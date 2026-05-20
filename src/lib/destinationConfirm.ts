import { mainnet, sepolia, hardhat } from "wagmi/chains";
import { NETWORK } from "./config";
import { ADDRESSES } from "./contracts";

// EIP-712 typed-data builder used to ask the connected wallet to sign an
// intent-confirmation before a burn or before the user is shown their
// per-user Pearl deposit address. The signature is NOT submitted on-chain —
// it is a local-only "are you sure?" gate so a phishing UI cannot silently
// swap the destination address out from under the user.

const DOMAIN_NAME = "PearlBridge";
const DOMAIN_VERSION = "1";

export const DESTINATION_CONFIRM_TYPES = {
  DestinationConfirm: [
    { name: "action", type: "string" },
    { name: "ethAddress", type: "address" },
    { name: "pearlAddress", type: "string" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "expires", type: "uint256" },
  ],
} as const;

export type DestinationAction = "burn" | "mint";

export interface DestinationConfirmMessage {
  action: DestinationAction;
  ethAddress: `0x${string}`;
  pearlAddress: string;
  amount: bigint;
  nonce: bigint;
  expires: bigint;
}

export function buildDestinationConfirmDomain(chainId?: number) {
  const effectiveChainId =
    chainId ??
    (NETWORK === "mainnet" ? mainnet.id : NETWORK === "devnet" ? hardhat.id : sepolia.id);
  const bridge = ADDRESSES[NETWORK].BRIDGE_CONTROLLER;
  return {
    name: DOMAIN_NAME,
    version: DOMAIN_VERSION,
    chainId: effectiveChainId,
    // C-4 fix: never fall back to 0x0 — a zero verifyingContract creates a shared
    // domain separator across all deployments, enabling signature replay. Throw
    // instead so the user sees a clear error rather than signing an unsafe payload.
    verifyingContract: (() => {
      if (!bridge) throw new Error(`No BridgeController address for network "${NETWORK}" — cannot build EIP-712 domain`);
      return bridge as `0x${string}`;
    })(),
  } as const;
}

export function makeDestinationMessage(
  action: DestinationAction,
  ethAddress: `0x${string}`,
  pearlAddress: string,
  amount: bigint,
): DestinationConfirmMessage {
  // 16-byte random nonce, 10-minute expiry window.
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  let nonce = 0n;
  for (const b of buf) nonce = (nonce << 8n) | BigInt(b);
  const expires = BigInt(Math.floor(Date.now() / 1000) + 600);
  return { action, ethAddress, pearlAddress, amount, nonce, expires };
}
