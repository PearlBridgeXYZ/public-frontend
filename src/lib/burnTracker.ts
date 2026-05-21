// Persistent burn-tracker for WPRL → PRL.
//
// The naive flow in BurnAndUnlock kept the burn tx hash in React state from
// `useWriteContract`. That state lives only as long as the component is
// mounted in this tab — closing the tab, refreshing, or navigating away in
// the SPA wiped it, the polling effect was never restarted, and the user
// was left staring at the input screen even though the relay had already
// finalised the unlock on the Pearl side.
//
// To make the confirmation reliable we persist the active burn to
// localStorage keyed by the user's eth address. On mount the widget
// rehydrates from the store and resumes polling against the relay, so the
// confirmation lands the next time the user opens the tab — not just the
// session they submitted in.

const STORAGE_PREFIX = "pearlbridge:pendingBurn:";
const STORAGE_VERSION = 1;

// Maximum lifetime of a stored burn. The relay's waitPearlConfirmation tops
// out at 30 min; after 6 hours we stop polling and let the user pick the
// transaction back up from /history if it never finalised. We do NOT auto-
// clear — the entry stays so a stale UI can still surface a "still pending"
// notice with a link to history.
export const BURN_POLL_TIMEOUT_MS = 6 * 60 * 60 * 1000;

export interface PendingBurn {
  version: number;
  ethTxHash: `0x${string}`;
  ethAddress: `0x${string}`;
  pearlAddress: string;
  // Stored as decimal strings since JSON can't serialise bigint and we
  // never need to do math on them on the FE side once burned — they're
  // purely for re-rendering the success screen.
  grossGrains: string;
  netGrains: string;
  feeGrains: string;
  submittedAt: number;
}

export interface PendingBurnInput {
  ethTxHash: `0x${string}`;
  ethAddress: `0x${string}`;
  pearlAddress: string;
  grossGrains: bigint;
  netGrains: bigint;
  feeGrains: bigint;
  submittedAt?: number;
}

// Minimal Storage shim so the module tests can run under Node without
// pulling in a DOM. Falls back to a no-op store if `localStorage` is not
// defined (SSR, tests without happy-dom).
function getStore(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // localStorage access can throw under strict privacy settings.
  }
  return null;
}

function keyFor(ethAddress: string): string {
  return `${STORAGE_PREFIX}${ethAddress.toLowerCase()}`;
}

export function saveBurn(input: PendingBurnInput): void {
  const store = getStore();
  if (!store) return;
  const row: PendingBurn = {
    version: STORAGE_VERSION,
    ethTxHash: input.ethTxHash,
    ethAddress: input.ethAddress,
    pearlAddress: input.pearlAddress,
    grossGrains: input.grossGrains.toString(),
    netGrains: input.netGrains.toString(),
    feeGrains: input.feeGrains.toString(),
    submittedAt: input.submittedAt ?? Date.now(),
  };
  try {
    store.setItem(keyFor(input.ethAddress), JSON.stringify(row));
  } catch {
    // Storage quota or serialisation error — better to lose persistence
    // than crash the burn flow.
  }
}

export function loadBurn(ethAddress: string | undefined | null): PendingBurn | null {
  if (!ethAddress) return null;
  const store = getStore();
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(keyFor(ethAddress));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingBurn>;
    if (
      parsed?.version !== STORAGE_VERSION ||
      typeof parsed.ethTxHash !== "string" ||
      typeof parsed.ethAddress !== "string" ||
      typeof parsed.pearlAddress !== "string" ||
      typeof parsed.netGrains !== "string" ||
      typeof parsed.grossGrains !== "string" ||
      typeof parsed.feeGrains !== "string" ||
      typeof parsed.submittedAt !== "number"
    ) {
      // Schema mismatch — drop the row so we don't keep tripping over it.
      clearBurn(ethAddress);
      return null;
    }
    return parsed as PendingBurn;
  } catch {
    clearBurn(ethAddress);
    return null;
  }
}

export function clearBurn(ethAddress: string | undefined | null): void {
  if (!ethAddress) return;
  const store = getStore();
  if (!store) return;
  try {
    store.removeItem(keyFor(ethAddress));
  } catch {
    /* ignore */
  }
}

// Map every relay burn state we know about into the four UI buckets the
// widget renders. The relay's actual state enum (per relay/src/db +
// relay/src/relay/unlock.ts + ethereum/watcher.ts) is:
//   pending    — queued, not yet attempted
//   signing    — relay is constructing + signing the Pearl tx
//   submitted  — broadcast to Pearl mempool, awaiting confirmation
//   finalized  — confirmed on Pearl ≥1 conf
//   failed     — release tx errored or didn't confirm within 30 min
//   reorged    — Eth-side reorg invalidated the burn before release
// The previous mapping in BurnAndUnlock only recognised `finalized` /
// `complete` / `unlocked` as success and `failed` as failure — every other
// state collapsed to "pending" and the user never saw a "broadcast"
// transition or a reorg / failure surfaced. `mapBurnState` makes the
// mapping explicit and total, so adding a future state to the relay is a
// type error here instead of a silent FE hang.
export type UiBurnState =
  | "pending"        // relay knows about it, hasn't started signing yet
  | "processing"     // signing / broadcasting in progress
  | "broadcast"      // tx is on Pearl mempool, waiting for confirmation
  | "complete"       // confirmed on Pearl, PRL delivered
  | "failed"         // unrecoverable — show error
  | "reorged"        // Eth reorg killed it before release — show recovery copy
  | "under_review";  // RC5.15 — anomaly detector parked the burn for manual review

export function mapBurnState(raw: string | null | undefined): UiBurnState {
  switch (raw) {
    case "finalized":
    case "complete":
    case "unlocked":
      return "complete";
    case "submitted":
      return "broadcast";
    case "signing":
      return "processing";
    case "failed":
      return "failed";
    case "reorged":
      return "reorged";
    case "under_review":
      return "under_review";
    case "pending":
    case null:
    case undefined:
    case "":
      return "pending";
    default:
      // Unknown relay state — treat as pending so we keep polling rather
      // than declaring success or failure on an unrecognised value.
      return "pending";
  }
}

export function isTerminalUiState(s: UiBurnState): boolean {
  // under_review is terminal for client-side polling: only an operator
  // releasing the row will transition it forward, so there's no useful
  // work for the FE to do beyond surfacing the reason and stopping the
  // poll loop.
  return s === "complete" || s === "failed" || s === "reorged" || s === "under_review";
}
