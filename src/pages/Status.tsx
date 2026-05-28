import { useState } from "react";
import { Link } from "react-router-dom";
import { RELAY_API_BASE } from "../lib/config";

type MintLookupResult =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; txid: string; state: string }
  | { kind: "error"; message: string };

export function Status() {
  const [lookupTxid, setLookupTxid] = useState("");
  const [lookup, setLookup] = useState<MintLookupResult>({ kind: "idle" });

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
          Look up your own deposit by Pearl txid. Per-deposit reason details
          and operator-contact paths live on the order page.
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-1">Look up a deposit</h2>
          <p className="text-xs text-gray-500">
            Paste a Pearl txid to check its state in the relay (pending,
            attesting, minted, queued, under review, cancelled, or rejected).
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
          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm space-y-2">
            <div className="text-gray-400 text-xs uppercase tracking-wide">Result</div>
            <div className="font-mono text-xs text-gray-300 break-all">{lookup.txid}</div>
            <div className="text-white">
              State: <span className="font-semibold text-[#00e5d0]">{lookup.state || "unknown"}</span>
            </div>
            {/^[0-9a-f]{64}$/i.test(lookup.txid) && (
              <Link
                to={`/order/${lookup.txid.toLowerCase()}`}
                className="inline-block text-xs text-[#00e5d0] hover:underline"
              >
                View full order status &rarr;
              </Link>
            )}
          </div>
        )}
        {lookup.kind === "error" && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
            {lookup.message}
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
              ["cancelled", "red", "Mint cancelled (reorg-watch or admin). Funds held pending refund — open the order page for the cancel reason and operator contact."],
              ["rejected", "red", "Deposit failed validation. Open the order page for the reject reason and operator contact."],
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
