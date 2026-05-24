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
    status: "primary-gtm",
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
