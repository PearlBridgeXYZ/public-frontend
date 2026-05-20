import { createAuthenticationAdapter } from "@rainbow-me/rainbowkit";
import {
  buildSiweMessage,
  fetchSiweNonce,
  fetchSiweSession,
  siweSignOut,
  verifySiwe,
} from "./siwe";
import { setAuthStatus } from "./authStore";

// RainbowKit AuthenticationAdapter that delegates to our SIWE backend.
// The shape RainbowKit expects:
//   getNonce, createMessage, verify, signOut.
//
// `createMessage` returns the canonical string to be signed by the wallet.
// `verify` posts {message, signature} to /api/auth/verify and is expected to
// return true/false; the cookie set by the backend is what carries the
// authenticated session.

export const siweAdapter = createAuthenticationAdapter<string>({
  getNonce: async () => fetchSiweNonce(),
  createMessage: ({ nonce, address, chainId }) =>
    buildSiweMessage({
      domain: window.location.host,
      address,
      uri: window.location.origin,
      version: "1",
      chainId,
      nonce,
      issuedAt: new Date().toISOString(),
      statement: "Sign in to PearlBridge to verify wallet ownership. This signature does not authorize any transaction.",
      expirationTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }),
  verify: async ({ message, signature }) => {
    try {
      await verifySiwe(message, signature as `0x${string}`);
      setAuthStatus("authenticated");
      return true;
    } catch {
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
