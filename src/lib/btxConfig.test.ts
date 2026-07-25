// Run with: node --test src/lib/btxConfig.test.ts
//
// Node 22 strips TS types natively (no tsx / ts-node / vitest needed); the
// existing utils.test.ts / burnTracker.test.ts use the same convention.
//
// Covers the BTX burn-side helpers that the BtxBurnWidget depends on:
//   - parseBtxToGrains: string-decimal → 8-dec grains with NO float arithmetic
//   - isBtxBech32mValid: full bech32m checksum decode (not just a shape regex)
//   - btxBurnFee / btxBurnNetReceive: fee + "you receive" preview + dust floor

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  parseBtxToGrains,
  btxGrainsToDisplay,
  isBtxBech32mValid,
  btxBurnFee,
  btxBurnNetReceive,
  BTX_DUST_GRAINS,
  BTX_BURN_FEE_BPS_DEFAULT,
  BTX,
} from "./btxConfig.ts";

const GRAINS = 100_000_000n; // 1 BTX

describe("parseBtxToGrains", () => {
  test("whole number → grains", () => {
    assert.equal(parseBtxToGrains("1"), GRAINS);
    assert.equal(parseBtxToGrains("250"), 250n * GRAINS);
  });

  test("fractional → grains, no float drift", () => {
    assert.equal(parseBtxToGrains("1.5"), 150_000_000n);
    assert.equal(parseBtxToGrains("0.00000001"), 1n); // 1 grain
    // The float path (Math.round(Number(x)*1e8)) mangles this; bigint must not.
    assert.equal(parseBtxToGrains("21000000.12345678"), 21_000_000n * GRAINS + 12_345_678n);
  });

  test("leading-dot and trailing-dot forms", () => {
    assert.equal(parseBtxToGrains(".5"), 50_000_000n);
    assert.equal(parseBtxToGrains("5."), 5n * GRAINS);
  });

  test("truncates beyond 8 fractional digits (does not round)", () => {
    assert.equal(parseBtxToGrains("1.123456789"), 112_345_678n);
  });

  test("trims surrounding whitespace", () => {
    assert.equal(parseBtxToGrains("  2.5  "), 250_000_000n);
  });

  test("invalid / empty / non-decimal → null", () => {
    assert.equal(parseBtxToGrains(""), null);
    assert.equal(parseBtxToGrains("   "), null);
    assert.equal(parseBtxToGrains("."), null);
    assert.equal(parseBtxToGrains("abc"), null);
    assert.equal(parseBtxToGrains("1.2.3"), null);
    assert.equal(parseBtxToGrains("-1"), null); // sign rejected
    assert.equal(parseBtxToGrains("1e8"), null); // exponent rejected
  });

  test("zero parses to 0 grains (caller blocks ≤ 0)", () => {
    assert.equal(parseBtxToGrains("0"), 0n);
    assert.equal(parseBtxToGrains("0.0"), 0n);
  });

  test("round-trips through btxGrainsToDisplay", () => {
    // Each pair is (input, canonical display). btxGrainsToDisplay trims trailing
    // fractional zeros but never digits of the whole part.
    const cases: Array<[string, string]> = [
      ["1", "1"],
      ["1.5", "1.5"],
      ["0.00000001", "0.00000001"],
      ["250", "250"],
      ["1.12345678", "1.12345678"],
      ["2.50", "2.5"],
    ];
    for (const [input, display] of cases) {
      assert.equal(btxGrainsToDisplay(parseBtxToGrains(input)!), display);
    }
  });
});

describe("isBtxBech32mValid", () => {
  // The configured federation lock is a real, well-formed btx1 bech32m address.
  const goodBtx = BTX.lockAddress;

  test("accepts a valid btx1 bech32m address", () => {
    assert.equal(isBtxBech32mValid(goodBtx), true);
  });

  test("rejects prl1… (wrong HRP — controller rejects these too)", () => {
    assert.equal(
      isBtxBech32mValid("prl1p5f450a5540efskxv050tgscelscuztut6zfaqssq8vnlnw53wvdsmw4yvs"),
      false,
    );
  });

  test("rejects a checksum-tampered address", () => {
    const last = goodBtx.slice(-1);
    const tampered = goodBtx.slice(0, -1) + (last === "n" ? "m" : "n");
    assert.equal(isBtxBech32mValid(tampered), false);
  });

  test("rejects mixed case", () => {
    const mixed = goodBtx.slice(0, 6).toUpperCase() + goodBtx.slice(6);
    assert.equal(isBtxBech32mValid(mixed), false);
  });

  test("rejects empty / garbage / too-short", () => {
    assert.equal(isBtxBech32mValid(""), false);
    assert.equal(isBtxBech32mValid("btx1"), false);
    assert.equal(isBtxBech32mValid("not an address"), false);
    assert.equal(isBtxBech32mValid("0x1234"), false);
  });

  test("rejects a bech32 (non-m) HRP-correct string", () => {
    // bc1q… style witness-v0 uses plain bech32, not bech32m — must fail the
    // bech32m checksum.
    assert.equal(isBtxBech32mValid("btx1qw508d6qejxtdg4y5r3zarvary0c5xw7k"), false);
  });
});

describe("btxBurnFee / btxBurnNetReceive (fee + you-receive preview)", () => {
  test("default 50 bps fee on a clean amount", () => {
    // 100 BTX @ 50 bps = 0.5 BTX fee, 99.5 net.
    const gross = 100n * GRAINS;
    assert.equal(btxBurnFee(gross), 50_000_000n);
    const { fee, net, belowFloor } = btxBurnNetReceive(gross);
    assert.equal(fee, 50_000_000n);
    assert.equal(net, gross - 50_000_000n);
    assert.equal(belowFloor, false);
  });

  test("honors a live fee bps override from the contract", () => {
    const gross = 100n * GRAINS;
    // 25 bps instead of the default 50.
    assert.equal(btxBurnFee(gross, 25n), 25_000_000n);
    assert.equal(btxBurnNetReceive(gross, 25n).net, gross - 25_000_000n);
  });

  test("default constant is 50 bps", () => {
    assert.equal(BTX_BURN_FEE_BPS_DEFAULT, 50n);
  });

  test("dust-floor: net ≤ dust ⇒ belowFloor, net forced to 0", () => {
    // An amount whose net after fee lands at/under the dust floor.
    const tiny = BTX_DUST_GRAINS; // 1000 grains gross
    const r = btxBurnNetReceive(tiny);
    assert.equal(r.belowFloor, true);
    assert.equal(r.net, 0n);
  });

  test("just above the dust floor bridges", () => {
    // Choose gross so that gross - fee ≥ dust. fee here = max small percent.
    const gross = 10n * GRAINS; // 10 BTX, fee = 0.05 BTX, net = 9.95 BTX » dust
    const r = btxBurnNetReceive(gross);
    assert.equal(r.belowFloor, false);
    assert.equal(r.net, gross - r.fee);
    assert.ok(r.net >= BTX_DUST_GRAINS);
  });

  test("gross == fee ⇒ belowFloor (no negative net)", () => {
    // Construct gross where fee consumes all of it isn't possible at 50bps for
    // positive gross, but gross just over fee+dust is the boundary; verify a
    // sub-floor amount is blocked rather than producing a bogus positive net.
    const sub = BTX_DUST_GRAINS + 1n;
    const r = btxBurnNetReceive(sub);
    assert.equal(r.belowFloor, true);
    assert.equal(r.net, 0n);
  });
});
