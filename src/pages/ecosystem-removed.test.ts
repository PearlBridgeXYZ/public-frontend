import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// G #62958 (RC5.54): the public Ecosystem page is retired; competitor tracking moved to an internal watcher.
test('ecosystem page is removed and old links redirect home', () => {
  const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  assert.ok(!app.includes('to="/ecosystem"'), 'no nav link to /ecosystem');
  assert.ok(!app.includes('<Ecosystem'), 'no Ecosystem component rendered');
  assert.ok(app.includes('<Route path="/ecosystem" element={<Navigate to="/" replace />} />'), '/ecosystem redirects to /');
  assert.ok(!existsSync(new URL('./Ecosystem.tsx', import.meta.url)), 'page source deleted');
  assert.ok(!existsSync(new URL('../../public/data/ecosystem.json', import.meta.url)), 'public snapshot not shipped');
  assert.ok(!existsSync(new URL('../../public/data/ecosystem-history.json', import.meta.url)), 'public history not shipped');
});
