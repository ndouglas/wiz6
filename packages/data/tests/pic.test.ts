import { describe, expect, it } from 'vitest';
import {
  PicSchema,
  PicSegmentSchema,
  PicOpSchema,
  PicHeaderSchema,
  PicLitOpSchema,
  PicRunOpSchema,
} from '../src/schemas/pic.js';

describe('PicOpSchema', () => {
  it('accepts a lit op', () => {
    expect(() => PicOpSchema.parse({ type: 'lit', bytes: [0x58, 0x02, 0x03, 0x05] })).not.toThrow();
  });

  it('accepts a run op', () => {
    expect(() => PicOpSchema.parse({ type: 'run', count: 18, fillByte: 0x00 })).not.toThrow();
  });

  it('rejects run count = 0 (0x100 = 256-op never happens; op 0x00 is END, op 0xff gives count 1)', () => {
    expect(() => PicOpSchema.parse({ type: 'run', count: 0, fillByte: 0 })).toThrow();
  });

  it('rejects run count > 128 (op 0x80 gives 256-0x80=128 max)', () => {
    expect(() => PicOpSchema.parse({ type: 'run', count: 129, fillByte: 0 })).toThrow();
  });

  it('rejects fillByte out of byte range', () => {
    expect(() => PicOpSchema.parse({ type: 'run', count: 10, fillByte: 256 })).toThrow();
  });

  it('rejects unknown op type', () => {
    expect(() => PicOpSchema.parse({ type: 'skip', count: 0 })).toThrow();
  });
});

describe('PicHeaderSchema', () => {
  it('accepts a valid header', () => {
    expect(() =>
      PicHeaderSchema.parse({ pos: 0x0258, width: 3, height: 5 }),
    ).not.toThrow();
  });

  it('rejects out-of-range pos', () => {
    expect(() =>
      PicHeaderSchema.parse({ pos: 70000, width: 1, height: 1 }),
    ).toThrow();
  });
});

describe('PicSegmentSchema', () => {
  it('accepts a segment with parsed header', () => {
    expect(() =>
      PicSegmentSchema.parse({
        segmentIndex: 0,
        encodedOffset: 0,
        encodedLength: 9,
        ops: [
          { type: 'lit', bytes: [0x58, 0x02, 0x03, 0x05, 0xff, 0x7f] },
          { type: 'run', count: 18, fillByte: 0x00 },
        ],
        decodedBytes: [
          0x58, 0x02, 0x03, 0x05, 0xff, 0x7f,
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ],
        header: { pos: 0x0258, width: 3, height: 5 },
      }),
    ).not.toThrow();
  });

  it('accepts a segment with null header (decoded < 4 bytes)', () => {
    expect(() =>
      PicSegmentSchema.parse({
        segmentIndex: 1,
        encodedOffset: 50,
        encodedLength: 4,
        ops: [{ type: 'lit', bytes: [0x12, 0x34] }],
        decodedBytes: [0x12, 0x34],
        header: null,
      }),
    ).not.toThrow();
  });
});

describe('PicSchema', () => {
  const baseSegment = {
    segmentIndex: 0,
    encodedOffset: 0,
    encodedLength: 9,
    ops: [{ type: 'lit', bytes: [0x58, 0x02, 0x03, 0x05, 0xff, 0x7f] }],
    decodedBytes: [0x58, 0x02, 0x03, 0x05, 0xff, 0x7f],
    header: { pos: 0x0258, width: 3, height: 5 },
  };

  it('accepts a valid pic with one segment', () => {
    expect(() =>
      PicSchema.parse({
        id: 'mon00',
        sourceFile: 'mon00.pic',
        segments: [baseSegment],
        totalBytes: 1166,
      }),
    ).not.toThrow();
  });

  it('accepts a multi-segment pic', () => {
    expect(() =>
      PicSchema.parse({
        id: 'mon50',
        sourceFile: 'mon50.pic',
        segments: [
          baseSegment,
          { ...baseSegment, segmentIndex: 1, encodedOffset: 9 },
          { ...baseSegment, segmentIndex: 2, encodedOffset: 18 },
        ],
        totalBytes: 26099,
      }),
    ).not.toThrow();
  });

  it('rejects empty id', () => {
    expect(() =>
      PicSchema.parse({
        id: '',
        sourceFile: 'x.pic',
        segments: [],
        totalBytes: 0,
      }),
    ).toThrow();
  });
});
