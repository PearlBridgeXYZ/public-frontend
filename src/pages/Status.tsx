import { useEffect, useMemo, useState } from "react";
import { RELAY_API_BASE } from "../lib/config";
import { grainsToDisplay } from "../lib/utils";

type StuckDeposit = {
  pearlTxId: string;
  reason: string;
  detail?: string;
  amountGrains: string;
  firstSeenAt: number;
  lastAlertedAt: number | null;
};

type MintLookupResult =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; txid: string; state: string }
  | { kind: "error"; message: string };

const REASON_COPY: Record<string, { label: string; explainer: string }> = {
  unregistered_deposit_address: {
    label: "Unregistered deposit address",
    explainer:
      "The Pearl tx paid an address the relay does not have on file. Funds are held in the custodial UTXO set pending admin refund.",
  },
  below_min_deposit: {
    label: "Below minimum deposit",
    explainer:
      "The deposited amount was under the bridge's configured minimum. No mint is issued; refund the depositor manually.",
  },
  recipient_not_resolved: {
    label: "Recipient not resolved",
    explainer:
      "The deposit address is registered but no Ethereum recipient is bound to it. Likely a relay-side data integrity issue — contact ops.",
  },
};

function reasonCopy(reason: string) {
  return (
    REASON_COPY[reason] || {
      label: reason,
      explainer: "Unrecognised rejection reason. Contact ops for context.",
    }
  );
}

function relativeTime(epochMs: number) {
  const diff = Date.now() - epochMs;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function Status() {
  const [stuck, setStuck] = useState<StuckDeposit[] | null>(null);
  const [stuckError, setStuckError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [reasonCounts, setReasonCounts] = useState<Record<string, number>>({});
  const [redacted, setRedacted] = useState(false);
  const [filter, setFilter] = useState("");
  const [lookupTxid, setLookupTxid] = useState("");
  const [lookup, setLookup] = useState<MintLookupResult>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${RELAY_API_BASE}/api/stuck-deposits`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          deposits: StuckDeposit[];
          count?: number;
          reasonCounts?: Record<string, number>;
          redacted?: boolean;
        };
        if (!cancelled) {
          setStuck(json.deposits ?? []);
          setTotalCount(typeof json.count === "number" ? json.count : json.deposits?.length ?? 0);
          setReasonCounts(json.reasonCounts ?? {});
          setRedacted(!!json.redacted);
          setStuckError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setStuck([]);
          setTotalCount(null);
          setReasonCounts({});
          setRedacted(false);
          setStuckError(
            e?.message ?? "Failed to load stuck deposits — relay unreachable?",
          );
        }
      }
    }
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const filtered = useMemo(() => {
    if (!stuck) return [];
    const f = filter.trim().toLowerCase();
    if (!f) return stuck;
    return stuck.filter(
      (d) => d.pearlTxId.toLowerCase().includes(f) || d.reason.toLowerCase().includes(f),
    );
  }, [stuck, filter]);

  async function runLookup() {
    const txid = lookupTxid.trim();
    if (!txid) return;
    setLookup({ kind: "loading" });
    try {
      const res = await fetch(
        `${RELAY_API_BASE}/api/mint-status?txid=${encodeURIComponent(txid)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { txid: string; state: string };
      setLookup({ kind: "ok", txid: json.txid, state: json.state });
    } catch (e: any) {
      setLookup({ kind: "error", message: e?.message ?? "Lookup failed" });
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-12">
      <div>
        <h1 className="text-3xl font-extrabold mb-2">Bridge Status</h1>
        <p className="text-gray-400 text-sm">
          Per-deposit state breakdown. Stuck deposits below need an admin refund.
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-1">Look up a deposit</h2>
          <p className="text-xs text-gray-500">
            Paste a Pearl txid to check its state in the relay (pending,
            attesting, minted, or rejected).
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={lookupTxid}
            onChange={(e) => setLookupTxid(e.target.value)}
            placeholder="Pearl txid…"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-[#00e5d0]/50 transition-colors"
            onKeyDown={(e) => {
              if (e.key === "Enter") runLookup();
            }}
          />
          <button
            onClick={runLookup}
            disabled={!lookupTxid.trim() || lookup.kind === "loading"}
            className="px-5 py-2.5 bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] text-black font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Look up
          </button>
        </div>
        {lookup.kind === "ok" && (
          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm space-y-1">
            <div className="text-gray-400 text-xs uppercase tracking-wide">Result</div>
            <div className="font-mono text-xs text-gray-300 break-all">{lookup.txid}</div>
            <div className="text-white">
              State: <span className="font-semibold text-[#00e5d0]">{lookup.state || "unknown"}</span>
            </div>
          </div>
        )}
        {lookup.kind === "error" && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
            {lookup.message}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Stuck deposits</h2>
          <span className="text-xs text-gray-500">
            {stuck === null
              ? "loading…"
              : `${totalCount ?? stuck.length} unresolved`}
          </span>
        </div>

        {redacted && (
          <div className="text-xs text-gray-400 bg-white/5 border border-white/10 rounded-xl px-3 py-2 space-y-2">
            <p>
              Per-deposit details are gated behind a wallet signature. Sign in with
              your Ethereum wallet to see txids, amounts, and timing. The aggregate
              counts below are public.
            </p>
            {Object.keys(reasonCounts).length > 0 && (
              <ul className="text-gray-300">
                {Object.entries(reasonCounts).map(([reason, n]) => (
                  <li key={reason}>
                    <span className="text-yellow-300">{reasonCopy(reason).label}</span>:{" "}
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by txid or reason…"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-[#00e5d0]/50 transition-colors"
        />

        {stuckError && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
            {stuckError}
          </div>
        )}

        {stuck !== null && stuck.length === 0 && !stuckError && !redacted && (
          <div className="text-sm text-gray-400 bg-white/5 border border-white/10 rounded-xl px-4 py-6 text-center">
            No stuck deposits. The relay has cleared every observed Pearl
            deposit successfully.
          </div>
        )}

        <div className="space-y-3">
          {filtered.map((d) => {
            const copy = reasonCopy(d.reason);
            return (
              <div
                key={d.pearlTxId}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-4 space-y-2"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="font-mono text-xs text-gray-400 break-all">
                    {d.pearlTxId}
                  </div>
                  <div className="text-xs text-gray-500">
                    {relativeTime(d.firstSeenAt)}
                  </div>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-yellow-300 font-semibold text-sm">
                    {copy.label}
                  </span>
                  <span className="text-white text-sm">
                    {grainsToDisplay(BigInt(d.amountGrains))} PRL
                  </span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  {copy.explainer}
                </p>
                {d.detail && (
                  <p className="text-xs text-gray-500 font-mono break-all">
                    {d.detail}
                  </p>
                )}
                <div className="pt-1">
                  <a
                    href={`mailto:refunds@pearlbridge.xyz?subject=${encodeURIComponent(
                      `Refund request: ${d.pearlTxId}`,
                    )}&body=${encodeURIComponent(
                      `I am requesting a refund for the deposit at txid ${d.pearlTxId}.\n\nReason logged by relay: ${d.reason}\n\nMy Pearl source address: <fill in>\nProof of ownership: <attach signed message>`,
                    )}`}
                    className="text-xs text-[#00e5d0] hover:underline"
                  >
                    Request refund →
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {stuck !== null && stuck.length > 0 && filtered.length === 0 && (
          <div className="text-xs text-gray-500 text-center py-3">
            No stuck deposits match the filter.
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Deposit state legend</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/*
            RC4.0 expands the state set with two slow-lane outcomes:
              queued    — over the daily fast-lane cap; mint scheduled for a
                          future readyAt. Coloured sky-blue to distinguish
                          from yellow in-progress.
              cancelled — reorg-watch or admin called cancelPendingMint;
                          terminal failure, refund path required. Coloured red
                          to read as "won't complete", not "still working".
          */}
          {(
            [
              ["pending", "yellow", "Pearl tx seen but not yet confirmed enough."],
              ["attesting", "yellow", "Confirmations met; relay is signing the mint attestation."],
              ["queued", "sky", "Slow-lane mint — over the daily fast-lane cap; finalises automatically at readyAt (~24h)."],
              ["minted", "emerald", "WPRL minted on Ethereum. Done."],
              ["cancelled", "red", "Mint cancelled (reorg-watch or admin). Funds held pending refund — see stuck deposits."],
              ["rejected", "red", "Deposit failed validation. See stuck deposits above."],
              ["refunded", "emerald", "Admin refund executed; PRL returned to depositor."],
            ] as const
          ).map(([state, color, copy]) => {
            const dot =
              color === "emerald"
                ? "bg-emerald-400"
                : color === "red"
                  ? "bg-red-400"
                  : color === "sky"
                    ? "bg-sky-400"
                    : "bg-yellow-400";
            return (
              <div
                key={state}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${dot}`}
                    aria-hidden="true"
                  />
                  <div
                    className="font-semibold text-white text-sm"
                    aria-label={state}
                  >
                    {state}
                  </div>
                </div>
                <div className="text-gray-400">{copy}</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
