import { describe, expect, it } from 'vitest';
import { decodePic } from '../../src/formats/pic.js';

function picStream(...vals: number[]): Uint8Array {
  return new Uint8Array(vals);
}

describe('decodePic', () => {
  it('decodes a LIT + RUN + END stream into one segment', () => {
    // LIT(6) [58 02 03 05 ff 7f]  RUN(256-0xee=18, fill=0x00)  END
    const buf = picStream(0x06, 0x58, 0x02, 0x03, 0x05, 0xff, 0x7f, 0xee, 0x00, 0x00);
    const pic = decodePic(buf, { id: 'mon01', sourceFile: 'mon01.pic' });
    expect(pic.id).toBe('mon01');
    // New decoder exposes a single segment with the entire decoded buffer.
    expect(pic.segments).toHaveLength(1);
    expect(pic.segments[0]!.ops).toEqual([
      { type: 'lit', bytes: [0x58, 0x02, 0x03, 0x05, 0xff, 0x7f] },
      { type: 'run', count: 18, fillByte: 0x00 },
    ]);
    expect(pic.segments[0]!.decodedBytes).toHaveLength(24);
  });

  it('parses one descriptor and stops at the first all-zero record', () => {
    // 24-byte descriptor: pos=0x0258, W=3, H=5, mask=20×0x00
    // followed by 24-byte zero terminator (acts as unused-slot sentinel)
    const descriptor = [0x58, 0x02, 3, 5, ...Array(20).fill(0)];
    const terminator = Array(24).fill(0);
    const payload = [...descriptor, ...terminator];
    const buf = picStream(0x30, ...payload, 0x00); // LIT(48) [payload] END
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

  it('parses multiple descriptors before the first all-zero record', () => {
    const d0 = [0x10, 0x00, 1, 1, ...Array(20).fill(0)];
    const d1 = [0x40, 0x00, 2, 1, ...Array(20).fill(0)];
    const term = Array(24).fill(0);
    const payload = [...d0, ...d1, ...term];
    const buf = picStream(0x48, ...payload, 0x00);
    const pic = decodePic(buf, { id: 'desc2', sourceFile: 'desc2.pic' });
    expect(pic.descriptors).toHaveLength(2);
    expect(pic.descriptors[0]!.pos).toBe(0x10);
    expect(pic.descriptors[1]!.pos).toBe(0x40);
    expect(pic.descriptors[1]!.width).toBe(2);
  });

  it('reports totalBytes equal to input length', () => {
    const buf = picStream(0x06, 0x58, 0x02, 0x03, 0x05, 0xff, 0x7f, 0xee, 0x00, 0x00);
    const pic = decodePic(buf, { id: 'x', sourceFile: 'x.pic' });
    expect(pic.totalBytes).toBe(10);
  });

  it('handles short input by padding internally and terminating at 0x00', () => {
    // No explicit END — short input gets padded with zeros and the first
    // padding-zero acts as the implicit END.
    const buf = picStream(0x05, 0x01, 0x02, 0x03);
    const pic = decodePic(buf, { id: 'short', sourceFile: 'short.pic' });
    expect(pic.segments).toHaveLength(1);
    expect(pic.segments[0]!.ops[0]).toMatchObject({ type: 'lit' });
  });

  it('handles a RUN with count 128 (op 0x80)', () => {
    const buf = picStream(0x80, 0xcd, 0x00);
    const pic = decodePic(buf, { id: 'max-run', sourceFile: 'x.pic' });
    expect(pic.segments[0]!.decodedBytes).toHaveLength(128);
    expect(pic.segments[0]!.decodedBytes.every((b) => b === 0xcd)).toBe(true);
  });

  it('handles a RUN with count 1 (op 0xff)', () => {
    const buf = picStream(0xff, 0xab, 0x00);
    const pic = decodePic(buf, { id: 'one-byte-run', sourceFile: 'x.pic' });
    expect(pic.segments[0]!.ops[0]).toEqual({ type: 'run', count: 1, fillByte: 0xab });
    expect(pic.segments[0]!.decodedBytes).toEqual([0xab]);
  });
});
