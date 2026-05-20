// Run with: node --test src/lib/burnTracker.test.ts
//
// Node 22 strips TS types natively (no tsx / ts-node / vitest needed) so
// this file is the canonical test surface for the burn-tracker persistence
// + state-mapping logic that drives the WPRL → PRL confirmation UX.

import { test, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";

import {
  saveBurn,
  loadBurn,
  clearBurn,
  mapBurnState,
  isTerminalUiState,
  BURN_POLL_TIMEOUT_MS,
  type PendingBurn,
} from "./burnTracker.ts";

// Minimal in-memory Storage shim that satisfies the subset of the
// `Storage` interface the module uses.
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
  clear(): void {
    this.data.clear();
  }
  key(_i: number): string | null {
    return null;
  }
  get length(): number {
    return this.data.size;
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage =
    new MemoryStorage() as unknown as Storage;
});

const ETH_ADDR = "0x88060a8f4D88e66346Fd479AE84DA1BdF03eF68f" as const;
const ETH_TX = "0xabc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abc" as const;
const PEARL_ADDR = "prl1pdummy7y0test4dest3address0xxxxxxxxxxxxxxxxxxx";

describe("burnTracker — persistence", () => {
  test("saveBurn + loadBurn roundtrip preserves the row", () => {
    saveBurn({
      ethTxHash: ETH_TX,
      ethAddress: ETH_ADDR,
      pearlAddress: PEARL_ADDR,
      grossGrains: 5_000_000_000n,
      netGrains: 5_000_000_000n,
      feeGrains: 0n,
      submittedAt: 1_700_000_000_000,
    });

    const loaded = loadBurn(ETH_ADDR);
    assert.ok(loaded, "loadBurn should return a row");
    assert.equal(loaded.ethTxHash, ETH_TX);
    assert.equal(loaded.ethAddress, ETH_ADDR);
    assert.equal(loaded.pearlAddress, PEARL_ADDR);
    assert.equal(loaded.grossGrains, "5000000000");
    assert.equal(loaded.netGrains, "5000000000");
    assert.equal(loaded.feeGrains, "0");
    assert.equal(loaded.submittedAt, 1_700_000_000_000);
  });

  test("loadBurn returns null when no entry exists", () => {
    assert.equal(loadBurn(ETH_ADDR), null);
  });

  test("loadBurn returns null for undefined / empty address", () => {
    assert.equal(loadBurn(undefined), null);
    assert.equal(loadBurn(null), null);
    assert.equal(loadBurn(""), null);
  });

  test("loadBurn is case-insensitive on the eth address key", () => {
    saveBurn({
      ethTxHash: ETH_TX,
      ethAddress: ETH_ADDR,
      pearlAddress: PEARL_ADDR,
      grossGrains: 1n,
      netGrains: 1n,
      feeGrains: 0n,
    });
    const upper = ETH_ADDR.toUpperCase();
    const lower = ETH_ADDR.toLowerCase();
    assert.ok(loadBurn(upper), "upper-case address should hit the same row");
    assert.ok(loadBurn(lower), "lower-case address should hit the same row");
  });

  test("clearBurn removes the entry", () => {
    saveBurn({
      ethTxHash: ETH_TX,
      ethAddress: ETH_ADDR,
      pearlAddress: PEARL_ADDR,
      grossGrains: 1n,
      netGrains: 1n,
      feeGrains: 0n,
    });
    assert.ok(loadBurn(ETH_ADDR));
    clearBurn(ETH_ADDR);
    assert.equal(loadBurn(ETH_ADDR), null);
  });

  test("loadBurn drops malformed JSON and clears the slot", () => {
    (globalThis as unknown as { localStorage: Storage }).localStorage.setItem(
      `pearlbridge:pendingBurn:${ETH_ADDR.toLowerCase()}`,
      "not a json blob",
    );
    assert.equal(loadBurn(ETH_ADDR), null);
    // Subsequent reads should not re-attempt to parse the same bad row.
    assert.equal(loadBurn(ETH_ADDR), null);
  });

  test("loadBurn drops rows from an older schema version", () => {
    const bogus = {
      version: 0,
      ethTxHash: ETH_TX,
      ethAddress: ETH_ADDR,
      pearlAddress: PEARL_ADDR,
      grossGrains: "1",
      netGrains: "1",
      feeGrains: "0",
      submittedAt: 1,
    } satisfies Omit<PendingBurn, "version"> & { version: number };
    (globalThis as unknown as { localStorage: Storage }).localStorage.setItem(
      `pearlbridge:pendingBurn:${ETH_ADDR.toLowerCase()}`,
      JSON.stringify(bogus),
    );
    assert.equal(loadBurn(ETH_ADDR), null);
  });

  test("each eth address has an isolated slot", () => {
    const otherAddr = "0x1111111111111111111111111111111111111111";
    saveBurn({
      ethTxHash: ETH_TX,
      ethAddress: ETH_ADDR,
      pearlAddress: PEARL_ADDR,
      grossGrains: 5n,
      netGrains: 5n,
      feeGrains: 0n,
    });
    saveBurn({
      ethTxHash: "0xdef" + "0".repeat(61) as `0x${string}`,
      ethAddress: otherAddr as `0x${string}`,
      pearlAddress: "prl1other",
      grossGrains: 10n,
      netGrains: 10n,
      feeGrains: 0n,
    });
    assert.equal(loadBurn(ETH_ADDR)!.grossGrains, "5");
    assert.equal(loadBurn(otherAddr)!.grossGrains, "10");
    clearBurn(ETH_ADDR);
    // Clearing one address must not touch the other.
    assert.equal(loadBurn(otherAddr)!.grossGrains, "10");
  });

  test("saveBurn defaults submittedAt to now when omitted", () => {
    const before = Date.now();
    saveBurn({
      ethTxHash: ETH_TX,
      ethAddress: ETH_ADDR,
      pearlAddress: PEARL_ADDR,
      grossGrains: 1n,
      netGrains: 1n,
      feeGrains: 0n,
    });
    const after = Date.now();
    const loaded = loadBurn(ETH_ADDR);
    assert.ok(loaded);
    assert.ok(loaded.submittedAt >= before && loaded.submittedAt <= after);
  });
});

describe("burnTracker — state mapping", () => {
  test("finalized / complete / unlocked all map to complete", () => {
    assert.equal(mapBurnState("finalized"), "complete");
    assert.equal(mapBurnState("complete"), "complete");
    assert.equal(mapBurnState("unlocked"), "complete");
  });

  test("submitted maps to broadcast (was previously hidden as pending)", () => {
    // This is the audit-flagged regression: relay sets `submitted` as soon
    // as it broadcasts the Pearl tx, but the old FE mapping collapsed it
    // to "pending" so the user never saw the "broadcast" milestone.
    assert.equal(mapBurnState("submitted"), "broadcast");
  });

  test("signing maps to processing", () => {
    assert.equal(mapBurnState("signing"), "processing");
  });

  test("failed maps to failed", () => {
    assert.equal(mapBurnState("failed"), "failed");
  });

  test("reorged maps to reorged (was previously hidden as pending)", () => {
    // Reorg invalidations leave the burn permanently dead-lettered — the
    // user MUST see a distinct surface so they know to contact ops.
    assert.equal(mapBurnState("reorged"), "reorged");
  });

  test("pending / null / undefined / unknown all map to pending", () => {
    assert.equal(mapBurnState("pending"), "pending");
    assert.equal(mapBurnState(null), "pending");
    assert.equal(mapBurnState(undefined), "pending");
    assert.equal(mapBurnState(""), "pending");
    assert.equal(mapBurnState("some-future-state-we-dont-know"), "pending");
  });

  test("isTerminalUiState is true only for complete / failed / reorged", () => {
    assert.equal(isTerminalUiState("complete"), true);
    assert.equal(isTerminalUiState("failed"), true);
    assert.equal(isTerminalUiState("reorged"), true);
    assert.equal(isTerminalUiState("pending"), false);
    assert.equal(isTerminalUiState("processing"), false);
    assert.equal(isTerminalUiState("broadcast"), false);
  });
});

describe("burnTracker — constants", () => {
  test("BURN_POLL_TIMEOUT_MS comfortably exceeds the relay's 30-min wait", () => {
    // The relay's waitPearlConfirmation tops out at 30 min. Our poll
    // timeout needs to safely exceed that so we don't give up on a burn
    // that's still legitimately in flight (e.g. relay restart + redrain).
    const THIRTY_MIN = 30 * 60 * 1000;
    assert.ok(BURN_POLL_TIMEOUT_MS > THIRTY_MIN * 4);
  });
});
