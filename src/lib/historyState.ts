// State → badge tone mapping for the /history feed.
//
// Extracted from History.tsx's inline StateBadge so it can be unit-tested
// (Node 22 strips TS types natively — see historyState.test.ts).
//
// RC4.0 state palette (unchanged tones):
//   success (green) — terminal success
//   failure (red)   — terminal failure
//   queued  (sky)   — slow-lane queued, distinct from yellow pending
//   pending (yellow)— true in-progress: pending, attesting, anything unknown
//
// BUGFIX (RC5.47): the relay's actual terminal-success state for mints and
// burns is "finalized" (verified live: burns are finalized|failed|under_review,
// mints are finalized|cancelled). It was missing from the success set, so every
// finalized (paid) bridge rendered yellow/in-progress and never showed a clear
// "done" — a finalized unwrap that had already delivered PRL still looked stuck,
// which drove false "my transaction failed" support tickets. "completed"/
// "minted"/"unlocked" are kept as forward/backward-compatible synonyms.

export type HistoryTone = "success" | "failure" | "queued" | "pending";

const SUCCESS = new Set(["finalized", "completed", "minted", "unlocked"]);
const FAILURE = new Set(["failed", "rejected", "cancelled"]);

export function historyStateTone(state: string): HistoryTone {
  const s = (state ?? "").toLowerCase().trim();
  if (SUCCESS.has(s)) return "success";
  if (FAILURE.has(s)) return "failure";
  if (s === "queued") return "queued";
  return "pending";
}

export function historyToneClasses(tone: HistoryTone): string {
  switch (tone) {
    case "success":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "failure":
      return "bg-red-500/15 text-red-300 border-red-500/30";
    case "queued":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "pending":
    default:
      return "bg-yellow-500/15 text-yellow-300 border-yellow-500/30";
  }
}
