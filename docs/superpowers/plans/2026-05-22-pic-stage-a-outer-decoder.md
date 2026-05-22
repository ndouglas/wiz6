# `.pic` Stage A — Outer Decoder + Structural Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decode the outer envelope of `.pic` files into segments + RLE ops + decoded byte buffers, with the parsed `[pos, W, H]` sub-header for each segment. Ship a `Pic` schema, a `decodePic` parser, an `extractPic` extractor, a `wiz6 extract pics` CLI command, and a viewer `/pics` browser that lets you see the segment structure of every `.pic` file. NO pixel rendering — Stage B's job.

**Architecture:** based on disassembly of the EGA graphics driver (`docs/re/pic.md`).

The decoder loop is:

```
op = next_byte()
if op == 0x00:    END this segment
elif op < 0x80:   LIT(op): copy `op` bytes verbatim
else:             RUN(256 - op, fill = next_byte()): emit (256 - op) copies of fill
```

Each `.pic` file contains **1-4 segments**. The driver runs the loop once per `0x00`, returns to its caller, and the caller re-invokes it with the next file offset to decode the next segment into a different destination region of the screen buffer. The total file is consumed segment-by-segment until EOF.

After decoding a segment, the first 4 bytes of the decoded output are the **caller-side header** `[pos_lo, pos_hi, W, H]`. The remaining decoded bytes are the bitmap data (Stage B will figure out how those bytes map to pixels).

**Tech Stack:** TypeScript, zod, vitest, React. Reference investigation: `docs/re/pic.md` (especially the `Decoder source` section that documents the disassembled opcode table).

**Out of scope (Stage A):**
- Pixel decoding (4bpp planar? 1bpp packed? 4bpp packed? mask + color?) → Stage B
- `combatSpriteId` → `monNN.pic` indirection table → separate task, needs `wroot.exe` disassembly
- Sprite composition across multiple segments — segment 1 paints sub-region 1, segment 2 paints sub-region 2, etc. The viewer can show each segment's bitmap independently; assembling them into one logical sprite is Stage B/C work.

---

## Pre-flight

- [ ] **Worktree on the latest `main`**

```bash
cd ~/Projects/ndouglas/wiz6
git worktree add ~/.config/superpowers/worktrees/wiz6/stage-pic-a -b stage-pic-a
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-a
pnpm install --frozen-lockfile
```

- [ ] **Baseline tests**

```bash
pnpm -r test 2>&1 | grep "Tests" | tail -5
```

Expected: 82 + 96 + 41 + 290 = 509 tests passing.

---

## Task 1: `PicSchema` in `@wiz6/data`

Strict zod schemas for the corrected (post-disassembly) format. Source of truth for everything downstream.

**Files:**
- Create: `packages/data/src/schemas/pic.ts`
- Test: `packages/data/tests/pic.test.ts`
- Modify: `packages/data/src/index.ts` — re-export

- [ ] **Step 1: Write the failing test**

Create `packages/data/tests/pic.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-a
pnpm --filter @wiz6/data test tests/pic.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the schema**

Create `packages/data/src/schemas/pic.ts`:

```typescript
import { z } from 'zod';

const byte = z.number().int().min(0).max(255);

export const PicLitOpSchema = z.object({
  type: z.literal('lit'),
  bytes: z.array(byte),
});

export const PicRunOpSchema = z.object({
  type: z.literal('run'),
  /** Number of repetitions of `fillByte`. Derived as `256 - op` where the
   *  encoded opcode is in 0x80..0xff, giving the inclusive range 1..128. */
  count: z.number().int().min(1).max(128),
  fillByte: byte,
});

export const PicOpSchema = z.discriminatedUnion('type', [
  PicLitOpSchema,
  PicRunOpSchema,
]);

export const PicHeaderSchema = z.object({
  /** u16 little-endian destination buffer offset, parsed from decoded bytes 0-1. */
  pos: z.number().int().min(0).max(0xffff),
  /** Sprite width in some unit (TBD by Stage B). Decoded byte 2. */
  width: byte,
  /** Sprite height in some unit (TBD by Stage B). Decoded byte 3. */
  height: byte,
});

export const PicSegmentSchema = z.object({
  segmentIndex: z.number().int().nonnegative(),
  /** Start offset of this segment's encoded bytes in the source file. */
  encodedOffset: z.number().int().nonnegative(),
  /** Number of source bytes consumed by this segment (including the trailing 0x00). */
  encodedLength: z.number().int().positive(),
  ops: z.array(PicOpSchema),
  /** RLE-decoded output of this segment. First 4 bytes are the header (if length >= 4). */
  decodedBytes: z.array(byte),
  /** First 4 decoded bytes parsed as [pos_lo, pos_hi, W, H]. `null` if decoded < 4 bytes. */
  header: PicHeaderSchema.nullable(),
});

export const PicSchema = z.object({
  id: z.string().min(1),
  sourceFile: z.string().min(1),
  segments: z.array(PicSegmentSchema),
  totalBytes: z.number().int().positive(),
});

export type PicLitOp = z.infer<typeof PicLitOpSchema>;
export type PicRunOp = z.infer<typeof PicRunOpSchema>;
export type PicOp = z.infer<typeof PicOpSchema>;
export type PicHeader = z.infer<typeof PicHeaderSchema>;
export type PicSegment = z.infer<typeof PicSegmentSchema>;
export type Pic = z.infer<typeof PicSchema>;
```

- [ ] **Step 4: Re-export from `packages/data/src/index.ts`**

Read the existing index to find the style:

```bash
cat packages/data/src/index.ts | tail -10
```

Append:

```typescript
export {
  PicSchema,
  PicSegmentSchema,
  PicOpSchema,
  PicLitOpSchema,
  PicRunOpSchema,
  PicHeaderSchema,
  type Pic,
  type PicSegment,
  type PicOp,
  type PicLitOp,
  type PicRunOp,
  type PicHeader,
} from './schemas/pic.js';
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @wiz6/data test tests/pic.test.ts
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/schemas/pic.ts packages/data/src/index.ts packages/data/tests/pic.test.ts
git commit -m "feat(data): PicSchema for monster sprite outer-envelope format

Models the RLE-decoded structure of a .pic file as a list of segments,
each with its own ops (LIT/RUN), decoded byte buffer, and parsed header.
Per the disassembled opcode table in docs/re/pic.md, the byte stream is
LIT(op) for op<0x80, RUN(256-op, fill_byte) for op>=0x80, and segment-
terminator for op==0x00."
```

---

## Task 2: `decodePic` parser in `@wiz6/parser`

Pure function: bytes → `Pic` value. Implements the segment-aware LIT/RUN/END decoder.

**Files:**
- Create: `packages/parser/src/formats/pic.ts`
- Test: `packages/parser/tests/formats/pic.test.ts`
- Modify: `packages/parser/src/index.ts` — export `decodePic`

- [ ] **Step 1: Write the failing test**

Create `packages/parser/tests/formats/pic.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to confirm fail**

```bash
pnpm --filter @wiz6/parser test tests/formats/pic.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `decodePic`**

Create `packages/parser/src/formats/pic.ts`:

```typescript
import { PicSchema, type Pic, type PicOp, type PicSegment } from '@wiz6/data';

export interface DecodePicOpts {
  id: string;
  sourceFile: string;
}

/**
 * Decode the outer envelope of a `.pic` file: a byte-stream consisting of
 * one or more segments, where each segment is a sequence of opcodes
 * terminated by 0x00:
 *
 *   op == 0x00       END this segment (return to caller)
 *   op  < 0x80       LIT(op): copy `op` raw bytes verbatim into segment output
 *   op >= 0x80       RUN(256 - op, fill = next_byte()): emit (256 - op)
 *                    copies of the FOLLOWING byte
 *
 * After decoding a segment, the first 4 bytes of the segment's decoded
 * output are interpreted as a caller-side header:
 *   [pos_lo, pos_hi, W, H]
 * where pos is u16 LE and W, H are sprite dimensions (interpretation TBD).
 *
 * Multi-segment files (mon50, credits, etc.) are decoded by looping until
 * the source bytes are exhausted: each `0x00` ends the current segment,
 * then a new segment starts at the next byte.
 *
 * See `docs/re/pic.md` "Decoder source" section for the disassembled
 * EGA-driver implementation this mirrors.
 */
export function decodePic(bytes: Uint8Array, opts: DecodePicOpts): Pic {
  const segments: PicSegment[] = [];
  let pos = 0;
  let segmentIndex = 0;

  while (pos < bytes.length) {
    const segStart = pos;
    const ops: PicOp[] = [];
    const decoded: number[] = [];
    let segmentTerminated = false;

    while (pos < bytes.length) {
      const op = bytes[pos]!;
      pos++;
      if (op === 0x00) {
        segmentTerminated = true;
        break;
      } else if (op < 0x80) {
        // LIT(op): copy `op` bytes verbatim
        if (pos + op > bytes.length) {
          throw new Error(
            `decodePic: truncated LIT at byte ${pos - 1} (need ${op} bytes, ${bytes.length - pos} available)`,
          );
        }
        const litBytes = Array.from(bytes.subarray(pos, pos + op));
        ops.push({ type: 'lit', bytes: litBytes });
        for (const b of litBytes) decoded.push(b);
        pos += op;
      } else {
        // RUN(256 - op, fill = next_byte())
        const count = 256 - op;
        if (pos >= bytes.length) {
          throw new Error(
            `decodePic: truncated RUN at byte ${pos - 1} (no fill byte available)`,
          );
        }
        const fillByte = bytes[pos]!;
        pos++;
        ops.push({ type: 'run', count, fillByte });
        for (let i = 0; i < count; i++) decoded.push(fillByte);
      }
    }

    if (!segmentTerminated && ops.length === 0) {
      // Trailing empty bytes? Shouldn't happen on real files. Bail out.
      break;
    }

    let header: PicSegment['header'] = null;
    if (decoded.length >= 4) {
      header = {
        pos: decoded[0]! | (decoded[1]! << 8),
        width: decoded[2]!,
        height: decoded[3]!,
      };
    }

    segments.push({
      segmentIndex,
      encodedOffset: segStart,
      encodedLength: pos - segStart,
      ops,
      decodedBytes: decoded,
      header,
    });
    segmentIndex++;
  }

  return PicSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    segments,
    totalBytes: bytes.length,
  });
}
```

- [ ] **Step 4: Re-export from `packages/parser/src/index.ts`**

Append:

```typescript
export { decodePic, type DecodePicOpts } from './formats/pic.js';
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @wiz6/parser test tests/formats/pic.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 6: Sanity check against all 60 real .pic files**

Ensure `original/` exists in the worktree (the wiz6 repo committed `original/` in stage 1j; the worktree should have it). If missing, symlink:

```bash
[ ! -d /Users/nathan/.config/superpowers/worktrees/wiz6/stage-pic-a/original ] && ln -s /Users/nathan/Projects/ndouglas/wiz6/original /Users/nathan/.config/superpowers/worktrees/wiz6/stage-pic-a/original
```

Run the decoder on every `.pic`:

```bash
cd /Users/nathan/.config/superpowers/worktrees/wiz6/stage-pic-a/packages/parser
cat > /tmp/pic-probe.ts <<'EOF'
import { decodePic } from './src/formats/pic.js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const ORIGINAL = '/Users/nathan/.config/superpowers/worktrees/wiz6/stage-pic-a/original';
const files = readdirSync(ORIGINAL).filter((f) => f.endsWith('.pic')).sort();
let totalSegments = 0;
for (const f of files) {
  const buf = new Uint8Array(readFileSync(join(ORIGINAL, f)));
  const id = f.replace(/\.pic$/, '');
  try {
    const pic = decodePic(buf, { id, sourceFile: f });
    totalSegments += pic.segments.length;
    const seg0 = pic.segments[0]!;
    const h = seg0.header;
    console.log(`${f}: ${pic.segments.length} segments, ${pic.totalBytes} bytes, seg0 pos=0x${(h?.pos ?? 0).toString(16).padStart(4, '0')} ${h?.width}x${h?.height}`);
  } catch (err) {
    console.error(`${f}: FAILED — ${(err as Error).message}`);
    process.exit(1);
  }
}
console.log(`TOTAL: ${files.length} files, ${totalSegments} segments`);
EOF
pnpm exec tsx /tmp/pic-probe.ts 2>&1 | tail -10
rm /tmp/pic-probe.ts
```

Expected: 60 lines showing each file's segment count. Every file's first-segment `pos=0x0258`. Total segment count ~85 (44 single + 10×2 + 5×3 + 1×4 = 85, per investigation notes). If ANY file fails, STOP and report — the disassembly should have given us a clean 60/60.

- [ ] **Step 7: Commit**

```bash
cd /Users/nathan/.config/superpowers/worktrees/wiz6/stage-pic-a
git add packages/parser/src/formats/pic.ts packages/parser/src/index.ts packages/parser/tests/formats/pic.test.ts
git commit -m "feat(parser): decodePic — segment-aware LIT/RUN/END decoder

Implements the .pic byte-stream decoder as documented in docs/re/pic.md
(disassembled from the EGA graphics driver). Each .pic file is one or
more segments; each segment is a sequence of LIT(n) and RUN(n, fill)
opcodes terminated by 0x00. The first 4 decoded bytes of each segment
form a caller-side [pos, W, H] header.

Verified against all 60 real .pic files in original/."
```

---

## Task 3: `extractPic` + `wiz6 extract pics`

Wrap `decodePic` with file I/O. Wire into the existing `wiz6 extract` subcommand surface so `wiz6 extract pics` and `wiz6 extract --all` both work.

**Files:**
- Create: `packages/cli/src/extractors/extract-pic.ts`
- Modify: `packages/cli/src/commands/extract.ts` — add `pics` to the type enum + dispatch
- Test: `packages/cli/tests/extractors/extract-pic.test.ts`
- Test: `packages/cli/tests/commands/extract.test.ts` — add `pics` to the existing test

- [ ] **Step 1: Inspect an existing extractor for the pattern**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-a
cat packages/cli/src/extractors/extract-wfont-4bpp.ts
```

Note the function shape: takes `{originalPath, outputPath, id}`, reads bytes, decodes, writes JSON, returns the decoded value.

- [ ] **Step 2: Write the failing test**

Create `packages/cli/tests/extractors/extract-pic.test.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractPic } from '../../src/extractors/extract-pic.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'wiz6-extract-pic-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('extractPic', () => {
  it('decodes a tiny synthetic .pic and writes JSON', () => {
    const src = join(tmpDir, 'mon00.pic');
    const out = join(tmpDir, 'mon00.json');
    // LIT(6) [58 02 03 05 ff 7f] RUN(18, 0x00) END
    writeFileSync(src, Buffer.from([0x06, 0x58, 0x02, 0x03, 0x05, 0xff, 0x7f, 0xee, 0x00, 0x00]));
    const pic = extractPic({ originalPath: src, outputPath: out, id: 'mon00' });
    expect(pic.id).toBe('mon00');
    expect(pic.segments).toHaveLength(1);
    const written = JSON.parse(readFileSync(out, 'utf8'));
    expect(written.id).toBe('mon00');
    expect(written.segments[0].header.pos).toBe(0x0258);
    expect(written.segments[0].header.width).toBe(3);
    expect(written.segments[0].header.height).toBe(5);
  });
});
```

- [ ] **Step 3: Run test to confirm fail**

```bash
pnpm --filter @wiz6/cli test tests/extractors/extract-pic.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement the extractor**

Create `packages/cli/src/extractors/extract-pic.ts`:

```typescript
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import { decodePic } from '@wiz6/parser';
import type { Pic } from '@wiz6/data';

export interface ExtractPicOpts {
  originalPath: string;
  outputPath: string;
  id: string;
}

export function extractPic(opts: ExtractPicOpts): Pic {
  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const pic = decodePic(bytes, {
    id: opts.id,
    sourceFile: basename(opts.originalPath),
  });
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(pic, null, 2));
  return pic;
}
```

- [ ] **Step 5: Run extractor test**

```bash
pnpm --filter @wiz6/cli test tests/extractors/extract-pic.test.ts
```

Expected: green.

- [ ] **Step 6: Wire `pics` into the `wiz6 extract` subcommand**

Open `packages/cli/src/commands/extract.ts`. Find the existing `TypeName` and `ALL_TYPES`:

```typescript
type TypeName = 'fonts' | 'portraits' | 'screens' | 'messages' | 'newgame' | 'scenario';
const ALL_TYPES: TypeName[] = ['fonts', 'portraits', 'screens', 'messages', 'newgame', 'scenario'];
```

Change to:

```typescript
type TypeName = 'fonts' | 'portraits' | 'screens' | 'messages' | 'newgame' | 'scenario' | 'pics';
const ALL_TYPES: TypeName[] = ['fonts', 'portraits', 'screens', 'messages', 'newgame', 'scenario', 'pics'];
```

Add the import:

```typescript
import { extractPic } from '../extractors/extract-pic.js';
import { readdirSync as fsReaddirSync } from 'node:fs';
```

(Or check if `readdirSync` is already imported and reuse.)

Add a `case 'pics':` in `extractOneType` after the existing `scenario` case:

```typescript
    case 'pics': {
      const entries = fsReaddirSync(originalDir)
        .filter((f) => f.endsWith('.pic'))
        .sort();
      for (const f of entries) {
        const id = f.replace(/\.pic$/, '');
        const pic = extractPic({
          originalPath: join(originalDir, f),
          outputPath: join(extractedDir, 'pics', `${id}.json`),
          id,
        });
        io.write(
          `wrote ${extractedDir}/pics/${id}.json (${pic.segments.length} segments, ${pic.totalBytes} bytes)\n`,
        );
      }
      return;
    }
```

Update the USAGE constant:

```typescript
const USAGE = `usage: wiz6 extract <type|--all> [flags]

types:
  fonts        wfont0.ega (1bpp) + wfont1-4 (4bpp)
  portraits    wport1-3 (NPC portrait sets)
  screens      titlepag, graveyrd, dragonsc EGA screens
  messages     msg.dbs (Huffman-decoded text)
  newgame      newgame.dbs (character creation templates)
  scenario     scenario.dbs (XP tables, items, monsters, quest data)
  pics         mon00-mon58 + credits.pic (outer-envelope decoded; pixel rendering TBD)
  --all        extract all of the above

flags:
  --original <dir>    default ./original
  --extracted <dir>   default ./extracted
`;
```

- [ ] **Step 7: Update the existing extract.test.ts**

Open `packages/cli/tests/commands/extract.test.ts`. Find the beforeEach that copies real files:

```typescript
for (const f of ['scenario.dbs', 'newgame.dbs', 'msg.dbs']) {
  const src = join(REAL_ORIGINAL, f);
  if (existsSync(src)) copyFileSync(src, join(tmpDir, 'original', f));
}
```

Add `.pic` files:

```typescript
for (const f of ['scenario.dbs', 'newgame.dbs', 'msg.dbs', 'mon00.pic', 'mon01.pic']) {
  const src = join(REAL_ORIGINAL, f);
  if (existsSync(src)) copyFileSync(src, join(tmpDir, 'original', f));
}
```

Add a new test inside the existing `describe`:

```typescript
  it('extracts pics into extracted/pics/*.json', () => {
    const { code } = capture(['extract', 'pics'], tmpDir);
    expect(code).toBe(0);
    expect(existsSync(join(tmpDir, 'extracted/pics/mon00.json'))).toBe(true);
    expect(existsSync(join(tmpDir, 'extracted/pics/mon01.json'))).toBe(true);
  });
```

- [ ] **Step 8: Run all CLI tests**

```bash
pnpm --filter @wiz6/cli test 2>&1 | grep "Tests" | tail -3
```

Expected: green.

- [ ] **Step 9: Sanity check end-to-end**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-a
pnpm wiz6 extract pics 2>&1 | head -5
ls extracted/pics/ | head -10
wc -l extracted/pics/mon00.json extracted/pics/credits.json
```

Expected: 60 JSON files in `extracted/pics/`, each with sensible record counts.

- [ ] **Step 10: Commit**

```bash
git add packages/cli/src/extractors/extract-pic.ts packages/cli/src/commands/extract.ts packages/cli/tests/extractors/extract-pic.test.ts packages/cli/tests/commands/extract.test.ts
git commit -m "feat(cli): wiz6 extract pics — runs decodePic across all 60 .pic files"
```

---

## Task 4: Viewer `/pics` index + `/pics/:name` detail

Browse all `.pic` files. Index page: card grid of 60 entries showing filename + size + segment count. Detail page: per-segment table with header values + decoded byte-length + payload hex preview.

**Files:**
- Create: `packages/viewer/src/pages/pics/PicsIndex.tsx`
- Create: `packages/viewer/src/pages/pics/PicDetail.tsx`
- Create: `packages/viewer/src/pages/pics/PicsIndex.module.css`
- Create: `packages/viewer/src/lib/hooks/usePic.ts`
- Modify: `packages/viewer/src/router.tsx` — add `/pics` + `/pics/:name`
- Modify: `packages/viewer/src/components/TopNav.tsx` — add "Pics" link
- Modify: `packages/viewer/src/pages/Landing.tsx` — add a Pics section card
- Modify: `packages/viewer/tests/components/TopNav.test.tsx` — add Pics row
- Modify: `packages/viewer/tests/pages/Landing.test.tsx` — add Pics to expected labels
- Test: `packages/viewer/tests/pages/pics/PicsIndex.test.tsx`
- Test: `packages/viewer/tests/pages/pics/PicDetail.test.tsx`

- [ ] **Step 1: Implement the data-fetch hook**

Create `packages/viewer/src/lib/hooks/usePic.ts`:

```typescript
import { useEffect, useState } from 'react';
import { PicSchema, type Pic } from '@wiz6/data';

interface PicState {
  data: Pic | null;
  loading: boolean;
  error: Error | null;
}

export function usePic(id: string | null): PicState {
  const [state, setState] = useState<PicState>({ data: null, loading: !!id, error: null });

  useEffect(() => {
    if (!id) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/pics/${id}.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (text.trimStart().startsWith('<')) {
          throw new Error(
            `expected JSON at /pics/${id}.json but got HTML — run \`pnpm extract\` to generate extracted/ assets.`,
          );
        }
        const parsed = PicSchema.parse(JSON.parse(text));
        if (!cancelled) setState({ data: parsed, loading: false, error: null });
      } catch (err) {
        if (!cancelled) setState({ data: null, loading: false, error: err as Error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return state;
}
```

- [ ] **Step 2: Write the PicsIndex test**

Create `packages/viewer/tests/pages/pics/PicsIndex.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PicsIndex } from '../../../src/pages/pics/PicsIndex.js';

const SAMPLE_PIC = {
  id: 'mon00',
  sourceFile: 'mon00.pic',
  segments: [
    {
      segmentIndex: 0,
      encodedOffset: 0,
      encodedLength: 9,
      ops: [{ type: 'lit', bytes: [0x58, 0x02] }],
      decodedBytes: [0x58, 0x02],
      header: null,
    },
  ],
  totalBytes: 1166,
};

function renderIndex() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const id = url.replace(/^.*\/(.+)\.json$/, '$1');
      return new Response(JSON.stringify({ ...SAMPLE_PIC, id }), { status: 200 });
    }),
  );
  return render(
    <MemoryRouter initialEntries={['/pics']}>
      <PicsIndex />
    </MemoryRouter>,
  );
}

describe('PicsIndex', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders the h1', async () => {
    renderIndex();
    expect(screen.getByRole('heading', { level: 1, name: /pics/i })).toBeInTheDocument();
  });

  it('renders 60 cards (59 monster files + credits)', async () => {
    renderIndex();
    await waitFor(() => {
      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThanOrEqual(60);
    });
  });

  it('each card links to its detail page', async () => {
    renderIndex();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /mon00/i })).toHaveAttribute('href', '/pics/mon00');
      expect(screen.getByRole('link', { name: /credits/i })).toHaveAttribute('href', '/pics/credits');
    });
  });
});
```

- [ ] **Step 3: Write the PicDetail test**

Create `packages/viewer/tests/pages/pics/PicDetail.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PicDetail } from '../../../src/pages/pics/PicDetail.js';

const SAMPLE = {
  id: 'mon01',
  sourceFile: 'mon01.pic',
  segments: [
    {
      segmentIndex: 0,
      encodedOffset: 0,
      encodedLength: 10,
      ops: [
        { type: 'lit', bytes: [0x58, 0x02, 0x03, 0x05, 0xff, 0x7f] },
        { type: 'run', count: 18, fillByte: 0x00 },
      ],
      decodedBytes: [
        0x58, 0x02, 0x03, 0x05, 0xff, 0x7f,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ],
      header: { pos: 0x0258, width: 3, height: 5 },
    },
    {
      segmentIndex: 1,
      encodedOffset: 10,
      encodedLength: 4,
      ops: [{ type: 'lit', bytes: [0x12] }],
      decodedBytes: [0x12],
      header: null,
    },
  ],
  totalBytes: 4469,
};

function renderDetail(name = 'mon01') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith(`/pics/${name}.json`)) {
        return new Response(JSON.stringify(SAMPLE), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }),
  );
  return render(
    <MemoryRouter initialEntries={[`/pics/${name}`]}>
      <Routes>
        <Route path="/pics/:name" element={<PicDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PicDetail', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders the filename as h1', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /mon01/i })).toBeInTheDocument();
    });
  });

  it('renders the segment count + total bytes', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/2 segments/i)).toBeInTheDocument();
      expect(screen.getByText(/4,?469 bytes/i)).toBeInTheDocument();
    });
  });

  it('renders a row per segment', async () => {
    renderDetail();
    await waitFor(() => {
      const rows = screen.getAllByRole('row');
      // 2 segment rows + 1 header row
      expect(rows.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('renders the parsed header (pos, w, h) for segment 0', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/0x0258/i)).toBeInTheDocument();
      expect(screen.getByText(/^3\s*[×x]\s*5$/i)).toBeInTheDocument();
    });
  });

  it('shows "no header" for segments with header=null', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/no header/i)).toBeInTheDocument();
    });
  });

  it('shows decoded bytes as hex (first few)', async () => {
    renderDetail();
    await waitFor(() => {
      // The first segment's decoded bytes start 58 02 03 05 ff 7f
      expect(screen.getByText(/58 02 03 05/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 4: Run the tests to confirm both fail**

```bash
pnpm --filter @wiz6/viewer test tests/pages/pics/
```

Expected: both fail (modules don't exist).

- [ ] **Step 5: Create CSS**

Create `packages/viewer/src/pages/pics/PicsIndex.module.css`:

```css
.page {
  padding: var(--space-5);
  max-width: 1100px;
  margin: 0 auto;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.card {
  display: block;
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.85rem;
}

.card:hover {
  border-color: var(--color-accent);
  text-decoration: none;
}

.cardName {
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: var(--space-1);
}

.cardMeta {
  color: var(--color-text-faint);
  font-size: 0.78rem;
}

.detailWrapper {
  padding: var(--space-5);
  max-width: 1100px;
  margin: 0 auto;
}

.summary {
  color: var(--color-text-muted);
  margin-bottom: var(--space-4);
  font-family: var(--font-mono);
  font-size: 0.92rem;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 0.85rem;
}

.table th {
  text-align: left;
  padding: var(--space-1) var(--space-2);
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.table td {
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
}

.decodedHex {
  color: var(--color-text-faint);
  word-break: break-all;
  max-width: 400px;
}

.noHeader {
  color: var(--color-text-faint);
  font-style: italic;
}

.backLink {
  display: inline-block;
  margin-bottom: var(--space-3);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.85rem;
}

.error {
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  color: var(--color-element-fire);
}
```

- [ ] **Step 6: Implement PicsIndex**

Create `packages/viewer/src/pages/pics/PicsIndex.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './PicsIndex.module.css';

const PIC_NAMES = [
  'credits',
  ...Array.from({ length: 59 }, (_, i) => `mon${i.toString().padStart(2, '0')}`),
];

interface Summary {
  id: string;
  segmentCount: number;
  totalBytes: number;
  error?: string;
}

export function PicsIndex() {
  const [summaries, setSummaries] = useState<Summary[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results: Summary[] = [];
      for (const name of PIC_NAMES) {
        try {
          const res = await fetch(`/pics/${name}.json`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          if (text.trimStart().startsWith('<')) {
            results.push({ id: name, segmentCount: 0, totalBytes: 0, error: 'not extracted' });
            continue;
          }
          const json = JSON.parse(text);
          results.push({
            id: name,
            segmentCount: Array.isArray(json.segments) ? json.segments.length : 0,
            totalBytes: typeof json.totalBytes === 'number' ? json.totalBytes : 0,
          });
        } catch (err) {
          results.push({
            id: name,
            segmentCount: 0,
            totalBytes: 0,
            error: (err as Error).message,
          });
        }
      }
      if (!cancelled) setSummaries(results);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.page}>
      <h1>Pics</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        Outer-envelope decoded view of the 59 monster sprite files and{' '}
        <code>credits.pic</code>. Each file decodes into 1-4 segments via the
        LIT/RUN/END opcodes documented in <code>docs/re/pic.md</code>. Pixel
        rendering is Stage B — these views show decoded byte buffers as hex.
      </p>
      <div className={styles.grid}>
        {summaries.map((s) => (
          <Link key={s.id} className={styles.card} to={`/pics/${s.id}`}>
            <div className={styles.cardName}>{s.id}</div>
            <div className={styles.cardMeta}>
              {s.error ? s.error : `${s.segmentCount} segments · ${s.totalBytes.toLocaleString()} bytes`}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Implement PicDetail**

Create `packages/viewer/src/pages/pics/PicDetail.tsx`:

```typescript
import { Link, useParams } from 'react-router-dom';
import { usePic } from '../../lib/hooks/usePic.js';
import styles from './PicsIndex.module.css';

function toHex(b: number): string {
  return b.toString(16).padStart(2, '0');
}

function bytesHex(bs: readonly number[], max = 32): string {
  const slice = bs.slice(0, max).map(toHex).join(' ');
  return bs.length > max ? `${slice} … (+${bs.length - max} more)` : slice;
}

export function PicDetail() {
  const { name } = useParams<{ name: string }>();
  const { data, loading, error } = usePic(name ?? null);

  if (loading) return <p className={styles.detailWrapper}>loading…</p>;
  if (error)
    return (
      <main className={styles.detailWrapper}>
        <Link to="/pics" className={styles.backLink}>
          ← back to pics
        </Link>
        <div className={styles.error}>{error.message}</div>
      </main>
    );
  if (!data) return null;

  return (
    <main className={styles.detailWrapper}>
      <Link to="/pics" className={styles.backLink}>
        ← back to pics
      </Link>
      <h1>{data.id}</h1>
      <p className={styles.summary}>
        {data.segments.length.toLocaleString()} segments · {data.totalBytes.toLocaleString()} bytes
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>encoded</th>
            <th>header</th>
            <th>ops</th>
            <th>decoded len</th>
            <th>decoded bytes (hex)</th>
          </tr>
        </thead>
        <tbody>
          {data.segments.map((seg) => (
            <tr key={seg.segmentIndex}>
              <td>{seg.segmentIndex}</td>
              <td>
                @{seg.encodedOffset.toLocaleString()} · {seg.encodedLength}B
              </td>
              <td>
                {seg.header ? (
                  <>
                    pos 0x{seg.header.pos.toString(16).padStart(4, '0')} ·{' '}
                    {seg.header.width} × {seg.header.height}
                  </>
                ) : (
                  <span className={styles.noHeader}>no header</span>
                )}
              </td>
              <td>
                {seg.ops
                  .map((o) =>
                    o.type === 'lit'
                      ? `L${o.bytes.length}`
                      : `R${o.count}×${toHex(o.fillByte)}`,
                  )
                  .join(' ')}
              </td>
              <td>{seg.decodedBytes.length}</td>
              <td className={styles.decodedHex}>{bytesHex(seg.decodedBytes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 8: Wire routes**

Open `packages/viewer/src/router.tsx`. Add lazy imports:

```typescript
const PicsIndex = lazy(() =>
  import('./pages/pics/PicsIndex.js').then((m) => ({ default: m.PicsIndex })),
);
const PicDetail = lazy(() =>
  import('./pages/pics/PicDetail.js').then((m) => ({ default: m.PicDetail })),
);
```

Add the routes inside the `routes` fragment:

```typescript
    <Route path="/pics" element={<PicsIndex />} />
    <Route path="/pics/:name" element={<PicDetail />} />
```

- [ ] **Step 9: Add TopNav link**

Open `packages/viewer/src/components/TopNav.tsx`. Add to the `SECTIONS` array:

```typescript
  { label: 'Pics', to: '/pics' },
```

Open `packages/viewer/tests/components/TopNav.test.tsx`. The existing `it.each` over section labels needs a new row:

```typescript
    ['Pics', '/pics'],
```

- [ ] **Step 10: Add Landing section card**

Open `packages/viewer/src/pages/Landing.tsx`. Add to the `SECTIONS` array:

```typescript
  {
    title: 'Pics',
    to: '/pics',
    description: '59 monster sprite files + credits — outer-envelope decoded (pixel rendering Stage B).',
    meta: '60 files',
  },
```

Open `packages/viewer/tests/pages/Landing.test.tsx`. The existing list of expected section labels needs `'Pics'` added.

- [ ] **Step 11: Run all viewer tests**

```bash
pnpm --filter @wiz6/viewer test 2>&1 | grep "Tests" | tail -3
```

Expected: green. Total should grow by ~10 (Pics tests + 1 each for TopNav and Landing).

- [ ] **Step 12: Sanity check via dev server**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-a
pnpm wiz6 extract pics 2>&1 | tail -3
ls extracted/pics/ | wc -l
```

Expected: 60 files in `extracted/pics/`.

```bash
pnpm dev:viewer > /tmp/wiz6-pic-dev.log 2>&1 &
DEV_PID=$!
sleep 3
PORT=$(grep -oE 'localhost:[0-9]+' /tmp/wiz6-pic-dev.log | head -1 | sed 's/localhost://')
curl -fsS http://localhost:$PORT/pics/mon00.json | head -3
kill $DEV_PID
```

Expected: JSON served via Vite publicDir.

- [ ] **Step 13: Commit**

```bash
git add packages/viewer/src/pages/pics/ packages/viewer/src/lib/hooks/usePic.ts packages/viewer/src/router.tsx packages/viewer/src/components/TopNav.tsx packages/viewer/src/pages/Landing.tsx packages/viewer/tests/pages/pics/ packages/viewer/tests/components/TopNav.test.tsx packages/viewer/tests/pages/Landing.test.tsx
git commit -m "feat(viewer): /pics index + /pics/:name detail (segments + hex preview)"
```

---

## Task 5: Final smoke + deploy cycle

- [ ] **Step 1: Full tests**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-a
pnpm -r test 2>&1 | grep "Tests" | tail -5
```

Expected: 82 + (9 new data) + (9 new parser) + (~2 new cli) + (~10 new viewer) ≈ 540+ total.

- [ ] **Step 2: Typecheck + build**

```bash
pnpm -r typecheck 2>&1 | tail -3
pnpm -r build 2>&1 | tail -5
```

Expected: green.

- [ ] **Step 3: Merge to main + push**

```bash
cd ~/Projects/ndouglas/wiz6
git checkout main
git merge stage-pic-a --no-ff -m "Merge .pic Stage A: outer decoder + structural viewer

Implements the LIT/RUN/END opcode stream documented in docs/re/pic.md
(disassembled from the EGA graphics driver). New PicSchema in
@wiz6/data, decodePic in @wiz6/parser (60/60 files clean), extractPic
+ wiz6 extract pics in @wiz6/cli, /pics index + /pics/:name detail
in @wiz6/viewer.

Pixel rendering is Stage B — payload bytes are exposed as hex for
inspection."
pnpm -r test 2>&1 | grep "Tests" | tail -5
git push origin main 2>&1 | tail -3
git worktree remove --force ~/.config/superpowers/worktrees/wiz6/stage-pic-a
git worktree prune
git branch -d stage-pic-a
```

- [ ] **Step 4: Wait for GH Actions build**

```bash
sleep 10
RUN_ID=$(gh run list --workflow=build-image.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status --interval 30 2>&1 | tail -5
NEW_SHA=$(gh api /users/ndouglas/packages/container/wiz6/versions --jq '.[0].metadata.container.tags[]' 2>/dev/null | grep '^sha-' | head -1)
[ -z "$NEW_SHA" ] && NEW_SHA=$(gh api /user/packages/container/wiz6/versions --jq '.[0].metadata.container.tags[]' 2>/dev/null | grep '^sha-' | head -1)
echo "new SHA: $NEW_SHA"
```

- [ ] **Step 5: Bump goldentooth + reconcile + verify**

```bash
cd ~/Projects/goldentooth/gitops
git pull
cat apps/wiz6/deployment.yaml | grep "image:"
```

Use the `Edit` tool to swap the image SHA. Then:

```bash
git diff apps/wiz6/deployment.yaml
git add apps/wiz6/deployment.yaml
git commit -m "chore(wiz6): bump image to pick up .pic Stage A (outer decoder + viewer)"
git push origin main 2>&1 | tail -3
flux reconcile kustomization apps --with-source --timeout=2m 2>&1 | tail -3
flux reconcile kustomization wiz6 --with-source --timeout=2m 2>&1 | tail -3
sleep 5
kubectl rollout status deployment/wiz6 -n wiz6 --timeout=2m 2>&1 | tail -3
curl -fsSk -o /dev/null -w "/pics: %{http_code}\n" https://wiz6.goldentooth.net/pics
curl -fsSk -o /dev/null -w "/pics/mon00: %{http_code}\n" https://wiz6.goldentooth.net/pics/mon00
curl -fsSk -o /dev/null -w "pics/mon00.json: %{http_code} %{size_download} bytes\n" https://wiz6.goldentooth.net/pics/mon00.json
```

Expected: all 200s; mon00.json is non-trivial size.

---

## Out of scope (continues in Stage B)

- Pixel decoding of segment `decodedBytes` past the 4-byte header
- `combatSpriteId` → `monNN.pic` indirection table (needs `wroot.exe` disassembly)
- Composition of multi-segment files into a single bitmap

## Notes for Stage B planning

After Stage A ships, `extracted/pics/*.json` becomes the canonical input for Stage B's pixel-decoding experiments. Each segment provides:

- `header.pos` — destination buffer offset (likely the EGA framebuffer or a sprite-atlas offset)
- `header.width`, `header.height` — sprite dimensions
- `decodedBytes` slice `[4..]` — the bitmap payload (still uncertain: 1bpp packed? 4bpp planar? 4bpp packed? mask + color?)

Stage B should:

1. Build candidate renderers (1bpp packed, 4bpp planar, 4bpp packed) as pure functions over a `(header, payload)` pair.
2. Render `mon05` segment 0 (W=2, H=1, smallest) and 2-3 other simple sprites under each candidate; produce side-by-side canvases.
3. User picks which interpretation matches expectation.
4. Lock in the chosen encoding; expand the schema with decoded pixel arrays.
5. Update `PicDetail` to render the assembled sprite per segment.
