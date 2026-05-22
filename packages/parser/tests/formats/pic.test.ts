import { describe, expect, it } from 'vitest';
import { decodePic } from '../../src/formats/pic.js';

function bytes(...vals: number[]): Uint8Array {
  return new Uint8Array(vals);
}

describe('decodePic', () => {
  it('decodes a single segment with LIT + RUN + END', () => {
    // LIT(6) [58 02 03 05 ff 7f]  RUN(256-0xee=18, fill=0x00)  END
    const buf = bytes(0x06, 0x58, 0x02, 0x03, 0x05, 0xff, 0x7f, 0xee, 0x00, 0x00);
    const pic = decodePic(buf, { id: 'mon01', sourceFile: 'mon01.pic' });
    expect(pic.id).toBe('mon01');
    expect(pic.segments).toHaveLength(1);
    expect(pic.segments[0]!.ops).toEqual([
      { type: 'lit', bytes: [0x58, 0x02, 0x03, 0x05, 0xff, 0x7f] },
      { type: 'run', count: 18, fillByte: 0x00 },
    ]);
    expect(pic.segments[0]!.decodedBytes).toHaveLength(24);
  });

  it('parses one descriptor + zero-terminator into descriptors[]', () => {
    // 24-byte descriptor: pos=0x0258, W=3, H=5, mask = 20×0x00
    // 24-byte zero terminator
    // Total = 48 bytes of decoded output.
    // LIT(48) is too big (max 127), so emit two LITs: LIT(48 capped at 0x30) = 48 OK; LIT can be up to 0x7f.
    const descriptor = [0x58, 0x02, 3, 5, ...Array(20).fill(0)];
    const terminator = Array(24).fill(0);
    const payload = [...descriptor, ...terminator];
    // LIT(48) — opcode 0x30 says "copy next 48 bytes"
    const buf = bytes(0x30, ...payload, 0x00);
    const pic = decodePic(buf, { id: 'desc1', sourceFile: 'desc1.pic' });
    expect(pic.descriptors).toHaveLength(1);
    expect(pic.descriptors[0]).toEqual({
      index: 0,
      pos: 0x0258,
      width: 3,
      height: 5,
      mask: Array(20).fill(0),
    });
  });

  it('parses multiple descriptors before zero-terminator', () => {
    // Two descriptors then terminator = 24+24+24 = 72 bytes payload
    const d0 = [0x10, 0x00, 1, 1, ...Array(20).fill(0)]; // pos=0x10, W=H=1
    const d1 = [0x40, 0x00, 2, 1, ...Array(20).fill(0)]; // pos=0x40, W=2, H=1
    const term = Array(24).fill(0);
    const payload = [...d0, ...d1, ...term];
    // Two LIT(36) ops (since LIT max payload is 127, but we'll do one LIT(72) which is 0x48 > 0x7f? No: 0x48 = 72 < 0x80, OK)
    const buf = bytes(0x48, ...payload, 0x00);
    const pic = decodePic(buf, { id: 'desc2', sourceFile: 'desc2.pic' });
    expect(pic.descriptors).toHaveLength(2);
    expect(pic.descriptors[0]!.index).toBe(0);
    expect(pic.descriptors[0]!.pos).toBe(0x10);
    expect(pic.descriptors[1]!.index).toBe(1);
    expect(pic.descriptors[1]!.pos).toBe(0x40);
    expect(pic.descriptors[1]!.width).toBe(2);
  });

  it('stops descriptor parsing if no zero-terminator is hit before buffer end', () => {
    // Single descriptor, no terminator — should still appear in descriptors list
    const d0 = [0x10, 0x00, 1, 1, ...Array(20).fill(0)];
    const buf = bytes(0x18, ...d0, 0x00);
    const pic = decodePic(buf, { id: 'desc3', sourceFile: 'desc3.pic' });
    expect(pic.descriptors).toHaveLength(1);
  });

  it('handles the canonical mon00.pic 7-byte prefix as one segment, parses partial descriptor as descriptor 0', () => {
    // 02 58 02 fd 01 ed 00 + 00  decodes to bytes [0x58, 0x02, 0x01, 0x01, 0x01, 0x00, 0x00, ... 19 more zeros]
    // = 24 bytes total. That's one descriptor: pos=0x0258, W=0x01, H=0x01, mask=[1, 0, ...]
    // Then a trailing 0x00 END marker.
    const buf = bytes(0x02, 0x58, 0x02, 0xfd, 0x01, 0xed, 0x00, 0x00);
    const pic = decodePic(buf, { id: 'mon00-prefix', sourceFile: 'mon00.pic' });
    expect(pic.descriptors).toHaveLength(1);
    expect(pic.descriptors[0]!.pos).toBe(0x0258);
    expect(pic.descriptors[0]!.width).toBe(1);
    expect(pic.descriptors[0]!.height).toBe(1);
    expect(pic.descriptors[0]!.mask[0]).toBe(1);
  });

  it('reports totalBytes equal to input length', () => {
    const buf = bytes(0x06, 0x58, 0x02, 0x03, 0x05, 0xff, 0x7f, 0xee, 0x00, 0x00);
    const pic = decodePic(buf, { id: 'x', sourceFile: 'x.pic' });
    expect(pic.totalBytes).toBe(10);
  });

  it('throws on truncated LIT', () => {
    const buf = bytes(0x05, 0x01, 0x02, 0x03);
    expect(() => decodePic(buf, { id: 'bad', sourceFile: 'bad.pic' })).toThrow(/truncated/i);
  });

  it('throws on truncated RUN', () => {
    const buf = bytes(0xfd);
    expect(() => decodePic(buf, { id: 'bad', sourceFile: 'bad.pic' })).toThrow(/truncated/i);
  });

  it('handles a RUN with count 128 (op 0x80)', () => {
    const buf = bytes(0x80, 0xcd, 0x00);
    const pic = decodePic(buf, { id: 'max-run', sourceFile: 'x.pic' });
    expect(pic.segments[0]!.decodedBytes).toHaveLength(128);
  });
});
