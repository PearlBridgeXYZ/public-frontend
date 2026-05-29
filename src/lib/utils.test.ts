// Run with: node --test src/lib/utils.test.ts
//
// Node 22 strips TS types natively (no tsx / ts-node / vitest needed); the
// existing burnTracker.test.ts uses the same convention.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  computeFee,
  hoursUntilEpochReset,
  grainsToDisplay,
  secondsUntilNextMidnightUtc,
  formatHmsCountdown,
} from "./utils.ts";

describe("hoursUntilEpochReset", () => {
  const DAY = 86_400;

  test("midnight UTC: full 24h until next reset", () => {
    // 2026-05-24 00:00:00 UTC exactly.
    const t = Date.UTC(2026, 4, 24, 0, 0, 0) / 1000;
    assert.equal(hoursUntilEpochReset(t, DAY), 24);
  });

  test("one second past midnight: just under 24h", () => {
    const t = Date.UTC(2026, 4, 24, 0, 0, 1) / 1000;
    const h = hoursUntilEpochReset(t, DAY);
    assert.ok(h < 24 && h > 23.999, `expected ~23.9997, got ${h}`);
  });

  test("noon UTC: 12h until reset", () => {
    const t = Date.UTC(2026, 4, 24, 12, 0, 0) / 1000;
    assert.equal(hoursUntilEpochReset(t, DAY), 12);
  });

  test("11:30 UTC: 12.5h until reset (matches one-decimal display)", () => {
    const t = Date.UTC(2026, 4, 24, 11, 30, 0) / 1000;
    assert.equal(hoursUntilEpochReset(t, DAY).toFixed(1), "12.5");
  });

  test("23:59:59 UTC: just over 0 hours, rounds to 0.0 at one decimal", () => {
    const t = Date.UTC(2026, 4, 24, 23, 59, 59) / 1000;
    const h = hoursUntilEpochReset(t, DAY);
    assert.ok(h > 0 && h < 0.001, `expected ~0.0003, got ${h}`);
    assert.equal(h.toFixed(1), "0.0");
  });

  test("non-integer seconds work too", () => {
    const t = Date.UTC(2026, 4, 24, 6, 0, 0) / 1000 + 0.5;
    const h = hoursUntilEpochReset(t, DAY);
    assert.ok(h > 17.99 && h < 18, `expected just under 18h, got ${h}`);
  });

  test("zero or negative window returns 0 (defensive)", () => {
    assert.equal(hoursUntilEpochReset(1_000_000, 0), 0);
    assert.equal(hoursUntilEpochReset(1_000_000, -1), 0);
  });

  test("epoch=0 is the only sensible boundary at very early timestamps", () => {
    const t = 1; // 1970-01-01 00:00:01 UTC
    const h = hoursUntilEpochReset(t, DAY);
    // Next boundary is t=86400. (86400 - 1) / 3600 = 23.99972…
    assert.equal(h.toFixed(2), "24.00");
  });
});

// Smoke tests for the other utilities that have never had a dedicated test
// file. These guard against accidental regressions in the lib while we're
// already adding utils.test.ts.
describe("computeFee (smoke)", () => {
  test("percent fee dominates above the floor", () => {
    // 100 PRL @ 50 bps = 0.5 PRL; floor = 0.1 PRL.
    const { fee, net } = computeFee(100_00000000n, 50, 10_000_000n);
    assert.equal(fee, 50_000_000n);
    assert.equal(net, 99_50000000n);
  });

  test("floor wins on tiny amounts", () => {
    // 1 PRL @ 50 bps = 0.005 PRL; floor = 0.1 PRL.
    const { fee, net } = computeFee(1_00000000n, 50, 10_000_000n);
    assert.equal(fee, 10_000_000n);
    assert.equal(net, 90_000_000n);
  });

  test("gross < fee → net = 0", () => {
    const { fee, net } = computeFee(5_000_000n, 50, 10_000_000n);
    assert.equal(fee, 10_000_000n);
    assert.equal(net, 0n);
  });
});

describe("grainsToDisplay (smoke)", () => {
  test("trims trailing zeros", () => {
    assert.equal(grainsToDisplay(100_000_000n), "1");
    assert.equal(grainsToDisplay(150_000_000n), "1.5");
    assert.equal(grainsToDisplay(150_500_000n), "1.505");
  });
});

describe("secondsUntilNextMidnightUtc", () => {
  test("exactly midnight UTC -> full day (86400)", () => {
    const t = Date.UTC(2026, 4, 29, 0, 0, 0); // ms
    assert.equal(secondsUntilNextMidnightUtc(t), 86_400);
  });

  test("one second past midnight -> 86399", () => {
    const t = Date.UTC(2026, 4, 29, 0, 0, 1);
    assert.equal(secondsUntilNextMidnightUtc(t), 86_399);
  });

  test("noon UTC -> 12h = 43200", () => {
    const t = Date.UTC(2026, 4, 29, 12, 0, 0);
    assert.equal(secondsUntilNextMidnightUtc(t), 43_200);
  });

  test("23:59:59 UTC -> 1 second", () => {
    const t = Date.UTC(2026, 4, 29, 23, 59, 59);
    assert.equal(secondsUntilNextMidnightUtc(t), 1);
  });

  test("23:59:59.500 UTC -> floors to 0 seconds (sub-second remainder)", () => {
    const t = Date.UTC(2026, 4, 29, 23, 59, 59) + 500;
    assert.equal(secondsUntilNextMidnightUtc(t), 0);
  });

  test("monotonic decrease across a one-second tick", () => {
    const base = Date.UTC(2026, 4, 29, 6, 0, 0);
    const a = secondsUntilNextMidnightUtc(base);
    const b = secondsUntilNextMidnightUtc(base + 1000);
    assert.equal(a - b, 1);
  });
});

describe("formatHmsCountdown", () => {
  test("zero -> 00:00:00", () => {
    assert.equal(formatHmsCountdown(0), "00:00:00");
  });

  test("one second -> 00:00:01", () => {
    assert.equal(formatHmsCountdown(1), "00:00:01");
  });

  test("one minute -> 00:01:00", () => {
    assert.equal(formatHmsCountdown(60), "00:01:00");
  });

  test("one hour exactly -> 01:00:00", () => {
    assert.equal(formatHmsCountdown(3600), "01:00:00");
  });

  test("23:59:59", () => {
    assert.equal(formatHmsCountdown(86_399), "23:59:59");
  });

  test("24h exactly -> 24:00:00", () => {
    assert.equal(formatHmsCountdown(86_400), "24:00:00");
  });

  test("negative input floors to 00:00:00", () => {
    assert.equal(formatHmsCountdown(-5), "00:00:00");
  });

  test("fractional seconds floor", () => {
    assert.equal(formatHmsCountdown(59.9), "00:00:59");
  });

  test("ridiculous input clamps to cap 99:59:59", () => {
    assert.equal(formatHmsCountdown(10_000_000), "99:59:59");
  });
});
