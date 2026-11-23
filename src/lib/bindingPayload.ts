// The text a user signs to bind an ETH address to a Pearl payout address for
// the intermediary unwrap. Kept free of imports so it can be unit-tested.

export type BindingTicker = "WPRL" | "WPEARL";

// The relay verifies the signature over the exact text, so the ticker in it
// must be one the relay accepts. A relay that predates the rename sends no
// bindingTickers and only accepts "WPRL".
export function pickBindingTicker(bindingTickers: unknown): BindingTicker {
  return Array.isArray(bindingTickers) && bindingTickers.includes("WPEARL") ? "WPEARL" : "WPRL";
}

// MUST match relay/src/api/intermediary.ts:bindingPayload() byte-for-byte.
// The relay re-builds this string with the values from the POST and
// recovers the signer; any divergence here → 401 on bind. The only variable
// word is the ticker (WPRL, or WPEARL when the relay advertises it).
export function buildBindingPayload(args: {
  ethAddress: string;
  pearlAddress: string;
  intermediaryAddress: string;
  chainId: number;
  nonce: string;
  issuedAt: number; // ms epoch
  bindingTtlMs: number;
  ticker?: BindingTicker;
}): string {
  return [
    "PearlBridge intermediary unwrap binding",
    "",
    "By signing this, I authorize the PearlBridge intermediary hot wallet",
    `to credit ANY ${args.ticker ?? "WPRL"} sent from the ETH address below to the Pearl`,
    "address below. This binding does NOT obligate me to send anything,",
    "and can be replaced at any time by signing a new binding.",
    "",
    `Chain ID: ${args.chainId}`,
    `Intermediary hot wallet: ${args.intermediaryAddress}`,
    `From ETH address: ${args.ethAddress}`,
    `To Pearl address: ${args.pearlAddress}`,
    `Nonce: ${args.nonce}`,
    `Issued at: ${new Date(args.issuedAt).toISOString()}`,
    `Binding TTL (ms): ${args.bindingTtlMs}`,
  ].join("\n");
}
