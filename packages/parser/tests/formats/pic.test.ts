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
    const seg = pic.segments[0]!;
    expect(seg.segmentIndex).toBe(0);
    expect(seg.encodedOffset).toBe(0);
    expect(seg.encodedLength).toBe(buf.length);
    expect(seg.ops).toEqual([
      { type: 'lit', bytes: [0x58, 0x02, 0x03, 0x05, 0xff, 0x7f] },
      { type: 'run', count: 18, fillByte: 0x00 },
    ]);
    expect(seg.decodedBytes.slice(0, 6)).toEqual([0x58, 0x02, 0x03, 0x05, 0xff, 0x7f]);
    expect(seg.decodedBytes.slice(6)).toEqual(Array(18).fill(0));
    expect(seg.decodedBytes).toHaveLength(24);
    expect(seg.header).toEqual({ pos: 0x0258, width: 3, height: 5 });
    expect(pic.totalBytes).toBe(buf.length);
  });

  it('decodes multiple segments', () => {
    // Two consecutive segments, each L6 R18(0) END
    const buf = bytes(
      0x06, 0x58, 0x02, 0x03, 0x05, 0xff, 0x7f, 0xee, 0x00, 0x00,
      0x06, 0x38, 0x04, 0x03, 0x05, 0xff, 0x7f, 0xee, 0x00, 0x00,
    );
    const pic = decodePic(buf, { id: 'mon-multi', sourceFile: 'mon-multi.pic' });
    expect(pic.segments).toHaveLength(2);
    expect(pic.segments[0]!.header).toEqual({ pos: 0x0258, width: 3, height: 5 });
    expect(pic.segments[1]!.header).toEqual({ pos: 0x0438, width: 3, height: 5 });
    expect(pic.segments[1]!.encodedOffset).toBe(10);
  });

  it('decodes the canonical mon00.pic first 7 bytes verbatim', () => {
    // mon00.pic starts: 02 58 02 fd 01 ed 00  (single segment)
    // Decoded: LIT(2)=[58 02]  RUN(256-0xfd=3, fill=0x01)  RUN(256-0xed=19, fill=0x00)... wait
    // Actually let me re-check: 02 58 02 fd 01 ed 00
    //   LIT(2): bytes [58, 02]
    //   0xfd: high-bit set → RUN(256-0xfd=3, fillByte=bytes[next]=0x01)
    //   0xed: high-bit set → RUN(256-0xed=19, fillByte=??)
    // But there's only 1 byte (0x00) left before EOF — wait, the next byte after 0xed
    // would be... let me re-look at the raw bytes:
    //   index 0: 02   (LIT 2)
    //   index 1: 58   (LIT payload)
    //   index 2: 02   (LIT payload)
    //   index 3: fd   (RUN; 256-0xfd=3)
    //   index 4: 01   (RUN fill byte)
    //   index 5: ed   (RUN; 256-0xed=19)
    //   index 6: 00   (RUN fill byte = 0x00)
    //
    // Wait — after the RUN fill is consumed, we're at index 7. But the buf is only 7 bytes
    // long! So this 7-byte sequence is actually one segment with NO trailing 0x00 END.
    //
    // Looking at mon00.pic for real (xxd output from earlier): the file is 1166 bytes long;
    // the END markers appear later. So a 7-byte input slice may not include an END.
    //
    // For this test, use a proper segment-ending sequence:
    const buf = bytes(
      0x02, 0x58, 0x02,       // LIT(2) [58 02]
      0xfd, 0x01,             // RUN(3, fill=0x01)
      0xed, 0x00,             // RUN(19, fill=0x00)
      0x00,                   // END
    );
    const pic = decodePic(buf, { id: 'mon00-prefix', sourceFile: 'mon00.pic' });
    expect(pic.segments).toHaveLength(1);
    const seg = pic.segments[0]!;
    expect(seg.ops).toEqual([
      { type: 'lit', bytes: [0x58, 0x02] },
      { type: 'run', count: 3, fillByte: 0x01 },
      { type: 'run', count: 19, fillByte: 0x00 },
    ]);
    expect(seg.decodedBytes).toEqual([
      0x58, 0x02,
      0x01, 0x01, 0x01,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(seg.header).toEqual({ pos: 0x0258, width: 0x01, height: 0x01 });
  });

  it('segments with decoded < 4 bytes get header=null', () => {
    // LIT(2) [12 34]  END
    const buf = bytes(0x02, 0x12, 0x34, 0x00);
    const pic = decodePic(buf, { id: 'tiny', sourceFile: 'tiny.pic' });
    expect(pic.segments).toHaveLength(1);
    expect(pic.segments[0]!.header).toBeNull();
    expect(pic.segments[0]!.decodedBytes).toEqual([0x12, 0x34]);
  });

  it('reports totalBytes equal to input length', () => {
    const buf = bytes(0x06, 0x58, 0x02, 0x03, 0x05, 0xff, 0x7f, 0xee, 0x00, 0x00);
    const pic = decodePic(buf, { id: 'x', sourceFile: 'x.pic' });
    expect(pic.totalBytes).toBe(10);
  });

  it('throws on truncated LIT (not enough remaining bytes)', () => {
    // LIT(5) but only 3 bytes follow before EOF
    const buf = bytes(0x05, 0x01, 0x02, 0x03);
    expect(() =>
      decodePic(buf, { id: 'bad-lit', sourceFile: 'bad.pic' }),
    ).toThrow(/truncated|out of bounds/i);
  });

  it('throws on truncated RUN (missing fill byte)', () => {
    // RUN op with no fill byte after
    const buf = bytes(0xfd);
    expect(() =>
      decodePic(buf, { id: 'bad-run', sourceFile: 'bad.pic' }),
    ).toThrow(/truncated|out of bounds/i);
  });

  it('handles a RUN with count 1 (op 0xff)', () => {
    const buf = bytes(0xff, 0xab, 0x00);
    const pic = decodePic(buf, { id: 'one-byte-run', sourceFile: 'x.pic' });
    expect(pic.segments[0]!.ops).toEqual([{ type: 'run', count: 1, fillByte: 0xab }]);
    expect(pic.segments[0]!.decodedBytes).toEqual([0xab]);
  });

  it('handles a RUN with count 128 (op 0x80)', () => {
    const buf = bytes(0x80, 0xcd, 0x00);
    const pic = decodePic(buf, { id: 'max-run', sourceFile: 'x.pic' });
    expect(pic.segments[0]!.ops).toEqual([{ type: 'run', count: 128, fillByte: 0xcd }]);
    expect(pic.segments[0]!.decodedBytes).toHaveLength(128);
    expect(pic.segments[0]!.decodedBytes.every((b) => b === 0xcd)).toBe(true);
  });
});
