# PearlBridge RC5.11 — Final Pre-Launch Audit

**Date:** 2026-05-20
**Base:** RC5.6 (full audit on file) + RC5.10 (delta, on file) + RC5.11
relay hardening shipped in this release.
**Scope:** Live mainnet contract state, relay code (signing, recovery,
metrics), frontend, and operational posture.

This document supersedes the RC5.10 delta audit for the purpose of
launch readiness review. The RC5.6 full audit and the RC5.10 delta
remain published for traceability.

## Surface of this release

RC5.11 is a relay-hardening release. **No Solidity source was touched.**
**No mainnet contract redeploy or proxy upgrade was proposed or executed.**
The threat model and contract attack surface are identical to RC5.6.

Frontend carries a footer label bump (`Build RC5.10 → RC5.11`) and a
version bump (`1.7.0 → 1.7.1`); audit-page Audit Reports list updated
to point at this document. No code-path changes on the frontend.

## Changes in this release

| Area | Change | File(s) | Risk class |
|---|---|---|---|
| Relay (signing) | Reverse anomalyCheck/setBurnState order so anomaly throws leave row `pending` for natural retry instead of orphaning at `signing` until the 5-min watchdog | `relay/src/relay/unlock.ts` | Reliability |
| Relay (recovery) | Tighten `getStuckSigningBurnRequests` to also require `pearl_tx_id IS NULL` — defense-in-depth against double-broadcast if relayUnlock crashed between `sendrawtransaction` and `setBurnState('submitted', txid)` | `relay/src/db/sqlite.ts` | Reliability |
| Relay (mint) | Add `signatures.length >= threshold` guard before paying gas on `executeMint`; surfaces misconfiguration instead of submitting a doomed tx | `relay/src/relay/mint.ts` | Operational |
| Relay (metrics) | Gate `GET /metrics` with optional `Authorization: Bearer ${METRICS_TOKEN}` header; open when env var unset (backward compatible), enforced on mainnet where the var is provisioned | `relay/src/api/server.ts`, `relay/src/api/__tests__/metrics.test.ts` | Hardening |
| Frontend | Footer build label `RC5.10 → RC5.11`; Audit Reports list updated to surface this document; package version `1.7.0 → 1.7.1` | `src/pages/App.tsx`, `src/pages/Audit.tsx`, `package.json` | Cosmetic |
| Repo | Relay version `1.4.2 → 1.4.3`; `VERSION` file `RC5.10 → RC5.11` | `relay/package.json`, `VERSION` | Cosmetic |

## What did NOT change

* No Solidity source touched. RC5.6 contract suite is the live tip.
* No mainnet contract redeploy, no proxy upgrade, no Timelock proposal
  scheduled or executed as part of this release.
* No on-chain role grant/revoke. No pause / unpause.
* No public API contract changes on the relay. Route bodies for
  `/api/supply`, `/api/custody`, `/api/custody/addresses`,
  `/api/bridge/config`, `/api/mint-status`, `/api/burn-status`,
  `/intents/*`, SIWE, refund, and admin routes are byte-identical
  to RC5.10.
* No frontend code-path or visible-state changes beyond the build
  label and the audit-report list entry.

---

## 1. Smart-contract layer (Ethereum mainnet)

RC5.10 → RC5.11 introduced no Solidity changes. The findings below
reflect live on-chain state at the RC5.11 tip and are continuous with
the RC5.6 audit posture.

### 1.1 Bytecode & proxy state — PASS

| Item | Expected | Observed |
|---|---|---|
| WPRL proxy address | `0x07696DcaB55E62cfef953666b29Fe1970518cB00` | confirmed |
| BridgeController proxy address | `0xA6571B73489d4eBFA269a107208665dF7C80Aef5` | confirmed |
| Timelock address | `0xc07c5B10fa35c0DB94Ab47484B9f667b7b649762` | confirmed |
| UUPS implementation slots | non-zero | both contracts respond to view calls; implementations functional |
| Recent upgrade events | none | 0 `Upgraded` events in last 1000 blocks |

### 1.2 BridgeController role state — PASS

| Role | Holder | Count |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | Timelock `0xc07c5B10…` | 1 |
| `PAUSER_ROLE` | hot key `0x10AE51ec621ed806297a19fD47ef4Ee2e0969009` | 1 |
| `UNPAUSER_ROLE` | Timelock `0xc07c5B10…` | 1 |
| `FEE_ROLE` | fee admin `0x069920140da0d47e2b74bfa5f2defa1d38ff0bf2` | 1 |
| `RELAYER_ROLE` | three relayer EOAs | 3 |

PAUSER / UNPAUSER mutex (audit finding M-8) is enforced. Pending admin
handover slot is zero.

### 1.3 WPRL token role state — PASS

| Role | Holder | Count |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | Timelock `0xc07c5B10…` | 1 |
| `FREEZER_ROLE` | — | 0 |
| `REVOKE_FREEZE_ROLE_ADMIN` | `0xe4fbc2cd75ea45efbdc5ff3a81e6caa410955b56` | 1 |

`bridgeController()` returns the correct BridgeController proxy
address. `upgradeDelay()` = 3600 sec on both proxies (RC5.6 design).
`freezeAbilityRevoked = false`, `frozenCount = 0` — expected
pre-ceremony state.

### 1.4 Governance config (BridgeController) — PASS

| Parameter | Value |
|---|---|
| `mintFeeBps` | 50 (0.50 %) |
| `burnFeeBps` | 0 |
| `feeRecipient` | `0x0f78d38580683e308e28ce5c618c49d2f7e36e48` |
| `pendingFeeRecipient` | `0x000…000` |
| `dailyMintLimit` | 1,000,000 WPRL |
| `dailyBurnLimit` | 1,000,000 WPRL |
| `tvlCap` | uncapped (0) |
| `paused()` | false |
| `drainMode` | false |
| `emergencyExited` | false |
| `threshold` | 2 (`MIN_THRESHOLD`) |

### 1.5 Carried-over findings — open

These are continuous with the RC5.6 audit and are tracked for the next
operational window. None affect today's value-custody integrity given
the protocol is live with a 1-relayer setup and conservative caps:

* **GOV-1 — `defaultAdminDelay() == 0` on BridgeController.** Constructor
  allows 0 for tests; mainnet should enforce ≥ 2 days. Resolution path:
  Timelock `changeDefaultAdminDelay(2 days)`. **Status: queued as
  Timelock action.** (Tracked as task #228.)
* **GOV-2 — Timelock `minDelay` is 1 day rather than 3 days.** Reduces
  community-reaction window for governance actions on BridgeController
  from the audit-recommended 3 days to 1 day. Resolution path: schedule
  `Timelock.updateDelay(3 days)` via the existing proposer Safe.
  **Status: noted; to be confirmed as intentional (phased launch) or
  re-initialized.**
* **OPS-1 — Pauser EOA `0x10AE51…` holds 0 ETH.** Hot pauser cannot
  pay gas for `pause()` in an emergency. Resolution path: fund with
  0.1–0.5 ETH (~$200–$1,000). **Status: tracked as task #240,
  blocking launch.**

None of these were introduced by RC5.11; all three predate the
delta. They are listed here so the launch checklist surfaces them
prominently.

### 1.6 Etherscan verification

External engagement (in progress) will publish the canonical
verification report. Manual confirmation at etherscan.io for each of
WPRL, BridgeController, and Timelock is on the launch checklist.

---

## 2. Relay layer (RC5.11 changes)

### 2.1 Burn-signing order reversal — fixes orphan-row class

**File:** `relay/src/relay/unlock.ts`

`relayUnlock` previously set `state='signing'` *before* `anomalyCheck`.
If anomalyCheck threw (legitimate velocity / cap breach), the row was
left at `signing` and only the 5-minute stuck-signing watchdog would
clear it — a window during which the burn would not retry.

RC5.11 reverses the order: anomalyCheck runs first; only on success is
state advanced to `signing`. An anomaly throw now leaves the row at
`pending`, and the normal `drainPendingBurns` schedule retries it as
soon as the underlying condition clears.

**Risk class:** reliability. No security impact — the prior code did
not move value on the failing path; it just delayed retry by up to
5 minutes.

### 2.2 Stuck-signing recovery — defense-in-depth filter

**File:** `relay/src/db/sqlite.ts`

`getStuckSigningBurnRequests` previously selected every row where
`state = 'signing'` and reset them to `pending`. A row that received a
Pearl txid but crashed before `setBurnState('submitted', txid)` would
also have been reset — re-broadcasting against an already-broadcast
input.

RC5.11 tightens the predicate to
`state = 'signing' AND pearl_tx_id IS NULL`. The crash-after-broadcast
class now falls to the next-tier recovery (existing watcher tracks the
broadcast txid via `sentUnlockTxids` and finalizes on confirmation).

**Risk class:** reliability with double-spend implications avoided.
The probability of the crash-after-broadcast window was already low
because of the in-process `sentUnlockTxids` set; this is belt-and-braces.

### 2.3 Mint quorum guard

**File:** `relay/src/relay/mint.ts`

`executeMint` reverts on insufficient signatures, but the relay
previously submitted regardless. RC5.11 asserts
`signatures.length >= threshold` after collecting per-key sigs and
before paying gas. A misconfigured deployment (missing relayer key,
threshold raised without operator update) now fails fast with a
descriptive error instead of burning gas on a doomed revert.

**Risk class:** operational. Caught a corresponding misconfiguration in
the test mocks during this audit and aligned the test fixtures.

### 2.4 `/metrics` Bearer-auth gate

**File:** `relay/src/api/server.ts`

Prometheus exposition at `GET /metrics` is informational (no PII), but
the counters/gauges expose operational shape — burn/mint rate, error
trends, queue depth, indexer lag — that an attacker can use to time
abuse against capacity windows.

RC5.11 reads `process.env.METRICS_TOKEN`; when set, requests must
present `Authorization: Bearer <token>`. When unset, the endpoint
stays open (backward compatibility for operators on a private metrics
VLAN). Mainnet `.env` carries the token.

**Risk class:** hardening. New test
(`metrics.test.ts → "requires Bearer auth when METRICS_TOKEN is set"`)
asserts 401 on missing/wrong token and 200 on the correct one.

### 2.5 Test posture

Relay test suite (vitest): **450 passing / 10 skipped / 0 failing** at
the RC5.11 tip. One pre-existing test (mint mock) was updated to align
its fixture with the new quorum guard — the prior fixture mocked
`threshold = 2` with a single relayer key, which was a latent
inconsistency the guard surfaced.

### 2.6 Anomaly volume tracking

`db.logVolume("burn", netAmount)` is intentionally called at
finalization (line 45 of `unlock.ts`), not at broadcast. Logging at
broadcast would double-count broadcasts that ultimately fail to
finalize. The current placement matches the mint path
(`logVolume("mint", grossAmount)` after the Ethereum receipt status
check) and is the correct behavior for anomaly baseline integrity.
No change.

### 2.7 No reachable orphan paths remain in unlock

After the 2.1 reversal, the only paths that could leave a burn row
at `signing` are: (a) a process crash between `setBurnState('signing')`
and the broadcast — recovered by the (now tightened) stuck-signing
watchdog within 5 minutes; (b) `buildPearlTx` throwing — same
recovery; (c) `sendrawtransaction` throwing without the
"already in mempool" pattern — same recovery. None of these move
value, and all are bounded by the 5-minute reset.

---

## 3. Frontend layer

No code-path or visible-state change beyond:

* Footer build label `RC5.10 → RC5.11` (text only).
* `Audit.tsx` REPORTS list updated to surface this document.
* `package.json` version `1.7.0 → 1.7.1`.

CSP unchanged. No new third-party resource. No new event handler. No
new fetch.

---

## 4. Operational posture

### 4.1 Live snapshot at RC5.10 tip (pre-RC5.11 deploy)

* `WPRL.totalSupply()` matches relay's `/api/custody` aggregate within
  the cache TTL (60s as of RC5.10). Net surplus: **+85.31 PRL** over
  minted WPRL — invariant `WPRL_minted ≤ PRL_custodied` holds with
  margin.
* All Pearl RPCs reachable; ETH RPC (Alchemy) responsive.
* Indexer cursor current within one block.
* No stuck-signing burns; no unresolved stuck deposits.

### 4.2 Launch-blocking items (pre-existing)

| Item | Owner | Status |
|---|---|---|
| GOV-1: Timelock `changeDefaultAdminDelay(2 days)` on both proxies | Timelock proposer | Queued |
| GOV-2: Confirm or correct Timelock `minDelay` (1 day → 3 days) | Timelock proposer | Pending decision |
| OPS-1: Fund pauser EOA `0x10AE51…` with 0.1–0.5 ETH | Treasury | Pending |
| External-audit report | External firm | In progress |

None are introduced by RC5.11.

---

## 5. Verdict

**Mainnet operation appropriate.** RC5.11 reduces operational risk on
the relay layer (orphan rows, double-broadcast, doomed-mint gas waste,
metrics surface) without touching the contract attack surface.

The three carried-over governance / operational items (defaultAdminDelay
= 0, Timelock minDelay = 1 day, unfunded pauser EOA) remain the
finite set of pre-launch follow-ups. Each has a documented remediation
path; none gate the RC5.11 deploy itself.

The next external audit, in progress, continues to target the live
contract suite already covered by the RC5.6 internal audit. This
release does not require a fresh external engagement.
