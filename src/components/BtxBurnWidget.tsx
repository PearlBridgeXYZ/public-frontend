import { useState, useEffect } from "react";
import { maxUint256 } from "viem";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { CopyButton } from "./CopyButton";
import {
  BTX,
  WBTX_ABI,
  BTX_BRIDGE_CONTROLLER_ABI,
  BTX_BURN_FEE_BPS_DEFAULT,
  parseBtxToGrains,
  btxGrainsToDisplay,
  btxBurnNetReceive,
  isBtxBech32mValid,
  btxSepoliaTxUrl,
} from "../lib/btxConfig";

// BTX burn → unlock widget. Burn WBTX (Sepolia testnet) to release native BTX to
// a btx1 destination. Mirrors the Pearl BurnAndUnlock flow (connect → enforce
// chain → balance → amount → bech32m-validated destination → approve → burn),
// but is fully isolated from the Pearl/mainnet path and targets Sepolia only.
//
// The BTX relay is not yet live, so this widget stops at the confirmed on-chain
// burn tx — the native BTX release is performed by the federation once the relay
// stands up. The success state is explicit about that boundary so a user isn't
// left expecting an instant credit.

type Step = "input" | "approve" | "burn" | "done";

export function BtxBurnWidget() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const onSepolia = chainId === BTX.chainId;

  const [amount, setAmount] = useState("");
  const [btxAddress, setBtxAddress] = useState("");
  const [step, setStep] = useState<Step>("input");
  // H6-style ack — gate the burn on an explicit "this is testnet" acknowledgment
  // so a user can't burn testnet WBTX expecting a real-value BTX release.
  const [ack, setAck] = useState(false);

  const grains = parseBtxToGrains(amount);
  const destValid = isBtxBech32mValid(btxAddress);

  // ── On-chain reads (all pinned to Sepolia) ──────────────────────────────────
  // Live burn fee (contract is the fee authority), paused flag, and the two
  // integrity getters: WBTX.bridgeController() must equal the configured BC, and
  // BC.wpearl() (token getter on the parameterized controller) must equal WBTX.
  const { data: stateReads } = useReadContracts({
    contracts: [
      {
        address: BTX.bridgeController,
        abi: BTX_BRIDGE_CONTROLLER_ABI,
        functionName: "burnFeeBps",
        chainId: BTX.chainId,
      },
      {
        address: BTX.bridgeController,
        abi: BTX_BRIDGE_CONTROLLER_ABI,
        functionName: "paused",
        chainId: BTX.chainId,
      },
      {
        address: BTX.bridgeController,
        abi: BTX_BRIDGE_CONTROLLER_ABI,
        functionName: "wpearl",
        chainId: BTX.chainId,
      },
      {
        address: BTX.wbtxAddress,
        abi: WBTX_ABI,
        functionName: "bridgeController",
        chainId: BTX.chainId,
      },
    ],
    query: { refetchInterval: 30_000 },
  });

  const liveFeeBps =
    stateReads?.[0]?.status === "success" ? BigInt(stateReads[0].result as number) : undefined;
  const feeBps = liveFeeBps ?? BTX_BURN_FEE_BPS_DEFAULT;
  const paused = stateReads?.[1]?.status === "success" ? (stateReads[1].result as boolean) : false;
  const bcTokenGetter =
    stateReads?.[2]?.status === "success" ? (stateReads[2].result as string) : undefined;
  const wbtxController =
    stateReads?.[3]?.status === "success" ? (stateReads[3].result as string) : undefined;

  // Integrity mismatch — only assert once BOTH reads have resolved (undefined =
  // still loading / RPC blip, not a mismatch). eqAddr is case-insensitive.
  const eqAddr = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  const controllerMismatch =
    wbtxController !== undefined && !eqAddr(wbtxController, BTX.bridgeController);
  const tokenMismatch = bcTokenGetter !== undefined && !eqAddr(bcTokenGetter, BTX.wbtxAddress);
  const integrityBroken = controllerMismatch || tokenMismatch;

  const { data: wbtxBalance, refetch: refetchBalance } = useReadContract({
    address: BTX.wbtxAddress,
    abi: WBTX_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: BTX.chainId,
    query: { enabled: !!address && onSepolia, refetchInterval: 15_000 },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: BTX.wbtxAddress,
    abi: WBTX_ABI,
    functionName: "allowance",
    args: address ? [address, BTX.bridgeController] : undefined,
    chainId: BTX.chainId,
    query: { enabled: !!address && onSepolia },
  });

  // ── Writes ──────────────────────────────────────────────────────────────────
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
    chainId: BTX.chainId,
  });
  const { isSuccess: burnSuccess, error: burnReceiptError } = useWaitForTransactionReceipt({
    hash: burnTxHash,
    chainId: BTX.chainId,
  });

  // Allowance is cached by wagmi — force a refetch once approve confirms so the
  // single action button flips from Approve to Burn instead of re-rendering Approve.
  useEffect(() => {
    if (approveSuccess) refetchAllowance();
  }, [approveSuccess, refetchAllowance]);

  // When the burn confirms on-chain, advance to the done step and refresh balance.
  useEffect(() => {
    if (burnSuccess && burnTxHash) {
      setStep("done");
      refetchBalance();
    }
  }, [burnSuccess, burnTxHash, refetchBalance]);

  const txError = approveSubmitError ?? burnSubmitError ?? approveReceiptError ?? burnReceiptError;

  const { fee, net, belowFloor } =
    grains !== null ? btxBurnNetReceive(grains, feeBps) : { fee: 0n, net: 0n, belowFloor: false };

  const exceedsBalance =
    grains !== null && typeof wbtxBalance === "bigint" && grains > (wbtxBalance as bigint);
  const needsApproval =
    grains !== null && (allowance === undefined || (allowance as bigint) < grains);

  const blockSubmit =
    grains === null ||
    grains <= 0n ||
    !destValid ||
    belowFloor ||
    exceedsBalance ||
    paused ||
    integrityBroken ||
    !ack;

  function handleApprove() {
    if (grains === null) return;
    approve({
      address: BTX.wbtxAddress,
      abi: WBTX_ABI,
      functionName: "approve",
      args: [BTX.bridgeController, maxUint256],
      chainId: BTX.chainId,
    });
    setStep("approve");
  }

  function handleBurn() {
    if (grains === null || !destValid) return;
    burn({
      address: BTX.bridgeController,
      abi: BTX_BRIDGE_CONTROLLER_ABI,
      functionName: "requestBurn",
      args: [grains, btxAddress],
      chainId: BTX.chainId,
    });
    setStep("burn");
  }

  function reset() {
    setAmount("");
    setBtxAddress("");
    setAck(false);
    resetApprove();
    resetBurn();
    setStep("input");
  }

  return (
    <div className="w-full max-w-lg mx-auto space-y-4">
      {/* Loud testnet rail */}
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs leading-relaxed">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border bg-amber-500/15 text-amber-300 border-amber-500/30">
            Sepolia Testnet
          </span>
          <span className="text-amber-200 font-semibold">Preview — not for real value</span>
        </div>
        <p className="text-gray-300">
          This burns testnet {BTX.wrappedSymbol} on{" "}
          <span className="text-white">Ethereum Sepolia</span> to release native {BTX.nativeSymbol}.
          The {BTX.wrappedSymbol} you burn is <span className="text-white">testnet</span> and has no
          monetary value.
        </p>
      </div>

      <div className="glass rounded-2xl p-6 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold">
            Burn {BTX.wrappedSymbol} → {BTX.nativeSymbol}
          </span>
        </div>

        {/* On-chain integrity warning — refuse to render the burn action if the
            deployed wiring doesn't match the configured addresses. */}
        {integrityBroken && (
          <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-300 space-y-1">
            <p className="font-semibold">On-chain integrity check failed — do NOT burn.</p>
            {controllerMismatch && (
              <p>
                {BTX.wrappedSymbol}.bridgeController() ({wbtxController?.slice(0, 10)}…) ≠ the
                configured BridgeController.
              </p>
            )}
            {tokenMismatch && (
              <p>
                BridgeController token ({bcTokenGetter?.slice(0, 10)}…) ≠ the configured{" "}
                {BTX.wrappedSymbol}.
              </p>
            )}
            <p className="text-red-400/80">
              The deployed contracts don&apos;t match this UI&apos;s configuration. Report this and
              do not submit a burn.
            </p>
          </div>
        )}

        {paused && !integrityBroken && (
          <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 text-xs text-yellow-200">
            The BTX bridge is currently paused — burns are temporarily disabled.
          </div>
        )}

        {(step === "input" || step === "approve") && (
          <>
            {/* Amount */}
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <label className="text-xs text-gray-400 uppercase tracking-wide">
                  Amount ({BTX.wrappedSymbol})
                </label>
                {typeof wbtxBalance === "bigint" && (
                  <span className="text-xs text-gray-500">
                    Balance:{" "}
                    <button
                      type="button"
                      onClick={() => setAmount(btxGrainsToDisplay(wbtxBalance as bigint))}
                      className="text-[#00e5d0] hover:underline font-mono"
                      title="Use full balance"
                    >
                      {btxGrainsToDisplay(wbtxBalance as bigint)} {BTX.wrappedSymbol}
                    </button>
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00000000"
                  inputMode="decimal"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 pr-16 text-sm font-mono focus:border-[#00e5d0]/50 outline-none"
                />
                <span className="absolute right-3 top-2.5 text-xs text-gray-500">
                  {BTX.wrappedSymbol}
                </span>
              </div>
              {amount && grains === null && (
                <p className="text-red-400 text-xs">Enter a valid {BTX.wrappedSymbol} amount.</p>
              )}
              {exceedsBalance && (
                <p className="text-red-400 text-xs">Amount exceeds your {BTX.wrappedSymbol} balance.</p>
              )}
            </div>

            {/* Destination */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 uppercase tracking-wide">
                Native {BTX.nativeSymbol} destination (btx1…)
              </label>
              <input
                value={btxAddress}
                onChange={(e) => setBtxAddress(e.target.value.trim())}
                placeholder="btx1…"
                spellCheck={false}
                className={`w-full bg-black/40 border rounded-xl px-3 py-2.5 text-sm font-mono outline-none transition-colors ${
                  btxAddress && !destValid
                    ? "border-red-500/50 focus:border-red-500/70"
                    : "border-white/10 focus:border-[#00e5d0]/50"
                }`}
              />
              {btxAddress && !destValid && (
                <p className="text-red-400 text-xs">
                  Invalid {BTX.nativeSymbol} address. Must be a bech32m btx1… address (the controller
                  rejects prl1… and malformed inputs).
                </p>
              )}
            </div>

            {/* Fee + you-receive preview */}
            {grains !== null && grains > 0n && (
              <div className="bg-black/20 rounded-xl p-3 text-xs space-y-1.5">
                {belowFloor ? (
                  <p className="text-yellow-300/90">
                    Below the minimum — after the fee the net release would be dust, so this burn
                    won&apos;t be honored. Increase the amount.
                  </p>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-400">
                        Bridge fee ({(Number(feeBps) / 100).toString()}%
                        {liveFeeBps === undefined ? ", est." : ""})
                      </span>
                      <span className="text-gray-300">
                        {btxGrainsToDisplay(fee)} {BTX.wrappedSymbol}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">You receive</span>
                      <span className="text-[#00e5d0] font-semibold">
                        {btxGrainsToDisplay(net)} {BTX.nativeSymbol}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Testnet ack */}
            {isConnected && onSepolia && (
              <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-0.5 accent-[#00e5d0]"
                />
                <span>
                  I understand this is a testnet preview: the {BTX.wrappedSymbol} I burn is testnet
                  and has no monetary value.
                </span>
              </label>
            )}

            {txError && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 space-y-1">
                <div className="font-semibold">Transaction failed</div>
                <div className="break-words">
                  {(txError as { shortMessage?: string; message?: string }).shortMessage ??
                    txError.message}
                </div>
                <button onClick={reset} className="underline hover:text-red-300">
                  Try again
                </button>
              </div>
            )}

            {/* Action button: connect → switch → approve → burn */}
            {!isConnected ? (
              <button
                onClick={() => openConnectModal?.()}
                className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] text-black"
              >
                Connect wallet
              </button>
            ) : !onSepolia ? (
              <button
                onClick={() => switchChain({ chainId: BTX.chainId })}
                disabled={switching}
                className="w-full py-3 rounded-xl font-semibold bg-amber-500/90 text-black disabled:opacity-60"
              >
                {switching ? "Switching…" : "Switch to Sepolia"}
              </button>
            ) : needsApproval && !approveSuccess ? (
              <button
                disabled={blockSubmit || (step === "approve" && !!approveTxHash && !approveSuccess)}
                onClick={handleApprove}
                className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] text-black disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500"
              >
                {step === "approve" && approveTxHash && !approveSuccess
                  ? "Approving…"
                  : `Step 1: Approve ${BTX.wrappedSymbol}`}
              </button>
            ) : (
              <button
                disabled={blockSubmit}
                onClick={handleBurn}
                className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] text-black disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500"
              >
                {approveSuccess ? `Step 2: Burn ${BTX.wrappedSymbol}` : `Burn ${BTX.wrappedSymbol}`}
              </button>
            )}
          </>
        )}

        {step === "burn" && !burnSuccess && (
          <div className="text-center py-6 space-y-4">
            <div className="w-12 h-12 border-4 border-[#00e5d0] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-300">Burning {BTX.wrappedSymbol} on Sepolia…</p>
          </div>
        )}

        {step === "done" && (
          <div className="text-center py-6 space-y-3">
            <div className="text-4xl text-[#00e5d0]">&#10003;</div>
            <p className="text-white font-semibold">{BTX.wrappedSymbol} burned on Sepolia</p>
            <p className="text-gray-400 text-sm">
              {btxGrainsToDisplay(net)} {BTX.nativeSymbol} will be released to{" "}
              <span className="font-mono">
                {btxAddress.slice(0, 12)}…{btxAddress.slice(-6)}
              </span>{" "}
              by the federation.
            </p>
            {burnTxHash && btxSepoliaTxUrl(burnTxHash) && (
              <a
                href={btxSepoliaTxUrl(burnTxHash)!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-[#00e5d0]/10 border border-[#00e5d0]/30 rounded-xl px-4 py-2 text-xs text-[#00e5d0] hover:bg-[#00e5d0]/20 transition-colors"
              >
                View burn transaction on Sepolia Etherscan ↗
              </a>
            )}
            <div className="rounded-xl bg-black/20 p-3 text-xs text-gray-400 text-left max-w-sm mx-auto">
              <p className="font-semibold text-gray-300 mb-1">What happens next</p>
              The burn is confirmed on Sepolia. The native {BTX.nativeSymbol} release is performed by
              the 2-of-3 federation once the BTX relay is live — this preview does not yet stream the
              release status. Keep your destination address and the burn tx hash above for reference.
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <span className="text-[10px] text-gray-600">Burn tx</span>
              {burnTxHash && <CopyButton value={burnTxHash} />}
            </div>
            <button onClick={reset} className="mt-2 text-xs text-gray-400 hover:text-white underline">
              Start a new burn
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
