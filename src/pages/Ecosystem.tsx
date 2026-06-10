import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RELAY_API_BASE } from "../lib/config";

// Live bridge-flow overlay sourced from the relay's public API at render
// time. The daily ecosystem.json snapshot never carried these fields (they
// shipped as schema-seeded nulls), so deposits/burns/fast-lane rendered
// blank or a day stale. Live wins; the snapshot value is the fallback when
// the API is unreachable.
type LiveBridgeFlow = {
  deposits24hPrl: number | null;
  burns24hPrl: number | null;
  fastLaneUsedPct: number | null;
  fastLaneLeftPrl: number | null;
};

function grainsToPrl(grains: string | undefined): number | null {
  if (!grains) return null;
  const n = Number(grains);
  return Number.isFinite(n) ? n / 1e8 : null;
}

async function fetchLiveBridgeFlow(): Promise<LiveBridgeFlow> {
  const out: LiveBridgeFlow = {
    deposits24hPrl: null,
    burns24hPrl: null,
    fastLaneUsedPct: null,
    fastLaneLeftPrl: null,
  };
  // Independent best-effort fetches: a failing one leaves its fields null
  // so the snapshot fallback (or an em-dash) renders instead.
  const [stats, status] = await Promise.allSettled([
    fetch(`${RELAY_API_BASE}/v1/stats`).then((r) => (r.ok ? r.json() : null)),
    fetch(`${RELAY_API_BASE}/v1/status`).then((r) => (r.ok ? r.json() : null)),
  ]);
  if (stats.status === "fulfilled" && stats.value?.volume?.["24h"]) {
    const day = stats.value.volume["24h"];
    out.deposits24hPrl = grainsToPrl(day.mint?.grains);
    // Burns leaving Ethereum = direct burns + intermediary unwraps; both
    // release locked PRL (same outflow convention as the Stats page).
    const burn = grainsToPrl(day.burn?.grains);
    const intermediary = grainsToPrl(day.intermediary?.grains);
    out.burns24hPrl =
      burn === null && intermediary === null ? null : (burn ?? 0) + (intermediary ?? 0);
  }
  if (status.status === "fulfilled" && status.value?.limits) {
    const cap = grainsToPrl(status.value.limits.dailyFastMintLimitGrains);
    const left = grainsToPrl(status.value.limits.fastMintWindowRemainingGrains);
    if (cap !== null && left !== null && cap > 0) {
      out.fastLaneUsedPct = Math.max(0, Math.min(100, ((cap - left) / cap) * 100));
      out.fastLaneLeftPrl = left;
    }
  }
  return out;
}

type VenueVolume = {
  venue: string;
  pair: string;
  volume_24h_usd: number | null;
  liquidity_usd?: number | null;
  url?: string;
};

type Market = {
  prl_price_usd: number | null;
  prl_change_24h_pct: number | null;
  prl_volume_24h_usd: number | null;
  prl_market_cap_usd: number | null;
  prl_circulating_supply?: number | null;
  prl_circulating_supply_method?: string | null;
  wprl_price_usd: number | null;
  wprl_premium_pct: number | null;
  volume_by_venue?: VenueVolume[];
  sources: string[];
};

type Network = {
  hashrate: string | null;
  difficulty: string | null;
  block_height: number | null;
  block_time_sec: number | null;
  active_workers: number | null;
  active_workers_scope?: string | null;
  pool_share_pct: number | null;
  sources: string[];
};

type SampleTweet = {
  handle?: string;
  url?: string;
  snippet?: string;
  posted_at?: string;
};

type Social = {
  sentiment?: "bullish" | "neutral" | "bearish" | null;
  summary?: string | null;
  mentions_24h?: number | null;
  tracked_accounts?: string[];
  sample_tweets?: SampleTweet[];
  sources?: string[];
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
  social?: Social;
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

// Composite trend signal across the headline metrics. Counts how many
// of the tracked series are net-up vs net-down across the available
// history window. Hidden until we have at least 2 samples.
function computeTrend(entries: HistoryEntry[]): {
  label: "Expanding" | "Contracting" | "Stable" | "Building baseline";
  arrow: "↗" | "↘" | "→" | "·";
  tone: "up" | "down" | "neutral";
  upCount: number;
  downCount: number;
  total: number;
  compositePct: number | null;
  days: number;
} {
  const n = entries.length;
  if (n < 2) {
    return {
      label: "Building baseline",
      arrow: "·",
      tone: "neutral",
      upCount: 0,
      downCount: 0,
      total: 0,
      compositePct: null,
      days: n,
    };
  }
  const first = entries[0];
  const last = entries[n - 1];
  const metrics: Array<[number | null | undefined, number | null | undefined]> = [
    [first.prl_price_usd, last.prl_price_usd],
    [first.prl_volume_24h_usd, last.prl_volume_24h_usd],
    [first.tvl_prl, last.tvl_prl],
    [first.hashrate_th_per_sec, last.hashrate_th_per_sec],
    [first.github_commits_7d, last.github_commits_7d],
    [first.ecosystem_count, last.ecosystem_count],
  ];
  let up = 0;
  let down = 0;
  let total = 0;
  const pctDeltas: number[] = [];
  for (const [a, b] of metrics) {
    if (a === null || a === undefined || b === null || b === undefined) continue;
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    total += 1;
    if (a === 0 && b === 0) continue;
    const pct = a === 0 ? (b > 0 ? 100 : -100) : ((b - a) / Math.abs(a)) * 100;
    pctDeltas.push(Math.max(-200, Math.min(200, pct)));
    if (pct > 5) up += 1;
    else if (pct < -5) down += 1;
  }
  const composite =
    pctDeltas.length > 0
      ? pctDeltas.reduce((s, x) => s + x, 0) / pctDeltas.length
      : null;
  let label: "Expanding" | "Contracting" | "Stable";
  let arrow: "↗" | "↘" | "→";
  let tone: "up" | "down" | "neutral";
  if (up > down) {
    label = "Expanding";
    arrow = "↗";
    tone = "up";
  } else if (down > up) {
    label = "Contracting";
    arrow = "↘";
    tone = "down";
  } else {
    label = "Stable";
    arrow = "→";
    tone = "neutral";
  }
  return { label, arrow, tone, upCount: up, downCount: down, total, compositePct: composite, days: n };
}

function TrendPill({ trend }: { trend: ReturnType<typeof computeTrend> }) {
  const cls =
    trend.tone === "up"
      ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
      : trend.tone === "down"
        ? "text-red-300 border-red-500/30 bg-red-500/10"
        : "text-gray-300 border-white/10 bg-white/5";
  const sign = trend.compositePct !== null && trend.compositePct > 0 ? "+" : "";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium ${cls}`}
      title={`${trend.upCount} up · ${trend.downCount} down · ${trend.total} metrics over ${trend.days}d`}
    >
      <span className="text-[12px] leading-none">{trend.arrow}</span>
      <span>{trend.label}</span>
      {trend.compositePct !== null ? (
        <span className="tabular-nums opacity-80">
          {sign}
          {trend.compositePct.toFixed(1)}%
        </span>
      ) : null}
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
          {clean.length === 0
            ? "no history yet · chart appears once data lands"
            : "1 sample · chart appears tomorrow"}
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
  const [live, setLive] = useState<LiveBridgeFlow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bust = Date.now();

    // Live bridge flow from the relay API — best-effort, refreshed every
    // 60s while the page is open so the fast-lane gauge tracks the window.
    let cancelled = false;
    const loadLive = () =>
      fetchLiveBridgeFlow()
        .then((v) => {
          if (!cancelled) setLive(v);
        })
        .catch(() => undefined);
    loadLive();
    const liveTimer = setInterval(loadLive, 60_000);
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

    return () => {
      cancelled = true;
      clearInterval(liveTimer);
    };
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
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full glass text-[10px] text-[#00e5d0] font-medium border border-[#00e5d0]/20">
              <span className="w-1 h-1 rounded-full bg-[#00e5d0] animate-pulse" />
              Ecosystem
            </div>
            {history && history.entries.length >= 2 ? (
              <TrendPill trend={computeTrend(history.entries)} />
            ) : null}
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
        <Stat
          label="Volume 24h"
          value={fmtUsd(data.market.prl_volume_24h_usd)}
          sub={
            data.market.volume_by_venue && data.market.volume_by_venue.length
              ? `across ${data.market.volume_by_venue.length} ${data.market.volume_by_venue.length === 1 ? "venue" : "venues"}`
              : undefined
          }
        />
        <Stat
          label="Market cap"
          value={fmtUsd(data.market.prl_market_cap_usd)}
          sub={
            data.market.prl_circulating_supply
              ? `${fmtCompact(data.market.prl_circulating_supply)} PRL supply`
              : undefined
          }
        />
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

      {/* Second row — bridge flow + network detail. Bridge flow prefers the
          live relay API (24h mint/burn volume, fast-lane window) and falls
          back to the daily snapshot; the row renders whenever either source
          has a value. */}
      {((live !== null &&
        (live.deposits24hPrl !== null ||
          live.burns24hPrl !== null ||
          live.fastLaneUsedPct !== null)) ||
        data.bridge.deposits_24h_prl !== null ||
        data.bridge.burns_24h_prl !== null ||
        data.bridge.fast_lane_used_pct !== null ||
        data.network.difficulty !== null ||
        data.network.block_time_sec !== null ||
        data.network.active_workers !== null) ? (
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Stat
            label="Bridge deposits 24h"
            value={(() => {
              const v = live?.deposits24hPrl ?? data.bridge.deposits_24h_prl;
              return v !== null && v !== undefined ? `${fmtCompact(v)} PRL` : "—";
            })()}
            sub={live?.deposits24hPrl !== null && live?.deposits24hPrl !== undefined ? "live" : undefined}
          />
          <Stat
            label="Bridge burns 24h"
            value={(() => {
              const v = live?.burns24hPrl ?? data.bridge.burns_24h_prl;
              return v !== null && v !== undefined ? `${fmtCompact(v)} PRL` : "—";
            })()}
            sub={live?.burns24hPrl !== null && live?.burns24hPrl !== undefined ? "live" : undefined}
          />
          <Stat
            label="Fast lane used (24h)"
            value={fmtPct(live?.fastLaneUsedPct ?? data.bridge.fast_lane_used_pct)}
            sub={
              live?.fastLaneLeftPrl !== null && live?.fastLaneLeftPrl !== undefined
                ? `${fmtCompact(live.fastLaneLeftPrl)} PRL left`
                : data.bridge.active_addresses_24h !== null
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
          <Stat
            label="Pool workers"
            value={fmtCompact(data.network.active_workers)}
            sub={data.network.active_workers_scope ?? undefined}
          />
        </section>
      ) : null}

      {history && history.entries.length ? (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
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

      {data.social &&
      (data.social.summary ||
        (data.social.sample_tweets && data.social.sample_tweets.length) ||
        data.social.mentions_24h !== null) ? (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold tracking-tight text-gray-300 uppercase flex items-center gap-2">
              Social
              {data.social.sentiment ? (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-medium normal-case ${
                    data.social.sentiment === "bullish"
                      ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
                      : data.social.sentiment === "bearish"
                        ? "text-red-300 border-red-500/30 bg-red-500/10"
                        : "text-gray-300 border-white/10 bg-white/5"
                  }`}
                >
                  {data.social.sentiment}
                </span>
              ) : null}
              {data.social.mentions_24h !== null && data.social.mentions_24h !== undefined ? (
                <span className="text-gray-600 normal-case font-normal text-xs">
                  {fmtCompact(data.social.mentions_24h)} mentions 24h
                </span>
              ) : null}
            </h2>
          </div>
          {data.social.summary ? (
            <p className="text-[12px] text-gray-300 leading-relaxed rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2.5">
              {data.social.summary}
            </p>
          ) : null}
          {data.social.sample_tweets && data.social.sample_tweets.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data.social.sample_tweets.slice(0, 4).map((t, i) => {
                const inner = (
                  <div className="h-full rounded-lg bg-white/[0.03] border border-white/5 hover:border-white/15 transition-colors px-3 py-2">
                    <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-1">
                      <span className="text-[#00e5d0]">{t.handle ?? "anon"}</span>
                      {t.posted_at ? <span>· {fmtRelative(t.posted_at)}</span> : null}
                    </div>
                    {t.snippet ? (
                      <p className="text-[12px] text-gray-300 leading-snug line-clamp-3">
                        {t.snippet}
                      </p>
                    ) : null}
                  </div>
                );
                return t.url ? (
                  <a
                    key={i}
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    {inner}
                  </a>
                ) : (
                  <div key={i}>{inner}</div>
                );
              })}
            </div>
          ) : null}
          {data.social.tracked_accounts && data.social.tracked_accounts.length ? (
            <p className="text-[10px] text-gray-600">
              tracked: {data.social.tracked_accounts.join(" · ")}
            </p>
          ) : null}
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
