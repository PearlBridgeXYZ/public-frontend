import { useEffect, useState } from "react";
import { DEPOSIT_RESUMES_AT_UNIX } from "../lib/pauseSchedule";
import { useBridgePaused } from "../lib/useBridgePaused";

function formatCountdown(secondsTotal: number): string {
  const s = Math.max(0, secondsTotal);
  const hh = Math.floor(s / 3600).toString().padStart(2, "0");
  const mm = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function PausedBanner() {
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // On-chain paused() is authoritative — if ops unpauses early (or hasn't
  // unpaused by the scheduled time), follow chain reality. The schedule is
  // only used as an RPC-failure fallback inside the hook. When the bridge
  // is live, hide unconditionally.
  const { paused } = useBridgePaused();
  if (!paused) return null;

  const resumeSeconds = Math.max(0, DEPOSIT_RESUMES_AT_UNIX - nowSec);

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
        <div className="space-y-3 min-w-0 w-full">
          <p className="text-[#00e5d0] font-semibold text-xs uppercase tracking-wide">
            Bridge paused for upgrades
          </p>
          <p className="text-gray-200 text-xs leading-relaxed">
            Our anomaly detection system triggered an automatic bridge pause.
            We&rsquo;re using the 24-hour window to make the bridge even more
            secure and better for the future. <span className="text-white">All
            funds are safe</span> and will be fully accessible the moment the
            bridge reopens. Any deposits or burns already on-chain will settle
            normally once we resume. Apologies for the interruption.
          </p>

          <div className="space-y-1.5 pt-2 border-t border-[#00e5d0]/15">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <p className="text-gray-300 text-[11px]">
                <span className="text-white font-semibold">Deposits &amp; withdrawals</span>
                <span className="text-gray-500"> resume in</span>
              </p>
              <p
                className="text-[#00e5d0]/90 text-[11px] font-semibold tabular-nums"
                aria-label={`deposits and withdrawals resume in ${formatCountdown(resumeSeconds)}`}
              >
                {formatCountdown(resumeSeconds)}
              </p>
            </div>
            <p className="text-gray-500 text-[10px] leading-relaxed -mt-0.5">
              Side door (paid withdrawals) remains open until then.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
