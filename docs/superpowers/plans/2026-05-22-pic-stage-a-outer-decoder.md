# `.pic` Stage A — Outer Decoder + Structural Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decode the outer envelope of `.pic` files (LIT / SKIP / END opcodes + sub-header parsing) end-to-end. Ship a `Pic` data schema, a `decodePic` parser, an `extractPic` extractor, a `wiz6 extract pics` CLI command, and a viewer `/pics` browser that lets you see the record structure of every `.pic` file. NO pixel rendering — payload bytes are exposed as hex for Stage B to consume.

**Architecture:**
- New schema `PicSchema` in `@wiz6/data`. Same shape across all 60 `.pic` files (59 monster sprites + `credits.pic`).
- New parser `decodePic(bytes, opts)` in `@wiz6/parser/formats/pic.ts`. Pure function over a byte array.
- New extractor `extractPic` in `@wiz6/cli/extractors`. Wraps `decodePic` + writes JSON.
- New CLI subcommand `wiz6 extract pics` (also picked up by `wiz6 extract --all`).
- New viewer routes `/pics` (index) and `/pics/:name` (detail), wired into the top nav + landing.

**Format spec** (verbatim from `docs/re/pic.md`):

```
op = bytes[pos++]
if op == 0x00:        END    (terminate the current record)
elif op < 0x80:       LIT(op): copy `op` raw bytes into the record's slot stream
else:                 SKIP(256 - op): emit (256 - op) "transparent" slots
```

Within each record, attempt to read the first LIT block as a sub-header:
```
[pos_lo, pos_hi, width, height, ...payload]
```

If the first LIT block has fewer than 4 bytes, leave `header = null` for that record. Subsequent LIT/SKIP ops in the same record stay as-is — they're additional fragments that haven't been characterised yet.

**Tech Stack:** TypeScript, zod, vitest, React. Reference investigation: `docs/re/pic.md`.

**Out of scope (Stage A):**
- Rendering pixels — Stage B
- The `combatSpriteId → monNN.pic` mapping — needs disassembly of `wroot.exe`; deferred
- Sub-sprite COMPOSITION (assembling a single big bitmap from many records) — Stage B / C
- Schema validation for "every monster has a matching .pic" — deferred

---

## Pre-flight

- [ ] **Worktree on latest `main`**

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

Strict zod schemas for the decoded format. Source of truth for everything downstream.

**Files:**
- Create: `packages/data/src/schemas/pic.ts`
- Test: `packages/data/tests/pic.test.ts`
- Modify: `packages/data/src/index.ts` — re-export

- [ ] **Step 1: Write the failing test**

Create `packages/data/tests/pic.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { PicSchema, PicRecordSchema, PicOpSchema, PicHeaderSchema } from '../src/schemas/pic.js';

describe('PicOpSchema', () => {
  it('accepts a lit op', () => {
    expect(() => PicOpSchema.parse({ type: 'lit', bytes: [0x58, 0x02, 0x03, 0x05] })).not.toThrow();
  });

  it('accepts a skip op', () => {
    expect(() => PicOpSchema.parse({ type: 'skip', count: 18 })).not.toThrow();
  });

  it('rejects skip count > 127', () => {
    // SKIP(256-op) where op is 0x81..0xff gives count 1..127
    expect(() => PicOpSchema.parse({ type: 'skip', count: 128 })).toThrow();
  });

  it('rejects unknown op type', () => {
    expect(() => PicOpSchema.parse({ type: 'end', count: 0 })).toThrow();
  });
});

describe('PicHeaderSchema', () => {
  it('accepts a valid header', () => {
    expect(() =>
      PicHeaderSchema.parse({
        pos: 0x0258,
        width: 3,
        height: 5,
        payload: [0xff, 0x7f],
      }),
    ).not.toThrow();
  });

  it('rejects out-of-range pos', () => {
    expect(() =>
      PicHeaderSchema.parse({ pos: 70000, width: 1, height: 1, payload: [] }),
    ).toThrow();
  });
});

describe('PicRecordSchema', () => {
  it('accepts a record with sub-header', () => {
    expect(() =>
      PicRecordSchema.parse({
        recordIndex: 0,
        ops: [
          { type: 'lit', bytes: [0x58, 0x02, 0x03, 0x05, 0xff, 0x7f] },
          { type: 'skip', count: 18 },
        ],
        header: { pos: 0x0258, width: 3, height: 5, payload: [0xff, 0x7f] },
        totalEmittedSlots: 24,
      }),
    ).not.toThrow();
  });

  it('accepts a record with null header (LIT < 4 bytes)', () => {
    expect(() =>
      PicRecordSchema.parse({
        recordIndex: 5,
        ops: [{ type: 'lit', bytes: [0x12] }, { type: 'skip', count: 10 }],
        header: null,
        totalEmittedSlots: 11,
      }),
    ).not.toThrow();
  });
});

describe('PicSchema', () => {
  const baseRecord = {
    recordIndex: 0,
    ops: [{ type: 'lit', bytes: [0x58, 0x02, 0x03, 0x05, 0xff, 0x7f] }],
    header: { pos: 0x0258, width: 3, height: 5, payload: [0xff, 0x7f] },
    totalEmittedSlots: 6,
  };

  it('accepts a valid pic', () => {
    expect(() =>
      PicSchema.parse({
        id: 'mon00',
        sourceFile: 'mon00.pic',
        records: [baseRecord],
        totalBytes: 1166,
      }),
    ).not.toThrow();
  });

  it('rejects empty id', () => {
    expect(() =>
      PicSchema.parse({
        id: '',
        sourceFile: 'x.pic',
        records: [],
        totalBytes: 0,
      }),
    ).toThrow();
  });

  it('accepts an empty records array', () => {
    expect(() =>
      PicSchema.parse({
        id: 'empty',
        sourceFile: 'empty.pic',
        records: [],
        totalBytes: 1,
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-a
pnpm --filter @wiz6/data test tests/pic.test.ts
```

Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement the schema**

Create `packages/data/src/schemas/pic.ts`:

```typescript
import { z } from 'zod';

const byte = z.number().int().min(0).max(255);
const byteArr = z.array(byte);

export const PicLitOpSchema = z.object({
  type: z.literal('lit'),
  bytes: byteArr,
});

export const PicSkipOpSchema = z.object({
  type: z.literal('skip'),
  count: z.number().int().min(0).max(127),
});

export const PicOpSchema = z.discriminatedUnion('type', [
  PicLitOpSchema,
  PicSkipOpSchema,
]);

export const PicHeaderSchema = z.object({
  pos: z.number().int().min(0).max(0xffff),
  width: byte,
  height: byte,
  payload: byteArr,
});

export const PicRecordSchema = z.object({
  recordIndex: z.number().int().nonnegative(),
  ops: z.array(PicOpSchema),
  header: PicHeaderSchema.nullable(),
  totalEmittedSlots: z.number().int().nonnegative(),
});

export const PicSchema = z.object({
  id: z.string().min(1),
  sourceFile: z.string().min(1),
  records: z.array(PicRecordSchema),
  totalBytes: z.number().int().positive(),
});

export type PicLitOp = z.infer<typeof PicLitOpSchema>;
export type PicSkipOp = z.infer<typeof PicSkipOpSchema>;
export type PicOp = z.infer<typeof PicOpSchema>;
export type PicHeader = z.infer<typeof PicHeaderSchema>;
export type PicRecord = z.infer<typeof PicRecordSchema>;
export type Pic = z.infer<typeof PicSchema>;
```

- [ ] **Step 4: Re-export from `packages/data/src/index.ts`**

Read the existing index to see the export style:

```bash
cat packages/data/src/index.ts | tail -10
```

Append (mimicking the existing pattern):

```typescript
export {
  PicSchema,
  PicRecordSchema,
  PicOpSchema,
  PicLitOpSchema,
  PicSkipOpSchema,
  PicHeaderSchema,
  type Pic,
  type PicRecord,
  type PicOp,
  type PicLitOp,
  type PicSkipOp,
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
git commit -m "feat(data): PicSchema for monster sprite outer-envelope format"
```

---

## Task 2: `decodePic` parser in `@wiz6/parser`

Pure function: bytes → `Pic` value. Implements the LIT/SKIP/END opcode loop with sub-header extraction from the first LIT block of each record.

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
  it('decodes a single record with a sub-header', () => {
    // LIT(6) [58 02 03 05 ff 7f]  SKIP(18)  END
    const buf = bytes(0x06, 0x58, 0x02, 0x03, 0x05, 0xff, 0x7f, 0xee, 0x00);
    const pic = decodePic(buf, { id: 'mon01', sourceFile: 'mon01.pic' });
    expect(pic.id).toBe('mon01');
    expect(pic.records).toHaveLength(1);
    const rec = pic.records[0]!;
    expect(rec.recordIndex).toBe(0);
    expect(rec.ops).toEqual([
      { type: 'lit', bytes: [0x58, 0x02, 0x03, 0x05, 0xff, 0x7f] },
      { type: 'skip', count: 18 },
    ]);
    expect(rec.header).toEqual({
      pos: 0x0258,
      width: 3,
      height: 5,
      payload: [0xff, 0x7f],
    });
    expect(rec.totalEmittedSlots).toBe(24); // 6 lit + 18 skip
    expect(pic.totalBytes).toBe(buf.length);
  });

  it('decodes multiple records', () => {
    const buf = bytes(
      // Record 0
      0x06, 0x58, 0x02, 0x03, 0x05, 0xff, 0x7f, 0xee, 0x00,
      // Record 1
      0x06, 0x38, 0x04, 0x03, 0x05, 0xff, 0x7f, 0xee, 0x00,
    );
    const pic = decodePic(buf, { id: 'mon01', sourceFile: 'mon01.pic' });
    expect(pic.records).toHaveLength(2);
    expect(pic.records[0]!.header!.pos).toBe(0x0258);
    expect(pic.records[1]!.header!.pos).toBe(0x0438);
  });

  it('records with first LIT < 4 bytes get header=null', () => {
    // LIT(2) [12 34]  END
    const buf = bytes(0x02, 0x12, 0x34, 0x00);
    const pic = decodePic(buf, { id: 'tiny', sourceFile: 'tiny.pic' });
    expect(pic.records).toHaveLength(1);
    expect(pic.records[0]!.header).toBeNull();
  });

  it('skip-only records are handled', () => {
    // SKIP(24)  END
    const buf = bytes(0xe8, 0x00);
    const pic = decodePic(buf, { id: 'empty-row', sourceFile: 'x.pic' });
    expect(pic.records).toHaveLength(1);
    expect(pic.records[0]!.ops).toEqual([{ type: 'skip', count: 24 }]);
    expect(pic.records[0]!.header).toBeNull();
    expect(pic.records[0]!.totalEmittedSlots).toBe(24);
  });

  it('decodes the standard mon01 first 9 bytes verbatim', () => {
    // Verbatim from docs/re/pic.md "Worked example" row at offset 0:
    // 06 58 02 03 05 ff 7f  ee 00
    const buf = bytes(0x06, 0x58, 0x02, 0x03, 0x05, 0xff, 0x7f, 0xee, 0x00);
    const pic = decodePic(buf, { id: 'mon01', sourceFile: 'mon01.pic' });
    expect(pic.records[0]!.header).toEqual({
      pos: 0x0258,
      width: 3,
      height: 5,
      payload: [0xff, 0x7f],
    });
  });

  it('throws on truncated LIT (not enough remaining bytes)', () => {
    // LIT(5) but only 3 bytes follow before EOF
    const buf = bytes(0x05, 0x01, 0x02, 0x03);
    expect(() =>
      decodePic(buf, { id: 'bad', sourceFile: 'bad.pic' }),
    ).toThrow(/truncated|out of bounds/i);
  });

  it('treats 0x80 as a no-op skip (count 0) — never seen in real files', () => {
    // LIT(3) [01 02 03]  SKIP(0)=0x80  END
    const buf = bytes(0x03, 0x01, 0x02, 0x03, 0x80, 0x00);
    const pic = decodePic(buf, { id: 'edge', sourceFile: 'edge.pic' });
    expect(pic.records[0]!.ops).toEqual([
      { type: 'lit', bytes: [0x01, 0x02, 0x03] },
      { type: 'skip', count: 0 },
    ]);
  });

  it('reports totalBytes equal to input length', () => {
    const buf = bytes(0x06, 0x58, 0x02, 0x03, 0x05, 0xff, 0x7f, 0xee, 0x00);
    const pic = decodePic(buf, { id: 'x', sourceFile: 'x.pic' });
    expect(pic.totalBytes).toBe(9);
  });

  it('handles a real-world prefix from mon00.pic — short header-only records', () => {
    // First 7 bytes of mon00.pic: 02 58 02 fd 01 ed 00 (LIT(2) SKIP(19) END)
    const buf = bytes(0x02, 0x58, 0x02, 0xfd, 0x01, 0xed, 0x00);
    const pic = decodePic(buf, { id: 'mon00', sourceFile: 'mon00.pic' });
    expect(pic.records).toHaveLength(1);
    expect(pic.records[0]!.ops).toEqual([
      { type: 'lit', bytes: [0x58, 0x02] },
      { type: 'skip', count: 19 },
    ]);
    // LIT was only 2 bytes — header should be null
    expect(pic.records[0]!.header).toBeNull();
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
import { PicSchema, type Pic, type PicOp, type PicRecord } from '@wiz6/data';

export interface DecodePicOpts {
  id: string;
  sourceFile: string;
}

/**
 * Decode the outer envelope of a `.pic` file: a byte-stream of
 *
 *   LIT(n) | SKIP(256-n) | END=0x00
 *
 * opcodes. Each END terminates a record. Within each record, attempt to
 * interpret the first LIT block's first 4 bytes as a sub-header:
 *
 *   [pos_lo, pos_hi, width, height, ...payload]
 *
 * If the first LIT is < 4 bytes (or the record has no leading LIT),
 * `header` is `null`.
 *
 * See `docs/re/pic.md` for the full investigation.
 */
export function decodePic(bytes: Uint8Array, opts: DecodePicOpts): Pic {
  const records: PicRecord[] = [];
  let pos = 0;
  let currentOps: PicOp[] = [];
  let recordIndex = 0;

  const finalizeRecord = () => {
    let header: PicRecord['header'] = null;
    let totalSlots = 0;
    for (const op of currentOps) {
      if (op.type === 'lit') totalSlots += op.bytes.length;
      else totalSlots += op.count;
    }
    // Try to parse the first LIT block as a header.
    const firstLit = currentOps.find((o) => o.type === 'lit');
    if (firstLit && firstLit.type === 'lit' && firstLit.bytes.length >= 4) {
      const b = firstLit.bytes;
      header = {
        pos: b[0]! | (b[1]! << 8),
        width: b[2]!,
        height: b[3]!,
        payload: b.slice(4),
      };
    }
    records.push({
      recordIndex,
      ops: currentOps,
      header,
      totalEmittedSlots: totalSlots,
    });
    recordIndex++;
    currentOps = [];
  };

  while (pos < bytes.length) {
    const op = bytes[pos]!;
    pos++;
    if (op === 0x00) {
      finalizeRecord();
    } else if (op < 0x80) {
      // LIT(op): copy `op` raw bytes
      if (pos + op > bytes.length) {
        throw new Error(
          `decodePic: truncated LIT at byte ${pos - 1} (need ${op} bytes, ${bytes.length - pos} available)`,
        );
      }
      const litBytes = Array.from(bytes.subarray(pos, pos + op));
      currentOps.push({ type: 'lit', bytes: litBytes });
      pos += op;
    } else {
      // SKIP(256 - op)
      currentOps.push({ type: 'skip', count: 256 - op });
    }
  }

  // If the file does NOT end on 0x00 (unusual), flush any pending ops as a final record.
  if (currentOps.length > 0) {
    finalizeRecord();
  }

  return PicSchema.parse({
    id: opts.id,
    sourceFile: opts.sourceFile,
    records,
    totalBytes: bytes.length,
  });
}
```

- [ ] **Step 4: Re-export from `packages/parser/src/index.ts`**

Append (or merge into existing export block):

```typescript
export { decodePic, type DecodePicOpts } from './formats/pic.js';
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @wiz6/parser test tests/formats/pic.test.ts
```

Expected: all green.

- [ ] **Step 6: Quick sanity check against real files**

Make sure decoding every real `.pic` file in `original/` succeeds without throwing. Run an inline check:

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-a
pnpm --filter @wiz6/parser exec tsx -e "
import { decodePic } from './src/formats/pic.js';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const ORIGINAL = process.cwd() + '/../../../../original';
const files = readdirSync(ORIGINAL).filter((f) => f.endsWith('.pic'));
for (const f of files) {
  const bytes = new Uint8Array(readFileSync(join(ORIGINAL, f)));
  const id = f.replace(/\.pic$/, '');
  const pic = decodePic(bytes, { id, sourceFile: f });
  console.log(\`\${f}: \${pic.records.length} records, \${pic.totalBytes} bytes, first pos=0x\${pic.records[0]?.header?.pos?.toString(16) ?? '?'}\`);
}
"
```

Expected output: 60 lines, each showing a file and its record count. The first record's `pos` should be `0x258` for every file (per the investigation notes).

If any file throws, STOP and report. Likely cause: a real-world edge case the test suite didn't capture.

- [ ] **Step 7: Commit**

```bash
git add packages/parser/src/formats/pic.ts packages/parser/src/index.ts packages/parser/tests/formats/pic.test.ts
git commit -m "feat(parser): decodePic — outer-envelope LIT/SKIP/END decoder"
```

---

## Task 3: `extractPic` + `wiz6 extract pics`

Wrap `decodePic` with file I/O. Wire into the existing `wiz6 extract` subcommand surface so `wiz6 extract pics` and `wiz6 extract --all` both work.

**Files:**
- Create: `packages/cli/src/extractors/extract-pic.ts`
- Modify: `packages/cli/src/commands/extract.ts` — add `pics` to the type enum
- Test: `packages/cli/tests/extractors/extract-pic.test.ts`
- Test: `packages/cli/tests/commands/extract.test.ts` — add `pics` to the existing test

- [ ] **Step 1: Inspect an existing extractor for the pattern**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-a
cat packages/cli/src/extractors/extract-wfont-4bpp.ts
```

Note the function shape: takes `{originalPath, outputPath, id}`, reads bytes, decodes, writes JSON, returns the decoded value.

- [ ] **Step 2: Write the failing test for the extractor**

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
    // LIT(6) [58 02 03 05 ff 7f] SKIP(18) END
    writeFileSync(src, Buffer.from([0x06, 0x58, 0x02, 0x03, 0x05, 0xff, 0x7f, 0xee, 0x00]));
    const pic = extractPic({ originalPath: src, outputPath: out, id: 'mon00' });
    expect(pic.id).toBe('mon00');
    expect(pic.records).toHaveLength(1);
    const written = JSON.parse(readFileSync(out, 'utf8'));
    expect(written.id).toBe('mon00');
    expect(written.records[0].header.pos).toBe(0x0258);
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
import { dirname } from 'node:path';
import { decodePic } from '@wiz6/parser';
import type { Pic } from '@wiz6/data';

export interface ExtractPicOpts {
  originalPath: string;
  outputPath: string;
  id: string;
}

export function extractPic(opts: ExtractPicOpts): Pic {
  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const pic = decodePic(bytes, { id: opts.id, sourceFile: opts.originalPath.split('/').pop()! });
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

Open `packages/cli/src/commands/extract.ts`. Find the existing `TypeName` enum + `ALL_TYPES` constant:

```typescript
type TypeName = 'fonts' | 'portraits' | 'screens' | 'messages' | 'newgame' | 'scenario';
const ALL_TYPES: TypeName[] = ['fonts', 'portraits', 'screens', 'messages', 'newgame', 'scenario'];
```

Change to:

```typescript
type TypeName = 'fonts' | 'portraits' | 'screens' | 'messages' | 'newgame' | 'scenario' | 'pics';
const ALL_TYPES: TypeName[] = ['fonts', 'portraits', 'screens', 'messages', 'newgame', 'scenario', 'pics'];
```

Add the import at the top:

```typescript
import { extractPic } from '../extractors/extract-pic.js';
```

Add a case in `extractOneType` for `'pics'`. Use this exact code (after the existing `scenario` case):

```typescript
    case 'pics': {
      const { readdirSync } = await import('node:fs');
      const { join } = await import('node:path');
      const entries = readdirSync(originalDir).filter((f) => f.endsWith('.pic')).sort();
      for (const f of entries) {
        const id = f.replace(/\.pic$/, '');
        const pic = extractPic({
          originalPath: join(originalDir, f),
          outputPath: join(extractedDir, 'pics', `${id}.json`),
          id,
        });
        io.write(
          `wrote ${extractedDir}/pics/${id}.json (${pic.records.length} records, ${pic.totalBytes} bytes)\n`,
        );
      }
      return;
    }
```

(`readdirSync` and `join` are needed but `extract.ts` may not import them yet — add to the top-of-file imports if necessary.)

Update the USAGE constant to include the new type:

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

- [ ] **Step 7: Update the existing extract.test.ts to include the pics subcommand**

Open `packages/cli/tests/commands/extract.test.ts`. Find the test setup that copies real .dbs files into `tmpDir/original/`. Add `.pic` files too. The beforeEach should also copy at least `mon00.pic` and `mon01.pic`:

```typescript
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'wiz6-cli-extract-'));
  mkdirSync(join(tmpDir, 'original'));
  for (const f of ['scenario.dbs', 'newgame.dbs', 'msg.dbs', 'mon00.pic', 'mon01.pic']) {
    const src = join(REAL_ORIGINAL, f);
    if (existsSync(src)) copyFileSync(src, join(tmpDir, 'original', f));
  }
});
```

Add a new test:

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
wc -l extracted/pics/mon00.json
```

Expected: 60 JSON files in `extracted/pics/`, mon00.json is a reasonable size.

- [ ] **Step 10: Commit**

```bash
git add packages/cli/src/extractors/extract-pic.ts packages/cli/src/commands/extract.ts packages/cli/tests/extractors/extract-pic.test.ts packages/cli/tests/commands/extract.test.ts
git commit -m "feat(cli): wiz6 extract pics — runs decodePic across all 60 .pic files"
```

---

## Task 4: Viewer `/pics` index + `/pics/:name` detail

Browse all `.pic` files. Index page: a card grid of 60 entries showing filename + size + record count. Detail page: a table of records for one file.

**Files:**
- Create: `packages/viewer/src/pages/pics/PicsIndex.tsx`
- Create: `packages/viewer/src/pages/pics/PicDetail.tsx`
- Create: `packages/viewer/src/pages/pics/PicsIndex.module.css`
- Create: `packages/viewer/src/lib/hooks/usePic.ts` — fetch helper
- Modify: `packages/viewer/src/router.tsx` — add `/pics` + `/pics/:name`
- Modify: `packages/viewer/src/components/TopNav.tsx` — add "Pics" link
- Modify: `packages/viewer/src/pages/Landing.tsx` — add a Pics section card
- Test: `packages/viewer/tests/pages/pics/PicsIndex.test.tsx`
- Test: `packages/viewer/tests/pages/pics/PicDetail.test.tsx`

- [ ] **Step 1: Inspect the existing portraits index for the pattern**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-a
cat packages/viewer/src/pages/portraits/PortraitsIndex.tsx
```

Note: it fetches an index manifest or hardcodes a list of file names, then renders each.

For pics, the simplest is to hardcode the list `mon00`..`mon58` + `credits` since that set is known.

- [ ] **Step 2: Implement the data-fetch hook**

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

- [ ] **Step 3: Write the PicsIndex test**

Create `packages/viewer/tests/pages/pics/PicsIndex.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PicsIndex } from '../../../src/pages/pics/PicsIndex.js';

const SAMPLE_PIC = {
  id: 'mon00',
  sourceFile: 'mon00.pic',
  records: [
    {
      recordIndex: 0,
      ops: [{ type: 'lit', bytes: [0x58, 0x02] }],
      header: null,
      totalEmittedSlots: 2,
    },
  ],
  totalBytes: 1166,
};

function renderIndex() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      // Each .json fetch returns the same sample shape with a different id
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
      // 60 .pic cards
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

- [ ] **Step 4: Write the PicDetail test**

Create `packages/viewer/tests/pages/pics/PicDetail.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PicDetail } from '../../../src/pages/pics/PicDetail.js';

const SAMPLE = {
  id: 'mon01',
  sourceFile: 'mon01.pic',
  records: [
    {
      recordIndex: 0,
      ops: [
        { type: 'lit', bytes: [0x58, 0x02, 0x03, 0x05, 0xff, 0x7f] },
        { type: 'skip', count: 18 },
      ],
      header: { pos: 0x0258, width: 3, height: 5, payload: [0xff, 0x7f] },
      totalEmittedSlots: 24,
    },
    {
      recordIndex: 1,
      ops: [{ type: 'lit', bytes: [0x12] }, { type: 'skip', count: 5 }],
      header: null,
      totalEmittedSlots: 6,
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

  it('renders the record count + total bytes', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/2 records/i)).toBeInTheDocument();
      expect(screen.getByText(/4,?469 bytes/i)).toBeInTheDocument();
    });
  });

  it('renders a table row per record', async () => {
    renderDetail();
    await waitFor(() => {
      const rows = screen.getAllByRole('row');
      // 2 record rows + 1 header row
      expect(rows.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('renders the decoded header (pos, w, h) for record 0', async () => {
    renderDetail();
    await waitFor(() => {
      // pos 0x0258, w=3, h=5
      expect(screen.getByText(/0x0258/i)).toBeInTheDocument();
      expect(screen.getByText(/^3\s*[×x]\s*5$/i)).toBeInTheDocument();
    });
  });

  it('shows "no header" for records with header=null', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/no header/i)).toBeInTheDocument();
    });
  });

  it('shows the payload as hex (first few bytes)', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/ff 7f/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 5: Run the tests to confirm both fail**

```bash
pnpm --filter @wiz6/viewer test tests/pages/pics/
```

Expected: both fail (modules don't exist).

- [ ] **Step 6: Create CSS**

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

.payloadHex {
  color: var(--color-text-faint);
  word-break: break-all;
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

- [ ] **Step 7: Implement PicsIndex**

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
  recordCount: number;
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
            results.push({ id: name, recordCount: 0, totalBytes: 0, error: 'not extracted' });
            continue;
          }
          const json = JSON.parse(text);
          results.push({
            id: name,
            recordCount: Array.isArray(json.records) ? json.records.length : 0,
            totalBytes: typeof json.totalBytes === 'number' ? json.totalBytes : 0,
          });
        } catch (err) {
          results.push({
            id: name,
            recordCount: 0,
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
        <code>credits.pic</code>. Pixel rendering is Stage B — these views show
        only record structure for now.
      </p>
      <div className={styles.grid}>
        {summaries.map((s) => (
          <Link key={s.id} className={styles.card} to={`/pics/${s.id}`}>
            <div className={styles.cardName}>{s.id}</div>
            <div className={styles.cardMeta}>
              {s.error ? s.error : `${s.recordCount} records · ${s.totalBytes.toLocaleString()} bytes`}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 8: Implement PicDetail**

Create `packages/viewer/src/pages/pics/PicDetail.tsx`:

```typescript
import { Link, useParams } from 'react-router-dom';
import { usePic } from '../../lib/hooks/usePic.js';
import styles from './PicsIndex.module.css';

function toHex(b: number): string {
  return b.toString(16).padStart(2, '0');
}

function payloadHex(payload: readonly number[], max = 32): string {
  const slice = payload.slice(0, max).map(toHex).join(' ');
  return payload.length > max ? `${slice} … (+${payload.length - max} more)` : slice;
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
        {data.records.length.toLocaleString()} records · {data.totalBytes.toLocaleString()} bytes
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>header</th>
            <th>slots</th>
            <th>ops</th>
            <th>payload (hex)</th>
          </tr>
        </thead>
        <tbody>
          {data.records.map((rec) => (
            <tr key={rec.recordIndex}>
              <td>{rec.recordIndex}</td>
              <td>
                {rec.header ? (
                  <>
                    pos 0x{rec.header.pos.toString(16).padStart(4, '0')} ·{' '}
                    {rec.header.width} × {rec.header.height}
                  </>
                ) : (
                  <span className={styles.noHeader}>no header</span>
                )}
              </td>
              <td>{rec.totalEmittedSlots}</td>
              <td>
                {rec.ops
                  .map((o) => (o.type === 'lit' ? `L${o.bytes.length}` : `S${o.count}`))
                  .join(' ')}
              </td>
              <td className={styles.payloadHex}>
                {rec.header ? payloadHex(rec.header.payload) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 9: Wire routes**

Open `packages/viewer/src/router.tsx`. Add:

```typescript
const PicsIndex = lazy(() =>
  import('./pages/pics/PicsIndex.js').then((m) => ({ default: m.PicsIndex })),
);
const PicDetail = lazy(() =>
  import('./pages/pics/PicDetail.js').then((m) => ({ default: m.PicDetail })),
);
```

Add the routes inside the `routes` fragment (alongside `/portraits`, etc.):

```typescript
    <Route path="/pics" element={<PicsIndex />} />
    <Route path="/pics/:name" element={<PicDetail />} />
```

- [ ] **Step 10: Add a TopNav link**

Open `packages/viewer/src/components/TopNav.tsx`. In the `SECTIONS` array, insert a new entry (placement alphabetical or wherever feels right):

```typescript
  { label: 'Pics', to: '/pics' },
```

The existing TopNav test has an `it.each` over the section labels. Add the new row to that test too:

```typescript
    ['Pics', '/pics'],
```

- [ ] **Step 11: Add a Landing section card**

Open `packages/viewer/src/pages/Landing.tsx`. In the `SECTIONS` array, add an entry near Portraits / Screens:

```typescript
  {
    title: 'Pics',
    to: '/pics',
    description: '59 monster sprite files + credits — outer-envelope decoded (pixel rendering Stage B).',
    meta: '60 files',
  },
```

The existing Landing test has a list of section labels. Add `'Pics'` to that array.

- [ ] **Step 12: Run all viewer tests**

```bash
pnpm --filter @wiz6/viewer test 2>&1 | grep "Tests" | tail -3
```

Expected: green. Several test files will gain new assertions; total should grow by ~10-15.

- [ ] **Step 13: Sanity check via dev server**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-a
pnpm extract pics 2>&1 | tail -3
```

Confirm `extracted/pics/mon00.json` etc. exist.

Then start the dev server briefly:

```bash
pnpm dev:viewer > /tmp/wiz6-pic-dev.log 2>&1 &
DEV_PID=$!
sleep 3
PORT=$(grep -oE 'localhost:[0-9]+' /tmp/wiz6-pic-dev.log | head -1 | sed 's/localhost://')
curl -fsS http://localhost:$PORT/pics/mon00.json | head -3
kill $DEV_PID
```

Expected: the JSON file is served via Vite's publicDir.

- [ ] **Step 14: Commit**

```bash
git add packages/viewer/src/pages/pics/ packages/viewer/src/lib/hooks/usePic.ts packages/viewer/src/router.tsx packages/viewer/src/components/TopNav.tsx packages/viewer/src/pages/Landing.tsx packages/viewer/tests/pages/pics/ packages/viewer/tests/components/TopNav.test.tsx packages/viewer/tests/pages/Landing.test.tsx
git commit -m "feat(viewer): /pics index + /pics/:name detail (structural view, no rendering)"
```

---

## Task 5: Final smoke + deploy cycle

- [ ] **Step 1: Full tests**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-pic-a
pnpm -r test 2>&1 | grep "Tests" | tail -5
```

Expected: 82 + ~9 (data) + ~9 (parser) + ~3 (cli) + ~10 (viewer) = ~540+ total.

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

Decodes the LIT/SKIP/END opcode stream of every .pic file. New
PicSchema in @wiz6/data, decodePic in @wiz6/parser, extractPic in
@wiz6/cli, /pics index + /pics/:name detail in @wiz6/viewer.

Pixel rendering is Stage B — payload bytes are exposed as hex for
inspection. Outer envelope decodes all 60 files (59 monsters +
credits) end-to-end with zero leftover bytes."
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

- Pixel rendering of `.pic` payloads (the actual sprite art)
- `combatSpriteId` → `monNN.pic` indirection table
- Sub-sprite composition into a single bitmap per file
- Multi-frame animation if any `.pic` files use it (current investigation suggests not, but `mon13` / `mon50` deserve another look)

## Notes for Stage B planning

After Stage A ships, the `extracted/pics/*.json` files become the canonical input for Stage B's pixel-decoding experiments. The Stage B plan should:

1. Build candidate renderers (1bpp packed, 4bpp planar, 4bpp packed, mask+color) as pure functions over a `PicHeader` (pos, w, h, payload).
2. Render `mon05` and 2-3 other simple sprites under each candidate, produce PNGs or in-browser canvases.
3. Show them side-by-side in the viewer; the user picks which one matches their expectation.
4. Lock in the chosen encoding; expand the schema to include decoded pixel arrays.
5. Update the `PicDetail` page to render the assembled sprite.
