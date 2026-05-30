import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { BRIDGE_CONTROLLER_ABI, CONTRACTS, EXPECTED_CHAIN_ID } from "../lib/contracts";

// Pause was triggered by the safety circuit at block 25205020 (PAUSER guardian
// 0x10AE…9009). Anchor both countdowns to that block's timestamp so the resume
// targets are fixed for every visitor — withdrawals at +2h, deposits at +24h.
const PAUSE_AT_UNIX = 1_780_105_895; // 2026-05-30 17:24:55 UTC
const WITHDRAW_RESUMES_AT_UNIX = PAUSE_AT_UNIX + 2 * 3600;   // 2026-05-30 19:24:55 UTC
const DEPOSIT_RESUMES_AT_UNIX = PAUSE_AT_UNIX + 24 * 3600;   // 2026-05-31 17:24:55 UTC

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

  // Banner displays through the deposit-resume target regardless of contract
  // paused() state — the directional reopening (withdrawals at +2h, deposits
  // at +24h) is a UX commitment that outlives the on-chain pause flag. Once
  // we're past the deposit target, hide entirely. While we're inside the
  // window, also surface if the contract has already been unpaused.
  if (nowSec >= DEPOSIT_RESUMES_AT_UNIX) return null;

  const withdrawSeconds = WITHDRAW_RESUMES_AT_UNIX - nowSec;
  const depositSeconds = DEPOSIT_RESUMES_AT_UNIX - nowSec;
  const withdrawalsOpen = withdrawSeconds <= 0;

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
                <span className="text-white font-semibold">Withdrawals</span>
                <span className="text-gray-500"> (WPRL &rarr; PRL)</span>
                {withdrawalsOpen ? null : (
                  <span className="text-gray-500"> resume in</span>
                )}
              </p>
              <p
                className={`text-[11px] font-semibold tabular-nums ${
                  withdrawalsOpen ? "text-[#00e5d0]" : "text-[#00e5d0]/90"
                }`}
                aria-label={
                  withdrawalsOpen
                    ? "withdrawals open"
                    : `withdrawals resume in ${formatCountdown(withdrawSeconds)}`
                }
              >
                {withdrawalsOpen
                  ? paused === true
                    ? "Reopening\u2026"
                    : "Open"
                  : formatCountdown(withdrawSeconds)}
              </p>
            </div>
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <p className="text-gray-300 text-[11px]">
                <span className="text-white font-semibold">Deposits</span>
                <span className="text-gray-500"> (PRL &rarr; WPRL)</span>
                <span className="text-gray-500"> resume in</span>
              </p>
              <p
                className="text-[#00e5d0]/90 text-[11px] font-semibold tabular-nums"
                aria-label={`deposits resume in ${formatCountdown(depositSeconds)}`}
              >
                {formatCountdown(depositSeconds)}
              </p>
            </div>
          </div>

          <p className="text-[#00e5d0]/70 text-[10px] leading-relaxed pt-1.5 border-t border-[#00e5d0]/15">
            Withdrawals reopen 2026-05-30 19:24:55 UTC &middot; Deposits reopen
            2026-05-31 17:24:55 UTC.
          </p>
        </div>
      </div>
    </div>
  );
}
