// Single source of truth for the release label shown in the footer and
// referenced by the Releases page entries.
//
// PROTOCOL: every change that lands on `main` or `next` must bump this
// constant to the next RC tag (e.g. RC5.51 -> RC5.52). The footer renders
// `Build {BUILD_LABEL}` so operators can verify from the live site whether
// a push has actually rolled through the CDN — if the footer doesn't show
// the label you just pushed, the edge hasn't picked it up yet. One line per
// release also gives every commit a clean grep target.
//
// Bump on every push, even tiny copy tweaks, per G's directive 2026-05-31.
export const BUILD_LABEL = "RC5.52";
