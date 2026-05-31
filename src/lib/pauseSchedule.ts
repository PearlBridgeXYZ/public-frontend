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
// DEPOSIT_RESUMES_AT_UNIX is the eta of the Timelock-queued unpause op
// scheduled by the admin Safe at 2026-05-30 06:10:59 UTC with a 24h delay
// (sel 0x3f4ba83a `unpause()`, op id
// 0x652d7f27e6d7298b1c88080287762a9f1dceea0963f801ba03936298e72be6b1,
// schedule tx 0xda9a73f0bed613b8d09db1014ee891d48b18604414da96bccf9d491c2e8b5925).
// That eta is the earliest the Safe can call `execute()` on the Timelock to
// actually unpause — so the countdown lines up with operational reality, not
// a guess. When the countdown hits zero the banner swaps to a
// "resume imminent" message instead of pinning at 00:00:00; whenever the
// unpause tx actually lands, `useBridgePaused`'s 15s `paused()` poll hides
// every paused surface.

export const PAUSE_AT_UNIX = 1_780_105_895; // 2026-05-30 01:51:35 UTC
export const DEPOSIT_RESUMES_AT_UNIX = 1_780_207_859; // 2026-05-31 06:10:59 UTC (Timelock unpause eta)
export const WITHDRAW_RESUMES_AT_UNIX = DEPOSIT_RESUMES_AT_UNIX; // both lanes resume together
