import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeQR as upstream } from 'qr';
import { encodeQR } from '../src/compat/cuer-qr.ts';
import decodeQR from 'qr/decode.js';

const payloads = ['https://pearlbridge.xyz', 'wc:' + 'a'.repeat(64) + '@2?relay-protocol=irn&symKey=' + 'b'.repeat(64), '你好 Pearl'];
for (const payload of payloads) {
  test(`QR encodes and independently decodes ${payload.slice(0, 25)}`, () => {
    const grid = encodeQR(payload, 'raw', { border: 0, scale: 1, ecc: 'medium' });
    assert.equal((grid.length - 17) % 4, 0); // valid symbol version, no padding
    // Add the quiet zone supplied by the UI, rasterize, decode the actual data.
    const scale = 8, width = (grid.length + 8) * scale;
    const data = new Uint8Array(width * width * 4).fill(255);
    for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid.length; x++) {
      if (!grid[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const i = (((y + 4) * scale + dy) * width + (x + 4) * scale + dx) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
    assert.equal(decodeQR({ data, width, height: width }), payload);
  });
}
test('reproduces upstream failure and preserves nonzero borders', () => {
  assert.throws(() => upstream('test', 'raw', { border: 0 }), /invalid border/);
  assert.deepEqual(encodeQR('test', 'raw', { border: 4 }), upstream('test', 'raw', { border: 4 }));
  assert.throws(() => encodeQR('test', 'raw', { border: 0, scale: 2 }), /scale=1/);
  assert.throws(() => encodeQR('test', 'raw', { border: -1 }), /invalid border/);
});
