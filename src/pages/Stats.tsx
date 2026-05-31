import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RELAY_API_BASE } from "../lib/config";
import { grainsToWholePrlWithCommas } from "../lib/utils";

type Bucket = { count: number; grains: string };
type Window = { mint: Bucket; burn: Bucket; intermediary: Bucket };
type StatsPayload = {
  volume: { "24h": Window; "7d": Window; all: Window };
  decimals: number;
  timestamp: number;
};

type CustodyAddrRow = { address: string; role: string; grains: string };
type CustodyAddrsPayload = { addresses: CustodyAddrRow[]; count: number; timestamp: number };

type WindowKey = "24h" | "7d" | "all";

const REFRESH_MS = 30_000;

function fmtPrl(grainsStr: string): string {
  try {
    return grainsToWholePrlWithCommas(BigInt(grainsStr));
  } catch {
    return "—";
  }
}

function sumBucket(w: Window): bigint {
  try {
    return BigInt(w.mint.grains) + BigInt(w.burn.grains) + BigInt(w.intermediary.grains);
  } catch {
    return 0n;
  }
}

function countBucket(w: Window): number {
  return w.mint.count + w.burn.count + w.intermediary.count;
}

function ageString(tsMs: number): string {
  const s = Math.max(0, Math.round((Date.now() - tsMs) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

export function Stats() {
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [supply, setSupply] = useState<string | null>(null);
  const [custodyAddrs, setCustodyAddrs] = useState<CustodyAddrsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<WindowKey>("24h");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [sRes, supRes, cRes] = await Promise.all([
          fetch(`${RELAY_API_BASE}/api/stats`, { credentials: "include" }),
          fetch(`${RELAY_API_BASE}/api/supply`, { credentials: "include" }),
          fetch(`${RELAY_API_BASE}/api/custody/addresses`, { credentials: "include" }),
        ]);
        if (cancelled) return;
        if (sRes.ok) setStats((await sRes.json()) as StatsPayload);
        if (supRes.ok) setSupply((await supRes.text()).trim());
        if (cRes.ok) setCustodyAddrs((await cRes.json()) as CustodyAddrsPayload);
        setErr(null);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "load failed");
      }
    }

    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // TVL = sum of grains held at lock + deposit addresses (the on-chain WPRL
  // is collateralised against these). Fees = grains held at the fee
  // collection address. Both come from the same custody scan the audit page
  // uses, so /stats and /audit can never disagree.
  let tvlGrains: bigint | null = null;
  let feeGrains: bigint | null = null;
  if (custodyAddrs) {
    let tvl = 0n;
    let fee = 0n;
    for (const row of custodyAddrs.addresses) {
      try {
        const g = BigInt(row.grains);
        if (row.role === "lock" || row.role === "deposit") tvl += g;
        if (row.role === "fee") fee += g;
      } catch {
        /* skip malformed rows */
      }
    }
    tvlGrains = tvl;
    feeGrains = fee;
  }

  const w = stats ? stats.volume[tab] : null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-12">
      <div>
        <h1 className="text-3xl font-extrabold mb-2">Bridge Stats</h1>
        <p className="text-gray-400 text-sm">
          Live bridge usage. TVL and fees come from the on-chain custody
          scan (same source as the{" "}
          <Link to="/audit" className="text-[#00e5d0] hover:underline">
            audit page
          </Link>
          ). Volume counts are server-side bridge events. Refreshes every 30s.
        </p>
        {err && (
          <p className="text-xs text-red-400 mt-2">Last refresh failed: {err}</p>
        )}
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass rounded-2xl p-4 text-center">
          <div className="text-gray-400 text-[11px] uppercase tracking-wide mb-1">
            TVL
          </div>
          <div className="text-2xl font-extrabold text-[#00e5d0] tabular-nums">
            {tvlGrains !== null ? grainsToWholePrlWithCommas(tvlGrains) : "—"}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">PRL locked</div>
        </div>
        <div className="glass rounded-2xl p-4 text-center">
          <div className="text-gray-400 text-[11px] uppercase tracking-wide mb-1">
            WPRL Supply
          </div>
          <div className="text-2xl font-extrabold text-white tabular-nums">
            {supply ? Number(supply).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">on Ethereum</div>
        </div>
        <div className="glass rounded-2xl p-4 text-center">
          <div className="text-gray-400 text-[11px] uppercase tracking-wide mb-1">
            Fees Collected
          </div>
          <div className="text-2xl font-extrabold text-white tabular-nums">
            {feeGrains !== null ? grainsToWholePrlWithCommas(feeGrains) : "—"}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">PRL, lifetime</div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold">Volume</h2>
            <p className="text-xs text-gray-500">
              Total PRL value moved through the bridge, split by direction.
            </p>
          </div>
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {(["24h", "7d", "all"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  tab === k
                    ? "bg-[#00e5d0] text-black"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {k === "all" ? "All-time" : k}
              </button>
            ))}
          </div>
        </div>

        {w ? (
          <>
            <div className="glass rounded-2xl p-5">
              <div className="text-gray-400 text-[11px] uppercase tracking-wide mb-1">
                Total volume ({tab === "all" ? "all-time" : tab})
              </div>
              <div className="text-3xl font-extrabold text-white tabular-nums">
                {grainsToWholePrlWithCommas(sumBucket(w))} PRL
              </div>
              <div className="text-[11px] text-gray-500 mt-1 tabular-nums">
                {countBucket(w).toLocaleString("en-US")} bridge events
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <DirectionCard
                label="Deposit → WPRL"
                copy="PRL locked, WPRL minted on Ethereum."
                bucket={w.mint}
                accent="text-[#00e5d0]"
              />
              <DirectionCard
                label="WPRL → Pearl"
                copy="WPRL burned on Ethereum, PRL unlocked."
                bucket={w.burn}
                accent="text-emerald-400"
              />
              <DirectionCard
                label="Intermediary"
                copy="Direct WPRL-funded unwraps for partners."
                bucket={w.intermediary}
                accent="text-sky-400"
              />
            </div>
          </>
        ) : (
          <div className="glass rounded-2xl p-5 text-sm text-gray-500">
            Loading volume…
          </div>
        )}
      </section>

      <div className="text-[11px] text-gray-600">
        {stats ? `Updated ${ageString(stats.timestamp)}` : null}
        {stats && custodyAddrs ? " · " : null}
        {custodyAddrs ? `Custody scan ${ageString(custodyAddrs.timestamp)}` : null}
      </div>
    </div>
  );
}

function DirectionCard({
  label,
  copy,
  bucket,
  accent,
}: {
  label: string;
  copy: string;
  bucket: Bucket;
  accent: string;
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-gray-400 text-[11px] uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className={`text-2xl font-extrabold ${accent} tabular-nums`}>
        {fmtPrl(bucket.grains)}
      </div>
      <div className="text-[10px] text-gray-500 mt-0.5">PRL</div>
      <div className="text-[11px] text-gray-400 mt-2 tabular-nums">
        {bucket.count.toLocaleString("en-US")} txs
      </div>
      <div className="text-[10px] text-gray-500 mt-2 leading-relaxed">
        {copy}
      </div>
    </div>
  );
}
