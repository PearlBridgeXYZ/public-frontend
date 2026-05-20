import { useEffect, useMemo, useState } from "react";
import type { AuthenticationStatus } from "@rainbow-me/rainbowkit";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { RELAY_API_BASE } from "../lib/config";
import { grainsToDisplay, shortAddress } from "../lib/utils";
import { getAuthStatus, subscribeAuthStatus } from "../lib/authStore";

// RC4.0 /api/pending-mints — operator-facing view of the slow-lane queue.
// Returns every mint currently in state='queued' (and optionally a recent
// cancelled[] tail for audit context). We render the queued list as a
// sortable table; cancelled rows surface in a smaller secondary section so
// ops can still see the reason after the row drains from the live queue.
//
// SIWE auth shared with /api/history — `credentials: "include"` carries the
// session cookie, and the page only mounts the fetch loop after the auth
// store reports an authenticated session. WS-B may further restrict to a
// specific role; the frontend defers to the relay's 401.

type QueuedMint = {
  pearlTxId: string;
  recipient: string;
  amountGrains: string;
  readyAt: number;
  status: "queued";
};

type CancelledMint = {
  pearlTxId: string;
  recipient: string;
  amountGrains: string;
  cancelledAt: number;
  status: "cancelled";
  reason?: string;
};

type PendingMintsResponse = {
  queued: QueuedMint[];
  cancelled: CancelledMint[];
};

type SortKey = "readyAt" | "recipient" | "amount";

function formatAbsolute(epochSec: number): string {
  if (!epochSec) return "—";
  return new Date(epochSec * 1000).toLocaleString();
}

function formatCountdown(targetEpochSec: number, nowMs: number): string {
  const targetMs = targetEpochSec * 1000;
  const remaining = targetMs - nowMs;
  if (remaining <= 0) return "ready now";
  const sec = Math.floor(remaining / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function Operator() {
  const [authStatus, setAuthStatusLocal] = useState<AuthenticationStatus>(getAuthStatus);
  const [data, setData] = useState<PendingMintsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("readyAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => subscribeAuthStatus(setAuthStatusLocal), []);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      setData(null);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`${RELAY_API_BASE}/api/pending-mints`, {
          credentials: "include",
        });
        if (res.status === 401) throw new Error("unauthenticated");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as PendingMintsResponse;
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "load failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [authStatus]);

  // 1Hz tick so the readyAt countdown updates between 30s API refreshes.
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [authStatus]);

  const sortedQueued = useMemo(() => {
    const rows = data?.queued ?? [];
    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "readyAt") cmp = a.readyAt - b.readyAt;
      else if (sortBy === "recipient") cmp = a.recipient.localeCompare(b.recipient);
      else if (sortBy === "amount") {
        const aBig = BigInt(a.amountGrains);
        const bBig = BigInt(b.amountGrains);
        cmp = aBig < bBig ? -1 : aBig > bBig ? 1 : 0;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [data, sortBy, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(key === "readyAt" ? "asc" : "desc");
    }
  }

  if (authStatus !== "authenticated") {
    return (
      <div className="max-w-5xl mx-auto w-full px-6 py-16">
        <h1 className="text-3xl font-bold mb-3">Operator queue</h1>
        <p className="text-gray-400 mb-8">
          Sign in with an operator-authorised wallet to view the slow-lane
          mint queue.
        </p>
        <div className="glass rounded-2xl p-8 border border-white/5 flex flex-col items-center gap-4">
          <p className="text-sm text-gray-400">
            The relay gates this endpoint behind SIWE — the same session
            cookie that powers the bridge history view.
          </p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full px-6 py-12 space-y-10">
      <div>
        <h1 className="text-3xl font-extrabold mb-2">Operator queue</h1>
        <p className="text-gray-400 text-sm">
          Live view of /api/pending-mints — every slow-lane mint currently
          waiting on its readyAt, plus recent cancellations for audit context.
          Refreshes every 30s.
        </p>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
          Failed to load pending mints: {error}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Queued mints</h2>
          <span className="text-xs text-gray-500">
            {loading && !data
              ? "loading…"
              : `${sortedQueued.length} queued`}
          </span>
        </div>

        {sortedQueued.length === 0 && !loading ? (
          <div className="text-sm text-gray-400 bg-white/5 border border-white/10 rounded-xl px-4 py-6 text-center">
            No mints are currently queued in the slow lane.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-xs">
              <thead className="bg-white/5 text-gray-400 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2">Pearl txid</th>
                  <th
                    className="text-left px-3 py-2 cursor-pointer hover:text-white"
                    onClick={() => toggleSort("recipient")}
                  >
                    Recipient {sortBy === "recipient" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th
                    className="text-right px-3 py-2 cursor-pointer hover:text-white"
                    onClick={() => toggleSort("amount")}
                  >
                    Amount (PRL) {sortBy === "amount" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th
                    className="text-left px-3 py-2 cursor-pointer hover:text-white"
                    onClick={() => toggleSort("readyAt")}
                  >
                    Ready at {sortBy === "readyAt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="text-left px-3 py-2">In</th>
                </tr>
              </thead>
              <tbody>
                {sortedQueued.map((r) => (
                  <tr
                    key={r.pearlTxId}
                    className="border-t border-white/5 text-gray-300"
                  >
                    <td className="px-3 py-2 font-mono">
                      {shortAddress(r.pearlTxId)}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {shortAddress(r.recipient)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {grainsToDisplay(BigInt(r.amountGrains))}
                    </td>
                    <td className="px-3 py-2 text-gray-400 tabular-nums">
                      {formatAbsolute(r.readyAt)}
                    </td>
                    <td className="px-3 py-2 text-sky-300 tabular-nums">
                      {formatCountdown(r.readyAt, nowMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data?.cancelled && data.cancelled.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Recent cancellations</h2>
          <p className="text-xs text-gray-500">
            Surfaced from /api/pending-mints for audit context — these rows
            have already drained from the live queue.
          </p>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-xs">
              <thead className="bg-white/5 text-gray-400 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2">Pearl txid</th>
                  <th className="text-left px-3 py-2">Recipient</th>
                  <th className="text-right px-3 py-2">Amount (PRL)</th>
                  <th className="text-left px-3 py-2">Cancelled at</th>
                  <th className="text-left px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {data.cancelled.map((r) => (
                  <tr
                    key={r.pearlTxId}
                    className="border-t border-white/5 text-gray-300"
                  >
                    <td className="px-3 py-2 font-mono">
                      {shortAddress(r.pearlTxId)}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {shortAddress(r.recipient)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {grainsToDisplay(BigInt(r.amountGrains))}
                    </td>
                    <td className="px-3 py-2 text-gray-400 tabular-nums">
                      {formatAbsolute(r.cancelledAt)}
                    </td>
                    <td className="px-3 py-2 text-red-300">
                      {r.reason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
