/// Grains (Pearl 8-decimal smallest unit) to human-readable PRL string
export function grainsToDisplay(grains: bigint): string {
  const whole = grains / 100_000_000n;
  const frac = grains % 100_000_000n;
  const fracStr = frac.toString().padStart(8, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}

/// Whole-PRL amount with thousands separators (e.g. 50_000n grains → "50,000").
/// Used in prose where we want "50,000 PRL" rather than "50000 PRL". Drops
/// fractional grains because the limit knobs are always whole-PRL values.
export function grainsToWholePrlWithCommas(grains: bigint): string {
  return (grains / 100_000_000n).toLocaleString("en-US");
}

/// Parse user input string to grains (bigint). Returns null if invalid.
export function parseToGrains(input: string): bigint | null {
  const trimmed = input.trim();
  if (!trimmed || isNaN(Number(trimmed))) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = frac.slice(0, 8).padEnd(8, "0");
  try {
    return BigInt(whole) * 100_000_000n + BigInt(fracPadded);
  } catch {
    return null;
  }
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/// Compute fee and net amount from gross amount, feeBps, and an optional
/// minimum fee floor (grains). `fee = max(percentFee, floor)`. If gross is
/// less than the resulting fee, returns net = 0n (caller blocks submission).
export function computeFee(
  gross: bigint,
  feeBps: number,
  floor: bigint = 0n
): { fee: bigint; net: bigint } {
  const percentFee = (gross * BigInt(feeBps)) / 10_000n;
  const fee = percentFee < floor ? floor : percentFee;
  const net = gross > fee ? gross - fee : 0n;
  return { fee, net };
}
