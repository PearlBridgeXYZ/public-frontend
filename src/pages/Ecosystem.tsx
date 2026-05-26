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

function fmtPct(n: number | null | undefined, signed = false): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
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

function CategoryPill({ c }: { c: EcoEntry["category"] }) {
  const palette: Record<EcoEntry["category"], string> = {
    explorer: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    wallet: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    bridge: "bg-[#00e5d0]/15 text-[#00e5d0] border-[#00e5d0]/30",
    dapp: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    inscription: "bg-pink-500/15 text-pink-300 border-pink-500/30",
    news: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    tool: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    pool: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    other: "bg-white/5 text-gray-300 border-white/10",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide border ${palette[c] ?? palette.other}`}
    >
      {c}
    </span>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      <div className="text-xl font-semibold text-white">{value}</div>
      {sub ? <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div> : null}
    </div>
  );
}

export function Ecosystem() {
  const [data, setData] = useState<EcosystemData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Cache-bust on each mount; CF Pages serves /data/ecosystem.json with the
    // default static cache headers, but the daily refresh commits a fresh file
    // to the next branch and triggers a redeploy, so the asset itself is the
    // versioning surface — the query string only prevents a stale browser
    // cache from masking a deploy that already landed at the edge.
    fetch(`/data/ecosystem.json?t=${Date.now()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<EcosystemData>;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <p className="text-red-400">Failed to load ecosystem data: {error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <p className="text-gray-400">Loading ecosystem snapshot…</p>
      </div>
    );
  }

  const seeded = data.updated_at === null;
  const byCategory = data.ecosystem.reduce<Record<string, EcoEntry[]>>((acc, e) => {
    (acc[e.category] ??= []).push(e);
    return acc;
  }, {});

  const orderedCats: EcoEntry["category"][] = [
    "explorer",
    "wallet",
    "bridge",
    "pool",
    "dapp",
    "inscription",
    "tool",
    "news",
    "other",
  ];

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-[#00e5d0] font-medium border border-[#00e5d0]/20">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00e5d0] animate-pulse" />
          Ecosystem
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight">Pearl Ecosystem</h1>
        <p className="text-gray-400 text-base leading-relaxed max-w-3xl">
          A daily snapshot of the Pearl chain ecosystem: market activity, network health,
          bridge flows, repo cadence, and a running catalog of dapps, wallets, explorers,
          and tooling we&apos;ve seen ship.
        </p>
        <p className="text-xs text-gray-500">
          {seeded ? (
            <>Snapshot seeded — first refresh pending.</>
          ) : (
            <>
              Updated <span className="text-gray-300">{fmtRelative(data.updated_at)}</span>
              {data.next_refresh_at ? (
                <> · next refresh <span className="text-gray-300">{fmtRelative(data.next_refresh_at)}</span></>
              ) : null}
            </>
          )}
        </p>
      </header>

      {data.narrative ? (
        <section className="glass rounded-2xl p-6 border border-[#00e5d0]/20">
          <div className="text-[10px] uppercase tracking-wide text-[#00e5d0] mb-2">
            Today&apos;s read
          </div>
          <p className="text-gray-300 leading-relaxed text-sm whitespace-pre-line">
            {data.narrative}
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Market</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile
            label="PRL price"
            value={fmtUsd(data.market.prl_price_usd, 4)}
            sub={fmtPct(data.market.prl_change_24h_pct, true) + " 24h"}
          />
          <StatTile
            label="24h volume"
            value={fmtUsd(data.market.prl_volume_24h_usd)}
          />
          <StatTile
            label="Market cap"
            value={fmtUsd(data.market.prl_market_cap_usd)}
          />
          <StatTile
            label="WPRL premium"
            value={fmtPct(data.market.wprl_premium_pct, true)}
            sub={data.market.wprl_price_usd ? fmtUsd(data.market.wprl_price_usd, 4) : undefined}
          />
        </div>
        {data.market.sources.length ? (
          <p className="text-[11px] text-gray-500">Sources: {data.market.sources.join(", ")}</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Network</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Hashrate" value={data.network.hashrate ?? "—"} />
          <StatTile label="Difficulty" value={data.network.difficulty ?? "—"} />
          <StatTile label="Block height" value={fmtNum(data.network.block_height)} />
          <StatTile
            label="Block time"
            value={data.network.block_time_sec !== null ? `${data.network.block_time_sec}s` : "—"}
            sub={
              data.network.active_workers !== null
                ? `${fmtNum(data.network.active_workers)} workers`
                : undefined
            }
          />
        </div>
        {data.network.sources.length ? (
          <p className="text-[11px] text-gray-500">Sources: {data.network.sources.join(", ")}</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">PearlBridge activity</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile
            label="TVL"
            value={data.bridge.tvl_prl !== null ? `${fmtNum(data.bridge.tvl_prl)} PRL` : "—"}
            sub={data.bridge.tvl_usd ? fmtUsd(data.bridge.tvl_usd) : undefined}
          />
          <StatTile
            label="Deposits 24h"
            value={data.bridge.deposits_24h_prl !== null ? `${fmtNum(data.bridge.deposits_24h_prl)} PRL` : "—"}
          />
          <StatTile
            label="Burns 24h"
            value={data.bridge.burns_24h_prl !== null ? `${fmtNum(data.bridge.burns_24h_prl)} PRL` : "—"}
          />
          <StatTile
            label="Fast-lane used"
            value={fmtPct(data.bridge.fast_lane_used_pct)}
            sub={
              data.bridge.active_addresses_24h !== null
                ? `${fmtNum(data.bridge.active_addresses_24h)} addrs`
                : undefined
            }
          />
        </div>
        {data.bridge.anomalies.length ? (
          <ul className="text-xs text-amber-300 space-y-1 pl-4">
            {data.bridge.anomalies.map((a, i) => (
              <li key={i} className="list-disc list-outside">{a}</li>
            ))}
          </ul>
        ) : null}
        <p className="text-[11px] text-gray-500">
          Live operational data: <Link to="/status" className="text-[#00e5d0] hover:underline">/status</Link>
          {" · "}
          <Link to="/audit" className="text-[#00e5d0] hover:underline">/audit</Link>
        </p>
      </section>

      {data.github.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Repo activity (7d)</h2>
          <div className="glass rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-white/5">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Repo</th>
                  <th className="text-right px-4 py-2 font-medium">★</th>
                  <th className="text-right px-4 py-2 font-medium">Commits 7d</th>
                  <th className="text-right px-4 py-2 font-medium">Open PRs</th>
                  <th className="text-right px-4 py-2 font-medium">Last commit</th>
                </tr>
              </thead>
              <tbody>
                {data.github.map((r, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="px-4 py-2 text-gray-300">
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:text-[#00e5d0]">
                          {r.repo}
                        </a>
                      ) : (
                        r.repo
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-400">{fmtNum(r.stars)}</td>
                    <td className="px-4 py-2 text-right text-gray-400">{fmtNum(r.commits_7d)}</td>
                    <td className="px-4 py-2 text-right text-gray-400">{fmtNum(r.open_prs)}</td>
                    <td className="px-4 py-2 text-right text-gray-500 text-xs">
                      {fmtRelative(r.last_commit_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Projects we&apos;ve seen ship</h2>
          <span className="text-[11px] text-gray-500">{data.ecosystem.length} tracked</span>
        </div>
        {data.ecosystem.length === 0 ? (
          <p className="text-gray-500 text-sm">No entries yet — first refresh pending.</p>
        ) : (
          <div className="space-y-6">
            {orderedCats.map((cat) => {
              const items = byCategory[cat];
              if (!items || items.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">
                    {cat} <span className="text-gray-600">({items.length})</span>
                  </div>
                  <ul className="space-y-2">
                    {items.map((e, i) => (
                      <li key={i} className="glass rounded-xl p-4 flex flex-col sm:flex-row sm:items-start sm:gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {e.url ? (
                              <a
                                href={e.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-white hover:text-[#00e5d0] truncate"
                              >
                                {e.name}
                              </a>
                            ) : (
                              <span className="font-semibold text-white truncate">{e.name}</span>
                            )}
                            <CategoryPill c={e.category} />
                            {e.status ? (
                              <span className="text-[10px] uppercase tracking-wide text-gray-500">
                                {e.status}
                              </span>
                            ) : null}
                          </div>
                          {e.description ? (
                            <p className="text-xs text-gray-400 leading-relaxed mt-1">{e.description}</p>
                          ) : null}
                          {(e.first_seen || e.source) ? (
                            <p className="text-[10px] text-gray-600 mt-1">
                              {e.first_seen ? <>first seen {e.first_seen}</> : null}
                              {e.first_seen && e.source ? " · " : ""}
                              {e.source ? <>via {e.source}</> : null}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {data.incidents.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Incidents &amp; notes</h2>
          <ul className="space-y-2">
            {data.incidents.map((it, i) => (
              <li key={i} className="glass rounded-xl p-3 text-sm">
                <span className="text-gray-500 text-xs mr-2">{it.date}</span>
                {it.url ? (
                  <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-[#00e5d0] hover:underline">
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

      <footer className="text-[11px] text-gray-600 border-t border-white/5 pt-4">
        Refreshed daily by an automated aggregator. This page is a best-effort
        snapshot, not investment advice. Project listings here do not imply
        endorsement.
      </footer>
    </div>
  );
}
