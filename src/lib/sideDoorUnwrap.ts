// Client-side helpers for the operator-trusted intermediary unwrap
// channel ("side door"). Mirror of relay's src/api/intermediary.ts —
// every helper here is a thin wrapper around an HTTP call.
//
// The side door is GATED OFF on the relay by default (feature flag
// INTERMEDIARY_UNWRAP_ENABLED). When the relay returns 404 / {enabled:
// false}, the UI must render an inert "feature disabled" state — never
// fall back to a different relay or assume the feature is live.
//
// Trust model: see relay/docs/INTERMEDIARY-UNWRAP-AUDIT.md. The user
// sends WPRL directly to an operator hot wallet. There is no on-chain
// claim. The binding API is the operator's promise to credit PRL to
// whatever Pearl address the user signed-bind to their ETH key.

import { RELAY_API_BASE } from "./config";

// Allow next.pearlbridge.xyz to point the side door at a dev relay
// (where the feature flag is on) while the canonical RELAY_API_BASE
// still points at production for the bridge UI. Falls back to
// RELAY_API_BASE when unset.
export const SIDE_DOOR_API_BASE: string =
  (import.meta.env.VITE_SIDE_DOOR_API_BASE as string | undefined) ?? RELAY_API_BASE;

export interface SideDoorConfig {
  enabled: boolean;
  intermediaryHotAddress?: `0x${string}`;
  wprlAddress?: `0x${string}`;
  feeBps?: number;
  perTxCapWei?: bigint;
  daily24hCapWei?: bigint;
  minPayoutWei?: bigint;
  minConfirmations?: number;
  chainId?: number;
}

export async function fetchSideDoorConfig(): Promise<SideDoorConfig> {
  const res = await fetch(`${SIDE_DOOR_API_BASE}/api/unwrap/config`);
  if (res.status === 404) return { enabled: false };
  if (!res.ok) throw new Error(`config fetch failed: HTTP ${res.status}`);
  const j = await res.json();
  if (!j.enabled) return { enabled: false };
  return {
    enabled: true,
    intermediaryHotAddress: j.intermediaryHotAddress,
    wprlAddress: j.wprlAddress,
    feeBps: Number(j.feeBps),
    perTxCapWei: BigInt(j.perTxCapWei),
    daily24hCapWei: BigInt(j.daily24hCapWei),
    minPayoutWei: BigInt(j.minPayoutWei),
    minConfirmations: Number(j.minConfirmations),
    chainId: Number(j.chainId),
  };
}

// MUST match relay/src/api/intermediary.ts:bindingPayload() byte-for-byte.
// The relay re-builds this string with the values from the POST and
// recovers the signer; any divergence here → 401 on bind.
export function buildBindingPayload(args: {
  ethAddress: string;
  pearlAddress: string;
  intermediaryAddress: string;
  chainId: number;
  nonce: string;
  issuedAt: number; // ms epoch
  bindingTtlMs: number;
}): string {
  return [
    "PearlBridge intermediary unwrap binding",
    "",
    "By signing this, I authorize the PearlBridge intermediary hot wallet",
    "to credit ANY WPRL sent from the ETH address below to the Pearl",
    "address below. This binding does NOT obligate me to send anything,",
    "and can be replaced at any time by signing a new binding.",
    "",
    `Chain ID: ${args.chainId}`,
    `Intermediary hot wallet: ${args.intermediaryAddress}`,
    `From ETH address: ${args.ethAddress}`,
    `To Pearl address: ${args.pearlAddress}`,
    `Nonce: ${args.nonce}`,
    `Issued at: ${new Date(args.issuedAt).toISOString()}`,
    `Binding TTL (ms): ${args.bindingTtlMs}`,
  ].join("\n");
}

export const DEFAULT_BINDING_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// 16-byte url-safe nonce. Matches the relay regex `[0-9a-zA-Z_-]{16,128}`.
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export interface BindingRow {
  ethAddress: string;
  pearlAddress: string;
  expiresAt: number; // ms epoch
}

export async function postBind(args: {
  ethAddress: string;
  pearlAddress: string;
  signature: `0x${string}`;
  nonce: string;
  issuedAt: number;
  bindingTtlMs?: number;
}): Promise<BindingRow> {
  const res = await fetch(`${SIDE_DOOR_API_BASE}/api/unwrap/bind`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`bind failed (HTTP ${res.status}): ${j?.error ?? "unknown"}`);
  }
  // Relay's bind response is {ok, expiresAt, promoted} — it does NOT echo
  // ethAddress/pearlAddress back. Synthesize the BindingRow from the args
  // we just sent + the expiresAt the relay returned, so downstream renders
  // (which read binding.pearlAddress) don't blow up.
  return {
    ethAddress: args.ethAddress,
    pearlAddress: args.pearlAddress,
    expiresAt: Number(j?.expiresAt ?? args.issuedAt + (args.bindingTtlMs ?? DEFAULT_BINDING_TTL_MS)),
  };
}

export async function fetchBinding(ethAddress: string): Promise<BindingRow | null> {
  const res = await fetch(
    `${SIDE_DOOR_API_BASE}/api/unwrap/binding?ethAddress=${encodeURIComponent(ethAddress)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`binding fetch failed: HTTP ${res.status}`);
  return (await res.json()) as BindingRow;
}

export type UnwrapState =
  | "awaiting_address"
  | "pending"
  | "signing"
  | "submitted"
  | "finalized"
  | "failed"
  | "reorged"
  | "under_review";

export interface UnwrapRow {
  ethTxHash: string;
  ethLogIndex: number;
  ethFrom: string;
  ethTo: string;
  wprlAmount: string;        // decimal string (wei)
  pearlAddress: string | null;
  pearlAmount: string | null; // decimal string (grains)
  feeBps: number;
  fee: string;
  state: UnwrapState;
  pearlTxId: string | null;
  ethBlock: number;
  reviewReason: string | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export async function fetchStatusByTx(ethTxHash: string): Promise<UnwrapRow[]> {
  const res = await fetch(
    `${SIDE_DOOR_API_BASE}/api/unwrap/status?ethTxHash=${encodeURIComponent(ethTxHash)}`,
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`status fetch failed: HTTP ${res.status}`);
  const j = await res.json();
  // Relay returns three shapes:
  //   - single row (when ?ethLogIndex= is set)            → object
  //   - multi-row {entries: [...]} (no ethLogIndex)       → envelope
  //   - bare array (older relay builds, kept for safety)  → array
  if (Array.isArray(j)) return j as UnwrapRow[];
  if (j && Array.isArray((j as { entries?: unknown }).entries)) {
    return (j as { entries: UnwrapRow[] }).entries;
  }
  return [j as UnwrapRow];
}

export function isTerminalState(s: UnwrapState): boolean {
  return s === "finalized" || s === "failed" || s === "reorged" || s === "under_review";
}
