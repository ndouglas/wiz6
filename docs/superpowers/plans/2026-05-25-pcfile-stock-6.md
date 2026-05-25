# pcfile.dbs Decoder + Stock-6 Gallery Seed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship a `pcfile.dbs` decoder + CLI extractor; replace the placeholder Hawkwind gallery seed with the canonical 6 stock characters (THESUS, TEMPEST, LYSANDR, NOBAL, TREON, PENTAG) decoded from the real game file.

**Architecture:** RE-first, then mechanical. Phase A is a focused RE pass producing `docs/re/pcfile-dbs.md` + a findings JSON with field offsets at known confidence levels. Phases B-D are conventional schema + decoder + extractor wiring against those findings. Phase D regenerates the gallery JSON from the extractor's output.

**Tech Stack:** pnpm monorepo, TS ESM (`.js` extensions), zod + vitest. Pure decoder in `@wiz6/parser`, I/O wrapper in `@wiz6/cli`, gallery JSON is a content asset.

**Worktree:** `~/.config/superpowers/worktrees/wiz6/feat-pcfile-stock-6` (branch `feat/pcfile-stock-6`)

---

## Pre-discovered facts (locked-in context for all tasks)

These are confirmed from a quick inspection by the controller before this plan was written. The Task A subagent should treat these as starting facts to verify/extend, not re-discover.

**File header (first 24 bytes of pcfile.dbs):**

```
0x00..0x01: record_size  u16 LE  = 0x01B0  (= 432, matches in-memory char-record stride)
0x02..0x03: slot_count   u16 LE  = 0x0010  (16 slots)
0x04..0x07: header_size  u32 LE  = 0x00000018  (= 24, where first record starts)
0x08..0x17: status[16]   u8×16   first 6 are 1 (populated), rest are 0
```

**16 × 432-byte character records follow, starting at file offset 0x18.**

**The 6 populated slots, decoded by name byte at +0x00:**

| Slot | Name (file offset) | First 64 bytes (record-relative) |
|---|---|---|
| 0 | THESUS  @ 0x018 | starts: `54 48 45 53 55 53 00 00 be 19 00 00 ...` |
| 1 | TEMPEST @ 0x1C8 | `54 45 4d 50 45 53 54 00 ed 1c 00 00 ...` |
| 2 | LYSANDR @ 0x378 | `4c 59 53 41 4e 44 52 00 61 1c 00 00 ...` |
| 3 | NOBAL   @ 0x528 | `4e 4f 42 41 4c 00 00 00 91 1b 00 00 ...` |
| 4 | TREON   @ 0x6D8 | `54 52 45 4f 4e 00 00 00 cb 19 00 00 ...` |
| 5 | PENTAG  @ 0x888 | `50 45 4e 54 41 47 00 00 2a 1a 00 00 ...` |

**High-confidence on-disk fields (from cross-record inspection):**

| Rel offset | Width | Field        | Sample (THESUS) | Confidence |
|---|---|---|---|---|
| 0x00 | 7 bytes | `name` (null-padded ASCII) | "THESUS\0" | high |
| 0x07 | 1 byte | name terminator | 0 always | high |
| 0x08 | u32 LE | `xp` | 6590 | high (matches Wiz6 economy for a level-5..9 character) |
| 0x0C..0x17 | 12 bytes | zeros across all 6 chars | 0 | (structural / reserved / future-field — TBD) |
| 0x18 | u16 LE | `level` (current?) | 8 | medium-high (matches expected stock-party levels) |
| 0x1A | u16 LE | `level_secondary` (max? saved_old_level? class_change cap?) | 8 | low (always equal to 0x18 in stock data — could be max-level OR repeated current) |
| 0x1C | u16 LE | `hp_current` | 126 | medium (curr/max pattern; values plausible for the levels) |
| 0x1E | u16 LE | `hp_max` | 126 | medium (always equal to hp_current in stock data) |
| 0x20 | u16 LE | unknown_A | 0x0127 = 295 | low (could be SP) |
| 0x22 | u16 LE | unknown_B | 0x0A8C = 2700 | low (could be gold OR max-SP — 2700 is in gold range) |
| 0x24..0x27 | 4 bytes | constant `01 00 01 00` across all 6 | (race+class? both = 1 across all? unlikely) | very low |

**Crucial discrepancy to resolve in Phase A:**

The in-memory `CHARACTER_RECORD` BssStruct (`packages/data/src/structs/character-record.ts`) places:
- name at +0x00 (length 12)
- xp at +0x0C
- gold at +0x10
- level at +0x24

But the on-disk evidence places:
- name at +0x00 (length 7 + null at +0x07 — effective 8 bytes)
- xp at +0x08
- something-level-shaped at +0x18

Same total record size (432 bytes), but **different field arrangements**. Either the engine de-marshals on load (file format ≠ memory format despite same size), OR the in-memory BssStruct doc has bug(s). Phase A must determine which.

**Where to look for the answer:**
- `docs/re/wpcvw-character-view.md` § "Character record layout (BSS at 0x43e8, stride 0x1b0)" — the in-memory source-of-truth
- `wbase.ovr` — loads pcfile.dbs at startup. The load routine (per `docs/re/wbase-main-menu.md`) is the canonical source for ON-DISK layout. Find it via Ghidra OR by searching for byte patterns near `*0x4fd2` (scenario_pcfile_count) and `*0x4fd8` (status array).
- `wpcmk.ovr` — the character-creation overlay. Writes new characters to pcfile.dbs. Whatever offsets it writes to define the on-disk layout.

---

## File structure (locked-in)

```
docs/re/
  └── pcfile-dbs.md                          # NEW — Task A output
docs/re/findings/
  └── pcfile-dbs.json                        # NEW — Task A output

packages/data/src/schemas/
  └── pcfile.ts                              # NEW — Task B (PcfileHeaderSchema + PcfileSlotSchema + DecodedPcfileSchema)

packages/data/tests/schemas/
  └── pcfile.test.ts

packages/parser/src/formats/
  └── pcfile.ts                              # NEW — Task B (pure decodePcfile)

packages/parser/tests/formats/
  └── pcfile.test.ts

packages/cli/src/extractors/
  └── extract-pcfile.ts                      # NEW — Task C (I/O wrapper)
packages/cli/src/commands/
  └── extract.ts                             # MODIFY — add `pcfile` dispatch

packages/cli/tests/extractors/
  └── extract-pcfile.test.ts

packages/viewer/public/gallery/
  └── characters.json                        # REPLACE — Task D (Hawkwind → stock 6)

packages/viewer/tests/lib/
  └── gallery.test.ts                        # MODIFY — Task D (assert 6 entries via real fixture)
packages/viewer/tests/pages/game/
  └── RosterView.test.tsx                    # MODIFY — Task D (mock returns 6 chars)
```

---

## Task A: RE pass — document the pcfile.dbs on-disk record

**Why this exists:** Phases B-D depend on knowing where the fields are. We have high-confidence offsets for name/xp/level/HP and a hard discrepancy with character-record.ts to resolve. This task delivers a finalized field map.

**Files:**
- Create: `docs/re/findings/pcfile-dbs.json`
- Create: `docs/re/pcfile-dbs.md`

**Process:**

- [ ] **Step A.1: Empirical pass over all 6 populated records**

Read `original/pcfile.dbs`, slice each of the 6 populated character records (slots 0..5), and produce a 432-column-wide table showing each record's bytes. For each column:
- Is it constant across all 6? (likely structural / 0-padding)
- Does it vary? (per-char data — usually low byte of an int, while the high byte is often zero)

Use this Python snippet (run from the worktree root) to bootstrap:

```python
import os
data = open('original/pcfile.dbs', 'rb').read()
records = []
for i in range(6):
    off = 0x18 + i * 0x1B0
    records.append(data[off:off+0x1B0])

# Print first 256 bytes columnar:
names = ['THESUS', 'TEMPEST', 'LYSANDR', 'NOBAL', 'TREON', 'PENTAG']
for chunk_start in range(0, 0x1B0, 0x40):
    print(f'\n--- bytes 0x{chunk_start:03x}..0x{chunk_start+0x3F:03x} ---')
    print('rel:    ' + ' '.join(f'{c:02x}' for c in range(0x40)))
    for name, rec in zip(names, records):
        print(f'{name:8}: ' + ' '.join(f'{b:02x}' for b in rec[chunk_start:chunk_start+0x40]))
```

Identify: byte regions that VARY per character (= data), byte regions that are CONSTANT across all 6 (= structural/zero-padding), byte regions where only SOME chars differ (= optional fields like inventory slots).

- [ ] **Step A.2: Binary-trace pass via Ghidra (or ndisasm if Ghidra is closed)**

The wbase.ovr load routine for pcfile.dbs is the on-disk format's source-of-truth. Locate it:

```bash
# Find the load routine in wbase.ovr. Try strings first:
strings -t x original/wbase.ovr | grep -i "PCFILE\|pcfile"
```

Then use the call-target math from CLAUDE.md (thunk-delta law) to identify what reads/writes happen at each pcfile record's byte position.

The wpcmk.ovr write routine is the inverse direction — it writes new characters to pcfile.dbs from in-memory state. Search for it the same way.

**Goal:** identify byte-for-byte the meaning of every field the engine reads/writes at file offsets [0x00..0x40] within a record. (Beyond 0x40, fields likely include inventory grid, equipped slots, spell-known bitmaps, etc. Document what's findable; mark the rest "TBD".)

- [ ] **Step A.3: Reconcile with character-record.ts**

`packages/data/src/structs/character-record.ts` documents the IN-MEMORY layout. The on-disk layout may differ. Determine:
- Are field offsets the same in memory and on disk? (If yes, character-record.ts is wrong about name+xp+gold offsets.)
- OR does the engine de-marshal on load (file→memory has different layouts)?
- If the file's `name` field is 8 bytes (not 12), update CharacterSchema (`packages/data/src/schemas/character.ts`) accordingly — the `.max(12)` constraint should match reality.

Be SPECIFIC about confidence: every claim in the finding must be either "high (verified by both empirical + binary trace)" or "medium (one side only)" or "low (educated guess)".

- [ ] **Step A.4: Write the finding JSON**

Per `docs/re/findings/README.md` schema, write `docs/re/findings/pcfile-dbs.json` with:

```json
{
  "topic": "pcfile-dbs-format",
  "date": "2026-05-25",
  "summary": "On-disk character database format: 24-byte header + 16 × 432-byte character records. Same record size as in-memory layout but field arrangement may differ (Phase A finding documents which).",
  "header_layout": [
    {"offset": "0x00", "width": 2, "type": "u16_le", "name": "record_size", "value": 432, "confidence": "high"},
    {"offset": "0x02", "width": 2, "type": "u16_le", "name": "slot_count", "value": 16, "confidence": "high"},
    {"offset": "0x04", "width": 4, "type": "u32_le", "name": "header_size", "value": 24, "confidence": "high"},
    {"offset": "0x08", "width": 16, "type": "u8[16]", "name": "status", "description": "0 = empty slot, 1 = populated", "confidence": "high"}
  ],
  "record_layout": [
    {"offset": "0x00", "width": 8, "name": "name", "type": "ascii_zstring", "confidence": "high"},
    {"offset": "0x08", "width": 4, "name": "xp", "type": "u32_le", "confidence": "high"}
    // ... add every field you confidently identified ...
  ],
  "unmapped_regions": ["0x40..0x1AF — inventory, equipped slots, spells, conditions, statuses (TBD; tracked as follow-up RE)"],
  "discrepancy_with_in_memory_layout": "..."
}
```

- [ ] **Step A.5: Write the markdown doc**

Create `docs/re/pcfile-dbs.md` summarizing the finding for human readers. Include:
- File header layout (table)
- Record layout (table)
- Sample dump of THESUS with annotations
- Reconciliation with character-record.ts
- What's confidently decoded vs left TBD

- [ ] **Step A.6: Commit**

```bash
cd ~/.config/superpowers/worktrees/wiz6/feat-pcfile-stock-6
git add docs/re/findings/pcfile-dbs.json docs/re/pcfile-dbs.md
git commit -m "docs(re): pcfile.dbs on-disk format (header + record layout)"
```

If Phase A finds that CharacterSchema's `name.max(12)` should be `name.max(8)` (or similar), make that schema change as a separate commit:

```bash
git add packages/data/src/schemas/character.ts \
        packages/data/tests/schemas/character.test.ts
git commit -m "fix(data): align CharacterSchema name constraint with on-disk pcfile.dbs format"
```

---

## Task B: decodePcfile in @wiz6/parser

**Why this exists:** Pure decoder. Takes `Uint8Array`, returns a typed JSON-friendly structure. Validates record stride / slot count from header. Best-effort field decoding for the records using Phase A's offsets.

**Files:**
- Create: `packages/data/src/schemas/pcfile.ts`
- Create: `packages/data/tests/schemas/pcfile.test.ts`
- Create: `packages/parser/src/formats/pcfile.ts`
- Create: `packages/parser/tests/formats/pcfile.test.ts`
- Modify: `packages/data/src/index.ts` (export new schemas)
- Modify: `packages/parser/src/index.ts` (export decodePcfile)

### Step B.1: Schemas in @wiz6/data

Create `packages/data/src/schemas/pcfile.ts`:

```typescript
import { z } from 'zod';

const U8 = z.number().int().min(0).max(255);
const U16 = z.number().int().min(0).max(0xffff);
const U32 = z.number().int().min(0).max(0xffffffff);

export const PcfileHeaderSchema = z.object({
  recordSize: U16,
  slotCount: U16,
  headerSize: U32,
  status: z.array(U8).length(16),
});

/**
 * One pcfile slot. v1 decodes a small set of high-confidence fields; the
 * full 432-byte raw record is preserved alongside as `raw` so callers can
 * recover any field we haven't decoded yet. See docs/re/pcfile-dbs.md.
 */
export const PcfileSlotSchema = z.object({
  slot: U8,
  populated: z.boolean(),
  /** ASCII name decoded from the first 8 record bytes (null-padded). Null
   *  when the slot is empty. */
  name: z.string().nullable(),
  /** Best-effort decoded fields. Add more here as the RE pass extends. */
  xp: U32,
  level: U16,
  hpCurrent: U16,
  hpMax: U16,
  /** Full 432-byte record bytes, preserved verbatim. Empty slots are still
   *  432 zeros (the file shape is fixed). */
  raw: z.array(U8).length(432),
});

export const DecodedPcfileSchema = z.object({
  header: PcfileHeaderSchema,
  slots: z.array(PcfileSlotSchema).length(16),
});

export type PcfileHeader = z.infer<typeof PcfileHeaderSchema>;
export type PcfileSlot = z.infer<typeof PcfileSlotSchema>;
export type DecodedPcfile = z.infer<typeof DecodedPcfileSchema>;
```

(Adjust the `PcfileSlotSchema` fields list to match exactly what Phase A's finding says is high-confidence decodable. If Phase A finds more reliable fields, add them. If `hpCurrent`/`hpMax` are downgraded to low-confidence, remove them and just keep `name`/`xp`/`level`.)

- [ ] **B.1: failing test → schema → passing test → commit**

Write `packages/data/tests/schemas/pcfile.test.ts` with at least:
- valid empty slot (populated=false, name=null, all numerics 0, raw all zeros)
- valid populated slot
- rejects out-of-range u16 (recordSize: 0x10000)
- rejects wrong status length
- rejects raw length ≠ 432

Run `pnpm --filter @wiz6/data test pcfile`, verify fail, implement schema, verify pass, commit:

```bash
git commit -m "feat(data): PcfileHeaderSchema + PcfileSlotSchema + DecodedPcfileSchema"
```

### Step B.2: decoder in @wiz6/parser

Create `packages/parser/src/formats/pcfile.ts`:

```typescript
import {
  DecodedPcfileSchema,
  type DecodedPcfile,
  type PcfileSlot,
} from '@wiz6/data';

/**
 * Decode `pcfile.dbs` bytes into a typed structure. Pure — no I/O.
 *
 * Best-effort field decoding: we decode the fields with high confidence
 * from docs/re/pcfile-dbs.md. The full 432-byte record bytes are also
 * preserved per slot under `raw` so future RE refinements can extract
 * additional fields without re-running this decoder.
 *
 * Validates the decoded structure against DecodedPcfileSchema.
 */
export function decodePcfile(bytes: Uint8Array): DecodedPcfile {
  if (bytes.length < 24) {
    throw new Error(`pcfile too short: ${bytes.length} bytes (need at least 24 for header)`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const recordSize = view.getUint16(0x00, true);
  const slotCount = view.getUint16(0x02, true);
  const headerSize = view.getUint32(0x04, true);

  if (recordSize !== 0x1B0) {
    throw new Error(`unexpected record_size: 0x${recordSize.toString(16)} (expected 0x1B0)`);
  }
  if (slotCount !== 16) {
    throw new Error(`unexpected slot_count: ${slotCount} (expected 16)`);
  }
  if (headerSize !== 24) {
    throw new Error(`unexpected header_size: ${headerSize} (expected 24)`);
  }
  const expected = headerSize + slotCount * recordSize;
  if (bytes.length !== expected) {
    throw new Error(`pcfile size mismatch: got ${bytes.length}, expected ${expected}`);
  }

  const status: number[] = [];
  for (let i = 0; i < 16; i++) status.push(bytes[8 + i]!);

  const slots: PcfileSlot[] = [];
  for (let i = 0; i < 16; i++) {
    const recStart = headerSize + i * recordSize;
    const rec = bytes.subarray(recStart, recStart + recordSize);
    const raw: number[] = Array.from(rec);
    const populated = status[i] === 1;

    // High-confidence field decode. Refine when Phase A finalizes offsets.
    let name: string | null = null;
    if (populated) {
      let nameEnd = 0;
      while (nameEnd < 8 && rec[nameEnd] !== 0) nameEnd++;
      name = new TextDecoder('ascii').decode(rec.subarray(0, nameEnd));
    }
    const xp = view.getUint32(recStart + 0x08, true);
    const level = view.getUint16(recStart + 0x18, true);
    const hpCurrent = view.getUint16(recStart + 0x1C, true);
    const hpMax = view.getUint16(recStart + 0x1E, true);

    slots.push({ slot: i, populated, name, xp, level, hpCurrent, hpMax, raw });
  }

  return DecodedPcfileSchema.parse({
    header: { recordSize, slotCount, headerSize, status },
    slots,
  });
}
```

(Adjust the field offsets — `0x08`, `0x18`, `0x1C`, `0x1E` — to whatever Phase A finalizes. If Phase A's record_layout findings change which u16/u32 fields are reliable, sync the decoder accordingly.)

### Step B.3: parser tests

Create `packages/parser/tests/formats/pcfile.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePcfile } from '../../src/formats/pcfile.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PCFILE = readFileSync(join(HERE, '..', '..', '..', '..', 'original', 'pcfile.dbs'));

describe('decodePcfile', () => {
  it('decodes the header from the real file', () => {
    const { header } = decodePcfile(new Uint8Array(PCFILE));
    expect(header.recordSize).toBe(0x1B0);
    expect(header.slotCount).toBe(16);
    expect(header.headerSize).toBe(24);
    expect(header.status.slice(0, 6)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(header.status.slice(6)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('decodes the 6 populated slots with their canonical names', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const populated = slots.filter((s) => s.populated);
    expect(populated.length).toBe(6);
    expect(populated.map((s) => s.name)).toEqual([
      'THESUS', 'TEMPEST', 'LYSANDR', 'NOBAL', 'TREON', 'PENTAG',
    ]);
  });

  it('decodes THESUS xp = 6590', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    expect(thesus.xp).toBe(6590);
  });

  it('empty slots have populated=false, name=null, and an all-zero raw', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const empty = slots.filter((s) => !s.populated);
    expect(empty.length).toBe(10);
    for (const s of empty) {
      expect(s.name).toBeNull();
      expect(s.raw.every((b) => b === 0)).toBe(true);
    }
  });

  it('throws on truncated input', () => {
    expect(() => decodePcfile(new Uint8Array([0xb0, 0x01]))).toThrow();
  });

  it('throws on wrong record_size in header', () => {
    const bytes = new Uint8Array(PCFILE);
    bytes[0] = 0xFF; // corrupt record_size
    expect(() => decodePcfile(bytes)).toThrow();
  });
});
```

- [ ] **B.3: failing test → decoder → passing test → commit**

Run the test, verify fail (missing module). Implement decoder, verify pass. Commit:

```bash
git commit -m "feat(parser): decodePcfile — header + 16-slot decoder with best-effort fields"
```

- [ ] **B.4: Update exports**

Add to `packages/data/src/index.ts`:

```typescript
export {
  PcfileHeaderSchema,
  PcfileSlotSchema,
  DecodedPcfileSchema,
  type PcfileHeader,
  type PcfileSlot,
  type DecodedPcfile,
} from './schemas/pcfile.js';
```

Add to `packages/parser/src/index.ts`:

```typescript
export { decodePcfile } from './formats/pcfile.js';
```

Commit:

```bash
git add packages/data/src/index.ts packages/parser/src/index.ts
git commit -m "chore: export pcfile decoder + schemas from package indices"
```

---

## Task C: extract-pcfile CLI extractor

**Why this exists:** Wraps `decodePcfile` with file I/O. Mirrors existing extractors (extract-pic, extract-wport, etc.) for consistency.

**Files:**
- Create: `packages/cli/src/extractors/extract-pcfile.ts`
- Create: `packages/cli/tests/extractors/extract-pcfile.test.ts`
- Modify: `packages/cli/src/commands/extract.ts` (add `pcfile` dispatch)

### Step C.1: Extractor module

Create `packages/cli/src/extractors/extract-pcfile.ts`:

```typescript
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { decodePcfile } from '@wiz6/parser';
import type { DecodedPcfile } from '@wiz6/data';

export interface ExtractPcfileOpts {
  originalPath: string;
  outputPath: string;
}

export function extractPcfile(opts: ExtractPcfileOpts): DecodedPcfile {
  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const decoded = decodePcfile(bytes);
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(decoded, null, 2));
  return decoded;
}
```

### Step C.2: Test

Create `packages/cli/tests/extractors/extract-pcfile.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractPcfile } from '../../src/extractors/extract-pcfile.js';

describe('extractPcfile', () => {
  it('reads pcfile.dbs and writes decoded JSON', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wiz6-pcfile-'));
    const src = join(__dirname, '..', '..', '..', '..', 'original', 'pcfile.dbs');
    const out = join(tmpDir, 'pcfile.json');
    const decoded = extractPcfile({ originalPath: src, outputPath: out });
    expect(decoded.header.slotCount).toBe(16);
    expect(decoded.slots.filter((s) => s.populated).length).toBe(6);

    const written = JSON.parse(readFileSync(out, 'utf8'));
    expect(written.header.recordSize).toBe(0x1B0);
    expect(
      written.slots.filter((s: { populated: boolean }) => s.populated).map((s: { name: string }) => s.name)
    ).toEqual(['THESUS', 'TEMPEST', 'LYSANDR', 'NOBAL', 'TREON', 'PENTAG']);
  });
});
```

If `__dirname` is unavailable in ESM, swap for `dirname(fileURLToPath(import.meta.url))` like the other tests in `packages/parser/tests/`.

### Step C.3: Wire `wiz6 extract pcfile`

Read `packages/cli/src/commands/extract.ts` to understand the existing dispatch pattern. There's likely a `case 'X':` block per subcommand. Add a `pcfile` case that:
1. Resolves the input path to `original/pcfile.dbs`
2. Resolves the output path to `extracted/pcfile.json`
3. Calls `extractPcfile({ originalPath, outputPath })`

If you encounter ambiguity in the dispatch pattern, stop and ask. Otherwise mirror the closest sibling (e.g., the wfont or wport dispatch).

- [ ] **C.1+C.2+C.3: failing test → impl → passing test → commit**

```bash
pnpm --filter @wiz6/cli test extract-pcfile
# verify fail
# implement extractor + dispatch
# verify pass
git add packages/cli/src/extractors/extract-pcfile.ts \
        packages/cli/tests/extractors/extract-pcfile.test.ts \
        packages/cli/src/commands/extract.ts
git commit -m "feat(cli): extract-pcfile (wiz6 extract pcfile → extracted/pcfile.json)"
```

---

## Task D: Replace gallery seed with stock 6

**Why this exists:** Phase 5 of #009 shipped with a placeholder Hawkwind in `packages/viewer/public/gallery/characters.json`. Now we have a real extractor — regenerate the gallery from the canonical 6 stock characters.

**Approach:** The gallery JSON must conform to `RosterSchema` (see `packages/data/src/schemas/roster.ts`), which embeds `CharacterSchema` (which has many fields not in pcfile's high-confidence set: race, class, gold, attributes, schoolMana, skills, conditions, etc.). We bridge the gap by:
1. Running the extractor over `original/pcfile.dbs`
2. For each populated slot, building a `Character` JSON object using:
   - **Decoded** fields from the extractor: name, xp, level, hpCurrent, hpMax (mapping hp → wherever CharacterSchema puts it; if CharacterSchema doesn't have an hp field, just drop hp for v1 — see schema)
   - **Sensible defaults** for the rest: race=0, class=0, gold=0, conditions=[0×10], dead=false, paralyzed=false, attributes=12 each, schoolMana=[0×6], skills=[0×14], savedOldLevel=0, reaction=50
3. Each gets a stable UUID — derive deterministically from the slot index so re-running the extractor produces the same UUIDs:
   - Slot 0 (THESUS) → `00000000-0000-4000-8000-000000000000`
   - Slot 1 (TEMPEST) → `00000000-0000-4000-8000-000000000001`
   - ... etc.

This is one-shot work — write a small TS script that imports the extractor + the schemas and produces the gallery JSON.

**Files:**
- Modify: `packages/viewer/public/gallery/characters.json`
- Create: `packages/viewer/scripts/generate-gallery.ts` (one-shot script — easy to re-run when the schema or pcfile data changes)
- Modify: `packages/viewer/tests/lib/gallery.test.ts` (use the real gallery shape — 6 chars, named THESUS first)
- Modify: `packages/viewer/tests/pages/game/RosterView.test.tsx` (assert at least one of the 6 stock names is visible)

### Step D.1: Write the gallery generator script

Create `packages/viewer/scripts/generate-gallery.ts`:

```typescript
#!/usr/bin/env tsx
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePcfile } from '@wiz6/parser';
import { RosterSchema, type Character, type Roster } from '@wiz6/data';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const PCFILE = join(REPO, 'original', 'pcfile.dbs');
const OUT = join(HERE, '..', 'public', 'gallery', 'characters.json');

function slotUuid(n: number): string {
  // Deterministic UUID v4-ish from slot index, so re-running the generator
  // produces the same ids.
  const hex = n.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

function defaultCharacter(): Omit<Character, 'id' | 'name' | 'xp' | 'level'> {
  return {
    race: 0,
    class: 0,
    savedOldLevel: 0,
    gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false,
    paralyzed: false,
    attributes: {
      str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12,
      personality: 50, karma: 50,
    },
    schoolMana: [0, 0, 0, 0, 0, 0],
    skills: new Array(14).fill(0),
    reaction: 50,
  };
}

const bytes = new Uint8Array(readFileSync(PCFILE));
const decoded = decodePcfile(bytes);

const characters: Character[] = decoded.slots
  .filter((s) => s.populated && s.name)
  .map((s, i) => ({
    id: slotUuid(i),
    name: s.name!,
    xp: s.xp,
    level: s.level,
    ...defaultCharacter(),
  }));

const roster: Roster = { schemaVersion: 1, characters };
RosterSchema.parse(roster); // validate before writing

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(roster, null, 2) + '\n');
console.log(`wrote ${OUT} with ${characters.length} characters`);
```

Run it:

```bash
cd ~/.config/superpowers/worktrees/wiz6/feat-pcfile-stock-6
pnpm exec tsx packages/viewer/scripts/generate-gallery.ts
```

Expected output: `wrote .../public/gallery/characters.json with 6 characters`

Verify by `cat`-ing the new file — it should have 6 characters with the stock names.

### Step D.2: Update the gallery test to use a 6-character fake

Modify `packages/viewer/tests/lib/gallery.test.ts`. The `FAKE_GALLERY` constant should be updated from 1 Hawkwind to the 6 stock characters — easiest path is to mirror the real `public/gallery/characters.json` (read at test time, or hand-author a 6-char fixture in the test file).

Recommended: keep using a hardcoded fixture (don't read the public file at test time — that couples test to deploy assets). Replace the existing `FAKE_GALLERY.characters` array with the 6-character version:

```typescript
const FAKE_GALLERY = {
  schemaVersion: 1,
  characters: [
    { id: '00000000-0000-4000-8000-000000000000', name: 'THESUS', race: 0, class: 0, level: 8, savedOldLevel: 0, xp: 6590, gold: 0, conditions: [0,0,0,0,0,0,0,0,0,0], dead: false, paralyzed: false, attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, personality: 50, karma: 50 }, schoolMana: [0,0,0,0,0,0], skills: [0,0,0,0,0,0,0,0,0,0,0,0,0,0], reaction: 50 },
    { id: '00000000-0000-4000-8000-000000000001', name: 'TEMPEST', race: 0, class: 0, level: 9, savedOldLevel: 0, xp: 7405, gold: 0, conditions: [0,0,0,0,0,0,0,0,0,0], dead: false, paralyzed: false, attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, personality: 50, karma: 50 }, schoolMana: [0,0,0,0,0,0], skills: [0,0,0,0,0,0,0,0,0,0,0,0,0,0], reaction: 50 },
    { id: '00000000-0000-4000-8000-000000000002', name: 'LYSANDR', race: 0, class: 0, level: 5, savedOldLevel: 0, xp: 7265, gold: 0, conditions: [0,0,0,0,0,0,0,0,0,0], dead: false, paralyzed: false, attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, personality: 50, karma: 50 }, schoolMana: [0,0,0,0,0,0], skills: [0,0,0,0,0,0,0,0,0,0,0,0,0,0], reaction: 50 },
    { id: '00000000-0000-4000-8000-000000000003', name: 'NOBAL', race: 0, class: 0, level: 4, savedOldLevel: 0, xp: 7057, gold: 0, conditions: [0,0,0,0,0,0,0,0,0,0], dead: false, paralyzed: false, attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, personality: 50, karma: 50 }, schoolMana: [0,0,0,0,0,0], skills: [0,0,0,0,0,0,0,0,0,0,0,0,0,0], reaction: 50 },
    { id: '00000000-0000-4000-8000-000000000004', name: 'TREON', race: 0, class: 0, level: 4, savedOldLevel: 0, xp: 6603, gold: 0, conditions: [0,0,0,0,0,0,0,0,0,0], dead: false, paralyzed: false, attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, personality: 50, karma: 50 }, schoolMana: [0,0,0,0,0,0], skills: [0,0,0,0,0,0,0,0,0,0,0,0,0,0], reaction: 50 },
    { id: '00000000-0000-4000-8000-000000000005', name: 'PENTAG', race: 0, class: 0, level: 2, savedOldLevel: 0, xp: 6698, gold: 0, conditions: [0,0,0,0,0,0,0,0,0,0], dead: false, paralyzed: false, attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, personality: 50, karma: 50 }, schoolMana: [0,0,0,0,0,0], skills: [0,0,0,0,0,0,0,0,0,0,0,0,0,0], reaction: 50 },
  ],
};
```

Update assertions to match the new fixture (count = 6, first name = THESUS):

```typescript
it('loadGallery returns the parsed gallery roster', async () => {
  const g = await loadGallery();
  expect(g.characters).toHaveLength(6);
  expect(g.characters[0]!.name).toBe('THESUS');
});

it('isGalleryCharacter returns true for IDs that came from the gallery', async () => {
  const g = await loadGallery();
  const galleryId = g.characters[0]!.id;
  expect(isGalleryCharacter(galleryId, g)).toBe(true);
  expect(isGalleryCharacter('22222222-2222-4222-8222-222222222222', g)).toBe(false);
});

it('importToRoster copies a gallery character into the roster with a NEW uuid', async () => {
  const g = await loadGallery();
  const sourceId = g.characters[0]!.id;
  const newId = await importToRoster(sourceId);
  expect(newId).not.toBe(sourceId);
  expect(newId).toMatch(/^[0-9a-f-]{36}$/);
  const r = readRoster();
  expect(r.characters).toHaveLength(1);
  expect(r.characters[0]!.id).toBe(newId);
  expect(r.characters[0]!.name).toBe('THESUS');
});
```

The `seedRosterIfEmpty` test should now expect 6 characters in the roster post-seed:

```typescript
it('imports every gallery character when the roster is empty', async () => {
  await seedRosterIfEmpty();
  const r = readRoster();
  expect(r.characters).toHaveLength(6);
  expect(r.characters.map((c) => c.name)).toEqual([
    'THESUS', 'TEMPEST', 'LYSANDR', 'NOBAL', 'TREON', 'PENTAG',
  ]);
});
```

### Step D.3: Update RosterView test

`packages/viewer/tests/pages/game/RosterView.test.tsx` currently has a `FAKE_GALLERY` with Hawkwind. Replace it with the same 6-character fixture (extract to a shared helper if you prefer). Update test assertions to reference one of the new names (e.g., "THESUS") instead of "Hawkwind".

Specifically check this test that uses the visitor upload:

```typescript
it('adds the uploaded character to the roster under a new uuid', async () => {
  // ... waitFor(() => screen.getByText('Hawkwind')); →
  // waitFor(() => screen.getByText('THESUS'));
  ...
});
```

### Step D.4: Run + commit

```bash
cd ~/.config/superpowers/worktrees/wiz6/feat-pcfile-stock-6
pnpm exec tsx packages/viewer/scripts/generate-gallery.ts
pnpm --filter @wiz6/viewer test
# All gallery + RosterView tests should pass with the new fixture
git add packages/viewer/scripts/generate-gallery.ts \
        packages/viewer/public/gallery/characters.json \
        packages/viewer/tests/lib/gallery.test.ts \
        packages/viewer/tests/pages/game/RosterView.test.tsx
git commit -m "feat(viewer): replace gallery seed with the canonical 6 stock characters"
```

---

## Task E: Final test + build + push

- [ ] **E.1: Full repo test**

```
pnpm -r test
```

Expected: all packages green.

- [ ] **E.2: Full repo build**

```
pnpm -r build
```

- [ ] **E.3: Update TODO.md**

The current #009 entry mentions "1 hand-authored character" in the gallery. Update it to reflect the stock 6:

```bash
# Find the gallery-related line in TODO.md and update it (or add an addendum)
# Then commit:
git add TODO.md
git commit -m "docs(todo): #009 gallery seed now ships the canonical stock 6"
```

- [ ] **E.4: Push the branch**

```
git push -u origin feat/pcfile-stock-6
```

---

## Self-review notes (for the implementer)

**Spec coverage:**
- ✅ pcfile.dbs RE pass → Task A
- ✅ decodePcfile decoder + schema → Task B
- ✅ CLI extractor + dispatch → Task C
- ✅ Replace Hawkwind with stock 6 in gallery → Task D
- ✅ Tests still pass → Task E

**Acceptable open gaps for v1:**
- The decoder's field set is small (name, xp, level, hpCurrent, hpMax). The other 400 bytes of each record (inventory, equipped slots, spells, conditions, race/class indices) stay in `raw[]` for future refinement.
- The gallery characters use sensible defaults (race=0/class=0/attributes=12) for fields we couldn't confidently decode. They're not byte-faithful clones of THESUS-as-the-original-game-presents-him — they're THESUS-as-a-recognizable-starting-character. A future refinement pass can pin down race/class/inventory.
- `CharacterSchema.name.max(12)` may get tightened to `.max(8)` in Phase A if the engine truly only allows 7+null bytes.

**Type consistency:**
- `PcfileSlot.name` is `string | null` — only populated slots have a name.
- `Character` in the gallery JSON has every field non-null (no optionals allowed by the schema).
- Slot UUID format: `00000000-0000-4000-8000-NNNNNNNNNNNN` where N = 12-hex slot index padded. This is RFC-4122 v4-shaped (4xxx, 8/9/a/bxxx) so zod's `.uuid()` validator accepts it.
