# PearlBridge Relay — MiniMax M2 audit (2026-05-30)

Four parallel passes (perimeter / pearl / ethereum / value-movement) over
the relay (`relay/src`, 15.4k LOC prod, 11.6k LOC tests). Each pass got
the full module group and a focused off-chain threat model. 26 findings
total. All 3 Highs spot-verified against source.

This is the first publicly-published relay-focused audit. Prior audits
on this page (RC5.6 re-audit, RC5.10–RC5.21 delta series) covered the
on-chain contract suite and operational deltas; this one is scoped
entirely to the relay (off-chain TypeScript) — the component that
watches Pearl L1 deposits, attests them to the BridgeController, and
broadcasts cross-chain payouts.

## HIGH (verified, fix-worthy)

### H-1 — refund payout bypasses unlock's per-lock mutex
`src/relay/refund.ts:60-92` vs `src/relay/unlock.ts:24-31, 109`.
`unlock.ts` serialises per-lock-address with `withLockMutex` AND atomically
claims the burn row via `tryClaimBurnForSigning`. `refund.ts` does neither.
A `BurnRequested` + `AdminRefundProcessed` arriving in the same window both
read the same UTXO set and race to broadcast. Loser eats RBF-rejected /
inputs-already-spent and the refund row can land in an inconsistent state
needing manual recovery. Fix: wrap `buildPearlTx + pearlRpc("sendrawtransaction")`
in `withLockMutex(lockAddress, ...)` and add a `tryClaimRefundForSigning`
parallel to the burn claim.

### H-2 — sweepAfterMint terminal-state check misses `broadcast`
`src/relay/deposit-sweep.ts:392-401`. After `enqueueDepositSweep` returns
`isNew=false`, the code skips only `confirmed` and `dust`. If the catchall
worker already moved the row to `broadcast` (sweep in mempool, not yet
confirmed), the primary path runs `executeSweep` again — and on collision
`recordDepositSweepResult` overwrites the catchall's `sweepTxId` with whatever
the primary returns (or `null` if it errored). Watcher's `sentUnlockTxids`
loses the original sweep txid, and the original sweep can be misclassified
as a no-OP_RETURN deposit. Fix: extend the existing guard to include
`broadcast` and `submitted` — any non-pending non-failed state should
short-circuit.

### H-3 — POST /api/intents has no auth and no rate-limit
`src/api/intents.ts:135`. Each request triggers `verifyIntent` →
BIP-322 sig verify (CPU) + `pearlRpcWithFailover('getrawtransaction', ...)` (RPC bandwidth)
+ canonical-bytes hashing + DB write. The bug-bounty endpoint
(`src/api/server.ts:904`) has rate-limit + disk persistence — intents has
neither. A single laptop can pin both the Pearl RPC and the DB. Fix: add
the same `ipHash → timestamps` limiter (e.g. 10/min/IP) to `/api/intents`,
and consider gating on `pb_sid` SIWE cookie for the non-anonymous path.

## MEDIUM (worth scheduling)

- **M-1 SIWE verify path unmetered** — `src/api/siwe.ts:93`. No rate-limit on
  failed verifies; enables nonce enumeration and timing probing. Same
  IP-hash limiter as H-3.
- **M-2 `/api/deposit-address` unauth + unmetered** — `src/api/server.ts:113`.
  Lets an attacker fill the deposit-address registry by enumerating ETH
  addrs, or probe registration state. Easy SIWE gate or per-IP cap.
- **M-3 Verified intents never expire** — `src/intents/gc.ts` only GCs
  `pending_confirmation`. A stale signed intent stays usable in lane
  resolution indefinitely. Add 7d expiry + GC.
- **M-4 Mint receipt-timeout catch falls through to `failed`** —
  `src/relay/mint.ts:318`. If `setMintState('submitted_stuck')` throws,
  control reaches the failure branch and a row that may already be on-chain
  is marked failed → watcher rebroadcasts → wasted gas (no double-mint —
  on-chain `processedPearlTxs` saves us). Add an explicit `return` after
  the inner DB write, and let `setMintState` failure throw rather than
  fall through.
- **M-5 minThreshold vs contract threshold drift** —
  `src/relay/orchestrator.ts:147`. If `MIN_THRESHOLD_FEATURE` is set
  below the on-chain threshold the relay collects too-few sigs and every
  mint reverts; if above attester count, everything fails. Add a startup
  sanity check `minThreshold ≤ attesters.length`, and read contract
  threshold once at boot to log a divergence warning.
- **M-6 No P2TR format check on burn `pearlAddress`** —
  `src/ethereum/watcher.ts:260`. Contract `_validatePearlAddress` should
  catch this on-chain, but the watcher persists the raw event arg into the
  burn row. A malformed addr that slipped through (or contract bug) becomes
  a stuck burn. Cheap defensive: reject anything that doesn't `bech32m`
  parse before enqueuing.
- **M-7 Slow-lane finalizer detects third-party finalize via error string** —
  `src/relay/slow-lane-finalizer.ts:82-95`. Brittle. Replace with explicit
  state read: `getMintRow(pearlTxId).state !== 'queued' → setMintState('finalized')`.
- **M-8 Sweep broadcaster has no retry for `signer_timeout` / `pearld_rejected`** —
  `src/relay/sweep-broadcaster.ts:56-62`. State sits in `broadcast_failed`
  permanently for cold-wallet sweeps. The deposit-sweep catchall only
  retries the primary path. Add bounded retry with backoff, then escalate
  to `broadcast_dead` for the alert tier.
- **M-9 Custody monitor alerts but doesn't gate operations** —
  `src/lib/custody-monitor.ts:93-127`. Crosses `multisig $200k` / `hsm $10M`
  → log + Telegram, but relay continues operating with EOA lock address.
  Add `CUSTODY_MODE='enforce'` config that blocks mint/unlock when
  current tier exceeds configured custody mode.

## LOW / INFO (file when cleaning up)

Custody endpoint unauthed (info-leak only); mint/burn-status endpoints
public (state observability); `incSdiIntentsGcFallback` not exported as a
Prometheus counter; stuck-deposit alerts default-off (`STUCK_DEPOSIT_ALERTS_ENABLE`
should be opt-out, not opt-in, in `NODE_ENV=production`); passive-mode
check in `refund.ts` not strictly first thing in the function; concurrent
`setInterval` poll iterations possible in `pearl/watcher.ts:100` if a poll
exceeds 10s (on-chain idempotency saves us, but waste); `pearl/signer.ts:73`
`writeUint64LE` silently wraps if BigInt > 2^64 — add range check;
`pearl/rpc-failover.ts:147` quorum mode falls back to first-responder under
split-brain — alert loudly when this happens.

## Findings called out as over-rated (so we don't act on them)

- **pearl/F-01 (IEEE-754 grain precision)** is over-rated. The code at
  `src/pearl/watcher.ts:65` already does `value.toFixed(8).split('.')` and
  the comment above (lines 60-64) explicitly names the 2^53 problem and
  the mitigation. The residual risk is whatever Node's `JSON.parse` does
  to numbers above 2^53 before `toFixed` runs — bounded by the JSON
  spec, not by us. Info-tier at most.
- **ethereum/F-NN-007** (sweepPersist gate) is a documented op procedure,
  not a finding.
- A few "speculative race" mediums hand-wave around the on-chain
  `processedPearlTxs` map — that map is the actual safety net and most
  of those collapse to "wasted gas" not "double-mint."

## What the relay does well (independent of MiniMax's flattery)

- M-of-N attester sources enforced disjoint at boot
  (`src/lib/attesters.ts` + `index.ts` `assertDisjoint`)
- SIWE binding: domain allowlist + chain-id pin + 10-min nonce TTL
- Per-lock-address mutex + atomic `tryClaimBurnForSigning` on unlock
- `INSERT OR IGNORE` + `ON CONFLICT DO NOTHING` everywhere value-related
- `setMintState/setBurnState` are UPDATE-only — they throw if the row is
  missing, so a stray INSERT can't blow away mutable fields
- mint-submit-watcher uses three-way check: `processedPearlTxs` →
  receipt → mempool before re-submitting
- Anomaly auto-pause defaults to off (human-in-loop) — right posture for
  early mainnet
- OP_RETURN parser rejects multi-intent transactions instead of guessing
- Cold-wallet sweep validates signature length + slot echo before relay

## What MiniMax couldn't check from source alone

- Runtime mTLS posture on `signer-rpc.ts`
- Whether `assertProductionVerifier` (BIP-322 mock guard) is actually
  asserted at startup in `api/server.ts`
- Live behaviour of `rpc-failover.ts` under partial Pearl-node outage
- Whether `MIN_THRESHOLD_FEATURE` matches the deployed contract threshold
- Actual `CREDENTIALS_DIRECTORY` isolation in the deployed systemd unit
- The Postgres adapter coverage parity with the sqlite adapter (a number
  of `(db as any)` casts make this hard to verify statically)

## Budget

~$0.40 in token cost across the four passes. ~3.5 min wall-clock.
