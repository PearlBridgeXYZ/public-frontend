import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('bridge description discloses both fees without changing the deposit minimum', () => {
  const page = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  assert.ok(page.includes('0.5% deposit fee (4 PRL minimum). 0.5% redemption fee.'));
  assert.ok(!page.includes('No fee on redemption.'));
});
