import { bech32, bech32m } from "bech32";

// Pearl Taproot addresses use HRP "prl". Witness v0 (P2WPKH/P2WSH) is bech32;
// v1+ (Taproot) is bech32m (BIP-350). The sipa-maintained `bech32` package
// covers both — we just enforce HRP, witness-version, and variant pairing.

const PEARL_HRP = "prl";

export function isPlausiblePearlAddress(addr: string): boolean {
  if (!addr) return false;
  // bech32 is case-insensitive but mixed case is forbidden by spec.
  if (addr !== addr.toLowerCase() && addr !== addr.toUpperCase()) return false;
  if (addr.length < 14 || addr.length > 90) return false;

  const lower = addr.toLowerCase();

  // Try bech32m first (Taproot, witness v1+) then bech32 (witness v0).
  let decoded: { prefix: string; words: number[] } | null = null;
  let variant: "bech32" | "bech32m" | null = null;
  try {
    decoded = bech32m.decode(lower);
    variant = "bech32m";
  } catch {
    try {
      decoded = bech32.decode(lower);
      variant = "bech32";
    } catch {
      return false;
    }
  }

  if (decoded.prefix !== PEARL_HRP) return false;
  if (decoded.words.length === 0) return false;

  const witver = decoded.words[0];
  if (witver > 16) return false;

  // BIP-350: v0 must be bech32, v1+ must be bech32m.
  if (witver === 0 && variant !== "bech32") return false;
  if (witver !== 0 && variant !== "bech32m") return false;

  return true;
}
