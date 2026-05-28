import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  RELAY_API_BASE,
  PEARL_EXPLORER_BASE,
  ethExplorerTxUrl,
} from "../lib/config";
import { mapBurnState, type UiBurnState } from "../lib/burnTracker";

// Public unwrap (WPRL → PRL) receipt page. Reachable at /unwrap/:ethTxHash
// without a wallet so anyone with the link can verify where the release is
// in its lifecycle. Strictly read-only, no signing.
//
// The relay's /api/burn-status endpoint takes an Ethereum tx hash (the burn
// transaction the user submitted on the WPRL contract) and returns the
// current state plus the Pearl release txid once it's been broadcast.
type BurnStatus = {
  state: string | null;
  pearlTxId: string | null;
  anomalyReason: string | null;
};

const STATE_COPY: Record<UiBurnState | "unknown", {
  label: string;
  detail: string;
  tone: "neutral" | "good" | "warn" | "bad";
}> = {
  pending: {
    label: "Burn observed",
    detail:
      "The WPRL burn was observed on Ethereum. The relay is queueing the corresponding PRL release.",
    tone: "neutral",
  },
  processing: {
    label: "Signing release transaction",
    detail:
      "The relay is constructing and signing the PRL release transaction. This is the second-to-last step before broadcast.",
    tone: "neutral",
  },
  broadcast: {
    label: "PRL release broadcast",
    detail:
      "The PRL release transaction has been broadcast on the Pearl network and is awaiting at least one confirmation.",
    tone: "neutral",
  },
  complete: {
    label: "PRL delivered",
    detail:
      "The PRL release transaction confirmed on Pearl. Funds have been delivered to the destination address.",
    tone: "good",
  },
  under_review: {
    label: "Marked for manual review: anomaly detected",
    detail:
      "The relay flagged this unlock for manual review before releasing PRL. The WPRL was burned on Ethereum and the PRL is held in the bridge custodial set. An operator will release the unlock or initiate a refund.",
    tone: "warn",
  },
  failed: {
    label: "Unlock failed",
    detail:
      "The relay could not complete the PRL release. Funds are still safe in the bridge custodial set — ops will retry or refund.",
    tone: "bad",
  },
  reorged: {
    label: "Burn invalidated by Ethereum reorg",
    detail:
      "An Ethereum reorg invalidated this burn before the relay could release PRL. The WPRL was not actually burned on the canonical chain — the connected wallet's balance should reflect the original amount.",
    tone: "bad",
  },
  unknown: {
    label: "Unknown burn",
    detail:
      "The relay does not have a row for this Ethereum transaction hash yet. If you just submitted the burn, it may still be propagating — this view auto-refreshes every 15s.",
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

export function UnwrapStatus() {
  const { ethTxHash: rawHash } = useParams<{ ethTxHash: string }>();
  const ethTxHash = (rawHash ?? "").trim().toLowerCase();
  const validHash = /^0x[0-9a-f]{64}$/.test(ethTxHash);

  const [status, setStatus] = useState<BurnStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  const uiState: UiBurnState = mapBurnState(status?.state ?? undefined);

  useEffect(() => {
    if (!validHash) return;
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch(
          `${RELAY_API_BASE}/api/burn-status?hash=${encodeURIComponent(ethTxHash)}`,
        );
        if (cancelled) return;
        if (!r.ok) {
          setError(`relay responded ${r.status}`);
          setLoaded(true);
          return;
        }
        const data = (await r.json()) as Partial<BurnStatus> & { state?: string | null };
        if (cancelled) return;
        setStatus({
          state: data.state ?? null,
          pearlTxId: data.pearlTxId ?? null,
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
    // Stop polling on terminal UI states — complete/failed/reorged/under_review
    // require operator action (or nothing at all). Anything else keeps the
    // 15s tick going so the user sees state transitions live.
    const terminal =
      uiState === "complete" ||
      uiState === "failed" ||
      uiState === "reorged" ||
      uiState === "under_review";
    const interval = terminal ? null : setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [ethTxHash, validHash, uiState]);

  if (!validHash) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-4">
        <h1 className="text-2xl font-extrabold">Invalid unwrap link</h1>
        <p className="text-gray-400 text-sm">
          An unwrap link looks like <span className="font-mono">/unwrap/&lt;0x + 64-hex eth tx hash&gt;</span>.
          The path segment in this URL is not a valid Ethereum transaction hash.
        </p>
        <Link to="/status" className="text-[#00e5d0] hover:underline text-sm">
          Bridge status &rarr;
        </Link>
      </div>
    );
  }

  const stateKey = status ? uiState : loaded ? "unknown" : null;
  const copy = stateKey ? STATE_COPY[stateKey] : null;
  const tone = copy ? toneClasses(copy.tone) : toneClasses("neutral");

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/unwrap/${ethTxHash}` : "";

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* no-op */
    }
  }

  const burnExplorerUrl = ethExplorerTxUrl(ethTxHash);

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-6">
      <div className="space-y-1">
        <p className="text-xs text-gray-500 uppercase tracking-wide">
          WPRL &rarr; PRL unwrap order
        </p>
        <h1 className="text-2xl font-extrabold">Unwrap status</h1>
        <p className="text-gray-400 text-sm">
          Public read-only view. No wallet required.
        </p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Burn tx hash</div>
            <div className="font-mono text-xs text-gray-300 break-all">{ethTxHash}</div>
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
          aria-label={`unwrap status ${stateKey}`}
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

          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-white/5">
            {burnExplorerUrl && (
              <a
                href={burnExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#00e5d0] hover:underline"
              >
                View burn on Etherscan &rarr;
              </a>
            )}
            {status?.pearlTxId && (
              <a
                href={`${PEARL_EXPLORER_BASE}/tx/${status.pearlTxId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#00e5d0] hover:underline"
              >
                View PRL release on Pearl Explorer &rarr;
              </a>
            )}
            {(stateKey === "under_review" || stateKey === "failed") && (
              <a
                href={`mailto:bridgedev@mailbox.org?subject=${encodeURIComponent(
                  `Bridge unwrap: ${ethTxHash}`,
                )}&body=${encodeURIComponent(
                  `Burn tx: ${ethTxHash}\nState: ${stateKey}\nReason: ${
                    status?.anomalyReason ?? "(none returned)"
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
