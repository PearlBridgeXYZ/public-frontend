// BTX bridge — frontend config (single source of truth for the BTX widget).
//
// PearlBridge (PRL) runs on Ethereum MAINNET; BTX is a SECOND, isolated bridge
// whose wrapped token (WBTX) is currently on Ethereum SEPOLIA (testnet preview,
// 2026-06-24 deploy). The site is a mainnet build, so the BTX widget is the one
// place that deliberately targets Sepolia — kept fully separate from the Pearl
// path so the live mainnet flow is never affected.
//
// Deposit binding is DERIVED-ADDRESS, never OP_RETURN (G directive 2026-06-24):
// the relay hands each recipient a unique btx1 deposit address; the user just
// sends BTX there. Mainnet WBTX is gated to G's explicit go — when it ships,
// add a `mainnet` block here and switch BTX_NETWORK exactly like the Pearl side.

import { sepolia } from "wagmi/chains";

export const BTX_NETWORK = "sepolia" as const;

// Sepolia testnet deployment (contracts/scripts/deploy-btx.ts, 2026-06-24).
export const BTX = {
  wrappedSymbol: "WBTX",
  nativeSymbol: "BTX",
  decimals: 8, // BTX uses 8 decimals (grains), like PRL
  chainId: sepolia.id, // 11155111
  chainLabel: "Sepolia Testnet",
  wbtxAddress: "0x5eb454555AF2F7383958e9fc47624984D3f80016" as `0x${string}`,
  bridgeController: "0x09398a38e7f1fc4391b763bf03dEcE5dF47933bC" as `0x${string}`,
  // Federation lock address (custody) — shown for transparency. Users do NOT
  // send here; each gets their own derived deposit address from the relay.
  lockAddress: "btx1zz0xqu4y5keq8cuzrazdsagacfnyv7mclf3azqvktglp200k94sxsuk7kdn",
} as const;

// BTX relay API base (its own isolated instance — NOT the Pearl api.pearlbridge.xyz).
// Empty until the BTX relay stands up on-box; the widget degrades gracefully to a
// "not live yet" state rather than erroring. Set VITE_BTX_API_BASE at that point.
export const BTX_API_BASE = (import.meta.env.VITE_BTX_API_BASE ?? "").replace(/\/$/, "");

// Fee: 1 BTX minimum + 0.5% (G directive 2026-06-24). grains = 1e8 per BTX.
export const BTX_GRAINS_PER = 100_000_000n;
export const BTX_FEE_BPS = 50n;
export const BTX_FEE_MIN_GRAINS = BTX_GRAINS_PER; // 1 BTX

// Size-scaled confirmation tiers — mirror of relay/src/btx/config.ts
// (51% analysis: BTX shows organic depth-3/4 reorgs, so the floor sits well
// above 4 with margin). ~95 s/block.
export const BTX_CONF_TIERS: ReadonlyArray<{ maxGrains: bigint; confs: number }> = [
  { maxGrains: 250n * BTX_GRAINS_PER, confs: 12 }, // ≤   250 BTX (~19 min)
  { maxGrains: 2_500n * BTX_GRAINS_PER, confs: 24 }, // ≤ 2,500 BTX (~38 min)
];
export const BTX_CONF_MAX = 60; // larger (~95 min)
const BTX_BLOCK_SECONDS = 95;

export function btxConfirmationsRequired(amountGrains: bigint): number {
  for (const t of BTX_CONF_TIERS) if (amountGrains <= t.maxGrains) return t.confs;
  return BTX_CONF_MAX;
}

export function btxWaitLabel(confs: number): string {
  const min = Math.round((confs * BTX_BLOCK_SECONDS) / 60);
  return min < 60 ? `~${min} min` : `~${(min / 60).toFixed(1)} h`;
}

// max(amount × bps, 1 BTX) — display fee for a prospective deposit.
export function btxBridgeFee(amountGrains: bigint): bigint {
  const pct = (amountGrains * BTX_FEE_BPS) / 10_000n;
  return pct > BTX_FEE_MIN_GRAINS ? pct : BTX_FEE_MIN_GRAINS;
}

export const btxSepoliaTxUrl = (h: string) =>
  /^0x[0-9a-fA-F]{64}$/.test(h) ? `https://sepolia.etherscan.io/tx/${h}` : null;
export const btxSepoliaAddrUrl = (a: string) => `https://sepolia.etherscan.io/address/${a}`;
