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

// Sepolia testnet deployment — parameterized Timelock ceremony (TOKEN_CONTRACT=WBTX),
// 2026-06-26: btx1 burn validation + "BTXBridge" EIP-712 domain + 21M WBTX cap.
// Supersedes the 2026-06-24 (deploy-btx.ts) and 2026-06-25 timelock-rehearsal deploys.
export const BTX = {
  wrappedSymbol: "WBTX",
  nativeSymbol: "BTX",
  decimals: 8, // BTX uses 8 decimals (grains), like PRL
  chainId: sepolia.id, // 11155111
  chainLabel: "Sepolia Testnet",
  wbtxAddress: "0x6fb27979cD0673805DC14934ba1a90E70DFcf0C4" as `0x${string}`,
  bridgeController: "0x31CC7F7Ec1b7E29f409dEDa3EF9d8A67e816428B" as `0x${string}`,
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

// Economic floor — mirror of relay/src/btx/config BTX_DUST_GRAINS. Below
// fee + dust the relay refuses to mint (would deliver ≤ dust net), so the UI
// must NOT show a positive "you receive" for such amounts.
export const BTX_DUST_GRAINS = 1000n;

/** Fee + net the depositor receives; belowFloor=true means it will NOT bridge. */
export function btxNetReceive(amountGrains: bigint): { fee: bigint; net: bigint; belowFloor: boolean } {
  const fee = btxBridgeFee(amountGrains);
  if (amountGrains < fee + BTX_DUST_GRAINS) return { fee, net: 0n, belowFloor: true };
  return { fee, net: amountGrains - fee, belowFloor: false };
}

/** Client-side btx1 bech32m shape check — defense-in-depth on relay responses. */
export const isBtxAddress = (a: string): boolean => /^btx1[02-9ac-hj-np-z]{20,90}$/.test(a);

export const btxSepoliaTxUrl = (h: string) =>
  /^0x[0-9a-fA-F]{64}$/.test(h) ? `https://sepolia.etherscan.io/tx/${h}` : null;
export const btxSepoliaAddrUrl = (a: string) => `https://sepolia.etherscan.io/address/${a}`;
