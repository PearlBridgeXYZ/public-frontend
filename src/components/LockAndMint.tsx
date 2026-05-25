import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useChainId, useReadContracts, useSignTypedData } from "wagmi";
import { parseToGrains, grainsToDisplay, computeFee } from "../lib/utils";
import { validateEthAddress } from "../lib/eth-address";
import {
  MINT_FEE_BPS,
  MIN_BRIDGE_FEE_GRAINS,
  RELAY_API_BASE,
  PEARL_EXPLORER_BASE,
  ethExplorerTxUrl,
} from "../lib/config";
import { CONTRACTS, NETWORK, BRIDGE_CONTROLLER_ABI, WPRL_ABI } from "../lib/contracts";
import { CopyButton } from "./CopyButton";
import { StepIndicator } from "./StepIndicator";
import { XFollowCTA } from "./XFollowCTA";
import { useBridgeMode } from "../lib/bridgeMode";
import {
  DESTINATION_CONFIRM_TYPES,
  buildDestinationConfirmDomain,
  makeDestinationMessage,
} from "../lib/destinationConfirm";
import {
  type BridgeReceipt,
  type ReceiptStep,
  loadReceipt,
  newReceiptId,
  saveReceipt,
  getConsumedPearlTxIds,
} from "../lib/bridgeReceipts";

const REQUIRED_CONFIRMATIONS = 6;

interface Props {
  ethAddress: `0x${string}` | undefined;
  bridgePaused: boolean;
}

type Step = "input" | "send" | "waiting" | "done";

// RC4.0 slow-lane mint state, returned by /api/mint-status. Mirrors the relay
// row's "state" column with relay-internal "finalized" already mapped to
// "minted" by the API. `queued` and `cancelled` are RC4.0 additions — the UI
// has to branch on both or slow-lane users see infinite spinners and reorg-
// cancelled users see misleading green checkmarks.
// "signing" and "submitted" are the relay's actual intermediate states
// (relay/mint.ts: pending → signing → submitted → finalized). The API maps
// finalized→minted but passes signing/submitted through untouched, so the
// waiting screen can render progress instead of a single static "attesting".
type MintApiStatus = {
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

export function LockAndMint({ ethAddress, bridgePaused }: Props) {
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [pearlTxId, setPearlTxId] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [userDepositAddress, setUserDepositAddress] = useState<string | null>(null);
  const [depositAddressLoading, setDepositAddressLoading] = useState(false);
  const [depositAddressError, setDepositAddressError] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [pearlConfirmations, setPearlConfirmations] = useState<number | null>(null);
  const [pearlTxFound, setPearlTxFound] = useState<boolean | null>(null);
  const [pearlPollError, setPearlPollError] = useState<string | null>(null);
  const [mintTxHash, setMintTxHash] = useState<string | null>(null);
  // RC4.0 slow-lane FSM: full mint-status response from the relay so the
  // waiting/done step can branch on queued/cancelled in addition to
  // pending/minted. `null` = haven't polled yet or relay returned no row.
  const [mintStatus, setMintStatus] = useState<MintApiStatus | null>(null);
  // Live UTC clock tick so the slow-lane countdown updates without waiting for
  // the next 15s poll. 1Hz is fine — the countdown is human-readable, not
  // sub-second precision.
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Advanced-mode destination override: mint WPRL to a wallet other than the
  // connected one. Only readable from state when isAdvanced=true; in normal
  // mode the destination is always the connected wallet so the
  // EIP-712 destination-confirmation signature can bind the address the user
  // actually approved.
  const [customDestination, setCustomDestination] = useState("");

  const chainId = useChainId();
  const { isAdvanced } = useBridgeMode();
  const { signTypedDataAsync } = useSignTypedData();
  const navigate = useNavigate();
  const { receiptId: urlReceiptId } = useParams<{ receiptId: string }>();
  const hydratedRef = useRef(false);

  // Hydrate from URL once on mount. If the user lands on /bridge/r_<id> we
  // restore their in-progress state from localStorage so closing the tab or
  // sharing the link doesn't lose the step they were on.
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!urlReceiptId) return;
    const r = loadReceipt(urlReceiptId);
    if (!r) return;
    hydratedRef.current = true;
    setReceiptId(r.id);
    setAmount(grainsToDisplay(BigInt(r.amountGrains)));
    if (r.depositAddress) setUserDepositAddress(r.depositAddress);
    if (r.pearlTxId) setPearlTxId(r.pearlTxId);
    if (r.mintTxHash) setMintTxHash(r.mintTxHash);
    setStep(r.step === "done" ? "done" : r.step === "waiting" ? "waiting" : "send");
  }, [urlReceiptId]);

  function persistReceipt(patch: Partial<BridgeReceipt> & { step: ReceiptStep }): string {
    const id = receiptId ?? newReceiptId();
    if (!receiptId) setReceiptId(id);
    if (!grains || !effectiveDestination) return id;
    const existing = loadReceipt(id);
    const r: BridgeReceipt = {
      id,
      ethAddress: effectiveDestination,
      amountGrains: (patch.amountGrains ?? grains).toString(),
      netGrains: (patch.netGrains ?? net).toString(),
      depositAddress: patch.depositAddress ?? userDepositAddress ?? existing?.depositAddress ?? null,
      pearlTxId: patch.pearlTxId ?? (pearlTxId || existing?.pearlTxId || null),
      mintTxHash: patch.mintTxHash ?? mintTxHash ?? existing?.mintTxHash ?? null,
      step: patch.step,
      network: NETWORK,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    saveReceipt(r);
    return id;
  }

  // Effective destination: in advanced mode the user can override the WPRL
  // recipient with a custom address (e.g. mint to a cold wallet from a hot
  // signing wallet). In normal mode the destination is always the connected
  // wallet so the EIP-712 destination-confirmation gate binds an address the
  // user actually controls. If advanced + override is blank/invalid, we fall
  // back to the connected wallet — the validation message below tells them
  // why.
  const customCheck =
    isAdvanced && customDestination.trim().length > 0
      ? validateEthAddress(customDestination)
      : null;
  const effectiveDestination: `0x${string}` | undefined =
    customCheck && customCheck.kind !== "invalid" ? customCheck.address : ethAddress;

  // Fetch per-user deposit address when wallet is connected. The relay derives
  // a unique Pearl address from the *effective destination* address (custom
  // override in advanced mode, else the connected wallet); deposits to that
  // Pearl address are credited to that ETH recipient. No OP_RETURN, no
  // off-chain signed intent — the address itself is the binding.
  useEffect(() => {
    if (!effectiveDestination) {
      setUserDepositAddress(null);
      setDepositAddressError(null);
      return;
    }
    setDepositAddressLoading(true);
    setDepositAddressError(null);
    fetch(`${RELAY_API_BASE}/api/deposit-address?ethAddress=${effectiveDestination}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`relay responded ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!d.pearlAddress) throw new Error("relay returned no deposit address");
        setUserDepositAddress(d.pearlAddress);
      })
      .catch((e: any) => {
        setDepositAddressError(e?.message || "Failed to fetch deposit address");
        setUserDepositAddress(null);
      })
      .finally(() => setDepositAddressLoading(false));
  }, [effectiveDestination]);

  const grains = parseToGrains(amount);
  const { fee, net } = grains
    ? computeFee(grains, MINT_FEE_BPS, MIN_BRIDGE_FEE_GRAINS)
    : { fee: 0n, net: 0n };
  // True when the 4 PRL floor is the binding fee (deposit < 800 PRL). Used to
  // swap the label "0.5%" → "4 PRL minimum" so users don't think the math is
  // wrong; the relay enforces the same floor server-side.
  const feeFloorActive = grains !== null && grains > 0n && fee === MIN_BRIDGE_FEE_GRAINS;
  // Block submission when the deposit can't cover the floor (gross ≤ floor).
  // Without this the relay would scale the attested gross to ≤ 0 and the
  // mint would revert with InvalidAmount on chain — better to refuse here.
  const belowMin = grains !== null && grains > 0n && grains <= MIN_BRIDGE_FEE_GRAINS;

  // EIP-55 gate on the effective destination. A typo here mints WPRL to the
  // wrong recipient, which is unrecoverable without an admin refund.
  const addressCheck = effectiveDestination ? validateEthAddress(effectiveDestination) : null;
  const checksummedAddress =
    addressCheck && addressCheck.kind !== "invalid" ? addressCheck.address : null;

  // Pull live caps so we can warn the user *before* they send PRL — a tx that
  // overflows the daily window or TVL cap will sit unmintable on the relay
  // until the next window or until ops raises the cap. Also pulls the tiered
  // cap fields so we can predict fast-vs-slow lane routing client-side and
  // surface the 24h delay BEFORE the user sends PRL.
  const { data: caps } = useReadContracts({
    contracts: [
      { address: CONTRACTS.BRIDGE_CONTROLLER, abi: BRIDGE_CONTROLLER_ABI, functionName: "mintWindowRemaining" },
      { address: CONTRACTS.BRIDGE_CONTROLLER, abi: BRIDGE_CONTROLLER_ABI, functionName: "tvlCap" },
      { address: CONTRACTS.WPRL, abi: WPRL_ABI, functionName: "totalSupply" },
      { address: CONTRACTS.BRIDGE_CONTROLLER, abi: BRIDGE_CONTROLLER_ABI, functionName: "dailyFastMintLimit" },
      { address: CONTRACTS.BRIDGE_CONTROLLER, abi: BRIDGE_CONTROLLER_ABI, functionName: "fastMintWindowRemaining" },
      { address: CONTRACTS.BRIDGE_CONTROLLER, abi: BRIDGE_CONTROLLER_ABI, functionName: "slowMintDelay" },
    ],
    query: { enabled: !!CONTRACTS.BRIDGE_CONTROLLER, refetchInterval: 30_000 },
  });
  const mintWindowRemaining = caps?.[0]?.result as bigint | undefined;
  const tvlCap = caps?.[1]?.result as bigint | undefined;
  const totalLocked = caps?.[2]?.result as bigint | undefined;
  const dailyFastMintLimit = caps?.[3]?.result as bigint | undefined;
  const fastMintWindowRemaining = caps?.[4]?.result as bigint | undefined;
  const slowMintDelay = caps?.[5]?.result as bigint | undefined;

  // Lane prediction: matches the contract's `_tryFastWindow` all-or-nothing
  // semantics in executeMint (BridgeController.sol L860). If the net grossAmount
  // (== `grains` here, since the contract sees what the relay attests) fits in
  // the remaining fast-lane window AND under the per-tx fast cap, the mint
  // lands instantly. Otherwise the WHOLE amount queues in the slow lane for
  // `slowMintDelay` seconds — no splitting, no eating-the-remainder.
  //
  // Gate the prediction on ALL caps being defined. Without this guard, a
  // partial load (one read undefined, others resolved) flips fitsFast* to
  // false and falsely renders the yellow "slow lane" banner before the read
  // settles.
  const capsLoaded =
    dailyFastMintLimit !== undefined && fastMintWindowRemaining !== undefined;
  const fitsFastCapPerTx =
    capsLoaded && grains !== null && grains <= (dailyFastMintLimit as bigint);
  const fitsFastWindow =
    capsLoaded && grains !== null && grains <= (fastMintWindowRemaining as bigint);
  const willBeFastLane =
    capsLoaded && grains !== null && grains > 0n && fitsFastCapPerTx && fitsFastWindow;
  const willBeSlowLane =
    capsLoaded && grains !== null && grains > 0n && (!fitsFastCapPerTx || !fitsFastWindow);

  const exceedsWindow =
    grains !== null && mintWindowRemaining !== undefined && grains > mintWindowRemaining;
  const exceedsTvl =
    grains !== null &&
    tvlCap !== undefined &&
    totalLocked !== undefined &&
    tvlCap > 0n &&
    totalLocked + grains > tvlCap;
  const addressInvalid = addressCheck?.kind === "invalid";
  // Advanced override invalid → fall-through silently issues a deposit address
  // bound to the connected wallet, not the override the user typed. Block
  // submission so the user fixes or clears the override before we mint. Audit
  // RC2.5 L-4.
  const customOverrideInvalid = customCheck?.kind === "invalid";
  const blockSubmit =
    bridgePaused || exceedsWindow || exceedsTvl || addressInvalid || customOverrideInvalid || belowMin;

  async function handleProceed() {
    if (!grains || !ethAddress || !effectiveDestination) return;
    setConfirmError(null);
    if (!isAdvanced) {
      try {
        // Destination here is the user's own ETH receiving address. Signing
        // it binds intent: a phishing UI cannot silently substitute a
        // different ETH destination.
        const message = makeDestinationMessage("mint", ethAddress, ethAddress, grains);
        await signTypedDataAsync({
          domain: buildDestinationConfirmDomain(chainId),
          types: DESTINATION_CONFIRM_TYPES,
          primaryType: "DestinationConfirm",
          message,
        });
      } catch (e: any) {
        setConfirmError(e?.shortMessage || e?.message || "Signature declined");
        return;
      }
    }
    const id = persistReceipt({ step: "send" });
    navigate(`/bridge/${id}`, { replace: false });
    setStep("send");
  }

  function handleSentConfirm() {
    persistReceipt({ step: "waiting" });
    setStep("waiting");
  }

  // Persist pearlTxId edits so a tab reload restores them.
  useEffect(() => {
    if (!receiptId || !pearlTxId) return;
    persistReceipt({ step: "waiting", pearlTxId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pearlTxId]);

  // Auto-detect: once in "waiting", poll the relay for a newly-indexed deposit
  // under the user's ETH address so the txid field fills automatically without
  // requiring the user to paste it. The relay watcher indexes it as soon as it
  // sees the tx — typically within the first 15s after the block mines.
  //
  // Reuse trap: when the user bridges twice to the same deposit address, the
  // relay's `/api/deposits/recent` may still return the FIRST bridge's txid
  // if its mint row isn't terminal yet (e.g. minted state hasn't settled, or
  // it's "queued"/"attesting" mid-pipeline). The consumed-txid catalog rejects
  // any txid this browser has already bound to a prior receipt so the second
  // bridge waits for the genuinely-new deposit instead of silently rebinding.
  useEffect(() => {
    if (step !== "waiting") return;
    if (pearlTxId.trim().length > 0) return; // already have one
    if (!effectiveDestination) return;
    let cancelled = false;
    async function probe() {
      try {
        const r = await fetch(
          `${RELAY_API_BASE}/api/deposits/recent?ethAddress=${effectiveDestination}`,
        );
        if (!r.ok || cancelled) return;
        const data = (await r.json()) as { txid?: string | null };
        if (!data.txid || cancelled) return;
        // Exclude any txid already bound to a prior receipt on this browser.
        // Excluding our own receipt id so a manually-cleared field can
        // re-adopt the same txid for THIS bridge.
        const consumed = getConsumedPearlTxIds(receiptId);
        if (consumed.has(data.txid.toLowerCase())) return;
        setPearlTxId(data.txid);
      } catch {
        /* swallow — keep polling */
      }
    }
    probe();
    const handle = setInterval(probe, 15_000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [step, pearlTxId, effectiveDestination, receiptId]);

  // Live confirmation polling. Relay queries pearld via the federated RPC pool
  // and returns { found, confirmations }; we display progress against the
  // 6-confirmation mint threshold. Explorer link is informational only.
  useEffect(() => {
    if (step !== "waiting") return;
    const txid = pearlTxId.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(txid)) {
      setPearlConfirmations(null);
      setPearlTxFound(null);
      setPearlPollError(null);
      return;
    }
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch(`${RELAY_API_BASE}/api/pearl-tx/${txid}`);
        if (!r.ok) {
          if (cancelled) return;
          setPearlPollError(`relay responded ${r.status}`);
          return;
        }
        const data = (await r.json()) as { found?: boolean; confirmations?: number };
        if (cancelled) return;
        setPearlPollError(null);
        if (data.found) {
          setPearlTxFound(true);
          setPearlConfirmations(typeof data.confirmations === "number" ? data.confirmations : 0);
        } else {
          setPearlTxFound(false);
          setPearlConfirmations(null);
        }
      } catch (e: any) {
        if (cancelled) return;
        setPearlPollError(e?.message || "poll failed");
      }
    }
    poll();
    const handle = setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [step, pearlTxId]);

  // Mint-status polling. Once the user has entered their Pearl txid we ask the
  // relay where the deposit is in its lifecycle. RC4.0 introduces two new
  // slow-lane states the FSM must branch on:
  //   queued    — under the tiered cap the mint is scheduled for `readyAt`;
  //               render a countdown instead of an infinite spinner.
  //   cancelled — reorg-watch or admin called cancelPendingMint; render the
  //               `cancelReason` so the user knows the mint is not coming and
  //               can pursue a refund.
  // Hits /api/mint-status (not /api/deposits/:txid) because the API endpoint
  // is the one that carries queuedAt/readyAt/cancelledAt/cancelReason.
  useEffect(() => {
    if (step !== "waiting" && step !== "done") return;
    const txid = pearlTxId.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(txid)) return;
    // Stop polling on terminal states only. Gating on mintTxHash would bail
    // as soon as the relay broadcasts ("submitted" sets the hash for the
    // Etherscan link), preventing the later "minted" transition.
    if (step === "done") return;
    if (mintStatus?.state === "cancelled") return;
    // RC5.15: under_review is a terminal-for-the-user state. Operator must
    // clear the anomaly before the row leaves under_review, so client-side
    // polling has no useful work to do — stopping prevents the 15s tick from
    // hammering the relay while a human investigates.
    if (mintStatus?.state === "under_review") return;
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch(
          `${RELAY_API_BASE}/api/mint-status?txid=${encodeURIComponent(txid)}`,
        );
        if (!r.ok) return;
        const data = (await r.json()) as {
          state?: string | null;
          mintTxHash?: string | null;
          queuedAt?: number | null;
          readyAt?: number | null;
          cancelledAt?: number | null;
          cancelReason?: string | null;
          anomalyReason?: string | null;
        };
        if (cancelled) return;
        const next: MintApiStatus = {
          state: (data.state as MintApiStatus["state"]) ?? null,
          mintTxHash: data.mintTxHash ?? null,
          queuedAt: data.queuedAt ?? null,
          readyAt: data.readyAt ?? null,
          cancelledAt: data.cancelledAt ?? null,
          cancelReason: data.cancelReason ?? null,
          anomalyReason: data.anomalyReason ?? null,
        };
        setMintStatus(next);
        // Surface the Etherscan link as soon as the relay broadcasts (state
        // "submitted") — the user gets visible progress before the receipt
        // confirms, instead of a static "attesting" string for the full
        // ~12-30s of Ethereum confirmation latency.
        if (next.mintTxHash && next.mintTxHash !== mintTxHash) {
          setMintTxHash(next.mintTxHash);
        }
        if (next.state === "minted" && next.mintTxHash) {
          persistReceipt({ step: "done", mintTxHash: next.mintTxHash });
          setStep("done");
        }
      } catch {
        /* swallow — next tick retries */
      }
    }
    poll();
    // Close-to-done states get a tighter poll: once the relay has signed
    // the attestation or broadcast the mint, the user is one Ethereum
    // confirmation away from "done" and 15s feels glacial. Drop to 3s.
    const closeToDone =
      mintStatus?.state === "signing" ||
      mintStatus?.state === "submitted" ||
      mintStatus?.state === "attesting";
    const handle = setInterval(poll, closeToDone ? 3_000 : 15_000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pearlTxId, mintTxHash, mintStatus?.state]);

  // 1Hz tick for the slow-lane countdown so the readyAt timer ticks without
  // waiting for the 15s mint-status poll. Only runs while a queued mint is
  // showing — no point spinning a timer at the input step.
  useEffect(() => {
    if (mintStatus?.state !== "queued") return;
    const handle = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(handle);
  }, [mintStatus?.state]);

  if (!ethAddress) {
    return (
      <div className="text-center py-8 text-gray-400">
        Connect your Ethereum wallet to continue.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <StepIndicator steps={["Amount", "Send PRL", "Waiting", "Done"]} current={
        step === "input" ? 0 : step === "send" ? 1 : step === "waiting" ? 2 : 3
      } />

      {step === "input" && (
        <>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
              Amount (PRL)
            </label>
            <input
              type="number"
              min="0"
              step="0.00000001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00000000"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:border-[#00e5d0]/50 transition-colors"
            />
          </div>

          {isAdvanced && (
            <div>
              <label className="block text-xs text-yellow-300 mb-1.5 uppercase tracking-wide">
                WPRL destination (advanced)
              </label>
              <input
                type="text"
                value={customDestination}
                onChange={(e) => setCustomDestination(e.target.value)}
                placeholder={ethAddress ?? "0x…"}
                className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none transition-colors ${
                  customCheck?.kind === "invalid"
                    ? "border-red-500/50 focus:border-red-500/70"
                    : "border-yellow-500/30 focus:border-yellow-400/60"
                }`}
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Override the WPRL recipient. Leave blank to mint to the connected wallet.
                A typo here mints to the wrong address — unrecoverable without an admin refund.
              </p>
              {customCheck?.kind === "invalid" && (
                <p className="text-xs text-red-400 mt-1.5">
                  Invalid override — {customCheck.reason}. Fix or clear this field to continue;
                  we will not issue a deposit address while the override is unparseable.
                </p>
              )}
              {customCheck?.kind === "valid-no-checksum" && (
                <p className="text-xs text-yellow-300 mt-1.5">
                  No EIP-55 checksum. Will be normalised to{" "}
                  <span className="font-mono break-all">{customCheck.address}</span>.
                </p>
              )}
            </div>
          )}

          {!!grains && grains > 0n && (
            <div className="bg-white/5 rounded-2xl p-4 text-sm space-y-2">
              <Row
                label={feeFloorActive ? "Bridge fee (4 PRL minimum)" : "Bridge fee (0.5%)"}
                value={grainsToDisplay(fee) + " PRL"}
              />
              <Row label="You receive" value={grainsToDisplay(net) + " WPRL"} highlight />
              <Row
                label="Estimated time"
                value={willBeSlowLane ? "~24h (slow lane)" : "~20 min (fast lane)"}
              />
              <p className="text-xs text-gray-500 pt-1 border-t border-white/5">
                Bridge fee is 0.5% of the deposit, with a 4 PRL minimum (binds for deposits
                under ~800 PRL). A small Pearl network fee (~0.0012 PRL) also applies for the
                lock transaction.
              </p>
            </div>
          )}

          {belowMin && (
            <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2">
              Deposit must exceed the 4 PRL minimum bridge fee. Increase the amount to continue.
            </div>
          )}

          {willBeFastLane && (
            <div className="text-xs text-[#00e5d0] bg-[#00e5d0]/5 border border-[#00e5d0]/30 rounded-xl px-3 py-2.5">
              <span className="font-semibold">Fast lane &mdash; ~20 min.</span>{" "}
              Your amount fits the {dailyFastMintLimit !== undefined ? grainsToDisplay(dailyFastMintLimit) : "—"} PRL daily fast-lane cap
              ({fastMintWindowRemaining !== undefined ? grainsToDisplay(fastMintWindowRemaining) : "—"} PRL remaining today),
              so WPRL will mint as soon as your deposit reaches 6 Pearl confirmations.
            </div>
          )}

          {willBeSlowLane && (
            <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2.5 space-y-1.5">
              <p>
                <span className="font-semibold">Slow lane &mdash; 24h delay.</span>{" "}
                {fitsFastCapPerTx === false
                  ? `This amount exceeds the ${dailyFastMintLimit !== undefined ? grainsToDisplay(dailyFastMintLimit) : "—"} PRL per-day fast-lane cap.`
                  : `Only ${fastMintWindowRemaining !== undefined ? grainsToDisplay(fastMintWindowRemaining) : "—"} PRL is left in today's fast lane — this transaction routes through the slow lane in full.`}
              </p>
              <p className="text-gray-300">
                Your WPRL will be queued and automatically minted after{" "}
                {slowMintDelay !== undefined ? formatDuration(Number(slowMintDelay) * 1000) : "~24h"}.
                No action required from you. You can reduce the amount below
                {" "}{dailyFastMintLimit !== undefined ? grainsToDisplay(dailyFastMintLimit) : "the fast-lane cap"}
                {" "}PRL to use the instant fast lane instead.
              </p>
              <p className="text-gray-400 pt-1 border-t border-yellow-500/20">
                The 24h timelock caps how much value a 51% reorg of Pearl could try to double-spend in any one day, and gives validators time to cancel a pending mint if one is detected. {" "}
                <Link to="/infrastructure#two-lane-mint" className="text-[#00e5d0] hover:underline">Security model &rarr;</Link>
              </p>
            </div>
          )}

          {addressCheck?.kind === "invalid" && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
              Connected wallet address failed validation: {addressCheck.reason}.
              Reconnect with a wallet that exposes a valid Ethereum address.
            </div>
          )}

          {addressCheck?.kind === "valid-no-checksum" && (
            <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2">
              Address has no EIP-55 checksum. Will be normalised to{" "}
              <span className="font-mono break-all">{addressCheck.address}</span>{" "}
              before binding to your deposit address.
            </div>
          )}

          {exceedsWindow && (
            <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2">
              Amount exceeds the remaining 24h mint window
              ({mintWindowRemaining !== undefined ? grainsToDisplay(mintWindowRemaining) : "?"} PRL).
              Reduce the amount or wait for the window to reset.
            </div>
          )}

          {exceedsTvl && (
            <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2">
              Amount would push total locked PRL past the bridge TVL cap
              ({tvlCap !== undefined ? grainsToDisplay(tvlCap) : "?"} PRL).
              Reduce the amount or wait for the cap to be raised.
            </div>
          )}

          {confirmError && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
              {confirmError}
            </div>
          )}

          <button
            disabled={!grains || grains <= 0n || blockSubmit}
            onClick={handleProceed}
            className="w-full bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] hover:from-[#00f0da] hover:to-[#00c5b5] disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 text-black font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-[#00e5d0]/20 disabled:shadow-none"
          >
            {bridgePaused ? "Bridge paused" : "Continue"}
          </button>
        </>
      )}

      {step === "send" && !!grains && checksummedAddress && effectiveDestination && (
        <>
          <p className="text-gray-300 text-sm">
            Send exactly <strong className="text-white">{grainsToDisplay(grains)} PRL</strong> to
            your bridge deposit address below using any Pearl wallet. No memo or OP_RETURN required.
          </p>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
              Your Pearl Deposit Address
            </label>
            {depositAddressLoading && (
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-gray-400 text-sm">
                Requesting deposit address from the relay…
              </div>
            )}
            {depositAddressError && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                Could not obtain a deposit address: {depositAddressError}. Reconnect the wallet or
                refresh; the relay may be temporarily unavailable.
              </div>
            )}
            {userDepositAddress && (
              <>
                <div className="flex items-center gap-2 bg-white/5 border border-[#00e5d0]/30 rounded-xl px-4 py-3">
                  <span className="text-white font-mono text-xs flex-1 break-all">{userDepositAddress}</span>
                  <CopyButton value={userDepositAddress} />
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  This address is unique to your wallet. WPRL will be minted to{" "}
                  <span className="font-mono text-gray-400">{checksummedAddress.slice(0, 10)}…</span>{" "}
                  once your deposit confirms.
                </p>
              </>
            )}
          </div>

          <p className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2">
            &#9888; Send only to the address shown above. Sending to any other Pearl address — including
            an address previously issued to a different wallet — will not be credited to your account
            and will require an admin refund.
          </p>

          <button
            disabled={!userDepositAddress}
            onClick={handleSentConfirm}
            className="w-full bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] hover:from-[#00f0da] hover:to-[#00c5b5] disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 text-black font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-[#00e5d0]/20 disabled:shadow-none"
          >
            I&apos;ve sent the transaction
          </button>
        </>
      )}

      {step === "waiting" && mintStatus?.state === "under_review" && (
        <div
          className="space-y-4"
          role="status"
          aria-label="mint under manual review"
        >
          <div className="text-center py-6 space-y-3">
            <div className="text-4xl text-yellow-300" aria-hidden="true">&#9888;</div>
            <p className="text-yellow-200 font-semibold">
              Marked for manual review: anomaly detected
            </p>
            <p className="text-sm text-gray-300 max-w-md mx-auto">
              {mintStatus.anomalyReason
                ? mintStatus.anomalyReason
                : "The relay flagged this deposit for manual review before minting."}
            </p>
            <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
              Your PRL is safe in the bridge custodial set. An operator will
              review the anomaly and either release the mint or initiate a
              refund. This typically resolves within a few hours during
              business hours.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
              <a
                href={`mailto:bridgedev@mailbox.org?subject=${encodeURIComponent(
                  `Bridge review: ${pearlTxId}`,
                )}&body=${encodeURIComponent(
                  `My deposit at txid ${pearlTxId} was flagged for manual review.\n\nReason returned: ${
                    mintStatus.anomalyReason ?? "(none returned)"
                  }\n\nMy connected wallet: ${effectiveDestination ?? ""}\n`,
                )}`}
                className="text-xs text-[#00e5d0] hover:underline"
              >
                Contact operator &rarr;
              </a>
              <a
                href="/status"
                className="text-xs text-gray-400 hover:text-[#00e5d0] hover:underline"
              >
                Track on /status &rarr;
              </a>
              {pearlTxId && /^[0-9a-f]{64}$/.test(pearlTxId.trim().toLowerCase()) && (
                <a
                  href={`${PEARL_EXPLORER_BASE}/tx/${pearlTxId.trim().toLowerCase()}?network=${NETWORK}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-400 hover:text-[#00e5d0] hover:underline"
                >
                  View deposit on Pearl Explorer &rarr;
                </a>
              )}
            </div>
            {receiptId && (
              <p className="text-xs text-gray-500 pt-2">
                You can close this tab and return any time at{" "}
                <span className="font-mono text-gray-400">/bridge/{receiptId}</span>.
              </p>
            )}
          </div>
        </div>
      )}

      {step === "waiting" && mintStatus?.state === "cancelled" && (
        <div
          className="space-y-4"
          role="status"
          aria-label="mint cancelled"
        >
          <div className="text-center py-6 space-y-3">
            <div className="text-4xl text-red-400" aria-hidden="true">&#10005;</div>
            <p className="text-red-300 font-semibold">Mint cancelled</p>
            <p className="text-sm text-gray-300">
              {mintStatus.cancelReason
                ? mintStatus.cancelReason
                : "The relay cancelled this mint before it landed on Ethereum."}
            </p>
            <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
              This usually means a Pearl-chain reorg invalidated your deposit
              transaction, or an admin paused the queue. Your PRL is held in
              the bridge custodial set pending a manual refund — see the
              refund explainer below.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
              <a
                href="/status"
                className="text-xs text-[#00e5d0] hover:underline"
              >
                Look up status &rarr;
              </a>
              <a
                href={`mailto:refunds@pearlbridge.xyz?subject=${encodeURIComponent(
                  `Refund request: ${pearlTxId}`,
                )}&body=${encodeURIComponent(
                  `My deposit at txid ${pearlTxId} was cancelled by the relay.\n\nCancel reason: ${
                    mintStatus.cancelReason ?? "(none returned)"
                  }\n\nMy Pearl source address: <fill in>\nMy connected wallet: ${
                    effectiveDestination ?? ""
                  }\nProof of ownership: <attach signed message>`,
                )}`}
                className="text-xs text-[#00e5d0] hover:underline"
              >
                Request refund &rarr;
              </a>
              <a
                href="/audit"
                className="text-xs text-gray-400 hover:text-[#00e5d0] hover:underline"
              >
                Refund process explainer &rarr;
              </a>
            </div>
            {pearlTxId && /^[0-9a-f]{64}$/.test(pearlTxId.trim().toLowerCase()) && (
              <a
                href={`${PEARL_EXPLORER_BASE}/tx/${pearlTxId.trim().toLowerCase()}?network=${NETWORK}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#00e5d0] hover:underline"
              >
                View PRL deposit on Pearl Explorer &rarr;
              </a>
            )}
          </div>
        </div>
      )}

      {step === "waiting" && mintStatus?.state === "queued" && (
        <div
          className="space-y-4"
          role="status"
          aria-label="mint queued in slow lane"
        >
          <div className="text-center py-6 space-y-4">
            <div className="text-4xl text-[#0099ff]" aria-hidden="true">&#9203;</div>
            <p className="text-white font-semibold">Queued for slow-lane mint</p>
            <p className="text-sm text-gray-300">
              {(() => {
                // readyAt is already milliseconds since epoch — the relay
                // stores it as ms (mint.ts converts on-chain seconds → ms
                // at write time) and /api/order-status forwards it as-is.
                // Do NOT re-multiply by 1000 (regression caught 2026-05-23:
                // Lavize saw "year 58346" because we double-converted).
                const readyAtMs =
                  typeof mintStatus.readyAt === "number"
                    ? mintStatus.readyAt
                    : null;
                if (!readyAtMs) {
                  return "Your deposit cleared the relay but the bridge fast-lane cap is full. The mint will land automatically once the slow-lane window opens.";
                }
                const remaining = readyAtMs - nowMs;
                if (remaining <= 0) {
                  return "Slow-lane window has opened — the relay will finalise the mint on the next tick.";
                }
                return `Mints scheduled in ${formatDuration(remaining)} (at ${new Date(
                  readyAtMs,
                ).toLocaleString()}).`;
              })()}
            </p>
            <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
              The bridge fast-lane cap protects against catastrophic loss in
              the event of a relay compromise. Deposits above the daily fast
              limit ride a 24h timelocked slow lane — no action is required
              from you; the WPRL will be minted automatically when the window
              opens.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
              <a
                href="/status"
                className="text-xs text-[#00e5d0] hover:underline"
              >
                Track on /status &rarr;
              </a>
              {pearlTxId && /^[0-9a-f]{64}$/.test(pearlTxId.trim().toLowerCase()) && (
                <a
                  href={`${PEARL_EXPLORER_BASE}/tx/${pearlTxId.trim().toLowerCase()}?network=${NETWORK}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-400 hover:text-[#00e5d0] hover:underline"
                >
                  View deposit on Pearl Explorer &rarr;
                </a>
              )}
            </div>
            {receiptId && (
              <p className="text-xs text-gray-500 pt-2">
                You can close this tab and return any time at{" "}
                <span className="font-mono text-gray-400">/bridge/{receiptId}</span>.
              </p>
            )}
          </div>
        </div>
      )}

      {step === "waiting" && mintStatus?.state !== "queued" && mintStatus?.state !== "cancelled" && mintStatus?.state !== "under_review" && (
        <div
          className="space-y-4"
          role="status"
          aria-label="mint pending"
        >
          <div className="text-center py-6 space-y-4">
            <div className="w-12 h-12 border-4 border-[#00e5d0] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-300">
              {pearlConfirmations === null
                ? `Waiting for ${REQUIRED_CONFIRMATIONS} Pearl confirmations (~20 min)`
                : pearlConfirmations < REQUIRED_CONFIRMATIONS
                ? `Pearl confirmations: ${pearlConfirmations} of ${REQUIRED_CONFIRMATIONS}`
                : mintStatus?.state === "submitted"
                ? "Mint broadcast on Ethereum — awaiting confirmation"
                : mintStatus?.state === "signing" || mintStatus?.state === "attesting"
                ? "Confirmed — signing mint attestation…"
                : "Confirmed — relay is processing your mint"}
            </p>
            <p className="text-xs text-gray-500">
              {pearlTxId ? "Transaction detected — tracking confirmations:" : "Waiting for your deposit to be detected…"}
            </p>
            {mintTxHash && mintStatus?.state !== "minted" && (() => {
              // Show the Etherscan link while the mint is on-chain but not
              // yet finalized — the user can verify the broadcast happened
              // and watch the block confirm, instead of staring at a spinner.
              const url = ethExplorerTxUrl(mintTxHash);
              return url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#00e5d0] hover:underline"
                >
                  View mint tx on Etherscan &rarr;
                </a>
              ) : (
                <p className="text-xs text-gray-500 font-mono break-all">
                  Mint tx: {mintTxHash}
                </p>
              );
            })()}
            <input
              type="text"
              value={pearlTxId}
              onChange={(e) => setPearlTxId(e.target.value)}
              placeholder="auto-detecting… (or paste Pearl txid)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-[#00e5d0]/50 transition-colors"
            />

            {pearlConfirmations !== null && (
              <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] transition-all"
                  style={{
                    width: `${Math.min(100, (pearlConfirmations / REQUIRED_CONFIRMATIONS) * 100)}%`,
                  }}
                />
              </div>
            )}

            {pearlTxId && /^[0-9a-f]{64}$/.test(pearlTxId.trim().toLowerCase()) && (
              <a
                href={`${PEARL_EXPLORER_BASE}/tx/${pearlTxId.trim().toLowerCase()}?network=${NETWORK}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[#00e5d0] hover:underline"
              >
                View on Pearl Explorer &rarr;
              </a>
            )}

            {pearlTxFound === false && (
              <p className="text-xs text-yellow-300">
                Transaction not yet seen by the Pearl network. It may still be propagating —
                this view auto-refreshes every 15s.
              </p>
            )}
            {pearlPollError && (
              <p className="text-xs text-red-400">{pearlPollError}</p>
            )}

            {pearlTxId && /^[0-9a-f]{64}$/.test(pearlTxId.trim().toLowerCase()) && (
              <p className="text-xs text-gray-500 pt-1">
                Share this order's public status (no wallet required):{" "}
                <Link
                  to={`/order/${pearlTxId.trim().toLowerCase()}`}
                  className="text-[#00e5d0] hover:underline font-mono"
                >
                  /order/{pearlTxId.trim().toLowerCase().slice(0, 10)}…
                </Link>
              </p>
            )}

            {receiptId && (
              <p className="text-xs text-gray-500 pt-2">
                You can close this tab and return any time at{" "}
                <span className="font-mono text-gray-400">/bridge/{receiptId}</span>.
              </p>
            )}
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="text-center py-6 space-y-3">
          <div className="text-4xl">&#10003;</div>
          <p className="text-white font-semibold">WPRL minted successfully</p>
          <p className="text-gray-400 text-sm">{grainsToDisplay(net)} WPRL delivered to your wallet</p>

          {mintTxHash && (() => {
            const url = ethExplorerTxUrl(mintTxHash);
            return url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-[#00e5d0] hover:underline mt-2"
              >
                View WPRL mint on Etherscan &rarr;
              </a>
            ) : (
              <p className="text-xs text-gray-500 font-mono break-all mt-2">
                Mint tx: {mintTxHash}
              </p>
            );
          })()}

          {pearlTxId && /^[0-9a-f]{64}$/.test(pearlTxId.trim().toLowerCase()) && (
            <div>
              <a
                href={`${PEARL_EXPLORER_BASE}/tx/${pearlTxId.trim().toLowerCase()}?network=${NETWORK}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#00e5d0] hover:underline"
              >
                View PRL deposit on Pearl Explorer &rarr;
              </a>
            </div>
          )}

          <XFollowCTA />
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

// Human-readable countdown for the slow-lane mint readyAt timer. Returns
// "23h 12m", "47m 18s", "12s" etc. Inputs ≤ 0 fall through to the calling
// branch ("window has opened") so we don't need a negative branch here.
function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
