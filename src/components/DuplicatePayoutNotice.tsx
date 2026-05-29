import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  findDuplicatePayoutNotice,
  PEARL_RETURN_ADDRESS,
} from "../lib/duplicatePayoutNotice";
import { RELAY_API_BASE } from "../lib/config";
import { CopyButton } from "./CopyButton";

// Per-wallet banner shown only to the four addresses affected by the
// May-2026 duplicate-payout incident. The frozen client-side table picks
// the addresses; the relay's `/api/duplicate-payout-status` hides the
// banner once the surplus has been returned to the lock address.
//
// Failure mode: if the status fetch fails we KEEP showing the banner.
// A briefly-stale banner for someone who already returned is harmless;
// suppressing a banner for someone who hasn't returned is the loss case.
export function DuplicatePayoutNotice() {
  const { address } = useAccount();
  const entry = findDuplicatePayoutNotice(address);
  const [hideForReturned, setHideForReturned] = useState(false);

  useEffect(() => {
    setHideForReturned(false);
    if (!entry || !address) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${RELAY_API_BASE}/api/duplicate-payout-status?addr=${address.toLowerCase()}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { status?: string };
        if (!cancelled && data?.status === "returned") {
          setHideForReturned(true);
        }
      } catch {
        // network/CORS hiccup — leave banner visible (safe default).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry, address]);

  if (!entry) return null;
  if (hideForReturned) return null;

  const burnShort = `${entry.ethBurnTxHash.slice(0, 10)}…${entry.ethBurnTxHash.slice(-6)}`;
  const pearlShort = `${entry.pearlRecipient.slice(0, 12)}…${entry.pearlRecipient.slice(-8)}`;

  return (
    <div className="mb-5 bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-4 text-sm text-amber-100 space-y-3">
      <p className="font-semibold text-amber-200">
        We accidentally sent you extra PRL
      </p>
      <p className="leading-relaxed">
        On your burn{" "}
        <a
          href={`https://etherscan.io/tx/${entry.ethBurnTxHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-amber-300 hover:text-amber-100 underline"
        >
          {burnShort}
        </a>
        , a relay race caused your Pearl address{" "}
        <span className="font-mono text-amber-300">{pearlShort}</span> to
        receive{" "}
        <span className="font-semibold text-white">
          {entry.surplusPrl} PRL
        </span>{" "}
        more than the burn called for. We&rsquo;ve fixed the underlying bug.
        If you&rsquo;re willing, we&rsquo;d really appreciate it if you sent
        the surplus back to:
      </p>
      <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2">
        <code className="text-xs text-amber-200 break-all flex-1">
          {PEARL_RETURN_ADDRESS}
        </code>
        <CopyButton value={PEARL_RETURN_ADDRESS} />
      </div>
      {entry.disposition === "unspent" && (
        <p className="text-xs text-amber-200/80">
          The surplus UTXO is still unspent in your wallet, so no recovery
          steps are needed on your end beyond sending it back.
        </p>
      )}
      {entry.duplicateTxids.length > 0 && (
        <details className="text-xs text-amber-200/70">
          <summary className="cursor-pointer hover:text-amber-100">
            Show the duplicate payout transaction
            {entry.duplicateTxids.length > 1 ? "s" : ""}
          </summary>
          <ul className="mt-2 space-y-1 font-mono">
            {entry.duplicateTxids.map((tx) => (
              <li key={tx} className="break-all">
                {tx}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-amber-200/60 pt-1">
        Questions? Reach out to{" "}
        <a
          href="mailto:bridgedev@mailbox.org"
          className="underline hover:text-amber-100"
        >
          bridgedev@mailbox.org
        </a>
        .
      </p>
    </div>
  );
}
