import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import type { AuthenticationStatus } from "@rainbow-me/rainbowkit";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  PEARL_EXPLORER_BASE,
  RELAY_API_BASE,
  ethExplorerTxUrl,
} from "../lib/config";
import { grainsToDisplay, shortAddress } from "../lib/utils";
import { getAuthStatus, subscribeAuthStatus } from "../lib/authStore";

// Server-shape: /api/history returns string grains so JS can keep BigInt.
// RC4.0 adds tiered-cap slow-lane fields (`queuedAt`/`readyAt`) and the
// reorg-cancel terminal-state fields (`cancelledAt`/`cancelReason`). All four
// are nullable — populated only when the mint touched the slow lane or was
// cancelled, `null` for plain fast-lane mints.
type ServerMint = {
  pearlTxId: string;
  ethRecipient: string;
  grossAmountGrains: string;
  state: string;
  ethTxHash: string | null;
  createdAt: number | null;
  queuedAt?: number | null;
  readyAt?: number | null;
  cancelledAt?: number | null;
  cancelReason?: string | null;
};

type ServerBurn = {
  ethTxHash: string;
  sender: string;
  netAmountGrains: string;
  pearlAddress: string;
  blockNumber: number;
  state: string;
  pearlTxId: string | null;
  createdAt: number | null;
};

type HistoryResponse = {
  address: string;
  mints: ServerMint[];
  burns: ServerBurn[];
};

// Direction-tagged union over the two row shapes so we can render a single
// merged, time-sorted feed. Falls back to "0" timestamp for legacy rows that
// pre-date the createdAt column.
type TimelineItem =
  | { kind: "mint"; ts: number; row: ServerMint }
  | { kind: "burn"; ts: number; row: ServerBurn };

function relativeTime(epochMs: number): string {
  if (!epochMs) return "—";
  const diff = Date.now() - epochMs;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// RC4.0 state palette:
//   green  — terminal success: completed, minted, unlocked
//   red    — terminal failure: failed, rejected, cancelled (NEW — was bucketed
//            into "yellow in-progress" pre-RC4.1 which lied to users)
//   blue   — slow-lane queued (NEW — distinct from yellow pending so users
//            with infinite-timer mints can tell their mint hasn't stalled)
//   yellow — true in-progress: pending, attesting, anything unknown
function StateBadge({ state, title }: { state: string; title?: string }) {
  const tone =
    state === "completed" || state === "minted" || state === "unlocked"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : state === "failed" || state === "rejected" || state === "cancelled"
        ? "bg-red-500/15 text-red-300 border-red-500/30"
        : state === "queued"
          ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
          : "bg-yellow-500/15 text-yellow-300 border-yellow-500/30";
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${tone}`}
      role="status"
      aria-label={state}
      title={title}
    >
      {state}
    </span>
  );
}

function MintRow({ row }: { row: ServerMint }) {
  const ethLink = row.ethTxHash ? ethExplorerTxUrl(row.ethTxHash) : null;
  const pearlLink = `${PEARL_EXPLORER_BASE}/tx/${row.pearlTxId}`;
  // Tooltip on cancelled rows so the user can read the cancel reason without
  // a dedicated detail page. Native `title` attribute is enough — keeps the
  // table scannable while still surfacing the reason on hover.
  const badgeTitle =
    row.state === "cancelled" && row.cancelReason
      ? `Cancelled: ${row.cancelReason}`
      : row.state === "queued" && row.readyAt
        ? `Queued — slow-lane mint scheduled for ${new Date(
            row.readyAt,
          ).toLocaleString()}`
        : undefined;
  return (
    <div className="glass rounded-xl p-4 border border-white/5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#00e5d0]">PRL → WPRL</span>
          <StateBadge state={row.state} title={badgeTitle} />
        </div>
        <span className="text-xs text-gray-500">{relativeTime(row.createdAt ?? 0)}</span>
      </div>
      <div className="text-2xl font-bold mb-2">
        {grainsToDisplay(BigInt(row.grossAmountGrains))} <span className="text-sm text-gray-400 font-medium">PRL</span>
      </div>
      <div className="space-y-1 text-xs text-gray-400">
        <div>
          <span className="text-gray-500">Pearl tx: </span>
          <a href={pearlLink} target="_blank" rel="noopener noreferrer" className="font-mono text-[#00e5d0] hover:underline">
            {shortAddress(row.pearlTxId)}
          </a>
        </div>
        {row.ethTxHash ? (
          <div>
            <span className="text-gray-500">WPRL mint tx: </span>
            {ethLink ? (
              <a href={ethLink} target="_blank" rel="noopener noreferrer" className="font-mono text-[#00e5d0] hover:underline">
                {shortAddress(row.ethTxHash)}
              </a>
            ) : (
              <span className="font-mono">{shortAddress(row.ethTxHash)}</span>
            )}
          </div>
        ) : null}
        {row.state === "queued" && row.readyAt ? (
          <div>
            <span className="text-gray-500">Slow-lane unlock: </span>
            <span className="text-sky-300">
              {new Date(row.readyAt).toLocaleString()}
            </span>
          </div>
        ) : null}
        {row.state === "cancelled" && row.cancelReason ? (
          <div>
            <span className="text-gray-500">Cancel reason: </span>
            <span className="text-red-300">{row.cancelReason}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BurnRow({ row }: { row: ServerBurn }) {
  const ethLink = ethExplorerTxUrl(row.ethTxHash);
  const pearlLink = row.pearlTxId ? `${PEARL_EXPLORER_BASE}/tx/${row.pearlTxId}` : null;
  return (
    <div className="glass rounded-xl p-4 border border-white/5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#0099ff]">WPRL → PRL</span>
          <StateBadge state={row.state} />
        </div>
        <span className="text-xs text-gray-500">{relativeTime(row.createdAt ?? 0)}</span>
      </div>
      <div className="text-2xl font-bold mb-2">
        {grainsToDisplay(BigInt(row.netAmountGrains))} <span className="text-sm text-gray-400 font-medium">PRL</span>
      </div>
      <div className="space-y-1 text-xs text-gray-400">
        <div>
          <span className="text-gray-500">Burn tx: </span>
          {ethLink ? (
            <a href={ethLink} target="_blank" rel="noopener noreferrer" className="font-mono text-[#0099ff] hover:underline">
              {shortAddress(row.ethTxHash)}
            </a>
          ) : (
            <span className="font-mono">{shortAddress(row.ethTxHash)}</span>
          )}
        </div>
        <div>
          <span className="text-gray-500">Pearl recipient: </span>
          <span className="font-mono">{shortAddress(row.pearlAddress)}</span>
        </div>
        {row.pearlTxId && pearlLink ? (
          <div>
            <span className="text-gray-500">Pearl unlock tx: </span>
            <a href={pearlLink} target="_blank" rel="noopener noreferrer" className="font-mono text-[#0099ff] hover:underline">
              {shortAddress(row.pearlTxId)}
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function History() {
  const { address } = useAccount();
  const [authStatus, setAuthStatusLocal] = useState<AuthenticationStatus>(getAuthStatus);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => subscribeAuthStatus(setAuthStatusLocal), []);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${RELAY_API_BASE}/api/history`, { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401) {
          throw new Error("unauthenticated");
        }
        if (!res.ok) throw new Error(`history ${res.status}`);
        const body = (await res.json()) as HistoryResponse;
        if (!cancelled) setData(body);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "load failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus, address]);

  // Connected but not signed → encourage the SIWE flow. RainbowKit's
  // ConnectButton drives the sign-in modal; we re-use it instead of
  // building a custom prompt.
  if (authStatus !== "authenticated") {
    return (
      <div className="max-w-3xl mx-auto w-full px-6 py-16">
        <h1 className="text-3xl font-bold mb-3">Bridge history</h1>
        <p className="text-gray-400 mb-8">
          Connect your wallet and sign in to view bridge transactions for your address.
        </p>
        <div className="glass rounded-2xl p-8 border border-white/5 flex flex-col items-center gap-4">
          <p className="text-sm text-gray-400">History is bound to the signed-in address.</p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  const items: TimelineItem[] = data
    ? [
        ...data.mints.map<TimelineItem>((row) => ({ kind: "mint", ts: row.createdAt ?? 0, row })),
        ...data.burns.map<TimelineItem>((row) => ({ kind: "burn", ts: row.createdAt ?? 0, row })),
      ].sort((a, b) => b.ts - a.ts)
    : [];

  return (
    <div className="max-w-3xl mx-auto w-full px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Bridge history</h1>
      {data ? (
        <p className="text-gray-500 text-sm mb-8 font-mono">{data.address}</p>
      ) : null}

      {loading ? <p className="text-gray-400 text-sm">Loading…</p> : null}
      {error ? <p className="text-red-400 text-sm">Failed to load history: {error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <div className="glass rounded-2xl p-8 border border-white/5 text-center">
          <p className="text-gray-400">No bridge transactions yet for this address.</p>
        </div>
      ) : null}

      <div className="space-y-3">
        {items.map((item) =>
          item.kind === "mint" ? (
            <MintRow key={`m-${item.row.pearlTxId}`} row={item.row} />
          ) : (
            <BurnRow key={`b-${item.row.ethTxHash}`} row={item.row} />
          ),
        )}
      </div>
    </div>
  );
}
