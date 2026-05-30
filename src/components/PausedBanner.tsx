import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { BRIDGE_CONTROLLER_ABI, CONTRACTS, EXPECTED_CHAIN_ID } from "../lib/contracts";

// Pause was triggered by the safety circuit at block 25205020 (PAUSER guardian
// 0x10AE…9009). Anchor the countdown to that block's timestamp + 24h so the
// resume target is fixed, not deploy-time-relative — multiple visitors load
// the page over a long window and they should all see the same countdown.
//
// Contract `paused()` is still the gate: if it flips back to false earlier,
// the banner disappears; if it's still paused after the countdown hits zero,
// we render "Resuming shortly…" instead.
const PAUSE_RESUMES_AT_UNIX = 1_780_192_295; // 2026-05-31 17:24:55 UTC

function formatCountdown(secondsTotal: number): string {
  const s = Math.max(0, secondsTotal);
  const hh = Math.floor(s / 3600).toString().padStart(2, "0");
  const mm = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function PausedBanner() {
  const { data: paused } = useReadContract({
    address: CONTRACTS.BRIDGE_CONTROLLER,
    abi: BRIDGE_CONTROLLER_ABI,
    functionName: "paused",
    chainId: EXPECTED_CHAIN_ID,
    query: { refetchInterval: 30_000 },
  });

  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  if (paused !== true) return null;

  const secondsRemaining = PAUSE_RESUMES_AT_UNIX - nowSec;
  const countdownActive = secondsRemaining > 0;

  return (
    <div
      role="status"
      aria-label="bridge paused notice"
      className="mb-6 max-w-lg mx-auto rounded-2xl border border-[#00e5d0]/40 bg-[#00e5d0]/10 backdrop-blur-sm p-5 text-sm"
    >
      <div className="flex items-start gap-3">
        <span className="text-[#00e5d0] text-lg mt-0.5" aria-hidden="true">
          &#9208;
        </span>
        <div className="space-y-2 min-w-0">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <p className="text-[#00e5d0] font-semibold text-xs uppercase tracking-wide">
              Bridge paused for upgrades
            </p>
            {countdownActive ? (
              <p
                className="text-[#00e5d0]/90 text-[11px] font-semibold tabular-nums"
                aria-label={`resumes in ${formatCountdown(secondsRemaining)}`}
              >
                {formatCountdown(secondsRemaining)}
              </p>
            ) : null}
          </div>
          <p className="text-gray-200 text-xs leading-relaxed">
            Thanks for bearing with us &mdash; we&rsquo;re growing fast and
            pausing briefly to ship infrastructure upgrades that handle the
            increased demand. <span className="text-white">All funds are
            safe</span> and will be fully accessible the moment the bridge
            reopens. Any deposits or burns already on-chain will settle
            normally once we resume. Apologies for the interruption.
          </p>
          <p className="text-[#00e5d0]/70 text-[11px] leading-relaxed pt-1.5 border-t border-[#00e5d0]/15">
            {countdownActive
              ? "Resumes at 2026-05-31 17:24:55 UTC."
              : "Resuming shortly\u2026"}
          </p>
        </div>
      </div>
    </div>
  );
}
