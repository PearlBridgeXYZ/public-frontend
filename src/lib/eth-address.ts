import { getAddress, isAddress } from "viem";

export type EthAddressValidation =
  | { kind: "valid"; address: `0x${string}`; hadChecksum: true }
  | { kind: "valid-no-checksum"; address: `0x${string}`; hadChecksum: false }
  | { kind: "invalid"; reason: string };

// Validate an Ethereum address ahead of binding it to a per-user Pearl
// deposit address. A typo here mints WPRL to the wrong address — unrecoverable
// without an admin refund — so the UX needs to be loud about the distinction
// between a checksummed input and a raw lower/upper-case one.
export function validateEthAddress(input: string): EthAddressValidation {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "invalid", reason: "Address required" };
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return { kind: "invalid", reason: "Must be 0x followed by 40 hex characters" };
  }

  const isAllLower = trimmed.toLowerCase() === trimmed;
  const isAllUpper = trimmed.slice(2).toUpperCase() === trimmed.slice(2);

  if (isAllLower || isAllUpper) {
    // viem's getAddress will produce the canonical EIP-55 form. Safe to call
    // since the regex above already rejected non-hex inputs.
    const checksummed = getAddress(trimmed) as `0x${string}`;
    return { kind: "valid-no-checksum", address: checksummed, hadChecksum: false };
  }

  // Mixed case → must match EIP-55 exactly. isAddress with strict=true is the
  // checksum check; if it fails, the input is a typo (or pasted from a tool
  // that mangled the case).
  if (!isAddress(trimmed, { strict: true })) {
    return {
      kind: "invalid",
      reason: "EIP-55 checksum failed — likely typo or copy-paste error",
    };
  }
  return { kind: "valid", address: trimmed as `0x${string}`, hadChecksum: true };
}

// Convenience for callers that only want a yes/no answer.
export function isValidEthAddress(input: string): boolean {
  return validateEthAddress(input).kind !== "invalid";
}
