// Run with: node --test src/lib/historyState.test.ts
//
// Node 22 strips TS types natively (no tsx / vitest needed). Guards the
// /history badge tone mapping — in particular the RC5.47 fix that finalized
// (the relay's real terminal-success state) renders as success, not pending.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { historyStateTone, historyToneClasses } from "./historyState.ts";

describe("historyStateTone", () => {
  test("finalized is success — the bug that showed paid bridges as not-done", () => {
    assert.equal(historyStateTone("finalized"), "success");
  });

  test("all terminal-success states map to success", () => {
    for (const s of ["finalized", "completed", "minted", "unlocked", "FINALIZED", " finalized "]) {
      assert.equal(historyStateTone(s), "success", `state=${s}`);
    }
  });

  test("terminal failures map to failure", () => {
    for (const s of ["failed", "rejected", "cancelled"]) {
      assert.equal(historyStateTone(s), "failure", `state=${s}`);
    }
  });

  test("queued is its own slow-lane tone, not pending", () => {
    assert.equal(historyStateTone("queued"), "queued");
  });

  test("pending / attesting / unknown fall back to pending", () => {
    for (const s of ["pending", "attesting", "under_review", "", "future-state"]) {
      assert.equal(historyStateTone(s), "pending", `state=${s}`);
    }
  });
});

describe("historyToneClasses", () => {
  test("every tone yields non-empty classes; success is emerald, failure is red", () => {
    for (const t of ["success", "failure", "queued", "pending"] as const) {
      assert.ok(historyToneClasses(t).length > 0);
    }
    assert.match(historyToneClasses("success"), /emerald/);
    assert.match(historyToneClasses("failure"), /red/);
    assert.match(historyToneClasses("queued"), /sky/);
  });
});
