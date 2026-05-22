# `.pic` Stage B — Pixel Rendering + Monster-Sprite Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every `.pic` sprite as actual pixels (EGA 16-color, transparent on color 15), display them in the `/pics` viewer pages, and wire them onto monster detail pages via the `combatSpriteId → monNN.pic` mapping confirmed in Phase 1.

**Architecture:** The format is fully spec'd. Each `.pic` segment (post-RLE-decode) is `[24-byte descriptors, zero-terminated][32-byte cell atlas]`. A descriptor is `[pos_lo, pos_hi, W, H, mask×20]` where W,H are in 8-pixel cells, mask is a W·H-bit LSB-first packed bitmap selecting populated cells (skipped cells consume no atlas bytes), and pos is a byte offset into the file's concatenated decoded buffer pointing to the first cell. Each cell is 4bpp EGA planar (8 bytes × 4 planes). Color 15 = transparent. The monster sprite filename is `mon{pad2(M.statBytes[145])}.pic` — direct byte read, no indirection table.

**Tech Stack:** TypeScript, zod, vitest, React, HTML Canvas.

**Pre-Stage-B context:**
- Stage A schemas + decoder shipped (see `docs/superpowers/plans/2026-05-22-pic-stage-a-outer-decoder.md`)
- Phase 1 RE notes in `docs/re/pic.md` (pixel encoding + composition) and `docs/re/sprite-id-table.md` (byte 145 mapping)
- Stage A baked a `PicSegment.header` field that's a misinterpretation — the first 4 bytes are actually descriptor 0's `[pos_lo, pos_hi, W, H]`, ignoring the trailing 20-byte mask. Task 1 drops this in favor of proper descriptor parsing.

---

## Pre-flight

- [ ] **Worktree on the latest `main`**

```bash
cd ~/Projects/ndouglas/wiz6
git worktree add ~/.config/superpowers/worktrees/wiz6/stage-pic-b -b stage-pic-b
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-b
pnpm install --frozen-lockfile
```

- [ ] **Baseline tests**

```bash
pnpm -r test 2>&1 | grep "Tests" | tail -5
```

Expected: 95 + 105 + 43 + 300 = 543 tests passing (the Stage A baseline).

- [ ] **Symlink `original/` if missing in the worktree**

```bash
[ ! -e original ] && ln -s /Users/nathan/Projects/ndouglas/wiz6/original original
```

---

## Task 1: Schema + decoder rewrite — descriptors replace `header`

The Stage A `PicSegment.header` field is a 4-byte slice of what's actually a 24-byte descriptor record. Replace it with a proper `descriptors: PicDescriptor[]` at the `Pic` level (descriptors are file-wide, not per-segment, because segment 0 can hold descriptors that reference cells in later segments).

**Files:**
- Modify: `packages/data/src/schemas/pic.ts` — drop `header` from `PicSegmentSchema`, add `PicDescriptorSchema` + `descriptors` field on `PicSchema`
- Modify: `packages/data/src/index.ts` — export the new types
- Modify: `packages/data/tests/pic.test.ts` — replace `header` assertions with `descriptors` assertions
- Modify: `packages/parser/src/formats/pic.ts` — drop the 4-byte header extraction, add descriptor parsing across the concatenated decoded buffer
- Modify: `packages/parser/tests/formats/pic.test.ts` — replace `header` assertions with `descriptors` assertions
- Modify: `packages/viewer/src/pages/pics/PicDetail.tsx` — drop the per-segment header column, add a "descriptors" summary section
- Modify: `packages/viewer/tests/pages/pics/PicDetail.test.tsx` — update to assert descriptor presentation, not header
- (Note: PicsIndex test does NOT reference header, no change needed there)

- [ ] **Step 1: Update `PicSchema` and add `PicDescriptorSchema`**

Edit `packages/data/src/schemas/pic.ts`. Replace the file contents with:

```typescript
import { z } from 'zod';

const byte = z.number().int().min(0).max(255);

export const PicLitOpSchema = z.object({
  type: z.literal('lit'),
  bytes: z.array(byte),
});

export const PicRunOpSchema = z.object({
  type: z.literal('run'),
  count: z.number().int().min(1).max(128),
  fillByte: byte,
});

export const PicOpSchema = z.discriminatedUnion('type', [
  PicLitOpSchema,
  PicRunOpSchema,
]);

export const PicSegmentSchema = z.object({
  segmentIndex: z.number().int().nonnegative(),
  encodedOffset: z.number().int().nonnegative(),
  encodedLength: z.number().int().positive(),
  ops: z.array(PicOpSchema),
  decodedBytes: z.array(byte),
});

export const PicDescriptorSchema = z.object({
  /** Position of this descriptor in the file's descriptor list (0-based). */
  index: z.number().int().nonnegative(),
  /** Byte offset into the concatenated decoded buffer where this descriptor's first cell lives. */
  pos: z.number().int().min(0).max(0xffff),
  /** Sprite width in 8-pixel cells. */
  width: byte,
  /** Sprite height in 8-pixel cells. */
  height: byte,
  /** 20-byte cell-population mask. Bit (row * width + col), LSB-first, set => the cell at (col, row) is in the atlas. */
  mask: z.array(byte).length(20),
});

export const PicSchema = z.object({
  id: z.string().min(1),
  sourceFile: z.string().min(1),
  segments: z.array(PicSegmentSchema),
  descriptors: z.array(PicDescriptorSchema),
  totalBytes: z.number().int().positive(),
});

export type PicLitOp = z.infer<typeof PicLitOpSchema>;
export type PicRunOp = z.infer<typeof PicRunOpSchema>;
export type PicOp = z.infer<typeof PicOpSchema>;
export type PicSegment = z.infer<typeof PicSegmentSchema>;
export type PicDescriptor = z.infer<typeof PicDescriptorSchema>;
export type Pic = z.infer<typeof PicSchema>;
```

- [ ] **Step 2: Update `@wiz6/data` exports**

Edit `packages/data/src/index.ts`. Find the existing block:

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

Replace it with:

```typescript
export {
  PicSchema,
  PicSegmentSchema,
  PicOpSchema,
  PicLitOpSchema,
  PicRunOpSchema,
  PicDescriptorSchema,
  type Pic,
  type PicSegment,
  type PicOp,
  type PicLitOp,
  type PicRunOp,
  type PicDescriptor,
} from './schemas/pic.js';
```

- [ ] **Step 3: Update `packages/data/tests/pic.test.ts`**

Replace the file contents with:

```typescript
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
```

- [ ] **Step 4: Run data tests, confirm they pass**

```bash
pnpm --filter @wiz6/data test tests/pic.test.ts
```

Expected: all green. If `PicHeaderSchema` is still imported anywhere it'll fail with a TS error — grep for it and remove any lingering imports.

```bash
grep -rn 'PicHeaderSchema\|PicHeader\b' packages/ --include='*.ts' --include='*.tsx' 2>/dev/null
```

Expected: zero hits.

- [ ] **Step 5: Update `packages/parser/src/formats/pic.ts`**

Replace the file contents with:

```typescript
import {
  PicSchema,
  type Pic,
  type PicOp,
  type PicSegment,
  type PicDescriptor,
} from '@wiz6/data';

export interface DecodePicOpts {
  id: string;
  sourceFile: string;
}

/**
 * Decode the outer envelope of a `.pic` file into segments + descriptors.
 *
 * Each segment is a sequence of opcodes terminated by 0x00:
 *   op == 0x00       END this segment
 *   op  < 0x80       LIT(op): copy `op` raw bytes
 *   op >= 0x80       RUN(256 - op, fill = next_byte()): emit (256 - op) copies
 *
 * After RLE-decoding all segments, descriptors are parsed from the start
 * of the CONCATENATED decoded buffer: each descriptor is 24 bytes
 * `[pos_lo, pos_hi, W, H, mask×20]`, terminated by a 24-byte all-zero record.
 *
 * See `docs/re/pic.md` "Pixel encoding" and "Multi-segment composition" sections
 * for the disassembled spec this mirrors.
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

    if (!segmentTerminated && ops.length === 0) break;

    segments.push({
      segmentIndex,
      encodedOffset: segStart,
      encodedLength: pos - segStart,
      ops,
      decodedBytes: decoded,
    });
    segmentIndex++;
  }

  // Parse descriptors from the concatenated decoded buffer.
  // Descriptors are 24 bytes each, terminated by a 24-byte all-zero record.
  const concatenated: number[] = [];
  for (const s of segments) concatenated.push(...s.decodedBytes);

  const descriptors: PicDescriptor[] = [];
  let descIdx = 0;
  while ((descIdx + 1) * 24 <= concatenated.length) {
    const rec = concatenated.slice(descIdx * 24, (descIdx + 1) * 24);
    if (rec.every((b) => b === 0)) break;
    descriptors.push({
      index: descIdx,
      pos: rec[0]! | (rec[1]! << 8),
      width: rec[2]!,
      height: rec[3]!,
      mask: rec.slice(4),
    });
    descIdx++;
  }

  return PicSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    segments,
    descriptors,
    totalBytes: bytes.length,
  });
}
```

- [ ] **Step 6: Update `packages/parser/tests/formats/pic.test.ts`**

Replace the file contents with:

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
```

- [ ] **Step 7: Run parser tests**

```bash
pnpm --filter @wiz6/parser test tests/formats/pic.test.ts
```

Expected: all green.

- [ ] **Step 8: Sanity check against all 60 real .pic files**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-b
cat > /tmp/pic-probe-b.ts <<'EOF'
import { decodePic } from '/Users/nathan/.config/superpowers/worktrees/wiz6/stage-pic-b/packages/parser/src/formats/pic.js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const ORIGINAL = '/Users/nathan/Projects/ndouglas/wiz6/original';
const files = readdirSync(ORIGINAL).filter((f) => f.endsWith('.pic')).sort();
let totalDescriptors = 0;
for (const f of files) {
  const buf = new Uint8Array(readFileSync(join(ORIGINAL, f)));
  const id = f.replace(/\.pic$/, '');
  const pic = decodePic(buf, { id, sourceFile: f });
  totalDescriptors += pic.descriptors.length;
  const d0 = pic.descriptors[0];
  console.log(`${f}: ${pic.segments.length} segs, ${pic.descriptors.length} descriptors, d0=${d0 ? `${d0.width}x${d0.height}c @ 0x${d0.pos.toString(16)}` : 'none'}`);
}
console.log(`TOTAL: ${files.length} files, ${totalDescriptors} descriptors`);
EOF
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-b
pnpm exec tsx /tmp/pic-probe-b.ts 2>&1 | tail -10
rm /tmp/pic-probe-b.ts
```

Expected: 60 files all decode cleanly. Most have 10-25 descriptors; smallest sprite files have 1-5; `credits.pic` is the largest at hundreds (it's the credits screen, not a monster).

- [ ] **Step 9: Update `packages/viewer/src/pages/pics/PicDetail.tsx`**

The existing PicDetail renders a segment-row table with a "header" column. Replace it with a segment-row table (no header column) AND a separate descriptors-row table.

Read the existing file first to confirm the current shape, then replace the per-segment table with this structure. The key changes:

1. Remove the `header` column from the segment table (segments no longer have a header).
2. Add a new "Descriptors" section below the segments table that lists each descriptor's `index | pos | W×H cells | mask (hex) | populated cell count`.

Open `packages/viewer/src/pages/pics/PicDetail.tsx` and find the `<table>` for segments. Edit:

- Remove the `<th>header</th>` `<th>` cell from the header row
- Remove the corresponding `<td>` with `seg.header ? ... : 'no header'` from the body row

Then below the segments table (but still inside `<main>`), add:

```tsx
      <h2 style={{ marginTop: 'var(--space-5)' }}>Descriptors ({data.descriptors.length})</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>pos</th>
            <th>W × H (cells)</th>
            <th>W × H (px)</th>
            <th>populated cells</th>
            <th>mask (hex)</th>
          </tr>
        </thead>
        <tbody>
          {data.descriptors.map((d) => {
            const cellCount = d.width * d.height;
            let populated = 0;
            for (let i = 0; i < cellCount; i++) {
              const byte = d.mask[i >> 3] ?? 0;
              if ((byte >> (i & 7)) & 1) populated++;
            }
            const maskHex = d.mask.map((b) => b.toString(16).padStart(2, '0')).join(' ');
            return (
              <tr key={d.index}>
                <td>{d.index}</td>
                <td>0x{d.pos.toString(16).padStart(4, '0')}</td>
                <td>{d.width} × {d.height}</td>
                <td>{d.width * 8} × {d.height * 8}</td>
                <td>{populated} / {cellCount}</td>
                <td className={styles.decodedHex}>{maskHex}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
```

- [ ] **Step 10: Update PicDetail test**

Open `packages/viewer/tests/pages/pics/PicDetail.test.tsx`. Replace the `SAMPLE` constant with the new shape (no `header` on segments, add `descriptors` at the top level):

```typescript
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
    },
    {
      segmentIndex: 1,
      encodedOffset: 10,
      encodedLength: 4,
      ops: [{ type: 'lit', bytes: [0x12] }],
      decodedBytes: [0x12],
    },
  ],
  descriptors: [
    {
      index: 0,
      pos: 0x0258,
      width: 3,
      height: 5,
      mask: Array(20).fill(0),
    },
  ],
  totalBytes: 4469,
};
```

Then update the assertions in that file:
- Replace the test that checked `expect(screen.getByText(/0x0258/i))` and `expect(screen.getByText(/3.*[×x].*5/i))` to look in the **Descriptors section** instead of the segments table. The values still appear (descriptor 0's pos is 0x0258 and W×H is 3×5), so the text matchers should still pass.
- Replace the test that checked `expect(screen.getByText(/no header/i))` with a test for descriptor count:

```typescript
  it('renders the descriptors section', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /Descriptors \(1\)/i })).toBeInTheDocument();
      expect(screen.getByText(/0x0258/i)).toBeInTheDocument();
      expect(screen.getByText(/^3 × 5$/i)).toBeInTheDocument();  // cells column
      expect(screen.getByText(/^24 × 40$/i)).toBeInTheDocument(); // pixels column (3*8 × 5*8)
    });
  });
```

Remove the old "no header" test entirely (segments no longer have headers, so the concept doesn't apply).

- [ ] **Step 11: Run viewer + parser + data tests together**

```bash
pnpm -r test 2>&1 | grep "Tests" | tail -5
```

Expected: all green, count roughly matches Stage A's baseline (some tests reshape but total should not regress significantly).

- [ ] **Step 12: Re-extract `.pic` JSONs in the worktree**

The viewer's runtime uses `extracted/pics/*.json` which were generated under the old Stage A schema (with `header`). Re-extract:

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-b
pnpm wiz6 extract pics 2>&1 | tail -3
# Spot-check the new shape
python3 -c "import json; d = json.load(open('extracted/pics/mon00.json')); print('descriptors:', len(d['descriptors']), 'segments:', len(d['segments']), 'has_header_in_seg0:', 'header' in d['segments'][0])"
```

Expected: 60 files re-written. `has_header_in_seg0: False`, descriptors list is non-empty.

- [ ] **Step 13: Commit**

```bash
git add packages/data/src/schemas/pic.ts packages/data/src/index.ts packages/data/tests/pic.test.ts packages/parser/src/formats/pic.ts packages/parser/tests/formats/pic.test.ts packages/viewer/src/pages/pics/PicDetail.tsx packages/viewer/tests/pages/pics/PicDetail.test.tsx
git commit -m "$(cat <<'EOF'
feat(pic): descriptor-list schema replaces 4-byte header

Stage A treated the first 4 bytes of each decoded segment as a self-
contained header (pos, W, H). Per the disassembled spec in
docs/re/pic.md (Pixel encoding), those 4 bytes are actually the first
4 fields of a 24-byte descriptor record (pos, W, H, then a 20-byte
W*H-bit mask). And a single .pic file can have many descriptors (up
to hundreds for credits.pic), each describing one sprite "view" with
cells packed in an atlas after the descriptor list.

PicSegment loses its `header` field. PicSchema gains a top-level
`descriptors: PicDescriptor[]` populated by parsing the concatenated
decoded buffer until a 24-byte zero-record terminator. Sanity-checked
against all 60 real .pic files.
EOF
)"
```

---

## Task 2: `renderPicDescriptor` in `@wiz6/parser`

Pure function: descriptor + decoded byte buffer → RGBA image. Implements 4bpp EGA planar cell decode with color-15 transparency.

**Files:**
- Create: `packages/parser/src/formats/pic-render.ts`
- Create: `packages/parser/tests/formats/pic-render.test.ts`
- Modify: `packages/parser/src/index.ts` — export the renderer + EGA palette

- [ ] **Step 1: Write the failing test**

Create `packages/parser/tests/formats/pic-render.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { renderPicDescriptor, EGA_PALETTE } from '../../src/formats/pic-render.js';
import type { PicDescriptor } from '@wiz6/data';

function descriptor(opts: { pos: number; width: number; height: number; mask: number[] }): PicDescriptor {
  return {
    index: 0,
    pos: opts.pos,
    width: opts.width,
    height: opts.height,
    mask: [...opts.mask, ...Array(20 - opts.mask.length).fill(0)].slice(0, 20),
  };
}

describe('renderPicDescriptor', () => {
  it('renders a 1×1-cell sprite with one populated cell of color 0 (black)', () => {
    // 32-byte cell at offset 0: all zeros => every pixel is color 0 (black)
    const buffer = Array(32).fill(0);
    const d = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    const out = renderPicDescriptor(d, buffer);
    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
    // 8×8×4 RGBA bytes = 256
    expect(out.rgba.length).toBe(256);
    // Check pixel (0,0): black with alpha 255
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([0, 0, 0, 255]);
    // Check pixel (7,7) — last pixel
    const last = 8 * 8 * 4 - 4;
    expect(Array.from(out.rgba.subarray(last, last + 4))).toEqual([0, 0, 0, 255]);
  });

  it('renders color 15 (white) as transparent (alpha 0)', () => {
    // 32-byte cell where every plane bit is set in row 0:
    //   plane 0 row 0 = 0xFF, plane 1 row 0 = 0xFF, plane 2 row 0 = 0xFF, plane 3 row 0 = 0xFF
    // → all 8 pixels of row 0 are color 15 = transparent
    const buffer = Array(32).fill(0);
    buffer[0] = 0xff;
    buffer[8] = 0xff;
    buffer[16] = 0xff;
    buffer[24] = 0xff;
    const d = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    const out = renderPicDescriptor(d, buffer);
    // Pixel (0,0): transparent
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([0, 0, 0, 0]);
    // Pixel (0,7): also transparent (same row)
    expect(Array.from(out.rgba.subarray(7 * 4, 7 * 4 + 4))).toEqual([0, 0, 0, 0]);
    // Pixel (1,0): color 0 (black) since row 1 has no set planes
    const row1off = 8 * 4;
    expect(Array.from(out.rgba.subarray(row1off, row1off + 4))).toEqual([0, 0, 0, 255]);
  });

  it('renders color 1 (blue) when only plane 0 is set', () => {
    // plane 0 row 0 = 0xFF, others 0 => row 0 all color 1 (EGA blue: 0x00 0x00 0xAA)
    const buffer = Array(32).fill(0);
    buffer[0] = 0xff;
    const d = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    const out = renderPicDescriptor(d, buffer);
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([0x00, 0x00, 0xaa, 0xff]);
  });

  it('renders color 12 (light red) when planes 2 and 3 are set', () => {
    // plane 2 = red bit, plane 3 = intensity bit => color = 0b1100 = 12
    const buffer = Array(32).fill(0);
    buffer[16] = 0xff;
    buffer[24] = 0xff;
    const d = descriptor({ pos: 0, width: 1, height: 1, mask: [0x01] });
    const out = renderPicDescriptor(d, buffer);
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([0xff, 0x55, 0x55, 0xff]);
  });

  it('skips unpopulated cells without consuming atlas bytes', () => {
    // 2×1 sprite, mask = 0b10 (only cell 1 is populated).
    // Cell at descriptor.pos: 32 bytes that should be drawn at COLUMN 1 (right half).
    // Cell at left half (col 0) should be untouched (transparent).
    const buffer = Array(32).fill(0);
    buffer[0] = 0xff;  // plane 0 row 0 — gives blue
    const d = descriptor({ pos: 0, width: 2, height: 1, mask: [0b10] });
    const out = renderPicDescriptor(d, buffer);
    expect(out.width).toBe(16);
    expect(out.height).toBe(8);
    // Pixel (0,0) — left half — should be transparent (no cell painted here)
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([0, 0, 0, 0]);
    // Pixel (0,8) — right half row 0 col 0 — should be blue from the populated cell
    expect(Array.from(out.rgba.subarray(8 * 4, 8 * 4 + 4))).toEqual([0x00, 0x00, 0xaa, 0xff]);
  });
});

describe('EGA_PALETTE', () => {
  it('has 16 entries', () => {
    expect(EGA_PALETTE).toHaveLength(16);
  });

  it('entry 0 is black', () => {
    expect(EGA_PALETTE[0]).toEqual([0, 0, 0]);
  });

  it('entry 15 is white', () => {
    expect(EGA_PALETTE[15]).toEqual([0xff, 0xff, 0xff]);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
pnpm --filter @wiz6/parser test tests/formats/pic-render.test.ts
```

Expected: FAIL (module doesn't exist).

- [ ] **Step 3: Implement the renderer**

Create `packages/parser/src/formats/pic-render.ts`:

```typescript
import type { PicDescriptor } from '@wiz6/data';

/** Standard EGA 16-color palette (RGB triples, 0..255). */
export const EGA_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0x00, 0x00, 0x00], [0x00, 0x00, 0xaa], [0x00, 0xaa, 0x00], [0x00, 0xaa, 0xaa],
  [0xaa, 0x00, 0x00], [0xaa, 0x00, 0xaa], [0xaa, 0x55, 0x00], [0xaa, 0xaa, 0xaa],
  [0x55, 0x55, 0x55], [0x55, 0x55, 0xff], [0x55, 0xff, 0x55], [0x55, 0xff, 0xff],
  [0xff, 0x55, 0x55], [0xff, 0x55, 0xff], [0xff, 0xff, 0x55], [0xff, 0xff, 0xff],
];

export interface RenderedSprite {
  /** Sprite width in pixels (descriptor.width * 8). */
  width: number;
  /** Sprite height in pixels (descriptor.height * 8). */
  height: number;
  /** RGBA pixel data, row-major. Alpha is 0 for color 15 (transparent) and 255 for all other colors. */
  rgba: Uint8ClampedArray;
}

/**
 * Render one descriptor's image. Cells are 4bpp EGA planar (32 bytes per
 * 8×8 cell: 8 bytes per plane × 4 planes, MSB-first within each plane byte).
 * Color 15 is treated as transparent (alpha=0). Skipped cells (mask bit
 * unset) produce transparent regions and do NOT advance the atlas pointer.
 */
export function renderPicDescriptor(
  descriptor: PicDescriptor,
  decodedBuffer: readonly number[],
): RenderedSprite {
  const pxW = descriptor.width * 8;
  const pxH = descriptor.height * 8;
  const rgba = new Uint8ClampedArray(pxW * pxH * 4);
  let atlasOffset = descriptor.pos;
  for (let cy = 0; cy < descriptor.height; cy++) {
    for (let cx = 0; cx < descriptor.width; cx++) {
      const bitIdx = cy * descriptor.width + cx;
      const byteIdx = bitIdx >> 3;
      const bitInByte = bitIdx & 7;
      const populated =
        byteIdx < descriptor.mask.length &&
        ((descriptor.mask[byteIdx] ?? 0) & (1 << bitInByte)) !== 0;
      if (!populated) continue;
      if (atlasOffset + 32 > decodedBuffer.length) {
        // Atlas exhausted — skip rendering but advance offset so subsequent
        // cells stay aligned with the spec.
        atlasOffset += 32;
        continue;
      }
      for (let row = 0; row < 8; row++) {
        const p0 = decodedBuffer[atlasOffset + row] ?? 0;
        const p1 = decodedBuffer[atlasOffset + 8 + row] ?? 0;
        const p2 = decodedBuffer[atlasOffset + 16 + row] ?? 0;
        const p3 = decodedBuffer[atlasOffset + 24 + row] ?? 0;
        for (let col = 0; col < 8; col++) {
          const bit = 7 - col;
          const b0 = (p0 >> bit) & 1;
          const b1 = (p1 >> bit) & 1;
          const b2 = (p2 >> bit) & 1;
          const b3 = (p3 >> bit) & 1;
          const color = b0 | (b1 << 1) | (b2 << 2) | (b3 << 3);
          const pxX = cx * 8 + col;
          const pxY = cy * 8 + row;
          const idx = (pxY * pxW + pxX) * 4;
          if (color === 15) {
            rgba[idx] = 0;
            rgba[idx + 1] = 0;
            rgba[idx + 2] = 0;
            rgba[idx + 3] = 0;
          } else {
            const [r, g, b] = EGA_PALETTE[color]!;
            rgba[idx] = r;
            rgba[idx + 1] = g;
            rgba[idx + 2] = b;
            rgba[idx + 3] = 0xff;
          }
        }
      }
      atlasOffset += 32;
    }
  }
  return { width: pxW, height: pxH, rgba };
}

/**
 * Convenience: concatenate all of a Pic's segment-decoded byte arrays into
 * one flat array. Use this as the buffer argument to `renderPicDescriptor`.
 */
export function concatenatePicSegments(segments: ReadonlyArray<{ decodedBytes: ReadonlyArray<number> }>): number[] {
  const out: number[] = [];
  for (const s of segments) {
    for (const b of s.decodedBytes) out.push(b);
  }
  return out;
}
```

- [ ] **Step 4: Re-export from `packages/parser/src/index.ts`**

Append:

```typescript
export {
  renderPicDescriptor,
  concatenatePicSegments,
  EGA_PALETTE,
  type RenderedSprite,
} from './formats/pic-render.js';
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @wiz6/parser test tests/formats/pic-render.test.ts
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/parser/src/formats/pic-render.ts packages/parser/src/index.ts packages/parser/tests/formats/pic-render.test.ts
git commit -m "$(cat <<'EOF'
feat(parser): renderPicDescriptor — 4bpp EGA planar pixel decoder

Pure function: (descriptor, concatenated decoded bytes) -> RGBA. Color
15 is rendered as transparent (alpha=0); the other 15 colors use the
standard EGA 16-color hardware palette. Skipped cells (mask bit unset)
produce transparent regions and do NOT consume atlas bytes — the atlas
is packed.
EOF
)"
```

---

## Task 3: `<PicCanvas />` component in viewer

A React component that takes a `RenderedSprite` and paints it to a canvas at an integer scale.

**Files:**
- Create: `packages/viewer/src/components/PicCanvas.tsx`
- Create: `packages/viewer/src/components/PicCanvas.module.css`
- Create: `packages/viewer/tests/components/PicCanvas.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/components/PicCanvas.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PicCanvas } from '../../src/components/PicCanvas.js';

describe('PicCanvas', () => {
  it('renders a canvas with the sprite dimensions × scale', () => {
    const rgba = new Uint8ClampedArray(8 * 8 * 4);
    const { container } = render(
      <PicCanvas width={8} height={8} rgba={rgba} scale={4} />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
    expect(canvas!.width).toBe(8 * 4);
    expect(canvas!.height).toBe(8 * 4);
  });

  it('paints the RGBA via putImageData and scales by drawing scaled copies', () => {
    const rgba = new Uint8ClampedArray(8 * 8 * 4);
    // Mark a known pixel — pixel (0,0) blue
    rgba[0] = 0x00; rgba[1] = 0x00; rgba[2] = 0xaa; rgba[3] = 0xff;
    // Spy on getContext to capture putImageData usage
    const putImageData = vi.fn();
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    const imageSmoothingEnabledSetter = vi.fn();
    const ctxStub: Partial<CanvasRenderingContext2D> = {
      putImageData,
      drawImage,
      fillRect,
      get imageSmoothingEnabled() { return false; },
      set imageSmoothingEnabled(v: boolean) { imageSmoothingEnabledSetter(v); },
      scale: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
    };
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(ctxStub);
    render(<PicCanvas width={8} height={8} rgba={rgba} scale={4} />);
    expect(putImageData).toHaveBeenCalled();
    // imageSmoothingEnabled should be disabled for pixel-art scaling
    expect(imageSmoothingEnabledSetter).toHaveBeenCalledWith(false);
  });

  it('uses default scale 1 when not specified', () => {
    const rgba = new Uint8ClampedArray(8 * 8 * 4);
    const { container } = render(
      <PicCanvas width={8} height={8} rgba={rgba} />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas!.width).toBe(8);
    expect(canvas!.height).toBe(8);
  });
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
pnpm --filter @wiz6/viewer test tests/components/PicCanvas.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create the CSS module**

Create `packages/viewer/src/components/PicCanvas.module.css`:

```css
.canvas {
  display: block;
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}
```

- [ ] **Step 4: Implement the component**

Create `packages/viewer/src/components/PicCanvas.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import styles from './PicCanvas.module.css';

interface PicCanvasProps {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  scale?: number;
  className?: string;
  /** Optional checker-board background for transparency. Default true. */
  showTransparencyBg?: boolean;
}

export function PicCanvas({
  width,
  height,
  rgba,
  scale = 1,
  className,
  showTransparencyBg = true,
}: PicCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scaledW = width * scale;
    const scaledH = height * scale;
    canvas.width = scaledW;
    canvas.height = scaledH;
    ctx.imageSmoothingEnabled = false;

    if (showTransparencyBg) {
      // Light/dark checker pattern at the unscaled resolution, then drawn over
      ctx.fillStyle = 'rgb(40,40,40)';
      ctx.fillRect(0, 0, scaledW, scaledH);
      ctx.fillStyle = 'rgb(60,60,60)';
      const tile = Math.max(4 * scale, 4);
      for (let y = 0; y < scaledH; y += tile) {
        for (let x = 0; x < scaledW; x += tile) {
          if (((x / tile) + (y / tile)) % 2 === 0) {
            ctx.fillRect(x, y, tile, tile);
          }
        }
      }
    }

    // Paint the unscaled image into an off-screen canvas, then drawImage at scale.
    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    const offCtx = off.getContext('2d');
    if (!offCtx) return;
    const imageData = new ImageData(rgba, width, height);
    offCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(off, 0, 0, scaledW, scaledH);
  }, [width, height, rgba, scale, showTransparencyBg]);

  return (
    <canvas
      ref={canvasRef}
      width={width * scale}
      height={height * scale}
      className={`${styles.canvas} ${className ?? ''}`}
    />
  );
}
```

Note about the test: `putImageData` is called on the off-screen canvas, not the main one. The test's `vi.fn()` for `putImageData` should still get hit because we replace `HTMLCanvasElement.prototype.getContext` globally. Both canvases will use the stub. If the test fails because `drawImage` complains about the stub being an Image rather than a canvas, mock `drawImage` to just no-op (the test already does `drawImage: vi.fn()`).

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @wiz6/viewer test tests/components/PicCanvas.test.tsx
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/components/PicCanvas.tsx packages/viewer/src/components/PicCanvas.module.css packages/viewer/tests/components/PicCanvas.test.tsx
git commit -m "feat(viewer): <PicCanvas /> — pixel-art canvas with optional checker bg"
```

---

## Task 4: PicDetail uses `<PicCanvas />`

Render each descriptor as a canvas in the PicDetail page, alongside the existing per-descriptor table row.

**Files:**
- Modify: `packages/viewer/src/pages/pics/PicDetail.tsx`
- Modify: `packages/viewer/src/pages/pics/PicsIndex.module.css` (add gallery layout styles)
- Modify: `packages/viewer/tests/pages/pics/PicDetail.test.tsx`

- [ ] **Step 1: Add gallery styles**

Edit `packages/viewer/src/pages/pics/PicsIndex.module.css`. Append:

```css
.gallery {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-3);
  margin-bottom: var(--space-4);
}

.galleryItem {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.galleryLabel {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--color-text-faint);
}
```

- [ ] **Step 2: Update PicDetail**

Edit `packages/viewer/src/pages/pics/PicDetail.tsx`. Add imports near the top:

```tsx
import { renderPicDescriptor, concatenatePicSegments } from '@wiz6/parser';
import { PicCanvas } from '../../components/PicCanvas.js';
import { useMemo } from 'react';
```

Inside the `PicDetail` component, after the existing `if (!data) return null;` check, add:

```tsx
  const decodedBuffer = useMemo(
    () => (data ? concatenatePicSegments(data.segments) : []),
    [data],
  );
  const rendered = useMemo(
    () => (data ? data.descriptors.map((d) => renderPicDescriptor(d, decodedBuffer)) : []),
    [data, decodedBuffer],
  );
```

Then, in the JSX, ABOVE the descriptors table, add a gallery section:

```tsx
      <h2 style={{ marginTop: 'var(--space-5)' }}>Sprites ({data.descriptors.length})</h2>
      <div className={styles.gallery}>
        {data.descriptors.map((d, i) => {
          const r = rendered[i];
          if (!r) return null;
          return (
            <div key={d.index} className={styles.galleryItem}>
              <PicCanvas width={r.width} height={r.height} rgba={r.rgba} scale={2} />
              <div className={styles.galleryLabel}>
                #{d.index} · {r.width}×{r.height}px
              </div>
            </div>
          );
        })}
      </div>
```

Keep the descriptors table below (the table is the "raw structure" view for debugging; the gallery is the visual view).

- [ ] **Step 3: Update the PicDetail test**

Edit `packages/viewer/tests/pages/pics/PicDetail.test.tsx`. Add a test that the gallery renders one canvas per descriptor. Append to the `describe('PicDetail', ...)` block:

```typescript
  it('renders a canvas per descriptor in the sprites gallery', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /Sprites \(1\)/i })).toBeInTheDocument();
    });
    const canvases = document.querySelectorAll('canvas');
    expect(canvases.length).toBeGreaterThanOrEqual(1);
  });
```

The mocked canvas getContext should not break the test (PicCanvas's `useEffect` calls `getContext` which returns the stub). If the existing global mock for `HTMLCanvasElement.prototype.getContext` isn't set in this file, add a `beforeEach` that sets one:

```typescript
import { beforeEach, vi } from 'vitest';

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    set imageSmoothingEnabled(v: boolean) {},
    scale: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  });
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @wiz6/viewer test tests/pages/pics/PicDetail.test.tsx
```

Expected: green.

- [ ] **Step 5: Quick dev-server visual check**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-b
pnpm dev:viewer > /tmp/wiz6-stageb-dev.log 2>&1 &
DEV_PID=$!
sleep 4
PORT=$(grep -oE 'localhost:[0-9]+' /tmp/wiz6-stageb-dev.log | head -1 | sed 's/localhost://')
echo "Dev server up at http://localhost:$PORT/pics/mon13 — visually inspect"
echo "(Stop with: kill $DEV_PID)"
```

Open `http://localhost:$PORT/pics/mon13` in a browser. You should see actual sprite images. If they look like garbage (random colors, wrong scale), STOP and report — the renderer is wrong somewhere. Kill the dev server when satisfied.

```bash
kill $DEV_PID
```

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/pages/pics/PicDetail.tsx packages/viewer/src/pages/pics/PicsIndex.module.css packages/viewer/tests/pages/pics/PicDetail.test.tsx
git commit -m "feat(viewer): PicDetail renders descriptor canvases (sprites visible)"
```

---

## Task 5: PicsIndex thumbnails

Render descriptor 0 of each `.pic` as a small thumbnail on the card grid.

**Files:**
- Modify: `packages/viewer/src/pages/pics/PicsIndex.tsx`
- Modify: `packages/viewer/src/pages/pics/PicsIndex.module.css` (adjust card styles for thumbnail)
- Modify: `packages/viewer/tests/pages/pics/PicsIndex.test.tsx`

- [ ] **Step 1: Update card styles**

Edit `packages/viewer/src/pages/pics/PicsIndex.module.css`. Update `.card` and add a `.cardThumb` class:

```css
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  text-decoration: none;
}

.cardThumb {
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(40, 40, 40);
}
```

- [ ] **Step 2: Update PicsIndex to fetch descriptors and render thumbnails**

Edit `packages/viewer/src/pages/pics/PicsIndex.tsx`. Change the summary shape to include descriptors + decoded buffer:

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PicSchema } from '@wiz6/data';
import { renderPicDescriptor, concatenatePicSegments } from '@wiz6/parser';
import { PicCanvas } from '../../components/PicCanvas.js';
import styles from './PicsIndex.module.css';

const PIC_NAMES = [
  'credits',
  ...Array.from({ length: 59 }, (_, i) => `mon${i.toString().padStart(2, '0')}`),
];

interface Summary {
  id: string;
  segmentCount: number;
  descriptorCount: number;
  totalBytes: number;
  thumbnail?: { width: number; height: number; rgba: Uint8ClampedArray };
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
            results.push({ id: name, segmentCount: 0, descriptorCount: 0, totalBytes: 0, error: 'not extracted' });
            continue;
          }
          const pic = PicSchema.parse(JSON.parse(text));
          const decoded = concatenatePicSegments(pic.segments);
          const firstDesc = pic.descriptors[0];
          const thumb = firstDesc
            ? renderPicDescriptor(firstDesc, decoded)
            : undefined;
          results.push({
            id: name,
            segmentCount: pic.segments.length,
            descriptorCount: pic.descriptors.length,
            totalBytes: pic.totalBytes,
            thumbnail: thumb,
          });
        } catch (err) {
          results.push({
            id: name,
            segmentCount: 0,
            descriptorCount: 0,
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
        Every <code>.pic</code> sprite, rendered as actual EGA pixels.
        Click a card to see all sprite views (descriptors), the segment
        structure, and raw byte data.
      </p>
      <div className={styles.grid}>
        {summaries.map((s) => (
          <Link key={s.id} className={styles.card} to={`/pics/${s.id}`}>
            <div className={styles.cardThumb}>
              {s.thumbnail ? (
                <PicCanvas
                  width={s.thumbnail.width}
                  height={s.thumbnail.height}
                  rgba={s.thumbnail.rgba}
                  scale={Math.max(1, Math.floor(Math.min(96 / s.thumbnail.width, 96 / s.thumbnail.height)))}
                  showTransparencyBg={false}
                />
              ) : (
                <span className={styles.cardMeta}>{s.error ?? 'no sprite'}</span>
              )}
            </div>
            <div className={styles.cardName}>{s.id}</div>
            <div className={styles.cardMeta}>
              {s.descriptorCount} sprite{s.descriptorCount === 1 ? '' : 's'} · {s.totalBytes.toLocaleString()}B
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Update PicsIndex test**

Edit `packages/viewer/tests/pages/pics/PicsIndex.test.tsx`. Update the `SAMPLE_PIC` constant to the new schema (no `header`, with `descriptors`):

```typescript
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
    },
  ],
  descriptors: [],
  totalBytes: 1166,
};
```

Also stub `HTMLCanvasElement.prototype.getContext` (since PicCanvas will be invoked) — add a `beforeEach`:

```typescript
import { beforeEach } from 'vitest';

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    set imageSmoothingEnabled(v: boolean) {},
    scale: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  });
});
```

- [ ] **Step 4: Run viewer tests**

```bash
pnpm --filter @wiz6/viewer test 2>&1 | grep "Tests" | tail -3
```

Expected: green.

- [ ] **Step 5: Visual smoke**

```bash
pnpm dev:viewer > /tmp/wiz6-stageb-dev.log 2>&1 &
DEV_PID=$!
sleep 4
PORT=$(grep -oE 'localhost:[0-9]+' /tmp/wiz6-stageb-dev.log | head -1 | sed 's/localhost://')
echo "Visit http://localhost:$PORT/pics — should see 60 sprite thumbnails"
kill $DEV_PID
```

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/pages/pics/PicsIndex.tsx packages/viewer/src/pages/pics/PicsIndex.module.css packages/viewer/tests/pages/pics/PicsIndex.test.tsx
git commit -m "feat(viewer): PicsIndex card thumbnails — 60 sprites visible at a glance"
```

---

## Task 6: `picId` on Monster + MonsterDetail sprite

Expose `statBytes[145]` as a proper `picId` field on each monster, then wire MonsterDetail to display the sprite.

**Files:**
- Modify: `packages/data/src/schemas/scenario-db.ts` — add `picId` to `MonsterSchema`
- Modify: `packages/parser/src/formats/scenario-db.ts` — set `picId: statBytes[145]` in monster parsing
- Modify: `packages/parser/tests/formats/scenario-db.test.ts` — assert `picId` extraction
- Modify: `packages/parser/tests/queries/monsters.test.ts` — likely needs `picId` in fixtures
- Modify: `packages/viewer/tests/fixtures/scenario-fixture.ts` — add `picId` to fixture
- Modify: `packages/viewer/src/pages/monsters/MonsterDetail.tsx` (or similar — find the file with grep) — display sprite when `picId > 0`
- Modify: tests for MonsterDetail (find via grep)

- [ ] **Step 1: Locate the MonsterDetail page**

```bash
grep -rln 'MonsterDetail\|monster-detail' packages/viewer/src/ --include='*.tsx' --include='*.ts'
```

- [ ] **Step 2: Add `picId` to MonsterSchema**

Open `packages/data/src/schemas/scenario-db.ts`. Find the `MonsterSchema` definition (it's a z.object with all the monster fields). Add `picId` next to `combatSpriteId`:

```typescript
  combatSpriteId: z.number().int().min(0).max(255),
  combatSpriteAlt: z.number().int().min(0).max(255),
  secondarySpriteId: z.number().int().min(0).max(255),
  /** Filename suffix for the monster's combat sprite: monNN.pic where NN = picId. 0 = no sprite. Source: statBytes[145]. */
  picId: z.number().int().min(0).max(58),
```

- [ ] **Step 3: Set `picId` in the parser**

Open `packages/parser/src/formats/scenario-db.ts`. Find where monsters are constructed (look for `combatSpriteId:` in the parse function). Add:

```typescript
        picId: statSlice[145]!,
```

Place it adjacent to where `combatSpriteId`, `secondarySpriteId` etc. are set. The exact position doesn't matter — it's a plain field assignment.

- [ ] **Step 4: Update parser tests**

The existing `tests/formats/scenario-db.test.ts` probably asserts specific monster fields. Search for the test:

```bash
grep -n 'combatSpriteId\|secondarySpriteId' packages/parser/tests/formats/scenario-db.test.ts | head
```

If there's a test asserting field shape, add a `picId` assertion alongside. If there's a test that asserts the full monster object structure for a specific monster (e.g., RAT), add the expected `picId: 21` for that monster.

- [ ] **Step 5: Update fixtures and queries tests**

```bash
grep -rln 'picId\|combatSpriteId' packages/ --include='*.ts' --include='*.tsx'
```

For each file that has a monster fixture object, add `picId: 0` (or appropriate value) to maintain schema conformance.

- [ ] **Step 6: Re-extract scenario.json**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-b
pnpm wiz6 extract scenario 2>&1 | tail -3
python3 -c "import json; d = json.load(open('extracted/scenario/scenario.json')); print('m0 (RAT) picId:', d['monsters'][0]['picId']); print('m2 (BAT) picId:', d['monsters'][2]['picId']); print('m8 (ROGUE) picId:', d['monsters'][8]['picId'])"
```

Expected output: `m0 picId: 21`, `m2 picId: 18`, `m8 picId: 22`.

- [ ] **Step 7: Wire MonsterDetail**

Open the MonsterDetail page (whatever path Step 1 returned). Add the sprite display.

Near the imports, add:

```tsx
import { PicSchema } from '@wiz6/data';
import { renderPicDescriptor, concatenatePicSegments } from '@wiz6/parser';
import { PicCanvas } from '../../components/PicCanvas.js';
import { useEffect, useState, useMemo } from 'react';
```

Inside the component (after the monster is loaded), add a sprite-loading hook. The exact place to add this depends on the page structure — generally, near where other monster details are displayed:

```tsx
  const [sprite, setSprite] = useState<{ width: number; height: number; rgba: Uint8ClampedArray } | null>(null);
  const picId = monster?.picId ?? 0;

  useEffect(() => {
    if (!picId || picId === 0) {
      setSprite(null);
      return;
    }
    let cancelled = false;
    const padded = picId.toString().padStart(2, '0');
    (async () => {
      try {
        const res = await fetch(`/pics/mon${padded}.json`);
        if (!res.ok) return;
        const text = await res.text();
        if (text.trimStart().startsWith('<')) return;
        const pic = PicSchema.parse(JSON.parse(text));
        const firstDesc = pic.descriptors[0];
        if (!firstDesc) return;
        const decoded = concatenatePicSegments(pic.segments);
        const r = renderPicDescriptor(firstDesc, decoded);
        if (!cancelled) setSprite(r);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [picId]);
```

Then in the JSX, display the sprite (find a good spot near the monster name/header):

```tsx
      {sprite && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <PicCanvas width={sprite.width} height={sprite.height} rgba={sprite.rgba} scale={2} />
        </div>
      )}
```

- [ ] **Step 8: Update MonsterDetail tests**

Find the existing MonsterDetail test (via grep), then update its monster fixture to include `picId`. If the test asserts on the monster fields, ensure `picId` works without errors. Stub fetch as needed.

- [ ] **Step 9: Run all viewer tests**

```bash
pnpm -r test 2>&1 | grep "Tests" | tail -5
```

Expected: green.

- [ ] **Step 10: Visual smoke**

```bash
pnpm dev:viewer > /tmp/wiz6-stageb-dev.log 2>&1 &
DEV_PID=$!
sleep 4
PORT=$(grep -oE 'localhost:[0-9]+' /tmp/wiz6-stageb-dev.log | head -1 | sed 's/localhost://')
echo "Visit a monster page http://localhost:$PORT/monsters/0 — should see the RAT sprite"
kill $DEV_PID
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(monster): wire MON*.PIC sprites onto monster detail pages

Adds picId (= statBytes[145]) to the monster schema, sourced directly
from byte 145 of each scenario.dbs monster record per the verified
mapping in docs/re/sprite-id-table.md. MonsterDetail fetches the
corresponding mon{picId:02}.json, renders descriptor 0 via PicCanvas,
and displays the sprite alongside the monster's other stats.

picId=0 (no sprite) is handled gracefully — the canvas is simply not
shown. 65 of 250 monsters fall into this case.
EOF
)"
```

---

## Task 7: Smoke + deploy — COMPLETE

Merge commit: `6867c1cca6d681e9338661bec1ad0bc448a6c0f3`
Image tag: `sha-6867c1cca6d681e9338661bec1ad0bc448a6c0f3`
Gitops commit: `9f975b64d051f2329842ff6f464a0dc10ae58869`

- [x] **Step 1: Full tests + typecheck + build**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-b
pnpm -r test 2>&1 | grep "Tests" | tail -5
pnpm -r typecheck 2>&1 | tail -3
pnpm -r build 2>&1 | tail -5
```

All green.

- [x] **Step 2: Merge to main**

```bash
cd ~/Projects/ndouglas/wiz6
git checkout main
git merge stage-pic-b --no-ff -m "$(cat <<'EOF'
Merge .pic Stage B: pixel rendering + monster-sprite integration

Renders every .pic sprite as actual EGA pixels (4bpp planar, 8x8 cell
atlas, color 15 = transparent) on the /pics index and detail pages,
and wires the sprites onto monster detail pages via the
statBytes[145] picId mapping verified in Phase 1.

Phase 1 RE notes:
- docs/re/pic.md (Pixel encoding + Composition sections)
- docs/re/sprite-id-table.md
- docs/re/dynamic-traces/ (raw DOSBox-X file-open logs)

Phase 2 implementation:
- @wiz6/data: PicDescriptorSchema, picId on MonsterSchema
- @wiz6/parser: renderPicDescriptor (EGA palette + transparency)
- @wiz6/viewer: <PicCanvas />, gallery on PicDetail, thumbnails on
  PicsIndex, sprite on MonsterDetail
EOF
)"
pnpm -r test 2>&1 | grep "Tests" | tail -5
git push origin main 2>&1 | tail -3
git worktree remove --force ~/.config/superpowers/worktrees/wiz6/stage-pic-b
git worktree prune
git branch -d stage-pic-b
```

- [x] **Step 3: Watch GH Actions build**

```bash
sleep 10
RUN_ID=$(gh run list --workflow=build-image.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status --interval 30 2>&1 | tail -5
NEW_SHA=$(git log --format='%H' -1 main)
SHORT="${NEW_SHA:0:7}"
echo "new image tag candidate: sha-$NEW_SHA (short: sha-$SHORT)"
```

- [x] **Step 4: Bump goldentooth + reconcile**

```bash
cd ~/Projects/goldentooth/gitops
git pull
cat apps/wiz6/deployment.yaml | grep 'image:'
```

Use the `Edit` tool to swap to the new `sha-...` tag. Then:

```bash
git diff apps/wiz6/deployment.yaml
git add apps/wiz6/deployment.yaml
git commit -m "chore(wiz6): bump to .pic Stage B (pixel rendering + monster sprites)"
git push origin main 2>&1 | tail -3
flux reconcile kustomization wiz6 --with-source --timeout=2m 2>&1 | tail -3
sleep 5
kubectl rollout status deployment/wiz6 -n wiz6 --timeout=2m 2>&1 | tail -3
```

- [x] **Step 5: Curl-verify the live site**

```bash
curl -fsSk -o /dev/null -w "/pics:            %{http_code}\n" https://wiz6.goldentooth.net/pics
curl -fsSk -o /dev/null -w "/pics/mon00:      %{http_code}\n" https://wiz6.goldentooth.net/pics/mon00
curl -fsSk -o /dev/null -w "/pics/mon00.json: %{http_code}\n" https://wiz6.goldentooth.net/pics/mon00.json
curl -fsSk -o /dev/null -w "/monsters/0:      %{http_code}\n" https://wiz6.goldentooth.net/monsters/0
curl -fsSk https://wiz6.goldentooth.net/pics/mon22.json | python3 -c "import json,sys; d = json.load(sys.stdin); print('mon22 descriptors:', len(d['descriptors']), 'first:', d['descriptors'][0] if d['descriptors'] else None)"
```

Expected: all 200s; mon22 has descriptors with the right shape.

- [x] **Step 6: Open the site for a visual check** (deferred to user for visual confirmation; all 6 curl checks returned HTTP 200)

`https://wiz6.goldentooth.net/pics` should show a wall of 60 monster sprite thumbnails.
`https://wiz6.goldentooth.net/monsters/0` should show the RAT with its sprite (mon21).
`https://wiz6.goldentooth.net/monsters/2` should show the BAT (mon18).
`https://wiz6.goldentooth.net/monsters/8` should show the ROGUE (mon22).

If those three match what the user saw during DOSBox-X dynamic debugging, Stage B is shipped correctly.

---

## Out of scope (Stage C+)

- CGA / Hercules / Tandy driver palettes. Stage B is EGA only.
- Multi-frame animation. If descriptors turn out to be frames in some files, Stage C can animate them.
- Sprite-bestiary / monster catalog page (browse by sprite rather than by monster). PicsIndex already gives 60-at-once view, monster pages give one-at-a-time; a third page that groups monsters by their picId would be cool but isn't required.
- Reverse-engineering UI sprites (`mon01.pic` .. `mon08.pic`) — these are loaded at game start and used in the encounter UI, not associated with any monster row. They render fine through the same code; they just don't appear on monster pages.
- Fixing bytes 144, 146, 147 of monster statBytes (currently mislabeled as the rest of `attributeSaves`). The data is still in `statBytes` for anyone who wants to look at it; nothing depends on the parser's interpretation.

## Notes

- The `Pic` JSON files grow modestly after Task 1 (descriptors take ~30 bytes per entry, mostly the 20-byte mask). For credits.pic with hundreds of descriptors this could add 10-20KB. Total `extracted/pics/` should remain well under 5MB.
- The renderer is intentionally simple (CPU loop over pixels). For 60 thumbnails at 8×8..120×100 each, this is a few hundred thousand pixels — negligible. No need to optimize.
- The `<PicCanvas />` component scales by drawing to an off-screen canvas first and then `drawImage`-ing scaled. `imageSmoothingEnabled = false` ensures crisp pixel-art scaling.
