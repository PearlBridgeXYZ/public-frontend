// Run with: node --test src/lib/bridgeAsset.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectInitialAsset, assetToPath, BTX_TAB_ENABLED } from "./bridgeAsset.ts";

// The BTX tab is behind BTX_TAB_ENABLED (temporarily false — G, 2026-09-10).
// These tests assert BOTH states so the suite stays honest whichever way the
// flag is set, and so re-enabling it is covered the moment someone flips it.

test("defaults to pearl", () => {
  assert.equal(detectInitialAsset("/", ""), "pearl");
  assert.equal(detectInitialAsset("/history", ""), "pearl");
  assert.equal(detectInitialAsset("", ""), "pearl");
});

test("unrelated path/query stays pearl", () => {
  assert.equal(detectInitialAsset("/", "?ref=abc"), "pearl");
  assert.equal(detectInitialAsset("/bridge/123", ""), "pearl");
});

test("BTX routing follows the flag", () => {
  const expected = BTX_TAB_ENABLED ? "btx" : "pearl";
  // /btx path, any case
  assert.equal(detectInitialAsset("/btx", ""), expected);
  assert.equal(detectInitialAsset("/BTX", ""), expected);
  assert.equal(detectInitialAsset("/Btx/", ""), expected);
  // ?btx / ?BTX query flag
  assert.equal(detectInitialAsset("/", "?btx"), expected);
  assert.equal(detectInitialAsset("/", "?BTX"), expected);
  assert.equal(detectInitialAsset("/", "?ref=x&BTX"), expected);
});

test("assetToPath follows the flag", () => {
  assert.equal(assetToPath("pearl"), "/");
  assert.equal(assetToPath("btx"), BTX_TAB_ENABLED ? "/btx" : "/");
});

test("while disabled, no BTX entry point survives", { skip: BTX_TAB_ENABLED }, () => {
  // A stale shared /btx link must not strand a visitor on a hidden section.
  for (const [path, search] of [["/btx", ""], ["/BTX/", ""], ["/", "?btx"], ["/", "?BTX=1"]]) {
    assert.equal(detectInitialAsset(path, search), "pearl", `${path}${search} must fall back`);
  }
  assert.equal(assetToPath("btx"), "/");
});
