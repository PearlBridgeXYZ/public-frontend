import { useReadContracts } from "wagmi";
import { WPRL_ABI, BRIDGE_CONTROLLER_ABI, ADDRESSES, EXPECTED_CHAIN_ID } from "../lib/contracts";
import { NETWORK } from "../lib/config";
import { grainsToDisplay } from "../lib/utils";

const ADDRS = ADDRESSES[NETWORK];

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

  return (
    <div className="w-full max-w-lg mx-auto mt-3 grid grid-cols-3 gap-3">
      <Stat label="TVL (WPRL)" value={tvl !== undefined ? grainsToDisplay(tvl) : "—"} />
      <Stat label="Fast Lane Left" value={fastRemaining !== undefined ? grainsToDisplay(fastRemaining) : "—"} />
      <Stat
        label="Bridge Status"
        value={isPaused === undefined ? "—" : isPaused ? "PAUSED" : "LIVE"}
        valueClass={isPaused ? "text-red-400" : "text-[#00e5d0]"}
        dot={isPaused === false}
      />
    </div>
  );
}

function Stat({ label, value, valueClass = "text-white", dot }: {
  label: string; value: string; valueClass?: string; dot?: boolean;
}) {
  return (
    <div className="glass rounded-2xl p-4 text-center">
      <p className="text-xs text-gray-500 mb-1.5 font-medium">{label}</p>
      <p className={`text-sm font-bold flex items-center justify-center gap-1.5 ${valueClass}`}>
        {dot && <span className="w-1.5 h-1.5 rounded-full bg-[#00e5d0] animate-pulse inline-block" />}
        {value}
      </p>
    </div>
  );
}
