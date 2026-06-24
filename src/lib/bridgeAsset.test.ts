// Run with: node --test src/lib/bridgeAsset.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectInitialAsset, assetToPath } from "./bridgeAsset.ts";

test("defaults to pearl", () => {
  assert.equal(detectInitialAsset("/", ""), "pearl");
  assert.equal(detectInitialAsset("/history", ""), "pearl");
  assert.equal(detectInitialAsset("", ""), "pearl");
});

test("/btx path selects btx (case-insensitive)", () => {
  assert.equal(detectInitialAsset("/btx", ""), "btx");
  assert.equal(detectInitialAsset("/BTX", ""), "btx");
  assert.equal(detectInitialAsset("/Btx/", ""), "btx");
});

test("?btx / ?BTX query selects btx", () => {
  assert.equal(detectInitialAsset("/", "?btx"), "btx");
  assert.equal(detectInitialAsset("/", "?BTX"), "btx");
  assert.equal(detectInitialAsset("/", "?ref=x&BTX"), "btx");
});

test("unrelated path/query stays pearl", () => {
  assert.equal(detectInitialAsset("/", "?ref=abc"), "pearl");
  assert.equal(detectInitialAsset("/bridge/123", ""), "pearl");
});

test("assetToPath maps correctly", () => {
  assert.equal(assetToPath("btx"), "/btx");
  assert.equal(assetToPath("pearl"), "/");
});
