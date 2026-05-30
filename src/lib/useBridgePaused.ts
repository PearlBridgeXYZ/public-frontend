import { useReadContract } from "wagmi";
import { BRIDGE_CONTROLLER_ABI, CONTRACTS } from "./contracts";
import { DEPOSIT_RESUMES_AT_UNIX } from "./pauseSchedule";

// Single source of truth for "is the canonical bridge currently paused?"
//
// On-chain `paused()` is authoritative — if ops flips it on/off, all surfaces
// (PausedBanner, PausedNote, BridgeCardSwitcher's side-door tab) react within
// one 15s polling tick without a page reload. The hardcoded schedule is only
// used as a fail-safe when the RPC read errors out: under failure, we trust
// the schedule until it has expired, then default to "not paused" so a long
// RPC outage can't pin the side-door UI in place forever.
//
// Returns `paused` as boolean (never undefined) so callers can use it directly
// in render gates without a tri-state branch.
export function useBridgePaused(): { paused: boolean; pausedReadFailed: boolean } {
  const { data: isPaused, isError: pausedReadFailed } = useReadContract({
    address: CONTRACTS.BRIDGE_CONTROLLER,
    abi: BRIDGE_CONTROLLER_ABI,
    functionName: "paused",
    query: { enabled: !!CONTRACTS.BRIDGE_CONTROLLER, refetchInterval: 15_000 },
  });

  if (isPaused === true) return { paused: true, pausedReadFailed: false };
  if (isPaused === false) return { paused: false, pausedReadFailed: false };

  // Read errored or hasn't returned yet. Fall back to the schedule.
  const nowSec = Math.floor(Date.now() / 1000);
  const scheduleSaysPaused = nowSec < DEPOSIT_RESUMES_AT_UNIX;
  return { paused: scheduleSaysPaused, pausedReadFailed };
}
