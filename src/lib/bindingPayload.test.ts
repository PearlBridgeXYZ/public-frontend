// Run with: node --test src/lib/bindingPayload.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildBindingPayload, pickBindingTicker } from "./bindingPayload.ts";

const ARGS = {
  ethAddress: "0x1111111111111111111111111111111111111111",
  pearlAddress: "prl1pexample",
  intermediaryAddress: "0x2222222222222222222222222222222222222222",
  chainId: 1,
  nonce: "test-nonce-1234567890",
  issuedAt: 1_700_000_000_000,
  bindingTtlMs: 2_592_000_000,
};

// Golden text: must equal relay/src/api/intermediary.ts bindingPayload().
const golden = (ticker: string) =>
  [
    "PearlBridge intermediary unwrap binding",
    "",
    "By signing this, I authorize the PearlBridge intermediary hot wallet",
    `to credit ANY ${ticker} sent from the ETH address below to the Pearl`,
    "address below. This binding does NOT obligate me to send anything,",
    "and can be replaced at any time by signing a new binding.",
    "",
    "Chain ID: 1",
    "Intermediary hot wallet: 0x2222222222222222222222222222222222222222",
    "From ETH address: 0x1111111111111111111111111111111111111111",
    "To Pearl address: prl1pexample",
    "Nonce: test-nonce-1234567890",
    "Issued at: 2023-11-14T22:13:20.000Z",
    "Binding TTL (ms): 2592000000",
  ].join("\n");

test("default text is the original WPRL wording, byte for byte", () => {
  assert.equal(buildBindingPayload(ARGS), golden("WPRL"));
  assert.equal(buildBindingPayload({ ...ARGS, ticker: "WPRL" }), golden("WPRL"));
});

test("WPEARL wording differs only in the ticker", () => {
  assert.equal(buildBindingPayload({ ...ARGS, ticker: "WPEARL" }), golden("WPEARL"));
});

test("WPEARL is used only when the relay advertises it", () => {
  assert.equal(pickBindingTicker(["WPRL", "WPEARL"]), "WPEARL");
  assert.equal(pickBindingTicker(["WPRL"]), "WPRL");
  assert.equal(pickBindingTicker(undefined), "WPRL");
  assert.equal(pickBindingTicker("WPEARL"), "WPRL");
  assert.equal(pickBindingTicker(null), "WPRL");
});
