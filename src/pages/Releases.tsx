import { Link } from "react-router-dom";

type Release = {
  tag: string;
  date: string;
  title: string;
  summary: string;
  highlights: string[];
  contracts?: string;
  status: "primary-gtm" | "shipped" | "superseded";
};

const RELEASES: Release[] = [
  {
    tag: "RC5.28",
    date: "2026-05-29",
    title: "Homepage: capacity-aware fast-lane notice (<100 PRL gate + midnight UTC countdown)",
    summary:
      "Re-introduces the fast-lane capacity notice with a tighter trigger and a generic, evergreen copy. The banner only renders when the on-chain fast-lane remaining drops below 100 PRL in the current 24h window, and it surfaces a live HH:MM:SS countdown to 00:00 UTC — the contract's epoch reset boundary. Includes the RC5.27 mint UX fixes (Eth-conf done flip, \"Start a new mint\" button).",
    highlights: [
      "Banner gate: BridgeController.fastMintWindowRemaining() < 100 PRL (10,000,000,000 grains). Undefined / pre-load keeps the banner hidden so a brief flash on first mount can't mislead users about capacity.",
      "Copy is generic — describes the slow-lane fall-through behaviour without referencing any specific cap value, target, or future change. No 1,000,000 PRL mention, no time-bounded apology.",
      "Live HH:MM:SS countdown to the next 00:00 UTC boundary, tabular-nums for no digit-jitter, ticks every second from a single per-page interval.",
      "Banner auto-disappears within one 30s on-chain refetch tick once the epoch boundary resets capacity above 100 PRL — no manual flag flip, no follow-up deploy.",
      "Two new pure utils: secondsUntilNextMidnightUtc(nowMsec) and formatHmsCountdown(seconds), each with a full unit-test suite (15 new tests).",
      "Carries forward RC5.27: \"Done\" on first Eth confirmation in the mint flow, \"Start a new mint\" reset button on the success screen.",
      "No Solidity changes, no relay business-logic change. Contracts identical to RC5.6.",
    ],
    status: "primary-gtm",
  },
  {
    tag: "RC5.27",
    date: "2026-05-28",
    title: "Mint UX: \"Done\" on first Eth confirmation + new-mint reset + auto-hide banner",
    summary:
      "Three surgical UX fixes for the mint flow and the homepage capacity banner. The mint widget now flips to the success screen as soon as the mint tx has one Ethereum confirmation (was: stuck on \"relay is processing your mint\" until the relay marked the row finalized — often well after the WPRL was already in the wallet). The success screen gains an explicit \"Start a new mint\" reset button. The RC5.26 fast-lane-exhausted banner now reads the live on-chain remaining-in-window and auto-disappears the moment the epoch boundary resets capacity, with a live countdown surfaced inside the banner.",
    highlights: [
      "LockAndMint: new wagmi useWaitForTransactionReceipt watcher on the mint tx hash. As soon as the receipt confirms (≥1 conf, success), the step flips to \"done\" — independent of the relay-status poll. Closes the gap where users saw \"relay is processing\" long after their WPRL had landed.",
      "LockAndMint: \"Start a new mint →\" button on the success screen. Resets all in-memory state and navigates back to /, so the user can fire a second bridge without reloading the tab. Mirrors the existing burn-flow \"Start a new burn\" affordance.",
      "Homepage banner: only renders when BridgeController.fastMintWindowRemaining() == 0 — auto-disappears within the 30s contract-refetch tick once the daily UTC epoch resets capacity. No manual flag flip, no follow-up deploy required when capacity returns.",
      "Homepage banner: live \"Resets in X.Xh\" countdown inside the banner so users know when the queue ends.",
      "No Solidity changes, no relay business-logic change. Contracts identical to RC5.6.",
    ],
    status: "shipped",
  },
  {
    tag: "RC5.26.1",
    date: "2026-05-29",
    title: "Homepage: remove fast-lane-exhausted notice banner",
    summary:
      "Interim hotfix that removed the temporary on-page notice rendered above the bridge widget. The banner had no dynamic gate on the RC5.26 build, so it kept rendering even while the fast lane still had capacity. Pure copy/UI rollback, no contract or relay change. Superseded by RC5.28's capacity-aware replacement.",
    highlights: [
      "Banner block between the hero text and the BridgeWidget removed on mainnet.",
      "Two-Lane Mint info block (with the live reset countdown and lane explainer) unchanged.",
      "No Solidity changes, no relay business-logic change. Contracts identical to RC5.6.",
    ],
    status: "shipped",
  },
  {
    tag: "RC5.26",
    date: "2026-05-28",
    title: "Homepage: fast-lane-exhausted notice banner",
    summary:
      "Temporary on-page notice above the bridge widget telling depositors that the fast lane is currently exhausted, so every transaction will route through the 24h slow lane until the cap resets. Also signals the upcoming bump to a 1,000,000 PRL/24h fast-lane cap. Pure copy/UI, no contract or relay change.",
    highlights: [
      "New banner rendered between the hero text and the BridgeWidget on the homepage; mainnet-only (testnet/devnet builds are unchanged).",
      "Amber tone, stopwatch glyph, accessible role=\"status\" + aria-label — readable for screen readers, visually distinct from the static Security Notice block below.",
      "Copy emphasises the queue behaviour: deposits are still accepted and still mint, they just take the full 24h slow-lane path until capacity returns.",
      "No Solidity changes, no relay business-logic change. Contracts identical to RC5.6.",
    ],
    status: "superseded",
  },
  {
    tag: "RC5.25",
    date: "2026-05-28",
    title: "Status page: remove global stuck-deposits feed",
    summary:
      "The /status page no longer renders the global list of stuck deposits. The txid lookup form (and the per-order /order/:pearlTxId page it links to) is the canonical path for a depositor to check their own deposit's state and pick up the relay's reject/cancel reason. The relay endpoint at /api/stuck-deposits is untouched for operator tooling — only the public surface stops calling it.",
    highlights: [
      "Status page: \"Stuck deposits\" section removed entirely; aggregate counts and per-deposit txids no longer rendered to the public.",
      "Look-up form: result block gains a \"View full order status →\" link to /order/:pearlTxId, so a depositor who sees their own deposit went to rejected/cancelled/under_review can still reach the full reason and the operator-contact mailto.",
      "Legend copy: rejected / cancelled entries now point readers at the order page rather than the removed \"stuck deposits above\" section.",
      "Sibling pages (OrderStatus, UnwrapStatus) updated: back-link reads \"Bridge status & deposit lookup\" instead of \"stuck-deposit lookup\".",
      "No Solidity changes, no relay business-logic change. /api/stuck-deposits still answers for operator scripts and the relay's own ops tooling; only the public-frontend stops consuming it. Contracts identical to RC5.6.",
    ],
    status: "shipped",
  },
  {
    tag: "RC5.24",
    date: "2026-05-26",
    title: "Audit page: hide fee wallet, keep treasury",
    summary:
      "Surgical edit to the Solvency & TVL panel. The fee-collection wallet is no longer shown on the audit page or counted in the displayed PRL custodied figure. The total now equals the canonical lock wallet plus active per-user deposit addresses plus treasury wallets — i.e. every PRL that backs outstanding WPRL. Operator-side fee accounting is untouched.",
    highlights: [
      "Audit page: PRL custodied figure = lock + deposit addresses + treasury (fee wallet excluded from total and from the inline breakdown).",
      "Breakdown text now lists lock, deposit addresses, and treasury — no fee-collection wallet mention.",
      "Disclaimer line about the 0.5% fee removed from the public audit view.",
      "Computation is client-side from the /api/custody payload; the API still returns fee data for operator tooling, but the figure is not surfaced anywhere on the user-facing site.",
      "No Solidity changes, no relay business-logic change. Contracts identical to RC5.6.",
    ],
    status: "shipped",
  },
  {
    tag: "RC5.23",
    date: "2026-05-25",
    title: "X follow CTA on bridge success",
    summary:
      "Surgical UI addition: a small \"Follow @pearlbridgexyz on X\" link with the X logo at the bottom of the bridge success states (mint and burn). Pure client-side, no infra change, no other UI touched.",
    highlights: [
      "Mint flow: success step now shows the X follow CTA below the existing Etherscan / Pearl Explorer links.",
      "Burn flow: success step shows the same CTA below the \"Start a new burn\" reset action.",
      "Reusable `XFollowCTA` component; uses the X logo as inline SVG (no external asset, no tracker), `text-gray-500` with teal hover to match existing accent.",
      "No Solidity changes, no relay change. Contracts identical to RC5.6.",
    ],
    status: "shipped",
  },
  {
    tag: "RC5.21",
    date: "2026-05-24",
    title: "Custody endpoint reliability + countdown re-homed",
    summary:
      "Relay-side reliability work for `/api/custody` (was 504-ing on cold cache under unbounded RPC fan-out) plus a small UI refinement: the fast-lane reset countdown is moved out of the stats tile and onto the Two-Lane Mint description block, which is where it actually belongs.",
    highlights: [
      "Custody endpoint: bounded-concurrency fan-out (8-wide) over 150+ deposit addresses, single-flight refresh, stale-while-revalidate, disk-persisted cache that survives relay restarts, 30s background warmer.",
      "Custody endpoint never blocks on cold cache anymore — it returns the previous payload immediately and refreshes in the background.",
      "CORS allowlist expanded to include `next.pearlbridge.xyz` so the dev mirror's audit page can load custody and stuck-deposits data.",
      "Frontend: fast-lane reset countdown moved off the Fast Lane Left stat tile and onto the Two-Lane Mint info block, where it doesn't distort the three-tile row.",
      "No Solidity changes, no relay business-logic change. Contracts identical to RC5.6.",
    ],
    status: "shipped",
  },
  {
    tag: "RC5.20",
    date: "2026-05-24",
    title: "Fast-lane reset countdown",
    summary:
      "Surgical UI update: the Fast Lane Left tile now shows hours remaining (one decimal) until the cap resets at the next fixed UTC epoch boundary. Pure client-side math against the contract's WINDOW_DURATION — no extra RPC, no contract change.",
    highlights: [
      "Sub-line under Fast Lane Left reads \"resets in X.Xh\" and ticks every minute.",
      "Reset boundary derived from BridgeLib.currentEpoch — `floor(t/W)*W`, not 24h after the first charge. At a 24h window that's midnight UTC daily.",
      "New `hoursUntilEpochReset(nowSec, windowSec)` utility with dedicated `node --test` coverage (midnight, noon, half-decimal, just-before-rollover, defensive zero/negative).",
      "No Solidity changes, no relay change. Contracts identical to RC5.6.",
    ],
    status: "shipped",
  },
  {
    tag: "RC5.13",
    date: "2026-05-21",
    title: "Live mint progress + two-lane wiring",
    summary:
      "First release we pointed new users at by default. Live mint progress states, mid-wait Etherscan deep-links, and a fully wired two-lane mint with on-chain fast-lane cap.",
    highlights: [
      "Live mint progress UI: deposit → confirmations → fast/slow lane decision → mint settled, with Etherscan link surfaced as soon as the tx hash exists.",
      "Two-lane mint: fast lane mints at 6 Pearl confirmations up to the contract-enforced 24h cap; anything larger or beyond the day's quota routes through the 24h Timelock automatically.",
      "TVL and Fast Lane Left rendered as whole PRL with thousands separators for legibility.",
      "Contracts unchanged from RC5.6 — same audited surface, frontend/relay polish only.",
    ],
    contracts:
      "Surface identical to RC5.6 (WPRL 0x07696DcaB55…, BridgeController 0xA6571B73…, Timelock 0xc07c5b10…, 24h delay, Safe proposer).",
    status: "shipped",
  },
  {
    tag: "RC5.12",
    date: "2026-05-20",
    title: "Operator anomaly alerts + whole-PRL display",
    summary:
      "Every anomaly trip in the relay posts a Telegram alert to the operator group and spawns a read-only investigator session for fast triage. Frontend rounds TVL and Fast Lane Left to whole PRL.",
    highlights: [
      "Operator-facing anomaly notification path.",
      "No Solidity changes; detector thresholds identical to RC5.11.",
    ],
    status: "shipped",
  },
  {
    tag: "RC5.11",
    date: "2026-05-20",
    title: "Final pre-launch audit + relay hardening",
    summary:
      "Consolidated launch-readiness review across contracts, relay (signing, recovery, mint quorum, metrics auth), frontend, and ops. Ships relay hardening only — no Solidity changes vs RC5.6.",
    highlights: [
      "Relay signing and recovery paths hardened.",
      "Mint quorum and metrics auth reviewed end-to-end.",
      "Three pre-existing governance/ops items tracked separately (defaultAdminDelay, Timelock minDelay, pauser ETH).",
    ],
    status: "shipped",
  },
  {
    tag: "RC5.10",
    date: "2026-05-20",
    title: "Brand logo + audit-page Loading state + 60s custody cache",
    summary:
      "Small operational release: brand logo refresh, audit-page loading copy, and a 30s→60s relay cache TTL. No Solidity changes, no on-chain action.",
    highlights: [
      "Brand logo refresh across header and favicons.",
      "Audit page renders a loading state while custody data is in-flight.",
      "Relay custody cache TTL extended 30s → 60s.",
    ],
    status: "shipped",
  },
  {
    tag: "RC5.9",
    date: "2026-05-19",
    title: "Live custody aggregate + GDPR consent + txid catalog",
    summary:
      "Per-address custody breakdown wired to a JSON endpoint, GDPR consent surface added, and a public txid catalog for cross-referencing live mints against Pearl deposits.",
    highlights: [
      "Live aggregate custody view with per-address JSON drill-down.",
      "GDPR consent banner before any analytics fires.",
      "Public txid catalog for independent verification.",
    ],
    status: "shipped",
  },
  {
    tag: "RC5.7",
    date: "2026-05-18",
    title: "Initial public release",
    summary:
      "First commit of the public frontend repository — bit-derivable source for whatever pearlbridge.xyz serves at a given build.",
    highlights: [
      "Reproducible-build claim: anyone can run `npm ci && npm run build` against the tagged commit and match the live bundle SHA.",
      "No operator-side files in the public repo.",
    ],
    status: "shipped",
  },
];

function StatusBadge({ status }: { status: Release["status"] }) {
  if (status === "primary-gtm") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#00e5d0]/15 text-[#00e5d0] border border-[#00e5d0]/30">
        <span className="w-1.5 h-1.5 rounded-full bg-[#00e5d0] animate-pulse" />
        Primary GTM
      </span>
    );
  }
  if (status === "superseded") {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium uppercase tracking-wide bg-white/5 text-gray-500 border border-white/10">
        Superseded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium uppercase tracking-wide bg-white/5 text-gray-300 border border-white/10">
      Shipped
    </span>
  );
}

export function Releases() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-[#00e5d0] font-medium border border-[#00e5d0]/20">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00e5d0]" />
          Releases
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight">
          Releases
        </h1>
        <p className="text-gray-400 text-base leading-relaxed max-w-3xl">
          PearlBridge ships in numbered release candidates. Each one is built
          from a tagged commit in{" "}
          <a
            href="https://github.com/PearlBridgeXYZ/public-frontend"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#00e5d0] hover:underline"
          >
            public-frontend
          </a>{" "}
          and audited end-to-end before promotion. The release marked{" "}
          <span className="text-[#00e5d0] font-semibold">Primary GTM</span> is
          the version we recommend for any new user landing on{" "}
          <span className="text-white">pearlbridge.xyz</span> today.
        </p>
      </header>

      <ol className="space-y-6">
        {RELEASES.map((r) => (
          <li
            key={r.tag}
            className={
              "glass rounded-2xl p-6 border " +
              (r.status === "primary-gtm"
                ? "border-[#00e5d0]/40 ring-1 ring-[#00e5d0]/20"
                : "border-white/5")
            }
          >
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h2 className="text-2xl font-bold tracking-tight">
                <span className="text-[#00e5d0]">{r.tag}</span>{" "}
                <span className="text-gray-300 font-semibold">— {r.title}</span>
              </h2>
              <StatusBadge status={r.status} />
              <span className="text-xs text-gray-500 ml-auto">{r.date}</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">
              {r.summary}
            </p>
            <ul className="space-y-1.5 mb-4">
              {r.highlights.map((h, i) => (
                <li
                  key={i}
                  className="text-xs text-gray-400 leading-relaxed pl-4 relative"
                >
                  <span className="absolute left-0 top-1.5 w-1 h-1 rounded-full bg-[#00e5d0]/60" />
                  {h}
                </li>
              ))}
            </ul>
            {r.contracts ? (
              <p className="text-[11px] text-gray-500 pt-3 border-t border-white/5">
                <span className="text-gray-400 uppercase tracking-wide">
                  Contracts:
                </span>{" "}
                {r.contracts}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="glass rounded-2xl p-5 text-sm">
        <p className="text-gray-400 leading-relaxed">
          Looking for the security side? See the{" "}
          <Link to="/audit" className="text-[#00e5d0] hover:underline">
            audit page
          </Link>{" "}
          for the multi-pass review behind each release, or the{" "}
          <Link to="/infrastructure" className="text-[#00e5d0] hover:underline">
            infrastructure page
          </Link>{" "}
          for the live operator topology.
        </p>
      </div>
    </div>
  );
}
