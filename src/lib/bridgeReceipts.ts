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
  // 9-char base36 (~ 47 bits of entropy) — collision-resistant within a single
  // user's history; not meant to be globally unique.
  const rand = new Uint8Array(8);
  crypto.getRandomValues(rand);
  let n = 0n;
  for (const b of rand) n = (n << 8n) | BigInt(b);
  const s = n.toString(36).slice(0, 9).padStart(9, "0");
  return `r_${s}`;
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
