import { createAuthenticationAdapter } from "@rainbow-me/rainbowkit";
import { mainnet, sepolia, hardhat } from "wagmi/chains";
import {
  buildSiweMessage,
  fetchSiweNonce,
  fetchSiweSession,
  siweSignOut,
  verifySiwe,
} from "./siwe";
import { setAuthStatus } from "./authStore";
import { NETWORK } from "./contracts";

// RainbowKit AuthenticationAdapter that delegates to our SIWE backend.
// The shape RainbowKit expects:
//   getNonce, createMessage, verify, signOut.
//
// `createMessage` returns the canonical string to be signed by the wallet.
// `verify` posts {message, signature} to /api/auth/verify and is expected to
// return true/false; the cookie set by the backend is what carries the
// authenticated session.

// Backend pins SIWE chainId to the relay's own NETWORK (relay/src/api/siwe.ts
// L191-197) — a Sepolia-signed message can't be replayed against the mainnet
// relay or vice-versa. Frontend has to match. If the connected wallet sits on
// a different chain at sign time (common on Windows when Phantom/OKX hijack
// `window.ethereum` and report a non-Ethereum chain), the backend would 401
// with "chainId mismatch" → RainbowKit's "Error verifying signature" toast,
// which makes the user think they did something wrong. Catch it before we
// even ask the wallet to sign.
const EXPECTED_CHAIN_ID =
  NETWORK === "mainnet" ? mainnet.id
  : NETWORK === "sepolia" ? sepolia.id
  : hardhat.id;

const EXPECTED_CHAIN_NAME =
  NETWORK === "mainnet" ? "Ethereum mainnet"
  : NETWORK === "sepolia" ? "Sepolia"
  : "the local devnet";

export const siweAdapter = createAuthenticationAdapter<string>({
  getNonce: async () => fetchSiweNonce(),
  createMessage: ({ nonce, address, chainId }) => {
    if (chainId !== EXPECTED_CHAIN_ID) {
      // Throw with a copy the user can act on. RainbowKit catches and
      // renders this in its sign-in modal as "Error preparing message".
      throw new Error(
        `Your wallet is on the wrong network. Please switch to ${EXPECTED_CHAIN_NAME} and try again.`,
      );
    }
    return buildSiweMessage({
      domain: window.location.host,
      address,
      uri: window.location.origin,
      version: "1",
      chainId,
      nonce,
      issuedAt: new Date().toISOString(),
      statement: "Sign in to PearlBridge to verify wallet ownership. This signature does not authorize any transaction.",
      expirationTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  },
  verify: async ({ message, signature }) => {
    try {
      await verifySiwe(message, signature as `0x${string}`);
      setAuthStatus("authenticated");
      return true;
    } catch (e) {
      // Surface the actual reason to the console so support can triage when
      // a user reports the generic RainbowKit "Error verifying signature"
      // toast. Most common: the wallet that signed wasn't the wallet whose
      // address went into the message (multi-extension provider race —
      // largely fixed by switching to EIP-6963 in wagmi.ts, but worth
      // keeping the trace for anything still slipping through).
      console.error("[SIWE] backend verify rejected signature:", e);
      setAuthStatus("unauthenticated");
      return false;
    }
  },
  signOut: async () => {
    await siweSignOut();
    setAuthStatus("unauthenticated");
  },
});

// Used by App.tsx to hydrate auth status on mount.
export async function getInitialSiweStatus(): Promise<"authenticated" | "unauthenticated"> {
  const session = await fetchSiweSession().catch(() => null);
  const status = session ? "authenticated" : "unauthenticated";
  setAuthStatus(status);
  return status;
}
