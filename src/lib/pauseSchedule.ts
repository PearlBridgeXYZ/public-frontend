// Single source of truth for the 2026-05-30 pause-and-resume window.
//
// On-chain `paused()` is the authority on whether the bridge is paused — see
// `useBridgePaused`. These constants drive the countdown UX *only*: the banner
// uses them to render "resume in HH:MM:SS", and they're used as an
// RPC-failure fallback inside the hook. Once on-chain `paused()` flips to
// false, every paused surface dismisses within one 15s polling tick
// regardless of what the countdown says.
//
// PAUSE_AT_UNIX matches the on-chain `Paused(address)` event emitted by
// BridgeController 0xa6571B73…aef5 at block 25,205,020, tx
// 0x6c4393fcee38a748039c84dde7d8ce9331c78475f7d1518e9eee503dbe2b5382.
//
// DEPOSIT_RESUMES_AT_UNIX is the conceptual "24h lock period ends" mark,
// computed as PAUSE_AT_UNIX + 24h. The actual unpause is operator-triggered
// (Timelock-governed `unpause()`), so this is an upper-bound for the
// countdown — if the operator unpauses earlier or later, the banner follows
// chain truth via `useBridgePaused`. When the countdown hits 0 the banner
// swaps to a "resume imminent" message instead of pinning at 00:00:00.

export const PAUSE_AT_UNIX = 1_780_105_895; // 2026-05-30 01:51:35 UTC
export const WITHDRAW_RESUMES_AT_UNIX = PAUSE_AT_UNIX + 24 * 3600; // both lanes resume together
export const DEPOSIT_RESUMES_AT_UNIX = PAUSE_AT_UNIX + 24 * 3600; // 2026-05-31 01:51:35 UTC
