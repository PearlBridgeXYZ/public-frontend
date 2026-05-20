import type { AuthenticationStatus } from "@rainbow-me/rainbowkit";

// Module-singleton auth state. The RainbowKitAuthenticationProvider needs
// `status` driven from outside the adapter — without this, the App-level
// useState hydrates once on mount and never updates when the user signs
// the SIWE message, so the connect button stays stuck on "Sign in" even
// though the backend session is good.

type Listener = (s: AuthenticationStatus) => void;

let status: AuthenticationStatus = "loading";
const listeners = new Set<Listener>();

export function getAuthStatus(): AuthenticationStatus {
  return status;
}

export function setAuthStatus(next: AuthenticationStatus): void {
  if (status === next) return;
  status = next;
  listeners.forEach((l) => l(next));
}

export function subscribeAuthStatus(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
