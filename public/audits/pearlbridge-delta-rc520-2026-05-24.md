# PearlBridge RC5.20 Delta Audit

**Release:** RC5.20
**Date:** 2026-05-24
**Scope:** Frontend Fast Lane Left countdown + recon of the most recent fast-lane epoch resets. No Solidity, no relay business logic.
**Solidity changes:** None.
**Relay changes:** None.

---

## 1. Summary

RC5.20 is a one-component UI release. The Fast Lane Left tile on the
home page already showed how much of the daily fast-mint cap remained;
RC5.20 adds a one-decimal countdown immediately under it telling the
user how many hours are left until that cap resets at the next fixed
UTC epoch boundary.

The countdown is pure client-side time math against the contract's
immutable `WINDOW_DURATION` (86 400s on mainnet). There is no new RPC,
no new contract surface, no relay change, and no change to the cap or
to how it is enforced.

This audit also reconciles on-chain and relay-DB views of the most
recent two fast-lane epoch resets (2026-05-23 00:00 UTC and 2026-05-24
00:00 UTC) and confirms the first mint after each reset routed
fast-lane cleanly.

---

## 2. What changed

### 2.1 Frontend — `Fast Lane Left` countdown

`src/components/BridgeStats.tsx` now imports `useEffect` and `useState`
and a new helper `hoursUntilEpochReset` from `src/lib/utils.ts`. The
component holds a `nowSec` state seeded from `Date.now()` and ticks it
once per minute via `setInterval(60_000)`; the interval is cleaned up
on unmount. One-decimal hours don't change faster than every 6 minutes,
so a 1-minute cadence is sufficient and avoids any battery cost on
mobile from a per-second timer.

When the on-chain `fastMintWindowRemaining` read resolves, the tile
renders a `text-[10px]` subscript reading `resets in X.Xh`. While the
read is still in flight, the subscript is omitted and the tile renders
exactly as before — no layout shift loop.

`Stat` was extended with an optional `subscript?: string` prop so the
new line is local to this one tile; the TVL and Bridge Status tiles
render identically to RC5.13.

### 2.2 Frontend — `hoursUntilEpochReset` utility

`src/lib/utils.ts` gains:

```ts
export function hoursUntilEpochReset(nowSec: number, windowSec: number): number {
  if (windowSec <= 0) return 0;
  const nextBoundary = (Math.floor(nowSec / windowSec) + 1) * windowSec;
  return Math.max(0, (nextBoundary - nowSec) / 3600);
}
```

This is the client-side mirror of `BridgeLib.currentEpoch(W)` =
`floor(t / W) * W`, plus one window. It returns the gap between the
current unix second and the *next* epoch boundary in hours, never
negative. The defensive `windowSec <= 0` branch guarantees no
divide-by-zero or negative-boundary regression if the constant is ever
mis-passed in future code.

The helper has dedicated `node --test` coverage in
`src/lib/utils.test.ts`:

- Midnight UTC → exactly 24 hours
- One second past midnight → just under 24h (≈ 23.9997)
- Noon → exactly 12 hours
- 11:30 UTC → 12.5 hours (one-decimal display sanity)
- 23:59:59 UTC → just over 0, which formats to `0.0h`
- Non-integer second timestamps
- `windowSec <= 0` returns `0`
- Very-early-timestamp edge (t = 1s into the epoch)

The same test file also adds smoke coverage for `computeFee` (percent
fee vs floor; net = 0 when gross < fee) and `grainsToDisplay` (trailing
zero trimming).

### 2.3 No contract change

`BridgeController.WINDOW_DURATION` is an immutable constant set at
construction. The frontend mirror (`WINDOW_DURATION_SEC = 86_400`) is
hardcoded with a comment pointing back to `BridgeLib.currentEpoch`. If
the contract is ever redeployed with a different window, this constant
must move with it; the test file's epoch-arithmetic tests would catch
an outright wrong value but not an off-by-window mismatch with the
deployed BC. This is acceptable for a UI-only countdown — the cap
itself is still enforced on-chain regardless of what the countdown
says.

---

## 3. Recon — did the fast-lane work as expected after recent resets?

Two epoch boundaries are in scope: **2026-05-23 00:00 UTC** and
**2026-05-24 00:00 UTC**. For each we (a) confirmed the next mint after
the boundary routed fast-lane (no `queued_at` row, mint finalized
synchronously), and (b) reconciled the on-chain
`fastMintWindowRemaining` against the relay's database SUM of in-window
gross amounts.

### 3.1 First mint after 2026-05-23 00:00 UTC

- Pearl tx id: `f5b1d277…` at **00:17:03 UTC**
- Recipient: `0xb0292625…`
- Ethereum tx: `0xb98f4ff2…`
- Gross: 907 PRL
- `queued_at`: NULL → fast-lane path
- State: `finalized`

This is well under the 50 000 PRL/24h fast-mint cap, so fast-lane
routing was correct.

### 3.2 First mint after 2026-05-24 00:00 UTC

- Pearl tx id: `80db395d…` at **00:40:42 UTC**
- Recipient: `0xfe19044c…`
- Ethereum tx: `0x1e9e5f96…`
- Gross: 6 PRL
- `queued_at`: NULL → fast-lane path
- State: `finalized`

Same outcome: cleanly inside the fast-lane window.

### 3.3 Aggregate reconciliation for the 2026-05-24 epoch

At audit time:

- On-chain `fastMintWindowRemaining` (BridgeController, mainnet): **36 681.73 PRL**
- → fast-lane used so far: **13 318.27 PRL**
- Relay DB `SUM(gross_amount)` of fast-lane mints with timestamp ≥ 2026-05-24 00:00 UTC: **13 318.27 PRL** ✓
- Total mints in the window: 29, all `queued_at IS NULL`, all `state = 'finalized'`

The contract and the relay agree to the grain. No fast/slow misroute
was observed in either epoch.

---

## 4. Risk assessment

| Risk | Status |
| --- | --- |
| Wrong `WINDOW_DURATION_SEC` constant in the frontend. | Mitigated. Hardcoded to 86 400 with a comment pointing to `BridgeLib.currentEpoch`. The on-chain cap is enforced regardless; a wrong UI value would only misrender the countdown, not the cap. |
| Stale countdown after long browser tab idle. | Acceptable. `setInterval(60_000)` resumes on tab focus on every modern browser; even at one-decimal precision the display is correct within 6 minutes of any wake. |
| Layout shift on first paint. | Mitigated. Subscript is only rendered when `fastRemaining !== undefined`; before that the tile is identical to RC5.13. |
| User reads countdown and assumes a sliding-window reset. | Mitigated by copy: `resets in X.Xh` plus the existing Releases page note that the cap resets at fixed UTC epoch boundaries. The countdown number itself is correct against the actual contract behavior. |
| Test-only utility regresses silently. | Mitigated. `node --test src/lib/utils.test.ts` is in the lint/test path; the same test file pins the helper's edge cases (zero-window defensive return, half-decimal value, just-before-rollover). |

---

## 5. What is unchanged

- All Solidity bytecode on mainnet (`WPRL` 0x07696Dca…, `BridgeController` 0xA6571B73…, `Timelock` 0xc07c5B10…).
- Fast-lane cap (`dailyFastMintLimit`) and slow-lane queue logic.
- `BridgeLib.currentEpoch(windowDuration)` and the audit-A5 fix that pinned the window to a fixed UTC epoch boundary instead of 24h from the first charge.
- Relay state machine, signing/broadcast, mutex serialization of UTXO selection (RC5.19, burn 0x66287335 race), anomaly detector, custody endpoint, solvency invariant.
- TVL and Bridge Status tile rendering on the home page.
- Audit page solvency card (full-precision PRL/WPRL reconciliation).

---

## 6. Carried-over governance / ops items

Unchanged from RC5.12:

- **GOV-1:** `defaultAdminDelay()` is currently 0 on the live proxies. Timelock action #228 (changeDefaultAdminDelay to 2 days) remains queued.
- **GOV-2:** Confirm Timelock `minDelay` should remain 1 day or step to 3 days.
- **OPS-1:** Top up the `PAUSER_ROLE` wallet (`0x10AE51…`) with ETH so the on-chain pause remains an executable fallback.

---

## 7. Verdict

Mainnet operation appropriate. The frontend countdown is purely
additive, the helper is covered by dedicated tests, and the recent
fast-lane epoch resets reconcile to the grain between the BridgeController
and the relay's database. No new attack surface, no new privileged
component, no new state.
