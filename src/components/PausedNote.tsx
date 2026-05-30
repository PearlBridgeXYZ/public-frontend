import { useEffect, useState } from "react";

// Same anchor as PausedBanner — pause block timestamp + 24h. Once we're past
// the deposit-resume target, the community note hides alongside the banner.
const DEPOSIT_RESUMES_AT_UNIX = 1_780_192_295; // 2026-05-31 17:24:55 UTC

export function PausedNote() {
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);

  if (nowSec >= DEPOSIT_RESUMES_AT_UNIX) return null;

  return (
    <div
      role="note"
      aria-label="a note from the team"
      className="mb-6 max-w-lg mx-auto rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-5 text-sm"
    >
      <div className="flex items-start gap-3">
        <span className="text-[#00e5d0] text-lg mt-0.5" aria-hidden="true">
          &#9993;
        </span>
        <div className="space-y-2.5 min-w-0">
          <p className="text-white font-semibold text-xs uppercase tracking-wide">
            A note from the team
          </p>
          <p className="text-gray-300 text-xs leading-relaxed">
            Hi all &mdash; we had an automatic security trip which auto-paused
            the bridge for 24 hours, and unfortunately we cannot unpause it
            until the 24-hour timer resets. Hopefully you can forgive us.
          </p>
          <p className="text-gray-300 text-xs leading-relaxed">
            <span className="text-white">Funds are safe</span>, the
            Uniswap pool still functions fine, and we are building a temporary
            mechanism to still be able to withdraw from the bridge even while
            it is paused. Deposits remain temporarily disabled until the timer
            resets.
          </p>
          <p className="text-gray-300 text-xs leading-relaxed">
            We&rsquo;re taking the opportunity to make our systems more robust.
            Now that nearly <span className="text-white">$500,000 USD of PRL</span> has been
            bridged, it gives us a chance to upgrade our infrastructure for the
            scale you&rsquo;re bringing.
          </p>
          <p className="text-gray-300 text-xs leading-relaxed">
            Thank you all for understanding and growing with us. We&rsquo;re busy
            building and so happy that so many of you are using our product.
          </p>
        </div>
      </div>
    </div>
  );
}
