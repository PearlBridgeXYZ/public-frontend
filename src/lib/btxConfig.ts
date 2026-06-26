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
import { bech32m } from "bech32";

export const BTX_NETWORK = "sepolia" as const;

// Human-readable part for native BTX bech32m addresses (btx1…).
export const BTX_HRP = "btx";

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
// `import.meta.env?.` (not `.env.`) so this module also loads under bare Node
// (node --test), where Vite's `import.meta.env` injection is absent. Under Vite
// the optional chain is a no-op — behavior is identical in the app.
export const BTX_API_BASE = (import.meta.env?.VITE_BTX_API_BASE ?? "").replace(/\/$/, "");

// Fee: 1 BTX minimum + 0.5% (G directive 2026-06-24). grains = 1e8 per BTX.
export const BTX_GRAINS_PER = 100_000_000n;
export const BTX_FEE_BPS = 50n;
export const BTX_FEE_MIN_GRAINS = BTX_GRAINS_PER; // 1 BTX

// Burn side (WBTX → native BTX redemption). The on-chain BridgeController is the
// fee authority (50 bps, `burnFeeBps()`); the UI reads it live and falls back to
// this default. There is NO percent-floor on burns the way deposits have the 1 BTX
// minimum — the only economic guard is the dust floor below (a net delivery ≤ dust
// is refused). Mirrors relay/src/btx semantics.
export const BTX_BURN_FEE_BPS_DEFAULT = 50n;

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

// ── Burn side: WBTX → native BTX redemption ──────────────────────────────────
//
// The BridgeController.requestBurn(uint256 amount, string pearlAddress) call
// charges `burnFeeBps` on the gross. The contract is the authority — the widget
// reads `burnFeeBps()` live and passes it here; this fallback keeps the preview
// honest before the read lands. Unlike the deposit side there's no 1 BTX percent
// floor on the fee, only the dust floor on the NET delivered.

/** Burn fee for a gross WBTX amount at the given bps (no percent floor on burns). */
export function btxBurnFee(grossGrains: bigint, feeBps: bigint = BTX_BURN_FEE_BPS_DEFAULT): bigint {
  return (grossGrains * feeBps) / 10_000n;
}

/**
 * Fee + net native BTX the burner receives. belowFloor=true means the net after
 * fee would be ≤ dust, so the relay won't release — the UI must NOT show a
 * positive "you receive" and must block submit.
 */
export function btxBurnNetReceive(
  grossGrains: bigint,
  feeBps: bigint = BTX_BURN_FEE_BPS_DEFAULT,
): { fee: bigint; net: bigint; belowFloor: boolean } {
  const fee = btxBurnFee(grossGrains, feeBps);
  if (grossGrains <= fee || grossGrains - fee < BTX_DUST_GRAINS) {
    return { fee, net: 0n, belowFloor: true };
  }
  return { fee, net: grossGrains - fee, belowFloor: false };
}

/**
 * Parse a user-typed decimal BTX amount → 8-decimal grains (bigint), with NO
 * float/Number arithmetic (avoids the 1e8 rounding bug the deposit preview has).
 * Mirrors utils.parseToGrains. Returns null for empty/invalid/negative input or
 * more than 8 fractional digits' worth of significant precision (excess is
 * truncated, not rounded, matching on-chain grain semantics).
 */
export function parseBtxToGrains(input: string): bigint | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Reject anything that isn't a plain non-negative decimal (no sign, no exp).
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === ".") return null;
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = frac.slice(0, 8).padEnd(8, "0");
  try {
    const grains = BigInt(whole || "0") * BTX_GRAINS_PER + BigInt(fracPadded);
    return grains;
  } catch {
    return null;
  }
}

/** Grains → trimmed decimal BTX string (e.g. 150_000_000n → "1.5"). */
export function btxGrainsToDisplay(grains: bigint): string {
  const whole = grains / BTX_GRAINS_PER;
  const frac = (grains % BTX_GRAINS_PER).toString().padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/**
 * Strict btx1 bech32m validation — full checksum decode (BIP-350), not just a
 * shape regex. Enforces:
 *   - HRP === "btx"
 *   - all-lowercase (bech32 forbids mixed case; we don't accept all-upper for an
 *     address the user will paste into a wallet)
 *   - valid bech32m checksum
 *   - a witness-version-shaped payload (first data word ≤ 16) — the federation
 *     lock + derived deposit addrs are SegWit/Taproot-style btx1 outputs.
 * The controller rejects prl1… destinations; this also rejects them (wrong HRP).
 */
export function isBtxBech32mValid(addr: string): boolean {
  if (!addr) return false;
  // Mixed case is invalid per spec; for a destination address we require lower.
  if (addr !== addr.toLowerCase()) return false;
  if (addr.length < 14 || addr.length > 90) return false;
  let decoded: { prefix: string; words: number[] };
  try {
    decoded = bech32m.decode(addr, 90);
  } catch {
    return false;
  }
  if (decoded.prefix !== BTX_HRP) return false;
  if (decoded.words.length === 0) return false;
  const witver = decoded.words[0];
  if (witver > 16) return false;
  return true;
}

/** Client-side btx1 bech32m shape check — defense-in-depth on relay responses. */
export const isBtxAddress = (a: string): boolean => /^btx1[02-9ac-hj-np-z]{20,90}$/.test(a);

export const btxSepoliaTxUrl = (h: string) =>
  /^0x[0-9a-fA-F]{64}$/.test(h) ? `https://sepolia.etherscan.io/tx/${h}` : null;
export const btxSepoliaAddrUrl = (a: string) => `https://sepolia.etherscan.io/address/${a}`;

// ── ABIs (BTX-isolated; deliberately NOT shared with the Pearl contracts.ts) ──
// WBTX is a standard 8-decimal burnable ERC-20 wrapper. `bridgeController()` is
// the immutable-in-spirit controller binding used for the on-chain integrity
// check. Direct burn() is blocked on-chain — redemption goes through the BC's
// requestBurn(uint256, string).
export const WBTX_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    // WBTX exposes the controller binding as `bridgeController` (address public).
    name: "bridgeController",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

// BridgeController (BTX deployment — same parameterized contract as the Pearl
// side, so the token getter is named `wpearl`). We only need the burn entry
// point, the live fee, the paused flag, and the token getter for integrity.
export const BTX_BRIDGE_CONTROLLER_ABI = [
  {
    name: "requestBurn",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "grossAmount", type: "uint256" },
      { name: "pearlAddress", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "burnFeeBps",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }],
  },
  {
    name: "paused",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    // Token getter on the parameterized controller is `wpearl` even in the BTX
    // deployment (TOKEN_CONTRACT=WBTX wired at init). Used for the integrity check.
    name: "wpearl",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "burnWindowRemaining",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;
