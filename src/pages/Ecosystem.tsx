import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Market = {
  prl_price_usd: number | null;
  prl_change_24h_pct: number | null;
  prl_volume_24h_usd: number | null;
  prl_market_cap_usd: number | null;
  wprl_price_usd: number | null;
  wprl_premium_pct: number | null;
  sources: string[];
};

type Network = {
  hashrate: string | null;
  difficulty: string | null;
  block_height: number | null;
  block_time_sec: number | null;
  active_workers: number | null;
  pool_share_pct: number | null;
  sources: string[];
};

type Bridge = {
  tvl_prl: number | null;
  tvl_usd: number | null;
  deposits_24h_prl: number | null;
  burns_24h_prl: number | null;
  fast_lane_used_pct: number | null;
  active_addresses_24h: number | null;
  anomalies: string[];
};

type GitHubRow = {
  repo: string;
  url?: string;
  stars?: number | null;
  open_prs?: number | null;
  commits_7d?: number | null;
  last_commit_at?: string | null;
  last_commit_msg?: string | null;
};

type EcoEntry = {
  name: string;
  category:
    | "explorer"
    | "wallet"
    | "bridge"
    | "dapp"
    | "inscription"
    | "news"
    | "tool"
    | "pool"
    | "other";
  url?: string;
  description?: string;
  status?: "live" | "beta" | "alpha" | "concept";
  first_seen?: string;
  source?: string;
};

type EcosystemData = {
  schema_version: number;
  updated_at: string | null;
  next_refresh_at: string | null;
  narrative: string | null;
  market: Market;
  network: Network;
  bridge: Bridge;
  github: GitHubRow[];
  ecosystem: EcoEntry[];
  incidents: { date: string; summary: string; url?: string }[];
};

type HistoryEntry = {
  date: string;
  updated_at?: string;
  prl_price_usd: number | null;
  prl_change_24h_pct?: number | null;
  prl_volume_24h_usd: number | null;
  prl_market_cap_usd?: number | null;
  wprl_price_usd?: number | null;
  wprl_premium_pct?: number | null;
  tvl_prl: number | null;
  tvl_usd?: number | null;
  block_height?: number | null;
  hashrate_th_per_sec: number | null;
  github_commits_7d?: number | null;
  ecosystem_count?: number | null;
};

type EcosystemHistory = {
  schema_version: number;
  entries: HistoryEntry[];
};

function fmtUsd(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(digits)}`;
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US");
}

function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

function fmtPct(n: number | null | undefined, signed = false): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  const days = Math.round(h / 24);
  return `${days}d ago`;
}

// fmtRelative collapses negative diffs to "just now", which made
// next_refresh_at always read as "now". fmtFuture mirrors it for the
// forward direction so headers show "in 15h" instead.
function fmtFuture(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 60_000) return "any moment";
  const min = Math.round(diffMs / 60_000);
  if (min < 60) return `in ${min}m`;
  const h = Math.round(min / 60);
  if (h < 48) return `in ${h}h`;
  const days = Math.round(h / 24);
  return `in ${days}d`;
}

// Single category palette used by both the project cards and the section
// rail; keeping it in one place avoids drift when adding a new category.
const CAT_COLOR: Record<EcoEntry["category"], string> = {
  explorer: "text-blue-300 border-blue-500/30 bg-blue-500/10",
  wallet: "text-purple-300 border-purple-500/30 bg-purple-500/10",
  bridge: "text-[#00e5d0] border-[#00e5d0]/30 bg-[#00e5d0]/10",
  dapp: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  inscription: "text-pink-300 border-pink-500/30 bg-pink-500/10",
  news: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  tool: "text-cyan-300 border-cyan-500/30 bg-cyan-500/10",
  pool: "text-orange-300 border-orange-500/30 bg-orange-500/10",
  other: "text-gray-300 border-white/10 bg-white/5",
};

function CategoryPill({ c }: { c: EcoEntry["category"] }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide border ${CAT_COLOR[c] ?? CAT_COLOR.other}`}
    >
      {c}
    </span>
  );
}

// Inline SVG sparkline — no charting lib. Renders a polyline normalized
// to the [min,max] of the series with a soft area fill underneath. Tone
// is derived from first→last delta: green for up, red for down. We use
// a fixed viewBox so cards stay the same height regardless of n points.
function Sparkline({
  values,
  label,
  current,
  formatValue,
}: {
  values: (number | null | undefined)[];
  label: string;
  current: string;
  formatValue?: (n: number) => string;
}) {
  const clean = values
    .map((v) => (v === null || v === undefined || Number.isNaN(v) ? null : v))
    .filter((v): v is number => v !== null);

  if (clean.length < 2) {
    // Single sample or no samples: render the current value only, no line.
    return (
      <div className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2 flex flex-col justify-between min-h-[68px]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[9px] uppercase tracking-wide text-gray-500">{label}</span>
          <span className="text-[15px] font-semibold text-white leading-tight tabular-nums">
            {current}
          </span>
        </div>
        <div className="text-[9px] text-gray-600">
          {clean.length === 0 ? "no history yet" : "1 sample · history builds daily"}
        </div>
      </div>
    );
  }

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min || 1;
  const W = 100;
  const H = 28;
  const step = clean.length > 1 ? W / (clean.length - 1) : 0;
  const points = clean.map((v, i) => {
    const x = i * step;
    const y = H - ((v - min) / range) * H;
    return [x, y] as const;
  });
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath =
    linePath +
    ` L${(W).toFixed(1)},${H} L0,${H} Z`;
  const first = clean[0];
  const last = clean[clean.length - 1];
  const delta = last - first;
  const deltaPct = first !== 0 ? (delta / first) * 100 : 0;
  const tone = delta > 0 ? "up" : delta < 0 ? "down" : "neutral";
  const stroke = tone === "up" ? "#34d399" : tone === "down" ? "#f87171" : "#6b7280";
  const fill = tone === "up" ? "rgba(52,211,153,0.12)" : tone === "down" ? "rgba(248,113,113,0.12)" : "rgba(107,114,128,0.10)";
  const deltaColor = tone === "up" ? "text-emerald-400" : tone === "down" ? "text-red-400" : "text-gray-500";
  const deltaSign = delta > 0 ? "+" : "";
  const subText =
    formatValue && clean.length >= 2
      ? `${deltaSign}${formatValue(delta)} · ${deltaSign}${deltaPct.toFixed(1)}%`
      : `${deltaSign}${deltaPct.toFixed(1)}%`;

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2 flex flex-col gap-1 min-h-[68px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[9px] uppercase tracking-wide text-gray-500">{label}</span>
        <span className="text-[14px] font-semibold text-white leading-tight tabular-nums">
          {current}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-7 block">
        <path d={areaPath} fill={fill} stroke="none" />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className={`text-[9px] tabular-nums ${deltaColor}`}>
        {clean.length}d · {subText}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down" | "neutral";
}) {
  const subColor =
    tone === "up" ? "text-emerald-400" : tone === "down" ? "text-red-400" : "text-gray-500";
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2">
      <div className="text-[9px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-[15px] font-semibold text-white leading-tight mt-0.5">{value}</div>
      {sub ? <div className={`text-[10px] mt-0.5 ${subColor}`}>{sub}</div> : null}
    </div>
  );
}

export function Ecosystem() {
  const [data, setData] = useState<EcosystemData | null>(null);
  const [history, setHistory] = useState<EcosystemHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bust = Date.now();
    fetch(`/data/ecosystem.json?t=${bust}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<EcosystemData>;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

    // History is best-effort — page renders fine without it (e.g. on a
    // fresh deploy before the file lands). Don't surface as a hard error.
    fetch(`/data/ecosystem-history.json?t=${bust}`)
      .then((r) => (r.ok ? (r.json() as Promise<EcosystemHistory>) : null))
      .then((h) => setHistory(h))
      .catch(() => setHistory(null));
  }, []);

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <p className="text-red-400 text-sm">Failed to load ecosystem data: {error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <p className="text-gray-400 text-sm">Loading ecosystem snapshot…</p>
      </div>
    );
  }

  const seeded = data.updated_at === null;
  const priceTone =
    data.market.prl_change_24h_pct === null
      ? "neutral"
      : data.market.prl_change_24h_pct > 0
        ? "up"
        : data.market.prl_change_24h_pct < 0
          ? "down"
          : "neutral";

  // Project ordering: most-relevant categories first, then alpha within. We
  // render a single grid so the page reads as one scannable list rather than
  // 8 separate per-category sections that fragmented the eye on mobile.
  const catOrder: EcoEntry["category"][] = [
    "bridge",
    "wallet",
    "explorer",
    "pool",
    "dapp",
    "inscription",
    "tool",
    "news",
    "other",
  ];
  const sortedProjects = [...data.ecosystem].sort((a, b) => {
    const ai = catOrder.indexOf(a.category);
    const bi = catOrder.indexOf(b.category);
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header — pill + title + meta on one row when there's room. */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full glass text-[10px] text-[#00e5d0] font-medium border border-[#00e5d0]/20 mb-2">
            <span className="w-1 h-1 rounded-full bg-[#00e5d0] animate-pulse" />
            Ecosystem
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Pearl Ecosystem</h1>
        </div>
        <p className="text-[11px] text-gray-500">
          {seeded ? (
            <>Snapshot seeded — first refresh pending.</>
          ) : (
            <>
              Updated <span className="text-gray-300">{fmtRelative(data.updated_at)}</span>
              {data.next_refresh_at ? (
                <> · next <span className="text-gray-300">{fmtFuture(data.next_refresh_at)}</span></>
              ) : null}
            </>
          )}
        </p>
      </header>

      {data.narrative ? (
        <section className="rounded-lg bg-white/[0.03] border border-[#00e5d0]/15 px-4 py-3">
          <p className="text-gray-300 leading-relaxed text-[13px]">{data.narrative}</p>
        </section>
      ) : null}

      {/* Single dense metrics grid — market + bridge + network in one block.
          On mobile 2-up, tablet 3-up, desktop 6-up so the whole snapshot
          lives in one row above the fold on most screens. */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Stat
          label="PRL"
          value={fmtUsd(data.market.prl_price_usd, 4)}
          sub={fmtPct(data.market.prl_change_24h_pct, true) + " 24h"}
          tone={priceTone}
        />
        <Stat label="Volume 24h" value={fmtUsd(data.market.prl_volume_24h_usd)} />
        <Stat label="Market cap" value={fmtUsd(data.market.prl_market_cap_usd)} />
        <Stat
          label="Bridge TVL"
          value={
            data.bridge.tvl_prl !== null ? `${fmtCompact(data.bridge.tvl_prl)} PRL` : "—"
          }
          sub={data.bridge.tvl_usd ? fmtUsd(data.bridge.tvl_usd) : undefined}
        />
        <Stat
          label="Hashrate"
          value={data.network.hashrate ?? "—"}
          sub={
            data.network.block_height !== null
              ? `blk ${fmtCompact(data.network.block_height)}`
              : undefined
          }
        />
        <Stat
          label="WPRL premium"
          value={fmtPct(data.market.wprl_premium_pct, true)}
          sub={
            data.market.wprl_price_usd ? fmtUsd(data.market.wprl_price_usd, 4) : undefined
          }
          tone={
            data.market.wprl_premium_pct === null
              ? "neutral"
              : Math.abs(data.market.wprl_premium_pct) < 1
                ? "neutral"
                : data.market.wprl_premium_pct > 0
                  ? "up"
                  : "down"
          }
        />
      </section>

      {/* Second row — bridge flow + network detail. Shown only when any value
          is populated; on a fresh schema-seeded payload this stays hidden so
          the page doesn't render a wall of em-dashes. */}
      {(data.bridge.deposits_24h_prl !== null ||
        data.bridge.burns_24h_prl !== null ||
        data.bridge.fast_lane_used_pct !== null ||
        data.network.difficulty !== null ||
        data.network.block_time_sec !== null ||
        data.network.active_workers !== null) ? (
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Stat
            label="Deposits 24h"
            value={
              data.bridge.deposits_24h_prl !== null
                ? `${fmtCompact(data.bridge.deposits_24h_prl)} PRL`
                : "—"
            }
          />
          <Stat
            label="Burns 24h"
            value={
              data.bridge.burns_24h_prl !== null
                ? `${fmtCompact(data.bridge.burns_24h_prl)} PRL`
                : "—"
            }
          />
          <Stat
            label="Fast lane"
            value={fmtPct(data.bridge.fast_lane_used_pct)}
            sub={
              data.bridge.active_addresses_24h !== null
                ? `${fmtNum(data.bridge.active_addresses_24h)} addrs`
                : undefined
            }
          />
          <Stat label="Difficulty" value={data.network.difficulty ?? "—"} />
          <Stat
            label="Block time"
            value={
              data.network.block_time_sec !== null ? `${data.network.block_time_sec}s` : "—"
            }
          />
          <Stat label="Workers" value={fmtCompact(data.network.active_workers)} />
        </section>
      ) : null}

      {history && history.entries.length ? (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-gray-300 uppercase">
              History{" "}
              <span className="text-gray-600 normal-case font-normal text-xs">
                {history.entries.length}d
              </span>
            </h2>
            <span className="text-[10px] text-gray-600">since {history.entries[0].date}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Sparkline
              label="PRL"
              values={history.entries.map((e) => e.prl_price_usd)}
              current={fmtUsd(data.market.prl_price_usd, 4)}
              formatValue={(n) => fmtUsd(n, 4)}
            />
            <Sparkline
              label="Volume 24h"
              values={history.entries.map((e) => e.prl_volume_24h_usd)}
              current={fmtUsd(data.market.prl_volume_24h_usd)}
              formatValue={(n) => fmtUsd(Math.abs(n))}
            />
            <Sparkline
              label="Bridge TVL"
              values={history.entries.map((e) => e.tvl_prl)}
              current={
                data.bridge.tvl_prl !== null
                  ? `${fmtCompact(data.bridge.tvl_prl)} PRL`
                  : "—"
              }
              formatValue={(n) => `${fmtCompact(Math.abs(n))} PRL`}
            />
            <Sparkline
              label="Hashrate"
              values={history.entries.map((e) => e.hashrate_th_per_sec)}
              current={data.network.hashrate ?? "—"}
              formatValue={(n) => `${Math.abs(n).toFixed(0)} TH/s`}
            />
          </div>
        </section>
      ) : null}

      {data.bridge.anomalies.length ? (
        <ul className="text-[11px] text-amber-300/80 space-y-0.5 pl-3 border-l border-amber-500/30">
          {data.bridge.anomalies.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      ) : null}

      {/* Projects grid — 1/2/3 cols. Inline category pill replaces per-cat
          sections; each card is just name+pill+one-line description. */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-gray-300 uppercase">
            Projects <span className="text-gray-600 normal-case font-normal text-xs">({data.ecosystem.length})</span>
          </h2>
        </div>
        {sortedProjects.length === 0 ? (
          <p className="text-gray-500 text-sm">No entries yet — first refresh pending.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {sortedProjects.map((e, i) => {
              const inner = (
                <div className="h-full rounded-lg bg-white/[0.03] border border-white/5 hover:border-white/15 hover:bg-white/[0.05] transition-colors px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-white text-[13px] truncate flex-1 min-w-0">
                      {e.name}
                    </span>
                    <CategoryPill c={e.category} />
                  </div>
                  {e.description ? (
                    <p className="text-[11px] text-gray-400 leading-snug mt-1 line-clamp-2">
                      {e.description}
                    </p>
                  ) : null}
                </div>
              );
              return e.url ? (
                <a
                  key={i}
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                  title={e.url}
                >
                  {inner}
                </a>
              ) : (
                <div key={i}>{inner}</div>
              );
            })}
          </div>
        )}
      </section>

      {data.github.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold tracking-tight text-gray-300 uppercase">
            Repo activity <span className="text-gray-600 normal-case font-normal text-xs">7d</span>
          </h2>
          <div className="rounded-lg bg-white/[0.03] border border-white/5 overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="text-[9px] uppercase tracking-wide text-gray-500 border-b border-white/5">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium">Repo</th>
                  <th className="text-right px-3 py-1.5 font-medium">★</th>
                  <th className="text-right px-3 py-1.5 font-medium">7d</th>
                  <th className="text-right px-3 py-1.5 font-medium">PRs</th>
                  <th className="text-right px-3 py-1.5 font-medium hidden sm:table-cell">
                    Last
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.github.map((r, i) => (
                  <tr key={i} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-3 py-1.5 text-gray-300 truncate max-w-[180px] sm:max-w-none">
                      {r.url ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-[#00e5d0]"
                        >
                          {r.repo}
                        </a>
                      ) : (
                        r.repo
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-400 tabular-nums">
                      {fmtCompact(r.stars)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-300 tabular-nums">
                      {fmtNum(r.commits_7d)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-400 tabular-nums">
                      {fmtNum(r.open_prs)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-500 text-[11px] hidden sm:table-cell">
                      {fmtRelative(r.last_commit_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data.incidents.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold tracking-tight text-gray-300 uppercase">
            Incidents
          </h2>
          <ul className="space-y-1">
            {data.incidents.map((it, i) => (
              <li
                key={i}
                className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2 text-[12px]"
              >
                <span className="text-gray-500 text-[10px] mr-2">{it.date}</span>
                {it.url ? (
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00e5d0] hover:underline"
                  >
                    {it.summary}
                  </a>
                ) : (
                  <span className="text-gray-300">{it.summary}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="text-[10px] text-gray-600 border-t border-white/5 pt-3 flex flex-wrap gap-x-3 gap-y-1">
        <span>Refreshed daily by an automated aggregator.</span>
        <span>Listings are not endorsements.</span>
        <span>
          Live ops: <Link to="/status" className="text-gray-400 hover:text-[#00e5d0]">/status</Link>
          {" · "}
          <Link to="/audit" className="text-gray-400 hover:text-[#00e5d0]">/audit</Link>
        </span>
      </footer>
    </div>
  );
}
