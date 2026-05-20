# PearlBridge RC5.10 — Delta Audit

**Date:** 2026-05-20
**Base:** RC5.6 (audited 2026-05-20, full re-audit on file)
**Surface of this delta:** frontend (pearlbridge-site) + relay HTTP API only

This is a small operational release. No smart-contract source was touched; no
on-chain deployment occurred; no relayer signing path was modified. The
threat model and contract attack surface are identical to RC5.6. The full
RC5.6 audit remains authoritative for everything that matters to value
custody.

## Changes in this release

| Area | Change | Files | Risk class |
|---|---|---|---|
| Brand | Replace generated SVG mark with raster logo asset (header + favicons) | `src/pages/App.tsx`, `public/brand/*`, `index.html` | Cosmetic |
| Audit page UX | `"…"` placeholder → `"Loading…"` for PRL custodied tile while the relay fetch is in flight | `src/pages/Audit.tsx` | Cosmetic |
| Relay perf | `/api/custody` server-side cache TTL extended from 30s to 60s to halve Pearl RPC pressure under traffic | `relay/src/api/server.ts` | Operational |
| Version | `pearlbridge-frontend` 1.6.0 → 1.7.0; `pearlbridge-relay` 1.4.1 → 1.4.2; `VERSION` RC5.7 → RC5.10; footer build label updated | `package.json`, `VERSION`, `App.tsx` | Cosmetic |

## What did NOT change

* No Solidity source touched.
* No mainnet contract redeploy or proxy upgrade proposed or executed.
* No on-chain role grant/revoke, no Timelock proposal, no pause / unpause.
* Relay signing, attester quorum, watcher, sweeper, drain, anomaly check —
  all untouched.
* `/api/supply`, `/api/custody/addresses`, `/api/bridge/config`, mint/burn
  routes — handler bodies untouched; only the `/api/custody` cache TTL
  constant changed.

## Security review

### Logo asset
The image is served from the same origin as the rest of the bundle and is
loaded by an `<img>` tag with no `srcSet` cross-origin sources. CSP
`img-src 'self' data: https:` is unchanged; this asset is `self`. The
favicon link entries reference the same origin. No new third-party
resource, no inline script, no new event handler.

### `/api/custody` cache TTL 30s → 60s
The cache is in-process memory keyed by nothing (single-tenant
endpoint). The cached payload is **public data already independently
verifiable on Etherscan and the Pearl explorer**; it is never written
back to state and cannot influence value movement. Worst case at the
new TTL: a brand-new deposit arriving at second `t` will appear in the
SolvencyCard at most ~60s later than it did at the old TTL. Surplus
invariant `WPRL_minted ≤ PRL_custodied` is also evaluated on this
cached snapshot; a transient negative surplus that resolves within 60s
is now slightly more likely to be visible to a refresh, which is
desirable for transparency, not a hazard.

### `"Loading…"` copy change
Pure string. No new code path, no new fetch, no condition reordered.
The error branch (`custodyError → "—"`) and the loaded branch
(`grainsToDisplay(totalCustodyGrains) PRL`) are byte-identical to
RC5.6.

## Test posture
Relay test suite: **449 passing / 10 skipped / 0 failing** at the
RC5.10 tip. No new tests required (no new code paths). The 30s vs 60s
TTL is configuration; both are exercised in production today as the
cache is opportunistic, not load-bearing.

## Verdict
Mainnet operation appropriate. This delta does not alter the
contract or relay security surface and does not require a fresh
external engagement. The next external audit (in progress) continues
to target the live contract suite already audited at RC5.6.
