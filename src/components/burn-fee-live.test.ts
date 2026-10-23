import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Re-audit 2026-10-04 (R3 M-4): the WPRL→PRL preview must use the contract's live burnFeeBps (50 bps on mainnet),
// not a build-time 0, so "You receive" matches what the user actually gets.
test('burn preview reads burnFeeBps live from the bridge controller', () => {
  const src = readFileSync(new URL('./BurnAndUnlock.tsx', import.meta.url), 'utf8');
  assert.match(src, /functionName: "burnFeeBps"/);
  assert.match(src, /computeFee\(grains, burnFeeBps\)/);
  assert.doesNotMatch(src, /computeFee\(grains, BURN_FEE_BPS\)/);
});
test('mainnet fallback fee matches the contract (50 bps)', () => {
  const env = readFileSync(new URL('../../.env.mainnet', import.meta.url), 'utf8');
  assert.match(env, /^VITE_BURN_FEE_BPS=50$/m);
});
