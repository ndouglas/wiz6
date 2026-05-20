import { describe, expect, it } from 'vitest';
import { decodeEgaScreen } from '../../src/formats/ega-screen.js';

const PLANE = 8000;
const TRAILER = 256;
const TOTAL = PLANE * 4 + TRAILER + 512;
const FILE_SIZE = 32768;

function makeFile({
  fill = 0,
  trailerFill = 0xab,
  trailingZeroes = 512,
}: { fill?: number; trailerFill?: number; trailingZeroes?: number } = {}): Uint8Array {
  const buf = new Uint8Array(FILE_SIZE);
  buf.fill(fill, 0, PLANE * 4);
  buf.fill(trailerFill, PLANE * 4, PLANE * 4 + TRAILER);
  // last 512 bytes already zero
  return buf;
}

describe('decodeEgaScreen', () => {
  it('decodes a 32768-byte file into 4 planes + 256-byte trailer', () => {
    const bytes = makeFile({ fill: 0x55, trailerFill: 0xab });
    const screen = decodeEgaScreen(bytes, { id: 'titlepag', sourceFile: 'titlepag.ega' });
    expect(screen.id).toBe('titlepag');
    expect(screen.sourceFile).toBe('titlepag.ega');
    expect(screen.width).toBe(320);
    expect(screen.height).toBe(200);
    expect(screen.planes).toHaveLength(4);
    expect(screen.planes[0]).toHaveLength(8000);
    expect(screen.planes[0]?.[0]).toBe(0x55);
    expect(screen.trailer).toHaveLength(256);
    expect(screen.trailer[0]).toBe(0xab);
  });

  it('extracts planes from the correct byte ranges', () => {
    const bytes = new Uint8Array(FILE_SIZE);
    bytes[0] = 0x01;          // first byte of plane 0
    bytes[8000] = 0x02;       // first byte of plane 1
    bytes[16000] = 0x04;      // first byte of plane 2
    bytes[24000] = 0x08;      // first byte of plane 3
    bytes[32000] = 0xFF;      // first byte of trailer
    const screen = decodeEgaScreen(bytes, { id: 'x', sourceFile: 'x.ega' });
    expect(screen.planes[0]?.[0]).toBe(0x01);
    expect(screen.planes[1]?.[0]).toBe(0x02);
    expect(screen.planes[2]?.[0]).toBe(0x04);
    expect(screen.planes[3]?.[0]).toBe(0x08);
    expect(screen.trailer[0]).toBe(0xFF);
  });

  it('throws on wrong file size', () => {
    expect(() =>
      decodeEgaScreen(new Uint8Array(32767), { id: 'x', sourceFile: 'x.ega' }),
    ).toThrow(/32768/);
  });

  it('throws if trailing 512 bytes are not all zero', () => {
    const bytes = makeFile();
    bytes[32256] = 1; // first byte after the trailer should be zero
    expect(() =>
      decodeEgaScreen(bytes, { id: 'x', sourceFile: 'x.ega' }),
    ).toThrow(/padding/);
  });
});
