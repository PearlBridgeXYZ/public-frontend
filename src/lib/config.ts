// NETWORK lives in contracts.ts (single source of truth for chain selection).
// Re-exported here so existing `import { NETWORK } from "../lib/config"` sites
// keep working — they're effectively pulling from contracts.ts.
import { NETWORK } from "./contracts";
export { NETWORK };

// 50 basis points = 0.5% on PRL → WPRL deposits.
export const MINT_FEE_BPS = Number(import.meta.env.VITE_MINT_FEE_BPS ?? "50");
// 0 basis points on WPRL → PRL redemptions (RC3 mainnet 2026-05-18 —
// matches on-chain `burnFeeBps` on the new BridgeController).
export const BURN_FEE_BPS = Number(import.meta.env.VITE_BURN_FEE_BPS ?? "0");

// 4 PRL minimum bridge fee, in grains (1 PRL = 10^8 grains). Applied as
// max(percentFee, floor). RC5.6 restored this display floor AND wired the
// relay to enforce it on-chain — the relay scales down the attested gross
// so the contract's bps math reproduces the displayed net (the
// difference stays as PRL in the lock wallet → over-collateralisation).
// Below ~800 PRL deposits 0.5% < 4 PRL, so the floor dominates; at 800
// PRL the two cross over and the % rate takes back over seamlessly.
export const MIN_BRIDGE_FEE_GRAINS = BigInt(
  import.meta.env.VITE_MIN_BRIDGE_FEE_GRAINS ?? "400000000", // 4 PRL × 10^8 grains
);

// PEARL_LOCK_ADDRESS lives in `CONTRACTS.PEARL_LOCK_ADDRESS` (contracts.ts).
// Don't add a parallel env-var override here — addresses must come from the
// single ADDRESSES table so DevNet and MainNet builds can never drift.

export const RELAY_API_BASE = import.meta.env.VITE_RELAY_API_BASE ?? "https://api.pearlbridge.xyz";

// Absolute base for the public /v1 API. RELAY_API_BASE compiles to "" on
// mainnet (.env.mainnet sets VITE_RELAY_API_BASE= empty, and ?? doesn't
// catch empty strings) — that's deliberate for the legacy /api/* routes,
// which ride the zone's same-origin /api/* → relay routing and need
// same-origin cookies for SIWE. The /v1/* paths have NO same-origin route
// (a relative fetch gets the SPA's index.html back), and v1 is open-CORS
// by design, so consume it cross-origin like any third party would.
// `||` (not ??) so the empty string falls through to the absolute host.
export const PUBLIC_API_BASE = import.meta.env.VITE_RELAY_API_BASE || "https://api.pearlbridge.xyz";

// Public Pearl block explorer — used for "View on Explorer" links so users can
// independently verify their deposit txid. Confirmation counts come from the
// relay (`/api/pearl-tx/:txid`), not the explorer; the link is informational.
export const PEARL_EXPLORER_BASE = import.meta.env.VITE_PEARL_EXPLORER_BASE ?? "https://explorer.pearlresearch.ai";

// Etherscan / equivalent block explorer for the Ethereum side. Used to link
// the user out to the WPRL mint transaction once the relay has broadcast it.
// DevNet has no explorer (Hardhat localnet) — the field stays empty there
// and the UI hides the link.
export function ethExplorerTxUrl(txHash: string): string | null {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return null;
  if (NETWORK === "mainnet") return `https://etherscan.io/tx/${txHash}`;
  if (NETWORK === "sepolia") return `https://sepolia.etherscan.io/tx/${txHash}`;
  return null;
}
