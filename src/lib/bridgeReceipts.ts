// localStorage-backed bridge receipts. Each in-progress bridge attempt gets a
// short id appended to the URL (`/bridge/r_<id>`) so a user can close the tab,
// share the link, or hit reload without losing their step state.
//
// Receipts are client-only — they're a UX convenience, not a source of truth.
// The relay is the authoritative record of which deposit address is bound to
// which ETH recipient (see `/api/deposit-address`).

export type ReceiptStep = "send" | "waiting" | "done";

export interface BridgeReceipt {
  id: string;
  ethAddress: string;
  amountGrains: string;        // BigInt serialised
  netGrains: string;           // BigInt serialised — after fee
  depositAddress: string | null;
  pearlTxId: string | null;
  // Ethereum tx that delivered WPRL to the user's wallet. Populated once
  // the relay reports state="minted" via /api/deposits/<pearlTxId>.
  mintTxHash: string | null;
  step: ReceiptStep;
  network: string;             // "mainnet" | "sepolia" | "devnet"
  createdAt: number;
  updatedAt: number;
}

const KEY_PREFIX = "pearlbridge.receipt.";
const INDEX_KEY = "pearlbridge.receipt.index";

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function newReceiptId(): string {
  // 122-bit UUID v4, hyphens stripped for URL compactness. The receipt index
  // can grow without practical collision risk even across many devices.
  return `r_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function loadReceipt(id: string): BridgeReceipt | null {
  const ls = safeLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(KEY_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw) as BridgeReceipt;
  } catch {
    return null;
  }
}

export function saveReceipt(r: BridgeReceipt): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    r.updatedAt = Date.now();
    ls.setItem(KEY_PREFIX + r.id, JSON.stringify(r));
    addToIndex(ls, r.id);
  } catch {
    /* localStorage full or disabled; treat receipts as ephemeral */
  }
}

function addToIndex(ls: Storage, id: string): void {
  try {
    const raw = ls.getItem(INDEX_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(id)) {
      list.unshift(id);
      // Keep the most recent 50; older receipts are not deleted from their
      // per-id keys but are not surfaced anywhere either.
      ls.setItem(INDEX_KEY, JSON.stringify(list.slice(0, 50)));
    }
  } catch {
    /* index is best-effort */
  }
}

// Enumerate every receipt the index knows about. Used by the auto-detect
// catalog to compute the set of pearlTxIds this browser has already adopted
// for a prior bridge — without this, a reused deposit address makes the
// relay's "most recent non-finalized deposit" call return the OLD txid for
// the second bridge attempt and the UI silently rebinds to it.
export function listAllReceipts(): BridgeReceipt[] {
  const ls = safeLocalStorage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(INDEX_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    const out: BridgeReceipt[] = [];
    for (const id of ids) {
      const r = loadReceipt(id);
      if (r) out.push(r);
    }
    return out;
  } catch {
    return [];
  }
}

// Catalog of pearlTxIds already bound to any local bridge receipt. Excludes
// the caller's own receipt id so a user who manually clears the txid field
// mid-bridge can have the same txid auto-detected again. Always lowercase
// for case-insensitive comparison.
export function getConsumedPearlTxIds(excludeReceiptId?: string | null): Set<string> {
  const out = new Set<string>();
  for (const r of listAllReceipts()) {
    if (excludeReceiptId && r.id === excludeReceiptId) continue;
    if (r.pearlTxId) out.add(r.pearlTxId.toLowerCase());
  }
  return out;
}
