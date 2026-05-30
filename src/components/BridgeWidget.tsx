import { useState } from "react";
import { useAccount, useChainId, useReadContract, useSwitchChain } from "wagmi";
import { LockAndMint } from "./LockAndMint";
import { BurnAndUnlock } from "./BurnAndUnlock";
import { DuplicatePayoutNotice } from "./DuplicatePayoutNotice";
import {
  CONTRACTS,
  EXPECTED_CHAIN_ID,
  EXPECTED_CHAIN_LABEL,
  NETWORK,
  BRIDGE_CONTROLLER_ABI,
} from "../lib/contracts";
import {
  DEPOSIT_RESUMES_AT_UNIX,
  WITHDRAW_RESUMES_AT_UNIX,
} from "../lib/pauseSchedule";

type Direction = "lock" | "burn";

export function BridgeWidget() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [direction, setDirection] = useState<Direction>("lock");

  const { data: isPaused, isError: pausedReadFailed } = useReadContract({
    address: CONTRACTS.BRIDGE_CONTROLLER,
    abi: BRIDGE_CONTROLLER_ABI,
    functionName: "paused",
    query: { enabled: !!CONTRACTS.BRIDGE_CONTROLLER, refetchInterval: 15_000 },
  });

  // Pause-gate fallback: if the on-chain paused() read errors (RPC outage,
  // node throttle, transient timeout) we cannot let isPaused silently fall
  // through to `undefined` — `bridgePaused={isPaused === true}` would then
  // disengage the user-facing pause gate while the contract is still paused,
  // and the user's tx would revert in their wallet. Instead, fall back to
  // the operator-published schedule: if the read fails AND the schedule
  // says the relevant lane has not yet resumed, treat as paused.
  // The direction-aware threshold matches the post-unpause split: deposits
  // resume later than withdrawals in this window.
  const nowSec = Math.floor(Date.now() / 1000);
  const scheduleResumesAt =
    direction === "lock" ? DEPOSIT_RESUMES_AT_UNIX : WITHDRAW_RESUMES_AT_UNIX;
  const scheduleSaysPaused = nowSec < scheduleResumesAt;
  const bridgePaused =
    isPaused === true ||
    (pausedReadFailed && isPaused === undefined && scheduleSaysPaused);

  // M5-15 (Round 5): refuse to show the bridge UI if the user's wallet is on
  // the wrong chain. Empty EXPECTED_BC_ADDRESS means the contract hasn't been
  // deployed yet — skip the chain check in that case (pre-deploy / testnet).
  const wrongChain = !!address && chainId !== EXPECTED_CHAIN_ID;

  if (wrongChain) {
    return (
      <div className="w-full max-w-lg mx-auto glass-strong rounded-3xl p-6 shadow-2xl shadow-black/50">
        <div className="text-center py-8 space-y-4">
          <p className="text-red-400 font-semibold text-lg">Wrong Network</p>
          <p className="text-gray-400 text-sm">
            Please switch to <span className="text-white font-semibold">{EXPECTED_CHAIN_LABEL}</span>.
            <br />
            Your wallet is connected to chain ID {chainId}.
          </p>
          <button
            onClick={() => switchChain({ chainId: EXPECTED_CHAIN_ID })}
            disabled={switching}
            className="px-5 py-2.5 bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] text-black font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {switching ? "Switching…" : `Switch to ${NETWORK === "devnet" ? "DevNet" : NETWORK === "mainnet" ? "Mainnet" : "Sepolia"}`}
          </button>
          {NETWORK === "devnet" && (
            <p className="text-xs text-gray-500 leading-relaxed pt-2">
              If your wallet doesn't have the DevNet chain, add it manually:
              <br />
              <span className="text-gray-400">Network name:</span> PearlBridge DevNet
              <br />
              <span className="text-gray-400">RPC URL:</span> <span className="font-mono text-[#00e5d0]">{import.meta.env.VITE_DEVNET_RPC_URL || "http://localhost:8545"}</span>
              <br />
              <span className="text-gray-400">Chain ID:</span> <span className="font-mono text-[#00e5d0]">31337</span>
              <br />
              <span className="text-gray-400">Symbol:</span> ETH
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto glass-strong rounded-3xl p-6 shadow-2xl shadow-black/50">
      <DuplicatePayoutNotice />
      {bridgePaused && (
        <div className="mb-5 bg-red-500/10 border border-red-500/40 rounded-xl px-4 py-3 text-sm text-red-300 space-y-1">
          <p className="font-semibold text-red-200">Bridge paused</p>
          <p className="text-xs">
            On-chain transactions will revert. New deposits and burns are
            disabled until the operator resumes the contract.
            {pausedReadFailed && isPaused === undefined && (
              <span className="block mt-1 text-red-400/80">
                (Live pause-status read failed; showing scheduled state.)
              </span>
            )}
          </p>
        </div>
      )}
      {/* Direction tabs */}
      <div className="flex bg-white/5 rounded-2xl p-1 mb-6 gap-1">
        <button
          onClick={() => setDirection("lock")}
          className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
            direction === "lock"
              ? "bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] text-black shadow-lg shadow-[#00e5d0]/20"
              : "text-gray-400 hover:text-white"
          }`}
        >
          PRL &rarr; WPRL
        </button>
        <button
          onClick={() => setDirection("burn")}
          className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
            direction === "burn"
              ? "bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] text-black shadow-lg shadow-[#00e5d0]/20"
              : "text-gray-400 hover:text-white"
          }`}
        >
          WPRL &rarr; PRL
        </button>
      </div>

      {direction === "lock" ? (
        <LockAndMint ethAddress={address} bridgePaused={bridgePaused} />
      ) : (
        <BurnAndUnlock ethAddress={address} bridgePaused={bridgePaused} />
      )}
    </div>
  );
}
