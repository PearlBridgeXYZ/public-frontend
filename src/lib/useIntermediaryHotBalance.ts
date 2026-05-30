// Reads the WPRL balance of the side-door intermediary hot wallet.
//
// Why this matters for the "WPRL in circulation" number:
//   When a user sends WPRL to the intermediary hot wallet and the relay
//   dispatches PRL from the lock at the same time, the lock balance drops
//   immediately but the WPRL has not been burned yet. That WPRL is
//   operator-owned and pending burn — it does not represent a user-held
//   claim against the bridge, and counting it in totalSupply makes the
//   bridge look temporarily undercollateralized (custodied PRL < minted
//   WPRL) until the burn lands.
//
// Subtracting this balance from totalSupply gives the honest "user-held
// WPRL" figure. Returns 0n when the side door is disabled or the address
// isn't surfaced by the relay.
import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { WPRL_ABI, ADDRESSES, NETWORK, EXPECTED_CHAIN_ID } from "./contracts";
import { fetchSideDoorConfig } from "./sideDoorUnwrap";

const ADDRS = ADDRESSES[NETWORK];

export function useIntermediaryHotBalance(): {
  address: `0x${string}` | null;
  balance: bigint | null;
} {
  const [address, setAddress] = useState<`0x${string}` | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSideDoorConfig()
      .then((cfg) => {
        if (cancelled) return;
        if (cfg.enabled && cfg.intermediaryHotAddress) {
          setAddress(cfg.intermediaryHotAddress);
        }
      })
      .catch(() => { /* side door unreachable — leave as null */ });
    return () => { cancelled = true; };
  }, []);

  const { data } = useReadContract({
    address: ADDRS.WPRL as `0x${string}` | undefined,
    abi: WPRL_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: EXPECTED_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });

  return {
    address,
    balance: data != null ? (data as bigint) : null,
  };
}
