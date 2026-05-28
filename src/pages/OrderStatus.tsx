import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  RELAY_API_BASE,
  PEARL_EXPLORER_BASE,
  NETWORK,
  ethExplorerTxUrl,
} from "../lib/config";

// Public mint receipt page. Reachable at /order/:pearlTxId without a wallet
// connection so anyone with the link (the depositor, a support agent, a
// counterparty) can verify where the mint is in its lifecycle. The page is
// strictly read-only: no wallet, no signing, no destination override. It
// hits /api/mint-status, the same endpoint LockAndMint polls.
type MintStatus = {
  state:
    | "pending"
    | "signing"
    | "submitted"
    | "attesting"
    | "queued"
    | "cancelled"
    | "under_review"
    | "minted"
    | "rejected"
    | null;
  mintTxHash: string | null;
  queuedAt: number | null;
  readyAt: number | null;
  cancelledAt: number | null;
  cancelReason: string | null;
  anomalyReason: string | null;
};

const STATE_COPY: Record<NonNullable<MintStatus["state"]> | "unknown", {
  label: string;
  detail: string;
  tone: "neutral" | "good" | "warn" | "bad";
}> = {
  pending: {
    label: "Awaiting confirmations",
    detail:
      "The Pearl deposit was seen by the relay and is accumulating the required confirmations before the mint attestation is signed.",
    tone: "neutral",
  },
  signing: {
    label: "Signing mint attestation",
    detail:
      "Confirmations are met. The relay is signing the EIP-712 attestation that authorises the WPRL mint on Ethereum.",
    tone: "neutral",
  },
  submitted: {
    label: "Mint transaction broadcast",
    detail:
      "The mint transaction has been broadcast on Ethereum. It will finalise once the mining queue confirms it.",
    tone: "neutral",
  },
  attesting: {
    label: "Attestation in progress",
    detail:
      "The relay is finishing the mint attestation. The mint transaction will be broadcast shortly.",
    tone: "neutral",
  },
  queued: {
    label: "Queued in slow-lane timelock",
    detail:
      "The deposit exceeded the daily fast-lane cap. The mint will land automatically when the 24h slow-lane window opens. No action is required.",
    tone: "warn",
  },
  under_review: {
    label: "Marked for manual review: anomaly detected",
    detail:
      "The relay flagged this deposit for manual review before minting. Your PRL is safe in the bridge custodial set. An operator will release the mint or initiate a refund.",
    tone: "warn",
  },
  cancelled: {
    label: "Mint cancelled",
    detail:
      "The relay cancelled this mint before it landed on Ethereum. This is usually a Pearl-chain reorg or an admin pause. Funds are held pending refund.",
    tone: "bad",
  },
  rejected: {
    label: "Deposit rejected",
    detail:
      "The deposit failed validation (unregistered address, below minimum, or unbound recipient). Funds are held in the custodial set pending refund.",
    tone: "bad",
  },
  minted: {
    label: "WPRL minted",
    detail: "WPRL has been minted and delivered to the destination wallet.",
    tone: "good",
  },
  unknown: {
    label: "Unknown deposit",
    detail:
      "The relay does not have a row for this Pearl txid yet. If you just sent the deposit, it may still be propagating — this view auto-refreshes every 15s.",
    tone: "neutral",
  },
};

function toneClasses(tone: "neutral" | "good" | "warn" | "bad") {
  switch (tone) {
    case "good":
      return {
        border: "border-emerald-500/40",
        bg: "bg-emerald-500/10",
        text: "text-emerald-300",
        dot: "bg-emerald-400",
      };
    case "warn":
      return {
        border: "border-yellow-500/40",
        bg: "bg-yellow-500/10",
        text: "text-yellow-200",
        dot: "bg-yellow-400",
      };
    case "bad":
      return {
        border: "border-red-500/40",
        bg: "bg-red-500/10",
        text: "text-red-300",
        dot: "bg-red-400",
      };
    default:
      return {
        border: "border-white/15",
        bg: "bg-white/5",
        text: "text-white",
        dot: "bg-sky-400",
      };
  }
}

export function OrderStatus() {
  const { pearlTxId: rawTxid } = useParams<{ pearlTxId: string }>();
  const pearlTxId = (rawTxid ?? "").trim().toLowerCase();
  const validTxid = /^[0-9a-f]{64}$/.test(pearlTxId);

  const [status, setStatus] = useState<MintStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!validTxid) return;
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch(
          `${RELAY_API_BASE}/api/mint-status?txid=${encodeURIComponent(pearlTxId)}`,
        );
        if (cancelled) return;
        if (!r.ok) {
          setError(`relay responded ${r.status}`);
          setLoaded(true);
          return;
        }
        const data = (await r.json()) as Partial<MintStatus> & { state?: string | null };
        if (cancelled) return;
        setStatus({
          state: (data.state as MintStatus["state"]) ?? null,
          mintTxHash: data.mintTxHash ?? null,
          queuedAt: data.queuedAt ?? null,
          readyAt: data.readyAt ?? null,
          cancelledAt: data.cancelledAt ?? null,
          cancelReason: data.cancelReason ?? null,
          anomalyReason: data.anomalyReason ?? null,
        });
        setError(null);
        setLoaded(true);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Failed to fetch status");
        setLoaded(true);
      }
    }
    poll();
    // Stop the auto-poll on terminal states so we don't hammer the relay
    // after the row is settled (minted/cancelled/rejected) or parked under
    // manual review (which requires operator action — no useful work for
    // the client poll to do).
    const terminal =
      status?.state === "minted" ||
      status?.state === "cancelled" ||
      status?.state === "rejected" ||
      status?.state === "under_review";
    const interval = terminal ? null : setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [pearlTxId, validTxid, status?.state]);

  useEffect(() => {
    if (status?.state !== "queued") return;
    const h = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(h);
  }, [status?.state]);

  if (!validTxid) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-4">
        <h1 className="text-2xl font-extrabold">Invalid order link</h1>
        <p className="text-gray-400 text-sm">
          A bridge order link looks like <span className="font-mono">/order/&lt;64-hex-pearl-txid&gt;</span>.
          The path segment in this URL is not a valid Pearl transaction id.
        </p>
        <Link to="/status" className="text-[#00e5d0] hover:underline text-sm">
          Look up by txid on /status &rarr;
        </Link>
      </div>
    );
  }

  const stateKey = status?.state ?? (loaded ? "unknown" : null);
  const copy = stateKey ? STATE_COPY[stateKey] : null;
  const tone = copy ? toneClasses(copy.tone) : toneClasses("neutral");

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/order/${pearlTxId}` : "";

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* no-op — clipboard unavailable */
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-6">
      <div className="space-y-1">
        <p className="text-xs text-gray-500 uppercase tracking-wide">
          PRL &rarr; WPRL bridge order
        </p>
        <h1 className="text-2xl font-extrabold">Order status</h1>
        <p className="text-gray-400 text-sm">
          Public read-only view. No wallet required.
        </p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Pearl txid</div>
            <div className="font-mono text-xs text-gray-300 break-all">{pearlTxId}</div>
          </div>
          <button
            onClick={copyShareLink}
            className="px-3 py-1.5 text-xs bg-[#00e5d0]/15 hover:bg-[#00e5d0]/25 text-[#00e5d0] rounded-lg font-semibold transition-colors"
          >
            {copied ? "Copied" : "Copy share link"}
          </button>
        </div>
      </div>

      {!loaded && !error && (
        <div className="text-sm text-gray-400">Loading status from the relay…</div>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {loaded && copy && (
        <div
          className={`rounded-2xl border px-5 py-5 space-y-3 ${tone.border} ${tone.bg}`}
          role="status"
          aria-label={`order status ${stateKey}`}
        >
          <div className="flex items-center gap-3">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${tone.dot}`} aria-hidden="true" />
            <span className={`font-semibold ${tone.text}`}>{copy.label}</span>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">{copy.detail}</p>

          {stateKey === "under_review" && status?.anomalyReason && (
            <div className="text-xs text-yellow-100 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 space-y-1">
              <div className="uppercase tracking-wide text-yellow-300 font-semibold">
                Reason
              </div>
              <div className="font-mono break-words">{status.anomalyReason}</div>
            </div>
          )}

          {stateKey === "cancelled" && status?.cancelReason && (
            <div className="text-xs text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 space-y-1">
              <div className="uppercase tracking-wide text-red-300 font-semibold">
                Cancel reason
              </div>
              <div className="font-mono break-words">{status.cancelReason}</div>
            </div>
          )}

          {stateKey === "queued" && status?.readyAt && (() => {
            // readyAt is already ms (see LockAndMint countdown note).
            const readyAtMs = status.readyAt;
            const remaining = readyAtMs - nowMs;
            const human =
              remaining > 0
                ? formatDuration(remaining)
                : "slow-lane window has opened";
            return (
              <div className="text-xs text-yellow-100 bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2">
                Mint scheduled {remaining > 0 ? `in ${human}` : "now"} (at{" "}
                {new Date(readyAtMs).toLocaleString()}).
              </div>
            );
          })()}

          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-white/5">
            <a
              href={`${PEARL_EXPLORER_BASE}/tx/${pearlTxId}?network=${NETWORK}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#00e5d0] hover:underline"
            >
              View deposit on Pearl Explorer &rarr;
            </a>
            {status?.mintTxHash && (() => {
              const url = ethExplorerTxUrl(status.mintTxHash);
              return url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#00e5d0] hover:underline"
                >
                  View WPRL mint on Etherscan &rarr;
                </a>
              ) : (
                <span className="text-xs text-gray-400 font-mono break-all">
                  Mint tx: {status.mintTxHash}
                </span>
              );
            })()}
            {(stateKey === "under_review" || stateKey === "cancelled" || stateKey === "rejected") && (
              <a
                href={`mailto:bridgedev@mailbox.org?subject=${encodeURIComponent(
                  `Bridge order: ${pearlTxId}`,
                )}&body=${encodeURIComponent(
                  `Order txid: ${pearlTxId}\nState: ${stateKey}\nReason: ${
                    status?.anomalyReason ?? status?.cancelReason ?? "(none returned)"
                  }\n`,
                )}`}
                className="text-xs text-[#00e5d0] hover:underline"
              >
                Contact operator &rarr;
              </a>
            )}
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 pt-2">
        <Link to="/status" className="hover:text-[#00e5d0] hover:underline">
          &larr; Bridge status &amp; deposit lookup
        </Link>
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
