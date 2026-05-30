// Single source of truth for the 2026-05-30 pause-and-resume window.
// PausedBanner and PausedNote both import from here so the two surfaces can't
// drift, and ops only need to bump one number to extend the window.

export const PAUSE_AT_UNIX = 1_780_105_895; // 2026-05-30 17:24:55 UTC
export const WITHDRAW_RESUMES_AT_UNIX = 1_780_116_209; // 2026-05-30 04:43:29 UTC (now + 45m)
export const DEPOSIT_RESUMES_AT_UNIX = 1_780_199_909; // 2026-05-31 03:58:29 UTC (now + 24h)
