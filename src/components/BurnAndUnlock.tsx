import { useState, useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { maxUint256 } from "viem";
import {
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSignTypedData,
} from "wagmi";
import { parseToGrains, grainsToDisplay, computeFee } from "../lib/utils";
import { WPRL_ABI, BRIDGE_CONTROLLER_ABI, ADDRESSES } from "../lib/contracts";
import { isPlausiblePearlAddress } from "../lib/pearlAddress";
import { BURN_FEE_BPS, NETWORK, PEARL_EXPLORER_BASE, RELAY_API_BASE } from "../lib/config";
import { StepIndicator } from "./StepIndicator";
import { useBridgeMode } from "../lib/bridgeMode";
import {
  DESTINATION_CONFIRM_TYPES,
  buildDestinationConfirmDomain,
  makeDestinationMessage,
} from "../lib/destinationConfirm";
import {
  saveBurn,
  loadBurn,
  clearBurn,
  mapBurnState,
  isTerminalUiState,
  BURN_POLL_TIMEOUT_MS,
  type UiBurnState,
} from "../lib/burnTracker";

interface Props {
  ethAddress: `0x${string}` | undefined;
  bridgePaused: boolean;
}

type Step = "input" | "confirm" | "approve" | "burn" | "waiting" | "done";

const ADDRS = ADDRESSES[NETWORK];

export function BurnAndUnlock({ ethAddress, bridgePaused }: Props) {
  const [amount, setAmount] = useState("");
  const [pearlAddress, setPearlAddress] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [relayState, setRelayState] = useState<UiBurnState>("pending");
  // Pearl release tx id (32-byte hex without 0x). Surfaced by the relay once
  // it broadcasts the PRL release transaction on the Pearl network. Drives
  // the "view on explorer" link in the delivery checklist and done step so
  // the user can independently verify their funds arrived.
  const [pearlReleaseTxId, setPearlReleaseTxId] = useState<string | null>(null);
  // Burn tx hash we are tracking. Initialised from localStorage on mount so
  // a tab close / refresh / SPA navigation doesn't strand the user on the
  // input screen while the relay finishes their unlock.
  const [trackedBurnHash, setTrackedBurnHash] = useState<`0x${string}` | null>(null);
  // Pearl recipient + amounts pulled back from the persisted row so the
  // success / waiting screens still render correctly after a page reload.
  const [persistedNet, setPersistedNet] = useState<bigint | null>(null);
  const [persistedPearlAddr, setPersistedPearlAddr] = useState<string | null>(null);
  const [persistedStart, setPersistedStart] = useState<number | null>(null);
  // The interval set by the poll effect — kept in a ref so the visibility
  // listener can trigger an extra immediate poll when the user returns to
  // the tab after a long stretch in the background.
  const pollRef = useRef<{ tick: () => void } | null>(null);

  const chainId = useChainId();
  const { isAdvanced } = useBridgeMode();
  const { signTypedDataAsync } = useSignTypedData();

  const grains = parseToGrains(amount);
  const { fee, net } = grains ? computeFee(grains, BURN_FEE_BPS) : { fee: 0n, net: 0n };

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: ADDRS.WPRL,
    abi: WPRL_ABI,
    functionName: "allowance",
    args: ethAddress ? [ethAddress, ADDRS.BRIDGE_CONTROLLER] : undefined,
    query: { enabled: !!ethAddress },
  });

  // Connected wallet's WPRL balance — surfaced under the amount input so the
  // user can see what's available, plus a Max button to autofill.
  const { data: wprlBalance, refetch: refetchBalance } = useReadContract({
    address: ADDRS.WPRL,
    abi: WPRL_ABI,
    functionName: "balanceOf",
    args: ethAddress ? [ethAddress] : undefined,
    query: { enabled: !!ethAddress, refetchInterval: 15_000 },
  });

  // 24h burn window — warn before submit so the user doesn't pay gas on a
  // tx that will revert with DailyLimitExceeded.
  const { data: burnWindowRemaining } = useReadContract({
    address: ADDRS.BRIDGE_CONTROLLER,
    abi: BRIDGE_CONTROLLER_ABI,
    functionName: "burnWindowRemaining",
    query: { enabled: !!ADDRS.BRIDGE_CONTROLLER, refetchInterval: 30_000 },
  });
  const exceedsWindow =
    grains !== null && burnWindowRemaining !== undefined && grains > burnWindowRemaining;
  const validPearlAddr = isPlausiblePearlAddress(pearlAddress);
  const blockSubmit = bridgePaused || exceedsWindow || !validPearlAddr;

  const {
    writeContract: approve,
    data: approveTxHash,
    error: approveSubmitError,
    reset: resetApprove,
  } = useWriteContract();
  const {
    writeContract: burn,
    data: burnTxHash,
    error: burnSubmitError,
    reset: resetBurn,
  } = useWriteContract();

  const { isSuccess: approveSuccess, error: approveReceiptError } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });
  const { isSuccess: burnSuccess, error: burnReceiptError } = useWaitForTransactionReceipt({
    hash: burnTxHash,
  });

  // wagmi's useReadContract caches allowance — without an explicit refetch
  // after approve confirms, `allowance` stays stale, `needsApproval` stays
  // true, and the UI re-renders the Approve button instead of Burn. Force a
  // refresh as soon as the approve receipt lands.
  useEffect(() => {
    if (approveSuccess) {
      refetchAllowance();
    }
  }, [approveSuccess, refetchAllowance]);

  // When wagmi confirms a fresh burn, persist it and start tracking.
  // The persisted row is the source of truth for the poll effect — that
  // way tab close / refresh / SPA-nav resumes seamlessly because the next
  // mount rehydrates trackedBurnHash from localStorage.
  useEffect(() => {
    if (!burnSuccess || !burnTxHash || !ethAddress) return;
    saveBurn({
      ethTxHash: burnTxHash,
      ethAddress,
      pearlAddress,
      grossGrains: grains ?? 0n,
      netGrains: net,
      feeGrains: fee,
    });
    setTrackedBurnHash(burnTxHash);
    setPersistedNet(net);
    setPersistedPearlAddr(pearlAddress);
    setPersistedStart(Date.now());
    setStep("waiting");
    setRelayState("pending");
    setPearlReleaseTxId(null);
    refetchBalance();
  }, [burnSuccess, burnTxHash, ethAddress, pearlAddress, grains, net, fee, refetchBalance]);

  // On mount (or when the connected address changes), rehydrate any
  // in-flight burn from localStorage. This is what fixes the original bug:
  // the relay confirms on its own schedule, and the user must see that
  // confirmation even if they closed the tab in the meantime.
  useEffect(() => {
    if (!ethAddress) return;
    // If wagmi already has a fresh burn from the same session, the save
    // effect above is the source of truth — don't clobber it.
    if (burnTxHash) return;
    const row = loadBurn(ethAddress);
    if (!row) return;
    setTrackedBurnHash(row.ethTxHash);
    setPersistedNet(BigInt(row.netGrains));
    setPersistedPearlAddr(row.pearlAddress);
    setPersistedStart(row.submittedAt);
    setStep("waiting");
    setRelayState("pending");
    setPearlReleaseTxId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ethAddress]);

  // The single polling loop. Reads from trackedBurnHash, not from the
  // wagmi write hook — so it works both for "fresh burn this session" and
  // "resumed burn from a previous session".
  const [pollTimedOut, setPollTimedOut] = useState(false);
  useEffect(() => {
    if (!trackedBurnHash || !ethAddress) {
      pollRef.current = null;
      return;
    }
    let done = false;
    let cancelled = false;
    const startedAt = persistedStart ?? Date.now();
    setPollTimedOut(false);

    async function poll() {
      if (cancelled || done) return;
      // Stop polling after BURN_POLL_TIMEOUT_MS. We do NOT clear the
      // persisted row — it stays so the next mount can resume, and we
      // route the user to /history for a definitive view.
      if (Date.now() - startedAt > BURN_POLL_TIMEOUT_MS) {
        setPollTimedOut(true);
        done = true;
        return;
      }
      try {
        const res = await fetch(
          `${RELAY_API_BASE}/api/burn-status?hash=${trackedBurnHash}`,
          { credentials: "include" },
        );
        if (!res.ok) return;
        const json = (await res.json()) as { state: string | null; pearlTxId?: string | null };
        if (json.pearlTxId) setPearlReleaseTxId(json.pearlTxId);
        const ui = mapBurnState(json.state);
        setRelayState(ui);
        if (ui === "complete") {
          setStep("done");
          done = true;
          // Persistence served its purpose — drop it so a future visit
          // doesn't replay the success screen forever.
          clearBurn(ethAddress);
        } else if (isTerminalUiState(ui)) {
          // failed / reorged — leave the persisted row in place so the
          // operator can ack from /history; surface the terminal state
          // here and stop polling.
          done = true;
        }
      } catch {
        // network blip — next interval tick retries
      }
    }

    poll();
    pollRef.current = { tick: poll };
    const interval = setInterval(() => { if (!done) poll(); }, 10_000);

    // Browsers throttle background tabs aggressively (sometimes pushing
    // 10s intervals out to minutes). When the user returns to the tab,
    // fire one extra poll so the UI catches up immediately instead of
    // waiting for the next throttled tick.
    function onVisible() {
      if (document.visibilityState === "visible" && !done) poll();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      pollRef.current = null;
    };
  }, [trackedBurnHash, ethAddress, persistedStart]);

  // Surface any tx error to the user — without this, a wallet rejection or
  // on-chain revert (e.g. paused contract, exceeded daily limit) just leaves
  // the spinner running forever (audit F-54 frontend review).
  const txError =
    approveSubmitError ?? burnSubmitError ?? approveReceiptError ?? burnReceiptError;

  const needsApproval = grains && (allowance === undefined || allowance < grains);

  async function gateDestination(): Promise<boolean> {
    if (isAdvanced) return true;
    if (!ethAddress || !grains || !pearlAddress) return false;
    setConfirmError(null);
    try {
      const message = makeDestinationMessage("burn", ethAddress, pearlAddress, grains);
      await signTypedDataAsync({
        domain: buildDestinationConfirmDomain(chainId),
        types: DESTINATION_CONFIRM_TYPES,
        primaryType: "DestinationConfirm",
        message,
      });
      return true;
    } catch (e: any) {
      setConfirmError(e?.shortMessage || e?.message || "Signature declined");
      return false;
    }
  }

  async function handleApprove() {
    if (!grains) return;
    if (!(await gateDestination())) return;
    approve({
      address: ADDRS.WPRL,
      abi: WPRL_ABI,
      functionName: "approve",
      args: [ADDRS.BRIDGE_CONTROLLER, maxUint256],
    });
    setStep("approve");
  }

  async function handleBurn() {
    if (!grains || !pearlAddress) return;
    if (!(await gateDestination())) return;
    burn({
      address: ADDRS.BRIDGE_CONTROLLER,
      abi: BRIDGE_CONTROLLER_ABI,
      functionName: "requestBurn",
      args: [grains, pearlAddress],
    });
    setStep("burn");
  }

  if (!ethAddress) {
    return (
      <div className="text-center py-8 text-gray-400">
        Connect your Ethereum wallet to continue.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <StepIndicator
        steps={["Amount", "Approve", "Burn", "Waiting", "Done"]}
        current={
          step === "input" || step === "confirm" ? 0
          : step === "approve" ? 1
          : step === "burn" ? 2
          : step === "waiting" ? 3
          : 4
        }
      />

      {(step === "input" || step === "confirm" || step === "approve") && (
        <>
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="block text-xs text-gray-400 uppercase tracking-wide">
                Amount (WPRL)
              </label>
              {wprlBalance !== undefined && (
                <span className="text-xs text-gray-500">
                  Balance:{" "}
                  <button
                    type="button"
                    onClick={() => setAmount(grainsToDisplay(wprlBalance as bigint))}
                    className="text-[#00e5d0] hover:underline font-mono"
                    title="Use full balance"
                  >
                    {grainsToDisplay(wprlBalance as bigint)} WPRL
                  </button>
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.00000001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00000000"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-20 text-white text-lg focus:outline-none focus:border-[#00e5d0]/50 transition-colors"
              />
              {wprlBalance !== undefined && (wprlBalance as bigint) > 0n && (
                <button
                  type="button"
                  onClick={() => setAmount(grainsToDisplay(wprlBalance as bigint))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#00e5d0]/15 hover:bg-[#00e5d0]/25 text-[#00e5d0] transition-colors"
                >
                  MAX
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
              Pearl Taproot Address (your Pearl wallet)
            </label>
            <input
              type="text"
              value={pearlAddress}
              onChange={(e) => setPearlAddress(e.target.value)}
              placeholder="prl1..."
              className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none transition-colors ${
                pearlAddress && !validPearlAddr
                  ? "border-red-500/50 focus:border-red-500/70"
                  : "border-white/10 focus:border-[#00e5d0]/50"
              }`}
            />
            {pearlAddress && !validPearlAddr && (
              <p className="text-xs text-red-400 mt-1.5">
                Invalid Pearl address. Must be a bech32m prl1… Taproot address.
              </p>
            )}
          </div>

          {grains && grains > 0n && (
            <div className="bg-white/5 rounded-2xl p-4 text-sm space-y-2">
              {BURN_FEE_BPS > 0 && (
                <Row
                  label={`Bridge fee (${(BURN_FEE_BPS / 100).toString()}%)`}
                  value={grainsToDisplay(fee) + " WPRL"}
                />
              )}
              <Row label="You receive" value={grainsToDisplay(net) + " PRL"} highlight />
              <Row label="Estimated time" value="~30 min" />
              {!isAdvanced && (
                <p className="text-xs text-gray-500 pt-1 border-t border-white/5">
                  Your wallet will prompt for a destination-confirmation signature before the burn is broadcast. No on-chain submission of the signature occurs.
                </p>
              )}
            </div>
          )}

          {exceedsWindow && (
            <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2">
              Amount exceeds the remaining 24h burn window
              ({burnWindowRemaining !== undefined ? grainsToDisplay(burnWindowRemaining) : "?"} WPRL).
              Reduce the amount or wait for the window to reset.
            </div>
          )}

          {confirmError && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
              {confirmError}
            </div>
          )}

          {txError && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 space-y-1">
              <div className="font-semibold">Transaction failed</div>
              <div className="break-words">
                {(txError as { shortMessage?: string; message?: string }).shortMessage ??
                  txError.message}
              </div>
              <button
                onClick={() => {
                  resetApprove();
                  resetBurn();
                  setStep("input");
                }}
                className="underline hover:text-red-300"
              >
                Try again
              </button>
            </div>
          )}

          {/* Single button that flips between Approve and Burn based on
              live allowance. `approveSuccess` short-circuits the gate so we
              don't get stuck on "Approve" while wagmi is still refetching. */}
          {needsApproval && !approveSuccess ? (
            <button
              disabled={!grains || grains <= 0n || blockSubmit || (step === "approve" && !approveSuccess && !!approveTxHash)}
              onClick={handleApprove}
              className="w-full bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] hover:from-[#00f0da] hover:to-[#00c5b5] disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 text-black font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-[#00e5d0]/20 disabled:shadow-none"
            >
              {bridgePaused
                ? "Bridge paused"
                : step === "approve" && !approveSuccess && approveTxHash
                ? "Approving…"
                : "Step 1: Approve WPRL"}
            </button>
          ) : (
            <button
              disabled={!grains || grains <= 0n || blockSubmit}
              onClick={handleBurn}
              className="w-full bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] hover:from-[#00f0da] hover:to-[#00c5b5] disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 text-black font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-[#00e5d0]/20 disabled:shadow-none"
            >
              {bridgePaused ? "Bridge paused" : approveSuccess ? "Step 2: Burn WPRL" : "Burn WPRL"}
            </button>
          )}
        </>
      )}

      {step === "burn" && !burnSuccess && (
        <div className="text-center py-6 space-y-4">
          <div className="w-12 h-12 border-4 border-[#00e5d0] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-300">Burning WPRL on Ethereum…</p>
        </div>
      )}

      {step === "waiting" && (
        <div className="text-center py-6 space-y-4">
          {relayState === "failed" || relayState === "reorged" ? (
            <div className="text-4xl text-red-400">&#9888;</div>
          ) : pollTimedOut ? (
            <div className="text-4xl text-yellow-400">&#9201;</div>
          ) : (
            <div className="w-12 h-12 border-4 border-[#00e5d0] border-t-transparent rounded-full animate-spin mx-auto" />
          )}
          <p className="text-white font-semibold">
            {relayState === "failed"
              ? "Unlock failed"
              : relayState === "reorged"
              ? "Burn invalidated by Ethereum reorg"
              : pollTimedOut
              ? "Still pending after 6 hours"
              : "Bridging back to Pearl network"}
          </p>
          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-sm space-y-3 text-left max-w-sm mx-auto">
            <RelayStep label="WPRL burned on Ethereum" done />
            <RelayStep
              label="Relay picking up burn event"
              done={relayState === "processing" || relayState === "broadcast" || relayState === "complete"}
              active={relayState === "pending"}
            />
            <RelayStep
              label="PRL release transaction broadcast"
              done={!!pearlReleaseTxId || relayState === "broadcast" || relayState === "complete"}
              active={relayState === "processing" && !pearlReleaseTxId}
              extra={
                pearlReleaseTxId ? (
                  <a
                    href={`${PEARL_EXPLORER_BASE}/tx/${pearlReleaseTxId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00e5d0] hover:underline text-xs font-mono break-all"
                  >
                    {pearlReleaseTxId.slice(0, 12)}…{pearlReleaseTxId.slice(-8)} ↗
                  </a>
                ) : null
              }
            />
            <RelayStep
              label="PRL delivered to your wallet"
              done={relayState === "complete"}
              active={relayState === "broadcast"}
            />
          </div>
          {relayState === "failed" ? (
            <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 max-w-sm mx-auto space-y-1">
              <p>The relay couldn't complete the PRL release. Funds are still safe on-chain — ops will retry or refund.</p>
              <Link to="/history" className="underline hover:text-red-200">View in history &rarr;</Link>
            </div>
          ) : relayState === "reorged" ? (
            <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 max-w-sm mx-auto space-y-1">
              <p>An Ethereum reorg invalidated this burn before the relay could release PRL. The WPRL was not actually burned on the canonical chain — your wallet balance should reflect the original amount.</p>
              <Link to="/history" className="underline hover:text-red-200">View in history &rarr;</Link>
            </div>
          ) : pollTimedOut ? (
            <div className="text-xs text-yellow-200 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2 max-w-sm mx-auto space-y-1">
              <p>This burn is taking longer than expected. It usually completes within ~30 min. Check the history page for the latest status.</p>
              <Link to="/history" className="underline hover:text-yellow-100">View in history &rarr;</Link>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Estimated time: ~15 min. Safe to close this tab — we&apos;ll pick back up where you left off.</p>
          )}
        </div>
      )}

      {step === "done" && (
        <div className="text-center py-6 space-y-3">
          <div className="text-4xl text-[#00e5d0]">&#10003;</div>
          <p className="text-white font-semibold">PRL delivered</p>
          <p className="text-gray-400 text-sm">
            {grainsToDisplay(persistedNet ?? net)} PRL sent to {(persistedPearlAddr ?? pearlAddress).slice(0, 12)}…
          </p>
          {pearlReleaseTxId && (
            <a
              href={`${PEARL_EXPLORER_BASE}/tx/${pearlReleaseTxId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-[#00e5d0]/10 border border-[#00e5d0]/30 rounded-xl px-4 py-2 text-xs text-[#00e5d0] hover:bg-[#00e5d0]/20 transition-colors"
            >
              View release transaction on Pearl Explorer ↗
            </a>
          )}
          <div>
            <button
              onClick={() => {
                if (ethAddress) clearBurn(ethAddress);
                setTrackedBurnHash(null);
                setPersistedNet(null);
                setPersistedPearlAddr(null);
                setPersistedStart(null);
                setPearlReleaseTxId(null);
                setRelayState("pending");
                setAmount("");
                setPearlAddress("");
                resetApprove();
                resetBurn();
                setStep("input");
              }}
              className="mt-3 text-xs text-gray-400 hover:text-white underline"
            >
              Start a new burn
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className={highlight ? "text-[#00e5d0] font-semibold" : "text-white"}>{value}</span>
    </div>
  );
}

function RelayStep({ label, done, active, extra }: { label: string; done?: boolean; active?: boolean; extra?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-5 h-5 mt-0.5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
        done ? "bg-[#00e5d0] text-black" : active ? "border-2 border-[#00e5d0] border-t-transparent animate-spin" : "border border-white/20"
      }`}>
        {done && "✓"}
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        <span className={done ? "text-white" : active ? "text-[#00e5d0]" : "text-gray-500"}>{label}</span>
        {extra}
      </div>
    </div>
  );
}
