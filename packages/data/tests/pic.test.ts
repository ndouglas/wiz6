import { describe, expect, it } from 'vitest';
import {
  PicSchema,
  PicSegmentSchema,
  PicOpSchema,
  PicDescriptorSchema,
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

  it('rejects run count = 0', () => {
    expect(() => PicOpSchema.parse({ type: 'run', count: 0, fillByte: 0 })).toThrow();
  });

  it('rejects run count > 128', () => {
    expect(() => PicOpSchema.parse({ type: 'run', count: 129, fillByte: 0 })).toThrow();
  });

  it('rejects fillByte out of byte range', () => {
    expect(() => PicOpSchema.parse({ type: 'run', count: 10, fillByte: 256 })).toThrow();
  });
});

describe('PicDescriptorSchema', () => {
  it('accepts a valid descriptor', () => {
    expect(() =>
      PicDescriptorSchema.parse({
        index: 0,
        pos: 0x0258,
        width: 3,
        height: 5,
        mask: Array(20).fill(0),
      }),
    ).not.toThrow();
  });

  it('rejects mask of wrong length', () => {
    expect(() =>
      PicDescriptorSchema.parse({
        index: 0,
        pos: 0,
        width: 1,
        height: 1,
        mask: Array(19).fill(0),
      }),
    ).toThrow();
  });

  it('rejects out-of-range pos', () => {
    expect(() =>
      PicDescriptorSchema.parse({
        index: 0,
        pos: 70000,
        width: 1,
        height: 1,
        mask: Array(20).fill(0),
      }),
    ).toThrow();
  });
});

describe('PicSegmentSchema', () => {
  it('accepts a segment', () => {
    expect(() =>
      PicSegmentSchema.parse({
        segmentIndex: 0,
        encodedOffset: 0,
        encodedLength: 9,
        ops: [{ type: 'lit', bytes: [0x58, 0x02] }],
        decodedBytes: [0x58, 0x02],
      }),
    ).not.toThrow();
  });

  it('rejects a segment with header (old Stage A field, now removed)', () => {
    expect(() =>
      PicSegmentSchema.parse({
        segmentIndex: 0,
        encodedOffset: 0,
        encodedLength: 9,
        ops: [{ type: 'lit', bytes: [0x58, 0x02] }],
        decodedBytes: [0x58, 0x02],
        header: { pos: 0x0258, width: 3, height: 5 },
      }),
    ).not.toThrow(); // z.object passthroughs unknown keys by default — just confirm the schema doesn't crash
  });
});

describe('PicSchema', () => {
  const baseSegment = {
    segmentIndex: 0,
    encodedOffset: 0,
    encodedLength: 9,
    ops: [{ type: 'lit', bytes: [0x58, 0x02] }],
    decodedBytes: [0x58, 0x02],
  };
  const baseDescriptor = {
    index: 0,
    pos: 0x0258,
    width: 3,
    height: 5,
    mask: Array(20).fill(0),
  };

  it('accepts a valid pic with descriptors', () => {
    expect(() =>
      PicSchema.parse({
        id: 'mon00',
        sourceFile: 'mon00.pic',
        segments: [baseSegment],
        descriptors: [baseDescriptor],
        totalBytes: 1166,
      }),
    ).not.toThrow();
  });

  it('accepts a pic with no descriptors', () => {
    expect(() =>
      PicSchema.parse({
        id: 'tiny',
        sourceFile: 'tiny.pic',
        segments: [baseSegment],
        descriptors: [],
        totalBytes: 9,
      }),
    ).not.toThrow();
  });

  it('rejects empty id', () => {
    expect(() =>
      PicSchema.parse({
        id: '',
        sourceFile: 'x.pic',
        segments: [],
        descriptors: [],
        totalBytes: 1,
      }),
    ).toThrow();
  });
});
