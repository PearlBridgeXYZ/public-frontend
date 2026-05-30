import { Link, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useReadContract } from "wagmi";
import { WPRL_ABI, CONTRACTS, EXPECTED_CHAIN_ID } from "../lib/contracts";
import { PEARL_EXPLORER_BASE, RELAY_API_BASE } from "../lib/config";
import { grainsToDisplay } from "../lib/utils";

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
    slug: "pearlbridge-relay-minimax-2026-05-30",
    title: "PearlBridge Relay — Off-Chain Security Audit",
    date: "2026-05-30",
    summary:
      "First publicly-published relay-focused audit. Four parallel automated passes (perimeter / Pearl / Ethereum / value-movement) over the off-chain TypeScript daemon — 15.4k LOC production, 11.6k LOC tests — that watches Pearl L1 deposits, attests them to the BridgeController, and broadcasts cross-chain payouts. 26 findings total; all 3 Highs spot-verified against source by hand.",
    verdict:
      "Three operational/availability-class Highs (refund/unlock mutex parity, sweep terminal-state guard, /api/intents rate-limit) — fix-worthy, not custody-class. The on-chain processedPearlTxs map remains the actual double-spend safety net. Mediums are scheduled debt.",
    status: "published",
  },
  {
    slug: "pearlbridge-delta-rc521-2026-05-24",
    title: "PearlBridge RC5.21 Delta Audit",
    date: "2026-05-24",
    summary:
      "Relay reliability + small UI refinement. The /api/custody endpoint had been 504-ing on cold cache because per-request fan-out spawned unbounded parallel reads against Pearl RPC; RC5.21 bounds concurrency to 8, single-flights refreshes, serves stale-while-revalidate from a disk-persisted cache that survives restarts, and keeps the cache warm via a 30s background timer. The fast-lane reset countdown also moved off the BridgeStats tile (where it stretched the three-tile row) and onto the Two-Lane Mint info block. CORS allowlist expanded to next.pearlbridge.xyz.",
    verdict:
      "Mainnet operation appropriate. No Solidity change, no relay business-logic change. Contracts identical to RC5.6.",
    status: "published",
  },
  {
    slug: "pearlbridge-delta-rc520-2026-05-24",
    title: "PearlBridge RC5.20 Delta Audit",
    date: "2026-05-24",
    summary:
      "Surgical UI update: Fast Lane Left tile now shows hours remaining (one decimal) until the cap resets at the next fixed UTC epoch boundary. Pure client-side countdown derived from the contract's WINDOW_DURATION; no extra RPC, no contract change, no relay change. Also recon: every mint since the 2026-05-23 and 2026-05-24 epoch resets routed fast-lane and finalized cleanly.",
    verdict:
      "Mainnet operation appropriate. Contracts identical to RC5.6; relay and signing surface untouched.",
    status: "published",
  },
  {
    slug: "pearlbridge-delta-rc512-2026-05-20",
    title: "PearlBridge RC5.12 Delta Audit",
    date: "2026-05-20",
    summary:
      "Operator-facing anomaly alerting: every anomaly trip in the relay now posts a Telegram alert to the operator group and spawns a read-only Claude investigator session for fast triage. Frontend rounds TVL and Fast Lane Left to whole PRL. No Solidity changes.",
    verdict:
      "Mainnet operation appropriate. Anomaly detector continues to run on the same thresholds as RC5.11; only the notification path is new.",
    status: "published",
  },
  {
    slug: "pearlbridge-final-rc511-2026-05-20",
    title: "PearlBridge RC5.11 — Final Pre-Launch Audit",
    date: "2026-05-20",
    summary:
      "Consolidated launch-readiness review across contracts, relay (signing, recovery, mint quorum, metrics auth), frontend, and ops. RC5.11 ships relay hardening only — no Solidity changes vs RC5.6.",
    verdict:
      "Mainnet operation appropriate. Three pre-existing governance/ops items tracked (defaultAdminDelay, Timelock minDelay, pauser ETH).",
    status: "published",
  },
  {
    slug: "pearlbridge-delta-rc510-2026-05-20",
    title: "PearlBridge RC5.10 Delta Audit",
    date: "2026-05-20",
    summary:
      "Small operational release: brand logo refresh, audit-page loading copy, and a 30s→60s relay cache TTL. No Solidity changes, no on-chain action.",
    verdict:
      "Mainnet operation appropriate — surface untouched relative to RC5.6.",
    status: "published",
  },
  {
    slug: "pearlbridge-reaudit-rc56-2026-05-20",
    title: "PearlBridge RC5.6 Audit",
    date: "2026-05-20",
    summary:
      "Eleven independent automated review passes over the live mainnet contract suite (BridgeController, WPearl, BridgeLib) plus on-chain verification of deployed proxy state.",
    verdict:
      "Mainnet operation appropriate — no Critical, no unmitigated High. Two Medium and a handful of Low/Informational items documented for the next release.",
    status: "published",
  },
  {
    slug: "pearlbridge-external-audit-2026",
    title: "PearlBridge — Independent External Security Audit",
    date: "In progress",
    summary:
      "Independent external review of the live mainnet contract suite. Engagement underway; the report will be published here when complete.",
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
          PearlBridge ships every release through a multi-pass security audit
          covering contracts, relay, frontend, and the Pearl cross-chain
          surface. The most recent re-audit (RC5.6, 2026-05-20) ran eleven
          independent passes over the live mainnet contract suite plus an
          on-chain probe of deployed state; a separate independent external
          audit is currently underway. Live solvency is shown below so backing
          can be verified without trusting this page.
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
  feeGrains?: string;
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
  const lockAddr = CONTRACTS.PEARL_LOCK_ADDRESS;
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

  const lockExplorerUrl = lockAddr
    ? `${PEARL_EXPLORER_BASE}/address/${lockAddr}`
    : null;

  const lockGrains = custody ? BigInt(custody.lockGrains) : null;
  const depositGrains = custody ? BigInt(custody.depositGrains) : null;
  const treasuryGrains =
    custody && custody.treasuryGrains ? BigInt(custody.treasuryGrains) : 0n;
  // User-redeemable custody = lock + deposit + treasury. The fee-collection
  // wallet is operator revenue and is intentionally not counted as part of
  // the figure shown here.
  const feeGrains = custody && custody.feeGrains ? BigInt(custody.feeGrains) : 0n;
  const apiTotalCustody = custody ? BigInt(custody.totalCustodyGrains) : null;
  const totalCustodyGrains =
    apiTotalCustody !== null ? apiTotalCustody - feeGrains : null;
  const breakdownUrl = `${RELAY_API_BASE}/api/custody/addresses`;

  const totalSupplyBig = totalSupply !== undefined ? (totalSupply as bigint) : null;
  const surplusGrains =
    totalCustodyGrains !== null && totalSupplyBig !== null
      ? totalCustodyGrains - totalSupplyBig
      : null;
  // Cross-check the wagmi-read totalSupply against the relay's reading. If they
  // disagree by more than a grain we surface a warning — but neither source is
  // load-bearing on the OTHER's accuracy; both are independently verifiable.
  const supplyMismatch =
    totalSupplyBig !== null &&
    custody !== null &&
    totalSupplyBig !== BigInt(custody.totalSupplyGrains);

  return (
    <section className="glass rounded-2xl p-6 border border-white/5">
      <div className="flex items-baseline justify-between gap-3 mb-5">
        <h2 className="text-lg font-bold text-white">Solvency &amp; TVL</h2>
        <span className="text-[11px] font-mono text-gray-500">Live</span>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed mb-5 max-w-2xl">
        Every WPRL on Ethereum is backed 1:1 by PRL custodied on Pearl L1. The
        custody figure below sums the canonical lock wallet, every active
        per-user deposit address, and the treasury wallets &mdash; in-flight
        deposits awaiting the next sweep cycle are counted as backing, because
        the relay can only consolidate them; it cannot move them anywhere else.
        Every number is independently re-checkable on the public Pearl explorer
        and Etherscan.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl bg-black/30 border border-white/5 p-4">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">
            WPRL minted (Ethereum)
          </p>
          <p className="text-xl font-bold text-white">
            {totalSupplyBig !== null
              ? `${grainsToDisplay(totalSupplyBig)} WPRL`
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
              ? `${grainsToDisplay(totalCustodyGrains)} PRL`
              : custodyError
                ? "—"
                : "Loading…"}
          </p>
          {custody && lockGrains !== null && depositGrains !== null && (
            <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
              <span className="font-mono">{grainsToDisplay(lockGrains)}</span>{" "}
              in lock wallet
              {depositGrains > 0n && (
                <>
                  {" + "}
                  <span className="font-mono">{grainsToDisplay(depositGrains)}</span>{" "}
                  across {custody.depositAddressCount}{" "}
                  active deposit address{custody.depositAddressCount === 1 ? "" : "es"}
                </>
              )}
              {treasuryGrains > 0n && (
                <>
                  {" + "}
                  <span className="font-mono">{grainsToDisplay(treasuryGrains)}</span>{" "}
                  in treasury
                  {custody.treasuryAddressCount && custody.treasuryAddressCount > 1
                    ? ` (${custody.treasuryAddressCount} wallets)`
                    : ""}
                </>
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {lockExplorerUrl && (
              <a
                href={lockExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-[#00e5d0] hover:underline inline-block"
              >
                Verify lock wallet on explorer &rarr;
              </a>
            )}
            <a
              href={breakdownUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[#00e5d0] hover:underline inline-block"
            >
              Per-address JSON breakdown &rarr;
            </a>
          </div>
          <p className="text-[11px] text-gray-500 mt-2 font-mono break-all">
            {lockAddr || "not configured"}
          </p>
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
              {grainsToDisplay(surplusGrains < 0n ? -surplusGrains : surplusGrains)}{" "}
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
          Wallet RPC and relay disagree on WPRL totalSupply &mdash; refresh in a
          minute. Both are independently verifiable on Etherscan.
        </p>
      )}
      {custodyError && !custody && (
        <p className="text-[11px] text-amber-400 mt-3">
          Custody endpoint unavailable &mdash; verify directly on the Pearl
          explorer via the link above.
        </p>
      )}
      <p className="text-[11px] text-gray-500 mt-4">
        Invariant: WPRL minted &le; PRL custodied at all times.
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
