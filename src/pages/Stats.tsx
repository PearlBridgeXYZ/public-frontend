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

// Inflow = WPRL minted on Ethereum (PRL deposited and locked).
// Outflow = WPRL leaving Ethereum, returning PRL — burn + intermediary
//           (partner-funded WPRL unwrap that still releases locked PRL).
function inflowGrains(w: Window): bigint {
  try {
    return BigInt(w.mint.grains);
  } catch {
    return 0n;
  }
}

function outflowGrains(w: Window): bigint {
  try {
    return BigInt(w.burn.grains) + BigInt(w.intermediary.grains);
  } catch {
    return 0n;
  }
}

function netSignedString(net: bigint): string {
  const abs = net < 0n ? -net : net;
  const sign = net > 0n ? "+" : net < 0n ? "−" : "";
  return `${sign}${grainsToWholePrlWithCommas(abs)}`;
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
  const [lastFetchMs, setLastFetchMs] = useState<number>(Date.now());
  const [tickNow, setTickNow] = useState<number>(Date.now());

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
        setLastFetchMs(Date.now());
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "load failed");
      }
    }

    load();
    const t = setInterval(load, REFRESH_MS);
    // Separate 1s ticker so the "next refresh in Xs" countdown actually
    // counts down — REFRESH_MS itself only fires every 30s.
    const ui = setInterval(() => setTickNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
      clearInterval(ui);
    };
  }, []);

  // TVL = total PRL collateral backing WPRL: hot lock + cold treasury + any
  // in-flight deposit balances. Fees = grains at the fee collection address.
  // Same custody scan the audit page uses, so /stats and /audit can never
  // disagree. The "fee" address sits outside TVL — fees are revenue, not
  // collateral.
  let tvlGrains: bigint | null = null;
  let feeGrains: bigint | null = null;
  if (custodyAddrs) {
    let tvl = 0n;
    let fee = 0n;
    for (const row of custodyAddrs.addresses) {
      try {
        const g = BigInt(row.grains);
        if (row.role === "lock" || row.role === "deposit" || row.role === "treasury") tvl += g;
        if (row.role === "fee") fee += g;
      } catch {
        /* skip malformed rows */
      }
    }
    tvlGrains = tvl;
    feeGrains = fee;
  }

  const w = stats ? stats.volume[tab] : null;
  const inflow = w ? inflowGrains(w) : 0n;
  const outflow = w ? outflowGrains(w) : 0n;
  const net = inflow - outflow;

  // 30s refresh tick; show seconds remaining so it's visible that the
  // page is live (G called this out 2026-05-31 — felt static even
  // though it polled every 30s).
  const secsSinceFetch = Math.max(0, Math.floor((tickNow - lastFetchMs) / 1000));
  const secsToNext = Math.max(0, Math.ceil((REFRESH_MS - (tickNow - lastFetchMs)) / 1000));

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-12">
      <div>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
          <h1 className="text-3xl font-extrabold">Bridge Stats</h1>
          <div
            className="flex items-center gap-2 text-[11px] text-gray-400 tabular-nums"
            title={`Auto-refreshes every ${REFRESH_MS / 1000}s. Last refresh ${secsSinceFetch}s ago.`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
            <span>
              Live · refresh in {secsToNext}s
            </span>
          </div>
        </div>
        <p className="text-gray-400 text-sm">
          Live bridge usage. TVL and fees come from the on-chain custody
          scan (same source as the{" "}
          <Link to="/audit" className="text-[#00e5d0] hover:underline">
            audit page
          </Link>
          ). Volume counts are server-side bridge events. Auto-refreshes every 30s.
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="glass rounded-2xl p-5">
                <div className="text-[#00e5d0] text-[11px] uppercase tracking-wide mb-1 flex items-center gap-1.5">
                  <span aria-hidden>↓</span>
                  <span>Inflow</span>
                </div>
                <div className="text-3xl font-extrabold text-[#00e5d0] tabular-nums">
                  {grainsToWholePrlWithCommas(inflow)}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  PRL locked → WPRL minted
                </div>
                <div className="text-[11px] text-gray-400 mt-2 tabular-nums">
                  {w.mint.count.toLocaleString("en-US")} deposits
                </div>
              </div>

              <div className="glass rounded-2xl p-5">
                <div className="text-amber-400 text-[11px] uppercase tracking-wide mb-1 flex items-center gap-1.5">
                  <span aria-hidden>↑</span>
                  <span>Outflow</span>
                </div>
                <div className="text-3xl font-extrabold text-amber-400 tabular-nums">
                  {grainsToWholePrlWithCommas(outflow)}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  WPRL burned → PRL unlocked
                </div>
                <div className="text-[11px] text-gray-400 mt-2 tabular-nums">
                  {(w.burn.count + w.intermediary.count).toLocaleString("en-US")} unlocks
                </div>
              </div>

              <div className="glass rounded-2xl p-5">
                <div className="text-gray-400 text-[11px] uppercase tracking-wide mb-1">
                  Net flow
                </div>
                <div
                  className={`text-3xl font-extrabold tabular-nums ${
                    net > 0n ? "text-[#00e5d0]" : net < 0n ? "text-amber-400" : "text-white"
                  }`}
                >
                  {netSignedString(net)}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  Inflow − Outflow ({tab === "all" ? "all-time" : tab})
                </div>
                <div className="text-[11px] text-gray-400 mt-2">
                  {net > 0n
                    ? "more PRL coming in than going out"
                    : net < 0n
                      ? "more PRL leaving than entering"
                      : "balanced"}
                </div>
              </div>
            </div>

            <div className="glass rounded-2xl p-4">
              <div className="text-gray-400 text-[11px] uppercase tracking-wide mb-2">
                Breakdown
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
                <div className="flex items-baseline justify-between">
                  <span className="text-gray-400">Deposit → WPRL</span>
                  <span className="font-semibold text-[#00e5d0] tabular-nums">
                    {fmtPrl(w.mint.grains)}{" "}
                    <span className="text-[10px] text-gray-500">
                      ({w.mint.count.toLocaleString("en-US")})
                    </span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-gray-400">WPRL → Pearl</span>
                  <span className="font-semibold text-emerald-400 tabular-nums">
                    {fmtPrl(w.burn.grains)}{" "}
                    <span className="text-[10px] text-gray-500">
                      ({w.burn.count.toLocaleString("en-US")})
                    </span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-gray-400">Intermediary</span>
                  <span className="font-semibold text-sky-400 tabular-nums">
                    {fmtPrl(w.intermediary.grains)}{" "}
                    <span className="text-[10px] text-gray-500">
                      ({w.intermediary.count.toLocaleString("en-US")})
                    </span>
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">
                Intermediary unwraps are partner-funded WPRL → PRL conversions
                that still release locked PRL, so they count toward outflow.
              </p>
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

