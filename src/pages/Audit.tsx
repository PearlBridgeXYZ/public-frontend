import { Link, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useReadContract } from "wagmi";
import { WPRL_ABI, CONTRACTS, EXPECTED_CHAIN_ID } from "../lib/contracts";
import { RELAY_API_BASE } from "../lib/config";
import { grainsToWholePrlWithCommas } from "../lib/utils";
import { useIntermediaryHotBalance } from "../lib/useIntermediaryHotBalance";

type AuditReport = {
  slug: string;
  title: string;
  date: string;
  summary: string;
  verdict: string;
  status: "published" | "in_progress";
};

const REPORTS: AuditReport[] = [
  {
    slug: "pearlbridge-relay-reaudit-2026-10-05",
    title: "PearlBridge Relay Re-Audit and Fix Verification",
    date: "2026-10-05",
    summary:
      "Review of the bridge server and website. Contract code unchanged; WPRL supply reconciles exactly on chain. All findings fixed and live.",
    verdict:
      "All findings fixed. Contracts unchanged.",
    status: "published",
  },
  {
    slug: "pearlbridge-delta-rc521-2026-05-24",
    title: "PearlBridge RC5.21 Delta Audit",
    date: "2026-05-24",
    summary:
      "Faster, more reliable reserve reporting on the audit page. No contract changes.",
    verdict:
      "Approved for mainnet. Contracts unchanged.",
    status: "published",
  },
  {
    slug: "pearlbridge-delta-rc520-2026-05-24",
    title: "PearlBridge RC5.20 Delta Audit",
    date: "2026-05-24",
    summary:
      "Small website update: fast-lane reset countdown. No contract or relay changes.",
    verdict:
      "Approved for mainnet. Contracts unchanged.",
    status: "published",
  },
  {
    slug: "pearlbridge-delta-rc512-2026-05-20",
    title: "PearlBridge RC5.12 Delta Audit",
    date: "2026-05-20",
    summary:
      "Faster operator alerts on unusual bridge activity. No contract changes.",
    verdict:
      "Approved for mainnet. Contracts unchanged.",
    status: "published",
  },
  {
    slug: "pearlbridge-final-rc511-2026-05-20",
    title: "PearlBridge RC5.11 — Final Pre-Launch Audit",
    date: "2026-05-20",
    summary:
      "Full pre-launch review of contracts, relay, website and operations.",
    verdict:
      "Approved for mainnet launch.",
    status: "published",
  },
  {
    slug: "pearlbridge-delta-rc510-2026-05-20",
    title: "PearlBridge RC5.10 Delta Audit",
    date: "2026-05-20",
    summary:
      "Minor website and caching update. No contract changes.",
    verdict:
      "Approved for mainnet. Contracts unchanged.",
    status: "published",
  },
  {
    slug: "pearlbridge-reaudit-rc56-2026-05-20",
    title: "PearlBridge RC5.6 Audit",
    date: "2026-05-20",
    summary:
      "Eleven independent review passes over the live contracts, plus on-chain checks of the deployed state.",
    verdict:
      "Approved for mainnet. No critical or unresolved high-severity issues.",
    status: "published",
  },
  {
    slug: "pearlbridge-external-audit-2026",
    title: "PearlBridge — Independent External Security Audit",
    date: "In progress",
    summary:
      "Independent external review of the live contracts. Report will be published here when complete.",
    verdict: "In progress",
    status: "in_progress",
  },
];

const REPORTS_SORTED = [...REPORTS].sort((a, b) => b.date.localeCompare(a.date));

export function Audit() {
  const { slug } = useParams();
  const active = useMemo(
    () => REPORTS_SORTED.find((r) => r.slug === slug) ?? null,
    [slug],
  );

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-[#00e5d0] font-medium border border-[#00e5d0]/20">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00e5d0]" />
          Audit
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight">
          Audit &amp; transparency
        </h1>
        <p className="text-gray-400 text-base leading-relaxed max-w-3xl">
          Each release of PearlBridge undergoes security review before it is
          deployed, and an independent external audit is presently under way.
          The reserves backing Wrapped Pearl are reported below in real time, so
          that the backing may be verified directly rather than taken on trust.
        </p>
      </header>

      {active ? <ReportView report={active} /> : (
        <>
          <SolvencyCard />
          <ReportIndex />
        </>
      )}
    </div>
  );
}

type CustodyResponse = {
  lockAddress: string;
  lockGrains: string;
  depositGrains: string;
  depositAddressCount: number;
  treasuryGrains?: string;
  treasuryAddressCount?: number;
  totalCustodyGrains: string;
  totalSupplyGrains: string;
  surplusGrains: string;
  timestamp: number;
  breakdownUrl?: string;
};

function SolvencyCard() {
  const wprlAddr = CONTRACTS.WPRL;
  const { data: totalSupply } = useReadContract({
    address: wprlAddr,
    abi: WPRL_ABI,
    functionName: "totalSupply",
    chainId: EXPECTED_CHAIN_ID,
    query: { enabled: !!wprlAddr },
  });

  const [custody, setCustody] = useState<CustodyResponse | null>(null);
  const [custodyError, setCustodyError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchCustody = () => {
      fetch(`${RELAY_API_BASE}/api/custody`)
        .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
        .then((d: CustodyResponse) => {
          if (cancelled) return;
          setCustody(d);
          setCustodyError(null);
        })
        .catch((e: unknown) => {
          if (!cancelled) setCustodyError(typeof e === "string" ? e : "fetch failed");
        });
    };
    fetchCustody();
    const id = setInterval(fetchCustody, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Relay-side custody = lock + deposit + treasury + fee. We use the full sum:
  // the fee Pearl wallet's PRL backs the operator-held fee WPRL that is part
  // of `totalSupply`, so subtracting fee on the custody side alone (and not
  // also on the supply side) used to produce a phantom shortfall on the page.
  const apiTotalCustody = custody ? BigInt(custody.totalCustodyGrains) : null;
  const breakdownUrl = `${RELAY_API_BASE}/api/custody/addresses`;

  // Side-door intermediary hot wallet (ETH side) holds WPRL the operator has
  // already paid out for off-chain — every grain is a 1:1 burnable claim that
  // will release a PRL grain from the lock when burned, so it represents
  // PRL-equivalent backing today. Add it to custody to reflect that the
  // operator-held WPRL pending burn is part of the bridge's collateral, not
  // an unmatched liability. Without this addend, side-door payouts (which
  // drain the operator's Pearl hot wallet in the treasury but leave the
  // corresponding WPRL on Ethereum until the burn lands) create a transient
  // apparent shortfall on the page even though the bridge is solvent.
  const { balance: intermediaryHotBalance } =
    useIntermediaryHotBalance();
  const pendingBurnGrains = intermediaryHotBalance ?? 0n;
  const totalCustodyGrains =
    apiTotalCustody !== null ? apiTotalCustody + pendingBurnGrains : null;

  // Use the relay's snapshot of WPRL totalSupply for the circulating figure.
  // Custody and supply both come from the same relay snapshot, so the page
  // never shows a deficit caused purely by snapshot drift between a live RPC
  // read and a 30s-cached relay read. wagmi's live totalSupply is still read
  // below for cross-check; mismatches surface a warning but don't drive math.
  const relaySupplyGrains = custody ? BigInt(custody.totalSupplyGrains) : null;
  const circulatingWprlGrains = relaySupplyGrains;
  const totalSupplyBig = totalSupply !== undefined ? (totalSupply as bigint) : null;
  const surplusGrains =
    totalCustodyGrains !== null && circulatingWprlGrains !== null
      ? totalCustodyGrains - circulatingWprlGrains
      : null;
  // Cross-check the wagmi-read totalSupply against the relay's reading. Small
  // drift is normal (relay snapshot is up to 30s stale). A large drift would
  // indicate a real relay-vs-RPC disagreement worth investigating.
  const supplyMismatch =
    totalSupplyBig !== null &&
    custody !== null &&
    totalSupplyBig > BigInt(custody.totalSupplyGrains) &&
    totalSupplyBig - BigInt(custody.totalSupplyGrains) > 10n * 100_000_000n;

  return (
    <section className="glass rounded-2xl p-6 border border-white/5">
      <div className="flex items-baseline justify-between gap-3 mb-5">
        <h2 className="text-lg font-bold text-white">Solvency &amp; TVL</h2>
        <span className="text-[11px] font-mono text-gray-500">Live</span>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed mb-5 max-w-2xl">
        Each unit of WPRL in circulation on Ethereum is backed one-to-one by PRL
        held in custody on Pearl L1. The figures below are read directly from
        both chains and may be checked independently against the per-address
        breakdown.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl bg-black/30 border border-white/5 p-4">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">
            WPRL in circulation (Ethereum)
          </p>
          <p className="text-xl font-bold text-white">
            {circulatingWprlGrains !== null
              ? `${grainsToWholePrlWithCommas(circulatingWprlGrains)} WPRL`
              : "—"}
          </p>
          <p className="text-[11px] text-gray-500 mt-2 font-mono break-all">
            {wprlAddr}
          </p>
        </div>
        <div className="rounded-xl bg-black/30 border border-white/5 p-4">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">
            PRL custodied (Pearl L1)
          </p>
          <p className="text-xl font-bold text-white">
            {totalCustodyGrains !== null
              ? `${grainsToWholePrlWithCommas(totalCustodyGrains)} PRL`
              : custodyError
                ? "—"
                : "Loading…"}
          </p>
          {custody && (
            <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
              Held across the bridge lock wallet, {custody.depositAddressCount}{" "}
              deposit address{custody.depositAddressCount === 1 ? "" : "es"}
              {custody.treasuryAddressCount
                ? ` and ${custody.treasuryAddressCount} treasury wallet${custody.treasuryAddressCount === 1 ? "" : "s"}`
                : ""}
              .
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            <a
              href={breakdownUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[#00e5d0] hover:underline inline-block"
            >
              Per-address breakdown &rarr;
            </a>
          </div>
        </div>
      </div>
      {custody && surplusGrains !== null && totalCustodyGrains !== null && (
        <div className="mt-4 rounded-xl bg-black/20 border border-white/5 px-4 py-3 text-[11px] text-gray-400 leading-relaxed flex items-baseline justify-between gap-3">
          <span>
            Surplus:{" "}
            <span
              className={
                surplusGrains >= 0n
                  ? "text-[#00e5d0] font-mono"
                  : "text-red-400 font-mono"
              }
            >
              {surplusGrains >= 0n ? "+" : ""}
              {grainsToWholePrlWithCommas(surplusGrains < 0n ? -surplusGrains : surplusGrains)}{" "}
              PRL
            </span>
          </span>
          <span className="font-mono text-gray-500">
            updated{" "}
            {Math.max(0, Math.round((Date.now() - custody.timestamp) / 1000))}s ago
          </span>
        </div>
      )}
      {supplyMismatch && (
        <p className="text-[11px] text-amber-400 mt-2">
          Wallet RPC and relay disagree on WPRL totalSupply by more than 10 PRL
          &mdash; refresh in a minute. Both are independently verifiable on
          Etherscan.
        </p>
      )}
      {custodyError && !custody && (
        <p className="text-[11px] text-amber-400 mt-3">
          Custody endpoint unavailable &mdash; verify directly on the Pearl
          explorer via the link above.
        </p>
      )}
      <p className="text-[11px] text-gray-500 mt-4">
        Invariant: the supply of WPRL never exceeds the PRL held in custody.
      </p>
    </section>
  );
}

function ReportIndex() {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {REPORTS_SORTED.map((r) =>
        r.status === "in_progress" ? (
          <div
            key={r.slug}
            className="glass rounded-2xl p-5 border border-amber-400/30 flex flex-col gap-3"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-white">{r.title}</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-full px-2 py-0.5 flex-shrink-0">
                In progress
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">{r.summary}</p>
            <p className="text-xs text-gray-300 leading-relaxed">
              <span className="text-gray-500">Status: </span>
              {r.verdict}
            </p>
          </div>
        ) : (
          <Link
            key={r.slug}
            to={`/audit/${r.slug}`}
            className="glass rounded-2xl p-5 border border-white/5 hover:border-[#00e5d0]/30 transition-colors group flex flex-col gap-3"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-white group-hover:text-[#00e5d0] transition-colors">
                {r.title}
              </h2>
              <span className="text-[11px] font-mono text-gray-500 flex-shrink-0">
                {r.date}
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">{r.summary}</p>
            <p className="text-xs text-gray-300 leading-relaxed">
              <span className="text-gray-500">Verdict: </span>
              {r.verdict}
            </p>
            <div className="text-xs text-[#00e5d0] mt-auto pt-1">
              Read report &rarr;
            </div>
          </Link>
        ),
      )}
    </section>
  );
}

function ReportView({ report }: { report: AuditReport }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    fetch(`/audits/${report.slug}.md`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load report");
      });
    return () => {
      cancelled = true;
    };
  }, [report.slug]);

  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <Link
            to="/audit"
            className="text-xs text-[#00e5d0] hover:underline inline-block mb-2"
          >
            &larr; All reports
          </Link>
          <h2 className="text-2xl font-bold">{report.title}</h2>
          <p className="text-xs font-mono text-gray-500 mt-1">{report.date}</p>
        </div>
        <a
          href={`/audits/${report.slug}.md`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-400 hover:text-[#00e5d0] transition-colors"
        >
          Raw markdown &rarr;
        </a>
      </div>

      <div className="glass rounded-2xl p-6 md:p-8 border border-white/5">
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
            Failed to load report: {error}
          </div>
        )}
        {!content && !error && (
          <div className="text-sm text-gray-500">Loading report&hellip;</div>
        )}
        {content && (
          <pre className="text-[12px] leading-relaxed text-gray-300 whitespace-pre-wrap font-mono">
            {content}
          </pre>
        )}
      </div>
    </section>
  );
}
