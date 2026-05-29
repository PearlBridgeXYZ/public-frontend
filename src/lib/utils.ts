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

/// Whole-PRL amount with no separator (e.g. 50_000n grains → "50000"). Used
/// in the compact home-page stat tiles where a thousands separator looks like
/// a decimal point at a glance to non-en-US readers.
export function grainsToWholePrl(grains: bigint): string {
  return (grains / 100_000_000n).toString();
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

/// Hours remaining until the next fixed-epoch window boundary, rounded to
/// the requested decimal precision. BridgeController's daily limit window
/// resets at `floor(block.timestamp / windowSec) * windowSec` — i.e., at
/// fixed UTC offsets, not 24h after the first charge (BridgeLib.currentEpoch,
/// fixed by audit A5). At a 24h window that's midnight UTC daily.
///
/// `nowSec` is unix seconds. `windowSec` is the contract's WINDOW_DURATION
/// (86_400 on mainnet). Returns hours as a non-negative number.
export function hoursUntilEpochReset(nowSec: number, windowSec: number): number {
  if (windowSec <= 0) return 0;
  const nextBoundary = (Math.floor(nowSec / windowSec) + 1) * windowSec;
  return Math.max(0, (nextBoundary - nowSec) / 3600);
}

/// Whole seconds until the next 00:00:00 UTC boundary from `nowMsec`
/// (millisecond unix time). Floors the fractional second so a second-resolution
/// HH:MM:SS counter ticks down monotonically without jitter.
///
/// At nowMsec === N * 86_400_000 exactly (a midnight tick) this returns 86_400
/// — i.e. we treat "right at midnight" as a fresh 24h window, not 0.
export function secondsUntilNextMidnightUtc(nowMsec: number): number {
  const DAY_MS = 86_400_000;
  const remainder = ((nowMsec % DAY_MS) + DAY_MS) % DAY_MS; // handles negatives defensively
  const msToBoundary = remainder === 0 ? DAY_MS : DAY_MS - remainder;
  return Math.floor(msToBoundary / 1000);
}

/// Format a non-negative seconds count as `HH:MM:SS`. Caps at 99:59:59 so
/// truncated rendering never blows out the layout (the on-chain window is
/// 24h so this cap is purely defensive).
export function formatHmsCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const capped = Math.min(s, 99 * 3600 + 59 * 60 + 59);
  const h = Math.floor(capped / 3600);
  const m = Math.floor((capped % 3600) / 60);
  const sec = capped % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}
