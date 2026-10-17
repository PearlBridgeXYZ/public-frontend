import { encodeQR as encodeUpstream, type QrOpts } from 'qr';

/**
 * cuer 0.0.3 asks for the unpadded matrix and renders its own quiet zone.
 * qr 0.6 rejects border=0. Generate one empty module around the symbol,
 * then remove that module; never change the payload, encoding or ECC.
 * Vite resolves only cuer's qr import here (not other qr consumers).
 */
export function encodeQR(value: string, output: 'raw', options: QrOpts = {}): boolean[][] {
  if (output !== 'raw') throw new Error('Cuer QR compatibility expects raw output');
  if (options.border !== 0) return encodeUpstream(value, output, options);
  if (options.scale !== undefined && options.scale !== 1) {
    throw new Error('Cuer QR compatibility expects scale=1');
  }
  const padded = encodeUpstream(value, 'raw', { ...options, border: 1 });
  return padded.slice(1, -1).map(row => row.slice(1, -1));
}
