import { useBridgePaused } from "../lib/useBridgePaused";

export function PausedNote() {
  // Hide as soon as the on-chain pause is lifted (or the schedule expires if
  // the RPC read is failing). The hook polls paused() every 15s, so this note
  // disappears within one tick of ops calling unpause().
  const { paused } = useBridgePaused();
  if (!paused) return null;

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
            Uniswap pool still functions fine, and we built a temporary
            side-door (paid) mechanism so you can still withdraw from the
            bridge while it is paused. Deposits and normal (free) withdrawals
            both resume together when the timer resets.
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
