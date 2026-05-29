// Per-deposit confirmation-tier table — frontend mirror of
// relay/src/pearl/conf-tiers.ts. Source of truth for both copies is
// ~/projects/pearlbridge-spec-conf-tier/SPEC.md §2. Keep these in sync.
//
// The frontend needs its own copy so the progress UI can render
// "X of Y confirmations" with the correct denominator the moment the
// user enters an amount, without waiting on a /api/mint-status round
// trip. The relay still enforces the gate; this is display only.

export type ConfTier = {
  maxDepositGrains: bigint;
  requiredConf: number;
};

export const CONF_TIERS: readonly ConfTier[] = [
  { maxDepositGrains:        100_000_000_000n, requiredConf:   6 }, // ≤    1,000 PRL
  { maxDepositGrains:      1_000_000_000_000n, requiredConf:   8 }, // ≤   10,000 PRL
  { maxDepositGrains:      2_500_000_000_000n, requiredConf:  20 }, // ≤   25,000 PRL
  { maxDepositGrains:      5_000_000_000_000n, requiredConf:  40 }, // ≤   50,000 PRL
  { maxDepositGrains:     10_000_000_000_000n, requiredConf:  80 }, // ≤  100,000 PRL
  { maxDepositGrains:     25_000_000_000_000n, requiredConf: 200 }, // ≤  250,000 PRL
  { maxDepositGrains:     50_000_000_000_000n, requiredConf: 400 }, // ≤  500,000 PRL
] as const;

const T0_REQUIRED_CONF = CONF_TIERS[0].requiredConf;

export function requiredConfFor(grains: bigint | null | undefined): number {
  if (grains === null || grains === undefined) return T0_REQUIRED_CONF;
  for (const t of CONF_TIERS) {
    if (grains <= t.maxDepositGrains) return t.requiredConf;
  }
  return CONF_TIERS[CONF_TIERS.length - 1].requiredConf;
}

// Pearl block time is ~116s. "~Xm" string for the waiting copy.
const PEARL_BLOCK_SECONDS = 116;

export function estimatedWaitLabel(requiredConf: number): string {
  const totalSeconds = requiredConf * PEARL_BLOCK_SECONDS;
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `~${minutes} min`;
  const hours = minutes / 60;
  // Round to one decimal for sub-hour precision; whole hours for >=10h.
  return hours >= 10 ? `~${Math.round(hours)}h` : `~${hours.toFixed(1)}h`;
}
