# PearlBridge RC5.21 Delta Audit

**Release:** RC5.21
**Date:** 2026-05-24
**Scope:** Relay-side reliability work for `/api/custody` (cold-cache 504 fix) plus a small UI refinement that re-homes the fast-lane reset countdown introduced in RC5.20. No Solidity, no relay business-logic change.
**Solidity changes:** None.
**Relay changes:** Reliability only — caching, concurrency, persistence, CORS. No state-machine, signing, mint, or sweep change.

---

## 1. Summary

RC5.21 is a two-component release:

1. **Relay — `/api/custody` reliability.** The endpoint was occasionally returning 504 Gateway Timeout when the in-memory cache was cold (relay restart, server first boot, periodic-refresh skew). Root cause: per-request fan-out spawned ~150 parallel Pearl RPC reads with no concurrency bound, saturating the RPC pool and pushing tail latency past Cloudflare's 60s edge timeout. RC5.21 fixes this with three layered changes:
   - **Bounded concurrency:** the deposit-address fan-out is capped at 8 in-flight reads via a small `mapWithConcurrency` helper.
   - **Single-flight + stale-while-revalidate:** concurrent callers collapse onto one refresh; the route returns the previous cache immediately and the refresh runs in the background, never blocking the request.
   - **Disk-persisted cache:** the payload is written to `data/custody-cache.json` and `data/custody-addrs-cache.json` after every refresh and read on relay boot, so a cold start serves the previous snapshot instantly.
   A 30s `setInterval` keeps the cache warm proactively; `onClose` disposes the timer.

2. **Frontend — fast-lane reset countdown re-homed.** RC5.20 placed the one-decimal countdown under the Fast Lane Left stat tile. The tile is one of three in a fixed three-column grid; an extra subscript line distorted its height and left a visible gap under the neighbouring tiles. RC5.21 removes the subscript from `BridgeStats.tsx` (no `subscript` prop, no `useState/useEffect`) and renders the countdown on the Two-Lane Mint info block — right-aligned next to the "Two-Lane Mint" heading. The contract-side cap and reset logic are unchanged; only the rendering location moved.

3. **Relay — CORS allowlist.** `next.pearlbridge.xyz` (dev mirror on the `next` branch of the public frontend) was being blocked from calling `/api/custody` and `/api/stuck-deposits` because it was missing from `CORS_ALLOWED_ORIGINS` and `SIWE_EXPECTED_DOMAINS`. Both env vars now include it. Verified post-restart: `curl -I -H "Origin: https://next.pearlbridge.xyz" .../api/custody` returns `access-control-allow-origin: https://next.pearlbridge.xyz`.

The on-chain surface is byte-identical to RC5.6. No new attack surface, no new privileged component, no new state machine.

---

## 2. What changed

### 2.1 Relay — `/api/custody` bounded concurrency + SWR + disk persistence

Three concrete changes in `relay/src/api/server.ts`:

#### (a) Bounded fan-out

`computeCustodyPayload()` now reads the deposit-address set via `mapWithConcurrency(pearlDescs, 8, sumUnspentGrains)` instead of `Promise.all`. The cap of 8 was chosen to comfortably fit under the configured Pearl RPC pool (`PEARL_RPC_URLS` × default pool size) while keeping aggregate refresh time around 1–2 seconds for the ~150-address steady state.

#### (b) Single-flight + stale-while-revalidate

A module-level `let custodyCache: { ts: number; payload: unknown } | null` plus a `let inFlight: Promise<...> | null` form a textbook single-flight. The `/api/custody` route:

1. If `custodyCache` exists and `Date.now() - custodyCache.ts < CUSTODY_TTL_MS` → return cache.
2. Else, if `custodyCache` exists → return cache **and** kick off `refreshCustody()` in the background (never `await`).
3. Else (genuinely cold) → `await refreshCustody()`, then return the result via the TS-narrowed `const after = custodyCache as { ts: number; payload: unknown } | null`.

The TS-narrowing local-cast is intentional: TypeScript does not preserve narrowing of a closed-over `let` across an `await`, so the post-await access is re-typed locally. Behaviourally identical, just appeases the checker.

The same pattern applies to `/api/custody/addresses` via `refreshCustodyAddrs()`.

#### (c) Disk persistence

`loadCachedFromDisk()` runs once on server boot. If a `custody-cache.json` or `custody-addrs-cache.json` file is present, the timestamp + payload populate the in-memory cache. `persistCacheToDisk()` runs after every successful refresh. This means:

- A relay restart no longer produces a cold-cache window.
- An RPC outage longer than `CUSTODY_TTL_MS` no longer 504s — it serves the last known good snapshot with a freshness timestamp the UI can render.
- The stale cliff (`CUSTODY_STALE_MAX_MS`) was removed entirely — there's no longer a max age past which the cache is treated as fatal; the freshness timestamp is the truth.

#### (d) Background warmer

`const custodyRefreshTimer = setInterval(refreshCustody, CUSTODY_TTL_MS / 2)` runs every 30s. `app.addHook("onClose", async () => clearInterval(custodyRefreshTimer))` disposes it during graceful shutdown.

#### Verification

- Post-restart cold start: `custody cache restored from disk` log line. First `/api/custody` request: 46 ms (cache hit).
- `data/custody-cache.json` size after one refresh: 676 bytes.
- Manual `kill -TERM`/restart cycle: cache restored, no observable delay.
- Concurrent `ab -n 20 -c 10` against `/api/custody`: 1 refresh observed in logs, 20 responses served (single-flight working).

### 2.2 Relay — CORS expansion

`relay/.env`:

```
CORS_ALLOWED_ORIGINS=https://pearlbridge.xyz,https://next.pearlbridge.xyz,https://devnet.mrb.sh,https://pearlbridge-xyz-avz.pages.dev,https://pearlbridge-next.pages.dev
SIWE_EXPECTED_DOMAINS=pearlbridge.xyz,next.pearlbridge.xyz,devnet.mrb.sh,pearlbridge-xyz-avz.pages.dev,pearlbridge-next.pages.dev
```

`@fastify/cors` continues to echo the specific allowed origin (never `*`) on credentialed requests. Verified:

```
$ curl -I -H "Origin: https://next.pearlbridge.xyz" https://relay.pearlbridge.xyz/api/custody
access-control-allow-origin: https://next.pearlbridge.xyz
access-control-allow-credentials: true
```

### 2.3 Frontend — countdown re-homed

- `src/components/BridgeStats.tsx`: reverted to its RC5.13 shape. No `useState`, no `useEffect`, no `hoursUntilEpochReset` import, no `subscript` prop on the `Stat` helper.
- `src/pages/App.tsx`: `HomePage` now imports `hoursUntilEpochReset`, holds a `nowSec` state seeded from `Date.now()`, ticks it once per minute via `setInterval(60_000)` (cleared on unmount), and renders `Fast lane resets in X.Xh` as a right-aligned `text-[10px]` line in a flex row next to the "Two-Lane Mint" heading.
- The helper, its tests, and the `WINDOW_DURATION_SEC = 86_400` constant are unchanged from RC5.20.

### 2.4 No contract change

`BridgeController.WINDOW_DURATION` is an immutable constant set at construction (86 400 s on mainnet). The frontend mirror is hardcoded with a comment pointing back to `BridgeLib.currentEpoch`. The on-chain cap is enforced regardless of any UI value.

---

## 3. Risk assessment

| Risk | Status |
| --- | --- |
| Disk cache corruption (partial write, bad JSON). | Mitigated. `loadCachedFromDisk` wraps `JSON.parse` in `try/catch` and falls back to an empty cache on any error; the next refresh repopulates. A corrupt file is logged but not fatal. |
| Disk cache leaks PII or non-public state. | Mitigated. The cached payload is exactly the response of the existing public `/api/custody` endpoint — no new fields, no internal state. |
| Bounded concurrency too low under future growth. | Acceptable for now. 8-wide × ~150 addresses = ~19 batches; refresh measured at ~1.2 s steady-state. If the deposit-address set grows past ~400 the cap can be raised; the underlying RPC pool is the actual ceiling. |
| Background refresh failure goes unnoticed. | Mitigated. Refresh errors log at `error` level with a stable prefix and the cache simply keeps serving the last good payload. The freshness timestamp is part of the response so the UI can render "as of X ago" if it ever wants to. |
| CORS allowlist drift between env and SIWE-expected domains. | Mitigated by always updating both env vars together. Verified post-restart with `curl -I -H "Origin: ..."`. |
| Frontend countdown drift after long browser idle. | Same as RC5.20. `setInterval(60_000)` resumes on tab focus on every modern browser; one-decimal precision means the display is correct within 6 min of any wake. |
| User confuses re-homed countdown with a per-transaction timer. | Mitigated by adjacency: the countdown sits inside the Two-Lane Mint info block, immediately under the heading that explains the fast/slow lane split. Copy is unchanged from RC5.20 ("Fast lane resets in X.Xh"). |

---

## 4. What is unchanged

- All Solidity bytecode on mainnet (`WPRL` 0x07696Dca…, `BridgeController` 0xA6571B73…, `Timelock` 0xc07c5B10…).
- Fast-lane cap (`dailyFastMintLimit`) and slow-lane queue logic.
- `BridgeLib.currentEpoch(windowDuration)` and the audit-A5 fix.
- Relay state machine, signing/broadcast, mutex serialization of UTXO selection, anomaly detector, solvency invariant.
- TVL, Fast Lane Left, and Bridge Status tile rendering on the home page.
- Audit page solvency card (full-precision PRL/WPRL reconciliation).
- The `hoursUntilEpochReset(nowSec, windowSec)` helper and its `node --test` coverage.

---

## 5. Carried-over governance / ops items

Unchanged from RC5.12:

- **GOV-1:** `defaultAdminDelay()` is currently 0 on the live proxies. Timelock action #228 (changeDefaultAdminDelay to 2 days) remains queued.
- **GOV-2:** Confirm Timelock `minDelay` should remain 1 day or step to 3 days.
- **OPS-1:** Top up the `PAUSER_ROLE` wallet (`0x10AE51…`) with ETH so the on-chain pause remains an executable fallback.

---

## 6. Verdict

Mainnet operation appropriate. RC5.21 is reliability work (relay) plus a small UI refinement (frontend); neither touches the on-chain contract surface, the signing path, or the relay state machine. The custody endpoint now degrades gracefully — bounded concurrency, single-flight, stale-while-revalidate, disk-persisted — instead of failing the audit page when the in-memory cache is cold. The countdown lives where it belongs, on the block that describes the lane it counts down for.
