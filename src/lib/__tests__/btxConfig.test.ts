// Pure-logic tests for src/lib/btxConfig.ts — the BTX confirmation-tier ladder,
// fee constants, and bech32m address validation.
//
// The sibling src/lib/btxConfig.test.ts (a `node:test` file) already covers the
// burn-side helpers (parseBtxToGrains / isBtxBech32mValid / btxBurn*). This
// vitest file adds the deposit-side conf-tier ladder + fee constants + a
// DRIFT-GUARD against the relay's canonical values. The two files run under
// different runners and do not collide (see vitest.config.ts `include`).
import { describe, expect, it } from "vitest";

import {
  BTX_CONF_TIERS,
  BTX_CONF_MAX,
  BTX_GRAINS_PER,
  BTX_FEE_BPS,
  BTX_FEE_MIN_GRAINS,
  BTX_BURN_FEE_BPS_DEFAULT,
  btxConfirmationsRequired,
  btxBridgeFee,
  isBtxBech32mValid,
  BTX,
} from "../btxConfig";

// ── Canonical relay values — SOURCE OF TRUTH: relay/src/btx/config.ts ──────────
// These are hardcoded here (not imported) on purpose: the whole point of the
// drift-guard is to fail loudly if the frontend's copy drifts from the relay's.
// If the relay changes these, update BOTH the relay and this expectation block.
//   T1 = 12 confs (≤ 250 BTX), T2 = 24 confs (≤ 2,500 BTX), T3 = 60 confs (tail)
//   fee = 50 bps, min-fee = 1 BTX
const RELAY_CANONICAL = {
  tiers: [
    { maxBtx: 250n, confs: 12 },
    { maxBtx: 2_500n, confs: 24 },
  ],
  tailConfs: 60,
  feeBps: 50n,
  minFeeBtx: 1n,
} as const;

const GRAINS = BTX_GRAINS_PER; // 1e8

describe("BTX conf-tier ladder (btxConfig.ts)", () => {
  it("is a sane, strictly monotonic ladder in both amount and confs", () => {
    // maxGrains strictly increasing, confs strictly increasing, and the tail
    // (BTX_CONF_MAX) sits strictly above the last explicit tier.
    for (let i = 1; i < BTX_CONF_TIERS.length; i++) {
      expect(BTX_CONF_TIERS[i].maxGrains).toBeGreaterThan(BTX_CONF_TIERS[i - 1].maxGrains);
      expect(BTX_CONF_TIERS[i].confs).toBeGreaterThan(BTX_CONF_TIERS[i - 1].confs);
    }
    const last = BTX_CONF_TIERS[BTX_CONF_TIERS.length - 1];
    expect(BTX_CONF_MAX).toBeGreaterThan(last.confs);
  });

  it("matches the documented 12/24/60 at ≤250 / ≤2500 / tail", () => {
    expect(BTX_CONF_TIERS[0]).toEqual({ maxGrains: 250n * GRAINS, confs: 12 });
    expect(BTX_CONF_TIERS[1]).toEqual({ maxGrains: 2_500n * GRAINS, confs: 24 });
    expect(BTX_CONF_MAX).toBe(60);
  });

  it("btxConfirmationsRequired selects the right tier by amount", () => {
    expect(btxConfirmationsRequired(1n)).toBe(12); // dust → T1
    expect(btxConfirmationsRequired(250n * GRAINS)).toBe(12); // boundary is inclusive
    expect(btxConfirmationsRequired(250n * GRAINS + 1n)).toBe(24); // just over → T2
    expect(btxConfirmationsRequired(2_500n * GRAINS)).toBe(24); // boundary inclusive
    expect(btxConfirmationsRequired(2_500n * GRAINS + 1n)).toBe(60); // tail
    expect(btxConfirmationsRequired(1_000_000n * GRAINS)).toBe(60); // whale → tail
  });
});

describe("BTX fee constants (btxConfig.ts)", () => {
  it("50 bps deposit fee with a 1 BTX minimum floor", () => {
    expect(BTX_FEE_BPS).toBe(50n);
    expect(BTX_FEE_MIN_GRAINS).toBe(1n * GRAINS);
  });

  it("btxBridgeFee = max(amount × bps, 1 BTX)", () => {
    // Small amount → the 1 BTX floor dominates.
    expect(btxBridgeFee(10n * GRAINS)).toBe(1n * GRAINS); // 0.5% of 10 = 0.05 < 1
    // Large amount → the percentage dominates.
    expect(btxBridgeFee(1_000n * GRAINS)).toBe(5n * GRAINS); // 0.5% of 1000 = 5
    // Crossover at 200 BTX (0.5% = 1 BTX): floor still wins at exactly 200.
    expect(btxBridgeFee(200n * GRAINS)).toBe(1n * GRAINS);
    expect(btxBridgeFee(201n * GRAINS)).toBe(100_500_000n); // 0.5% of 201 = 1.005 BTX
  });

  it("default burn fee is 50 bps", () => {
    expect(BTX_BURN_FEE_BPS_DEFAULT).toBe(50n);
  });
});

describe("isBtxBech32mValid (bech32m address validation)", () => {
  it("accepts the configured federation lock (a real btx1 address)", () => {
    expect(isBtxBech32mValid(BTX.lockAddress)).toBe(true);
  });

  it("rejects wrong HRP, mixed case, and garbage", () => {
    expect(isBtxBech32mValid("prl1p5f450a5540efskxv050tgscelscuztut6zfaqssq8vnlnw53wvdsmw4yvs")).toBe(false);
    expect(isBtxBech32mValid(BTX.lockAddress.toUpperCase())).toBe(false);
    expect(isBtxBech32mValid("")).toBe(false);
    expect(isBtxBech32mValid("not-an-address")).toBe(false);
    expect(isBtxBech32mValid("0x1234")).toBe(false);
  });

  it("rejects a checksum-tampered address", () => {
    const last = BTX.lockAddress.slice(-1);
    const tampered = BTX.lockAddress.slice(0, -1) + (last === "n" ? "m" : "n");
    expect(isBtxBech32mValid(tampered)).toBe(false);
  });
});

// ── DRIFT-GUARD ───────────────────────────────────────────────────────────────
// Fails if the frontend's BTX conf-tiers / fees drift from the relay's canonical
// values. SOURCE OF TRUTH: relay/src/btx/config.ts. If this test fails, the
// frontend and relay disagree on money-safety parameters — reconcile, don't just
// bump the expectation.
describe("DRIFT-GUARD: frontend BTX config == relay canonical (relay/src/btx/config.ts)", () => {
  it("conf-tiers match the relay ladder (12/24 at ≤250/≤2500, 60 tail)", () => {
    expect(BTX_CONF_TIERS.length).toBe(RELAY_CANONICAL.tiers.length);
    RELAY_CANONICAL.tiers.forEach((canon, i) => {
      expect(BTX_CONF_TIERS[i].confs).toBe(canon.confs);
      expect(BTX_CONF_TIERS[i].maxGrains).toBe(canon.maxBtx * GRAINS);
    });
    expect(BTX_CONF_MAX).toBe(RELAY_CANONICAL.tailConfs);
  });

  it("fee bps and minimum fee match the relay", () => {
    expect(BTX_FEE_BPS).toBe(RELAY_CANONICAL.feeBps);
    expect(BTX_BURN_FEE_BPS_DEFAULT).toBe(RELAY_CANONICAL.feeBps);
    expect(BTX_FEE_MIN_GRAINS).toBe(RELAY_CANONICAL.minFeeBtx * GRAINS);
  });

  it("grains-per-BTX is 1e8 (8-decimal, matches relay grain semantics)", () => {
    expect(BTX_GRAINS_PER).toBe(100_000_000n);
  });
});
