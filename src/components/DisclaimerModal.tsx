import { useEffect, useState } from "react";
import {
  DISCLAIMER_INTRO,
  DISCLAIMER_CLAUSES,
  DISCLAIMER_VERSION,
  hasAcceptedDisclaimer,
  markDisclaimerAccepted,
} from "../lib/disclaimer";

// Full-page legal gate shown on first browser load. Blocks the entire app
// until the user clicks "I have read and accept", at which point a
// browser-scoped cookie is written and the gate disappears for one year
// (or until DISCLAIMER_VERSION bumps).
//
// Not wallet-gated: we want the disclosure in front of the user before
// they connect a wallet, sign anything, or send PRL. Cookie storage so
// the acceptance is independent of wallet identity — the same human in
// the same browser shouldn't see it twice.

interface Props {
  onAccept: () => void;
}

export function LegalDisclaimer({ onAccept }: Props) {
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  // GDPR: consent must be a specific, informed, freely-given, AFFIRMATIVE
  // action — a scroll-to-bottom plus a single "Accept" button arguably
  // bundles too many distinct processing purposes. The dedicated checkbox
  // gives an unambiguous opt-in to the data-processing clause specifically,
  // which is the legally-load-bearing GDPR Art. 7 anchor.
  const [gdprConsent, setGdprConsent] = useState(false);

  // Pre-mark "scrolled" if the content is shorter than the viewport — no
  // amount of scrolling will fire the bottom event in that case, leaving
  // the Accept button permanently disabled.
  useEffect(() => {
    const el = document.getElementById("disclaimer-scroll");
    if (el && el.scrollHeight <= el.clientHeight + 8) {
      setScrolledToEnd(true);
    }
  }, []);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
      setScrolledToEnd(true);
    }
  }

  const canAccept = scrolledToEnd && gdprConsent;

  function handleAccept() {
    if (!canAccept) return;
    markDisclaimerAccepted();
    onAccept();
  }

  return (
    <div
      className="fixed inset-0 z-[1000] bg-[#050810] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
    >
      {/* Animated background — same vibe as the app shell so the gate
          doesn't feel like a separate microsite. */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #00e5d0 0%, transparent 70%)" }} />
        <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #0066ff 0%, transparent 70%)" }} />
      </div>

      <header className="px-6 py-5 border-b border-white/5">
        <div className="max-w-3xl mx-auto">
          <h1 id="disclaimer-title" className="text-2xl font-bold text-white">
            Before you use PearlBridge
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Please read the user agreement and risk disclosure in full. You must scroll to
            the bottom to enable the accept button.
          </p>
        </div>
      </header>

      <div
        id="disclaimer-scroll"
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-6 py-6"
      >
        <div className="max-w-3xl mx-auto text-sm text-gray-300 leading-relaxed space-y-3">
          <p className="font-semibold text-base text-white mb-3">
            PearlBridge user agreement &amp; risk disclosure
          </p>
          <p>{DISCLAIMER_INTRO}</p>
          <ol className="list-decimal pl-5 space-y-2">
            {DISCLAIMER_CLAUSES.map((c) => (
              <li key={c.title}>
                <strong>{c.title}</strong> {c.body}
              </li>
            ))}
          </ol>
          <p className="text-xs text-gray-500 mt-4">
            Disclosure version {DISCLAIMER_VERSION}. Updated text supersedes prior acceptance.
          </p>
        </div>
      </div>

      <footer className="px-6 py-5 border-t border-white/5 bg-black/30 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          <label className="flex items-start gap-3 text-sm text-gray-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={gdprConsent}
              onChange={(e) => setGdprConsent(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[#00e5d0] cursor-pointer flex-shrink-0"
              aria-describedby="gdpr-consent-description"
            />
            <span className="leading-relaxed">
              <strong className="text-white">GDPR consent.</strong>{" "}
              <span id="gdpr-consent-description">
                I have read the data-processing &amp; privacy clause and consent to the
                processing of my personal data (public wallet addresses, hashed IP for
                abuse mitigation, and a strictly-necessary acceptance cookie) for the
                purpose of operating the PearlBridge service, under Arts. 6(1)(a) and
                6(1)(b) GDPR. I understand I may withdraw consent at any time by
                clearing site data and discontinuing use.
              </span>
            </span>
          </label>
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <p className="text-xs text-gray-500">
              Disclosure version {DISCLAIMER_VERSION}. Acceptance is stored as a browser
              cookie for one year.
            </p>
            <div className="flex gap-3 w-full sm:w-auto">
              <a
                href="https://duckduckgo.com"
                className="px-5 py-3 rounded-xl text-sm text-gray-300 hover:text-white border border-white/10 hover:border-white/30 transition-colors text-center"
              >
                Decline &amp; leave
              </a>
              <button
                disabled={!canAccept}
                onClick={handleAccept}
                className="px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] text-black disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 transition-all shadow-lg shadow-[#00e5d0]/20 disabled:shadow-none whitespace-nowrap"
              >
                {!scrolledToEnd
                  ? "Scroll to enable"
                  : !gdprConsent
                    ? "Tick GDPR consent to enable"
                    : "I have read and accept"}
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Backwards-compat export — older imports still use the modal name.
export const DisclaimerModal = LegalDisclaimer;

// Hook for the App-shell to read acceptance state. Re-exported so callers
// don't need to import from two paths.
export { hasAcceptedDisclaimer };
