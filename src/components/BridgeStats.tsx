import { useEffect, useState } from "react";
import { useReadContracts } from "wagmi";
import { WPRL_ABI, BRIDGE_CONTROLLER_ABI, ADDRESSES, EXPECTED_CHAIN_ID } from "../lib/contracts";
import { NETWORK } from "../lib/config";
import { grainsToWholePrl, hoursUntilEpochReset } from "../lib/utils";

const ADDRS = ADDRESSES[NETWORK];

// Mirrors BridgeController.WINDOW_DURATION. The fast-lane cap resets at the
// next fixed UTC epoch boundary (BridgeLib.currentEpoch — `floor(t/W)*W`),
// not 24h after the first charge. Hardcoded here because it's an immutable
// constant on the deployed BC and adding an RPC call to read it would only
// move a constant around the wire.
const WINDOW_DURATION_SEC = 86_400;

export function BridgeStats() {
  // Pin reads to the bridge's deployed chain. Without an explicit chainId,
  // wagmi reads from the connected wallet's active chain (or default
  // mainnet pre-connect) — the BC address only exists on EXPECTED_CHAIN_ID,
  // so every call would return undefined and the panel would show "—".
  const { data } = useReadContracts({
    contracts: [
      { address: ADDRS.WPRL, abi: WPRL_ABI, functionName: "totalSupply", chainId: EXPECTED_CHAIN_ID },
      { address: ADDRS.BRIDGE_CONTROLLER, abi: BRIDGE_CONTROLLER_ABI, functionName: "fastMintWindowRemaining", chainId: EXPECTED_CHAIN_ID },
      { address: ADDRS.BRIDGE_CONTROLLER, abi: BRIDGE_CONTROLLER_ABI, functionName: "paused", chainId: EXPECTED_CHAIN_ID },
    ],
    query: { refetchInterval: 30_000 },
  });

  const tvl = data?.[0]?.result as bigint | undefined;
  const fastRemaining = data?.[1]?.result as bigint | undefined;
  const isPaused = data?.[2]?.result as boolean | undefined;

  // Tick once a minute — one-decimal hours don't change faster than every
  // 6 minutes, so 60s is plenty and keeps us off setInterval(1000) battery
  // drain on mobile. Lazy initializer so SSR / first paint don't re-run
  // Date.now() on every render.
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(id);
  }, []);
  const resetCountdown =
    fastRemaining !== undefined
      ? `resets in ${hoursUntilEpochReset(nowSec, WINDOW_DURATION_SEC).toFixed(1)}h`
      : undefined;

  return (
    <div className="w-full max-w-lg mx-auto mt-3 grid grid-cols-3 gap-3">
      <Stat label="TVL (WPRL)" value={tvl !== undefined ? grainsToWholePrl(tvl) : "—"} />
      <Stat
        label="Fast Lane Left"
        value={fastRemaining !== undefined ? grainsToWholePrl(fastRemaining) : "—"}
        subscript={resetCountdown}
      />
      <Stat
        label="Bridge Status"
        value={isPaused === undefined ? "—" : isPaused ? "PAUSED" : "LIVE"}
        valueClass={isPaused ? "text-red-400" : "text-[#00e5d0]"}
        dot={isPaused === false}
      />
    </div>
  );
}

function Stat({ label, value, valueClass = "text-white", dot, subscript }: {
  label: string; value: string; valueClass?: string; dot?: boolean; subscript?: string;
}) {
  return (
    <div className="glass rounded-2xl p-4 text-center">
      <p className="text-xs text-gray-500 mb-1.5 font-medium">{label}</p>
      <p className={`text-sm font-bold flex items-center justify-center gap-1.5 ${valueClass}`}>
        {dot && <span className="w-1.5 h-1.5 rounded-full bg-[#00e5d0] animate-pulse inline-block" />}
        {value}
      </p>
      {subscript && <p className="text-[10px] text-gray-500 mt-1">{subscript}</p>}
    </div>
  );
}
