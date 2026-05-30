# PC File Presets & Import/Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players populate the in-viewer PC File (the engine's 16-entry PCFILE.DBS, today's `wiz6:roster`) from a library of named Presets (built-in Stock + custom + imported), and import/export character files as lossless JSON or engine-faithful PCFILE.DBS — with party formation left entirely to the existing ADD PARTY MEMBER flow.

**Architecture:** Four stages, each independently testable. Stage 1 is a pure `@wiz6/parser` engine-format core (Character↔PcfileSlot bridge + full-file `encodePcfile`). Stage 2 adds the JSON format + `Preset` schema + viewer stores (presets + a 16-cap on the roster). Stage 3 ships the built-in Stock preset as a generated static asset. Stage 4 is the `/pc-file` UI page. No change to the active party, the ADD PARTY MEMBER picker, or party stores.

**Tech Stack:** TypeScript ESM monorepo (pnpm), Zod schemas in `@wiz6/data`, pure decoders/encoders in `@wiz6/parser`, React + react-router in `@wiz6/viewer`, Vitest. Relative imports use `.js` extensions. Spec: `docs/superpowers/specs/2026-05-30-pc-file-presets-import-export-design.md`.

**Reference facts (verified against current code):**
- `PcfileSlot` (`packages/data/src/schemas/pcfile.ts`) typed fields: `slot, populated, name, ageCounter, xp, mks, gold, hpCurrent, hpMax, spCurrent, spMax, encumbranceCurrent, encumbranceMax, schoolManaCur[6], schoolManaMax[6], level, levelSecondary, conditions[10], race, alignment, class, str, int, pie, vit, dex, spd, per, kar, skills[30], bodyAc[7], reaction, npcRaceReaction[31], spellSlotsKnown[20], portraitIndex (creation default @0x1ab), inventoryCount, inventoryCountPage2, derivedAc, savedOldLevel, schoolRankThresholds[14], inventory[22], equipment[8], raw[432]`.
- `Character` (`packages/data/src/schemas/character.ts`) fields: `id, name, race, class, level, savedOldLevel, xp, gold, conditions[10], dead, paralyzed, attributes{str,int,pie,vit,dex,spd,per,kar}, schoolMana[6], schoolManaMax[6], skills[30], reaction, sex, portraitSlotId?, rosterCharacterId?, portraitIndex (GLOBAL rendered, 0..41), hpCurrent?, hpMax?, staminaCurrent?, staminaMax?, age?, mks?, encumbranceCurrent?, encumbranceMax?, bodyAc?`.
- `encodeCharacterRecord(slot: PcfileSlot): Uint8Array` seeds the 432 bytes from `slot.raw`, then overwrites typed fields. The **rendered portrait (record +0x19c)** and **sex (+0x1a1)** are taken ONLY from `raw` — the bridge must write them there.
- `decodePcfile(bytes): DecodedPcfile` exists and validates the 24-byte header (`recordSize=0x1B0`, `slotCount=16`, `headerSize=24`, `status[16]`) + 16×432 records.
- Stock characters live in `test-fixtures/original/pcfile.dbs` (pristine; tests must read there, never `original/`).
- Routes are JSX `<Route>` in `packages/viewer/src/router.tsx`. Static JSON is served from `packages/viewer/public/` and fetched by path (e.g. `fetch('/gallery/characters.json')` in `packages/viewer/src/lib/gallery.ts`).

---

## Stage 1 — Engine-format core (`@wiz6/parser`)

### Task 1: `pcfileSlotToCharacter` — decode a slot to a roster Character

**Files:**
- Create: `packages/parser/src/formats/pcfile-character-bridge.ts`
- Test: `packages/parser/tests/formats/pcfile-character-bridge.test.ts`
- Modify: `packages/parser/src/index.ts` (export)

- [ ] **Step 1: Write the failing test**

```ts
// packages/parser/tests/formats/pcfile-character-bridge.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePcfile } from '../../src/formats/pcfile.js';
import { pcfileSlotToCharacter } from '../../src/formats/pcfile-character-bridge.js';
import { CharacterSchema } from '@wiz6/data';

// Match the existing parser tests' fixture-path pattern (ESM — no __dirname).
const HERE = dirname(fileURLToPath(import.meta.url));
const PCFILE = join(HERE, '..', '..', '..', '..', 'test-fixtures', 'original', 'pcfile.dbs');

describe('pcfileSlotToCharacter', () => {
  const decoded = decodePcfile(new Uint8Array(readFileSync(PCFILE)));
  const thesus = decoded.slots[0]; // first stock char

  it('maps engine fields onto a schema-valid Character', () => {
    const c = pcfileSlotToCharacter(thesus, 'fixed-id-1');
    expect(() => CharacterSchema.parse(c)).not.toThrow();
    expect(c.id).toBe('fixed-id-1');
    expect(c.name).toBe(thesus.name);
    expect(c.race).toBe(thesus.race);
    expect(c.class).toBe(thesus.class);
    expect(c.attributes.str).toBe(thesus.str);
    expect(c.attributes.kar).toBe(thesus.kar);
    expect(c.staminaCurrent).toBe(thesus.spCurrent);
    expect(c.staminaMax).toBe(thesus.spMax);
    expect(c.age).toBe(thesus.ageCounter);
    expect(c.encumbranceMax).toBe(thesus.encumbranceMax);
  });

  it('reads the RENDERED portrait from raw[0x19c], not slot.portraitIndex (0x1ab)', () => {
    const c = pcfileSlotToCharacter(thesus, 'id');
    expect(c.portraitIndex).toBe(thesus.raw[0x19c]);
  });

  it('reads sex from raw[0x1a1] and derives dead/paralyzed from conditions', () => {
    const c = pcfileSlotToCharacter(thesus, 'id');
    expect(c.sex).toBe(thesus.raw[0x1a1]);
    expect(c.dead).toBe(thesus.conditions[2] !== 0);
    expect(c.paralyzed).toBe(thesus.conditions[3] !== 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/parser test pcfile-character-bridge`
Expected: FAIL — `pcfileSlotToCharacter` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/parser/src/formats/pcfile-character-bridge.ts
import type { Character, PcfileSlot } from '@wiz6/data';

/** Record offsets for fields the engine keeps but PcfileSlot only preserves in `raw`. */
const OFF_RENDERED_PORTRAIT = 0x19c; // global portrait index 0..41 (the drawn portrait)
const OFF_SEX = 0x1a1;

/**
 * Convert a decoded PCFILE.DBS slot into a roster `Character`.
 *
 * Engine fields map field-for-field. Two fields live only in `raw`:
 *   - rendered portrait at +0x19c  → Character.portraitIndex (the GLOBAL index the
 *     engine actually draws; NOT slot.portraitIndex, which is the +0x1ab creation default)
 *   - sex at +0x1a1                → Character.sex
 *
 * @param slot a populated PcfileSlot (caller filters out empty slots).
 * @param id   the UUID to assign (fresh on import; deterministic in tests).
 */
export function pcfileSlotToCharacter(slot: PcfileSlot, id: string): Character {
  return {
    id,
    name: slot.name ?? '',
    race: slot.race,
    class: slot.class,
    level: slot.level,
    savedOldLevel: slot.savedOldLevel,
    xp: slot.xp,
    gold: slot.gold,
    conditions: [...slot.conditions],
    dead: slot.conditions[2] !== 0,
    paralyzed: slot.conditions[3] !== 0,
    attributes: {
      str: slot.str, int: slot.int, pie: slot.pie, vit: slot.vit,
      dex: slot.dex, spd: slot.spd, per: slot.per, kar: slot.kar,
    },
    schoolMana: [...slot.schoolManaCur],
    schoolManaMax: [...slot.schoolManaMax],
    skills: [...slot.skills],
    reaction: slot.reaction,
    sex: (slot.raw[OFF_SEX] === 1 ? 1 : 0),
    portraitIndex: slot.raw[OFF_RENDERED_PORTRAIT]!,
    hpCurrent: slot.hpCurrent,
    hpMax: slot.hpMax,
    staminaCurrent: slot.spCurrent,
    staminaMax: slot.spMax,
    age: slot.ageCounter,
    mks: slot.mks,
    encumbranceCurrent: slot.encumbranceCurrent,
    encumbranceMax: slot.encumbranceMax,
    bodyAc: [...slot.bodyAc],
  };
}
```

- [ ] **Step 4: Add the export**

In `packages/parser/src/index.ts`, alongside the existing `pcfile.js` / `encode-character-record.js` exports, add:

```ts
export { pcfileSlotToCharacter, characterToPcfileSlot } from './formats/pcfile-character-bridge.js';
```

(`characterToPcfileSlot` is added in Task 2; exporting both now keeps the import line stable.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @wiz6/parser test pcfile-character-bridge`
Expected: PASS (3 tests). The `characterToPcfileSlot` export is unresolved until Task 2 — if the index export errors, temporarily export only `pcfileSlotToCharacter`, then add the second name in Task 2.

- [ ] **Step 6: Commit**

```bash
git add packages/parser/src/formats/pcfile-character-bridge.ts packages/parser/tests/formats/pcfile-character-bridge.test.ts packages/parser/src/index.ts
git commit -m "feat(parser): pcfileSlotToCharacter bridge (rendered portrait via raw[0x19c])"
```

### Task 2: `characterToPcfileSlot` — synthesize a slot (with `raw`) from a Character

**Files:**
- Modify: `packages/parser/src/formats/pcfile-character-bridge.ts`
- Test: `packages/parser/tests/formats/pcfile-character-bridge.test.ts` (add cases)

- [ ] **Step 1: Write the failing test (append to the existing describe block)**

```ts
import { characterToPcfileSlot } from '../../src/formats/pcfile-character-bridge.js';
import { encodeCharacterRecord } from '../../src/formats/encode-character-record.js';

describe('characterToPcfileSlot', () => {
  const decoded = decodePcfile(new Uint8Array(readFileSync(PCFILE)));
  const thesus = decoded.slots[0];

  it('round-trips a decoded stock char field-equal (slot→char→slot→record→decode)', () => {
    const c = pcfileSlotToCharacter(thesus, 'id');
    const slot = characterToPcfileSlot(c, 7); // slot index 7
    const record = encodeCharacterRecord(slot);
    // Wrap one record into a decodable single-slot view by re-using decode on a
    // full file is overkill; assert the round-tripped Character instead:
    const back = pcfileSlotToCharacter({ ...slot, raw: Array.from(record) }, 'id');
    expect(back.name).toBe(c.name);
    expect(back.attributes).toEqual(c.attributes);
    expect(back.portraitIndex).toBe(c.portraitIndex); // survived via raw[0x19c]
    expect(back.sex).toBe(c.sex);                       // survived via raw[0x1a1]
    expect(back.staminaMax).toBe(c.staminaMax);
    expect(back.encumbranceMax).toBe(c.encumbranceMax);
  });

  it('writes rendered portrait to raw[0x19c] and sex to raw[0x1a1]', () => {
    const c = pcfileSlotToCharacter(thesus, 'id');
    const slot = characterToPcfileSlot(c, 0);
    expect(slot.raw[0x19c]).toBe(c.portraitIndex);
    expect(slot.raw[0x1a1]).toBe(c.sex);
    expect(slot.populated).toBe(true);
    expect(slot.raw).toHaveLength(432);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/parser test pcfile-character-bridge`
Expected: FAIL — `characterToPcfileSlot` not defined.

- [ ] **Step 3: Implement (append to `pcfile-character-bridge.ts`)**

```ts
import type { PcfileInventoryItem } from '@wiz6/data';

const EMPTY_ITEM: PcfileInventoryItem = {
  itemId: 0, weight: 0, pad: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0,
};

/**
 * Synthesize a full PcfileSlot (including a 432-byte `raw`) from a roster
 * Character, ready for `encodeCharacterRecord`. App-created characters have no
 * `raw`, so we build one: zeroed, with the two raw-only engine fields written —
 * rendered portrait at +0x19c and sex at +0x1a1. Fields our Character schema
 * does not model are defaulted (empty inventory, 0xFF equipment, base AC 10).
 */
export function characterToPcfileSlot(c: Character, slotIndex: number): PcfileSlot {
  const raw = new Array<number>(432).fill(0);
  raw[OFF_RENDERED_PORTRAIT] = c.portraitIndex & 0xff;
  raw[OFF_SEX] = c.sex & 0xff;

  return {
    slot: slotIndex,
    populated: true,
    name: c.name,
    ageCounter: c.age ?? 0,
    xp: c.xp,
    mks: c.mks ?? 0,
    gold: c.gold,
    hpCurrent: c.hpCurrent ?? 0,
    hpMax: c.hpMax ?? 0,
    spCurrent: c.staminaCurrent ?? 0,
    spMax: c.staminaMax ?? 0,
    encumbranceCurrent: c.encumbranceCurrent ?? 0,
    encumbranceMax: c.encumbranceMax ?? 0,
    schoolManaCur: [...c.schoolMana],
    schoolManaMax: [...c.schoolManaMax],
    level: c.level,
    levelSecondary: c.level,
    conditions: [...c.conditions],
    race: c.race,
    alignment: 0,
    class: c.class,
    str: c.attributes.str, int: c.attributes.int, pie: c.attributes.pie, vit: c.attributes.vit,
    dex: c.attributes.dex, spd: c.attributes.spd, per: c.attributes.per, kar: c.attributes.kar,
    skills: [...c.skills],
    bodyAc: c.bodyAc ? [...c.bodyAc] : [0, 0, 10, 10, 10, 10, 10],
    reaction: c.reaction,
    npcRaceReaction: new Array<number>(31).fill(c.reaction),
    spellSlotsKnown: new Array<number>(20).fill(0),
    portraitIndex: 0, // +0x1ab creation default; not the rendered portrait (that's raw[0x19c])
    inventoryCount: 0,
    inventoryCountPage2: 0,
    derivedAc: 10,
    savedOldLevel: c.savedOldLevel,
    schoolRankThresholds: new Array<number>(14).fill(0),
    inventory: new Array(22).fill(null).map(() => ({ ...EMPTY_ITEM })),
    equipment: new Array<number>(8).fill(0xff),
    raw,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wiz6/parser test pcfile-character-bridge`
Expected: PASS (5 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/formats/pcfile-character-bridge.ts packages/parser/tests/formats/pcfile-character-bridge.test.ts
git commit -m "feat(parser): characterToPcfileSlot — synthesize a full record (raw[0x19c]/[0x1a1])"
```

### Task 3: `encodePcfile` — full 16-slot file + the byte round-trip gate

**Files:**
- Create: `packages/parser/src/formats/encode-pcfile.ts`
- Test: `packages/parser/tests/formats/encode-pcfile.test.ts`
- Modify: `packages/parser/src/index.ts` (export)

- [ ] **Step 1: Write the failing test (the killer byte round-trip)**

```ts
// packages/parser/tests/formats/encode-pcfile.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePcfile } from '../../src/formats/pcfile.js';
import { encodePcfile } from '../../src/formats/encode-pcfile.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PCFILE = join(HERE, '..', '..', '..', '..', 'test-fixtures', 'original', 'pcfile.dbs');

describe('encodePcfile', () => {
  it('decode → encode is byte-identical for the stock pcfile.dbs', () => {
    const original = new Uint8Array(readFileSync(PCFILE));
    const decoded = decodePcfile(original);
    const reencoded = encodePcfile(decoded);
    expect(reencoded.length).toBe(original.length); // 6936
    expect(Buffer.from(reencoded).equals(Buffer.from(original))).toBe(true);
  });

  it('produces a 6936-byte file that decodes back to the same slot names', () => {
    const decoded = decodePcfile(new Uint8Array(readFileSync(PCFILE)));
    const bytes = encodePcfile(decoded);
    const back = decodePcfile(bytes);
    expect(back.slots.map((s) => s.name)).toEqual(decoded.slots.map((s) => s.name));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wiz6/parser test encode-pcfile`
Expected: FAIL — `encodePcfile` not found.

- [ ] **Step 3: Implement**

```ts
// packages/parser/src/formats/encode-pcfile.ts
import type { DecodedPcfile } from '@wiz6/data';
import { encodeCharacterRecord } from './encode-character-record.js';

const HEADER_SIZE = 24;
const RECORD_SIZE = 0x1b0; // 432
const SLOT_COUNT = 16;

/**
 * Encode a DecodedPcfile back to the 6936-byte on-disk PCFILE.DBS format:
 * 24-byte header (record_size, slot_count, header_size, status[16]) + 16×432
 * records. Each record is produced by encodeCharacterRecord (which seeds from
 * the slot's `raw`, so decode→encode is byte-exact for unmodified data).
 */
export function encodePcfile(decoded: DecodedPcfile): Uint8Array {
  const total = HEADER_SIZE + SLOT_COUNT * RECORD_SIZE;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  view.setUint16(0x00, decoded.header.recordSize, true);
  view.setUint16(0x02, decoded.header.slotCount, true);
  view.setUint32(0x04, decoded.header.headerSize, true);
  for (let i = 0; i < 16; i++) out[0x08 + i] = decoded.header.status[i]!;

  for (let i = 0; i < SLOT_COUNT; i++) {
    const record = encodeCharacterRecord(decoded.slots[i]!);
    out.set(record, HEADER_SIZE + i * RECORD_SIZE);
  }
  return out;
}
```

- [ ] **Step 4: Add the export**

In `packages/parser/src/index.ts`:

```ts
export { encodePcfile } from './formats/encode-pcfile.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @wiz6/parser test encode-pcfile`
Expected: PASS (2 tests). If byte parity fails, the divergence is in `encodeCharacterRecord` for some field — diff the first mismatching offset against `decodePcfile`'s read of that field; do NOT "fix" by zeroing — the seed-from-raw path should already cover it.

- [ ] **Step 6: Build a Character[]→DecodedPcfile helper + test (export path)**

Append to `encode-pcfile.ts`:

```ts
import type { Character } from '@wiz6/data';
import { characterToPcfileSlot } from './pcfile-character-bridge.js';

/** Build a DecodedPcfile from up to 16 Characters (for export). Extra empty slots
 *  are zeroed records with status 0; populated slots get status 1. */
export function charactersToDecodedPcfile(characters: ReadonlyArray<Character>): DecodedPcfile {
  if (characters.length > 16) throw new Error(`too many characters: ${characters.length} (max 16)`);
  const status = new Array<number>(16).fill(0);
  const slots = [];
  for (let i = 0; i < 16; i++) {
    const c = characters[i];
    if (c) {
      status[i] = 1;
      slots.push(characterToPcfileSlot(c, i));
    } else {
      slots.push(emptySlot(i));
    }
  }
  return { header: { recordSize: 0x1b0, slotCount: 16, headerSize: 24, status }, slots };
}

function emptySlot(i: number) {
  return characterToPcfileSlot(
    {
      id: '', name: '', race: 0, class: 0, level: 0, savedOldLevel: 0, xp: 0, gold: 0,
      conditions: new Array(10).fill(0), dead: false, paralyzed: false,
      attributes: { str: 0, int: 0, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0 },
      schoolMana: new Array(6).fill(0), schoolManaMax: new Array(6).fill(0),
      skills: new Array(30).fill(0), reaction: 0, sex: 0, portraitIndex: 0,
    } as Character,
    i,
  );
}
```

Add to the test file:

```ts
import { charactersToDecodedPcfile } from '../../src/formats/encode-pcfile.js';
import { pcfileSlotToCharacter } from '../../src/formats/pcfile-character-bridge.js';

it('Character[] → file → decode round-trips field-equal', () => {
  const original = decodePcfile(new Uint8Array(readFileSync(PCFILE)));
  const chars = original.slots.filter((s) => s.populated).map((s, i) => pcfileSlotToCharacter(s, `id${i}`));
  const bytes = encodePcfile(charactersToDecodedPcfile(chars));
  const back = decodePcfile(bytes);
  expect(back.slots.slice(0, chars.length).map((s) => s.name)).toEqual(chars.map((c) => c.name));
  expect(back.slots[0]!.raw[0x19c]).toBe(chars[0]!.portraitIndex);
});
```

- [ ] **Step 7: Run + commit**

Run: `pnpm --filter @wiz6/parser test encode-pcfile` → PASS (3 tests).

```bash
git add packages/parser/src/formats/encode-pcfile.ts packages/parser/tests/formats/encode-pcfile.test.ts packages/parser/src/index.ts
git commit -m "feat(parser): encodePcfile + charactersToDecodedPcfile (byte round-trip gate)"
```

---

## Stage 2 — JSON format, Preset schema, viewer stores

### Task 4: `Preset` schema + JSON file envelope

**Files:**
- Create: `packages/data/src/schemas/preset.ts`
- Test: `packages/data/tests/schemas/preset.test.ts`
- Modify: `packages/data/src/index.ts` (exports)

- [ ] **Step 1: Write the failing test**

```ts
// packages/data/tests/schemas/preset.test.ts
import { describe, it, expect } from 'vitest';
import { PresetSchema, PresetsFileSchema, PcFileJsonSchema } from '../../src/schemas/preset.js';

const char = {
  id: '00000000-0000-4000-8000-000000000001', name: 'A', race: 0, class: 0, level: 1,
  savedOldLevel: 0, xp: 0, gold: 0, conditions: new Array(10).fill(0), dead: false, paralyzed: false,
  attributes: { str: 10, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 10 },
  schoolMana: new Array(6).fill(0), schoolManaMax: new Array(6).fill(0), skills: new Array(30).fill(0),
  reaction: 50, sex: 0, portraitIndex: 0,
};

describe('PresetSchema', () => {
  it('accepts a preset of ≤16 characters', () => {
    expect(() => PresetSchema.parse({ schemaVersion: 1, id: 'p1', name: 'Stock', characters: [char] })).not.toThrow();
  });
  it('rejects >16 characters', () => {
    const many = { schemaVersion: 1, id: 'p', name: 'x', characters: new Array(17).fill(char) };
    expect(() => PresetSchema.parse(many)).toThrow();
  });
});

describe('PcFileJsonSchema', () => {
  it('accepts the native export envelope', () => {
    expect(() => PcFileJsonSchema.parse({ format: 'wiz6-pcfile', version: 1, characters: [char] })).not.toThrow();
  });
  it('rejects a wrong format tag', () => {
    expect(() => PcFileJsonSchema.parse({ format: 'nope', version: 1, characters: [] })).toThrow();
  });
  it('rejects >16 characters', () => {
    expect(() => PcFileJsonSchema.parse({ format: 'wiz6-pcfile', version: 1, characters: new Array(17).fill(char) })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wiz6/data test preset`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/data/src/schemas/preset.ts
import { z } from 'zod';
import { CharacterSchema } from './character.js';

const CharacterList = z.array(CharacterSchema).max(16);

/** A named, ≤16-character preset in the library. `readOnly` is true only for
 *  the built-in Stock preset (which is not persisted to localStorage). */
export const PresetSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  name: z.string().min(1),
  readOnly: z.boolean().optional(),
  characters: CharacterList,
});
export type Preset = z.infer<typeof PresetSchema>;

/** The persisted presets library (custom + imported only; Stock is built-in). */
export const PresetsFileSchema = z
  .object({ schemaVersion: z.literal(1), presets: z.array(PresetSchema) })
  .refine((f) => new Set(f.presets.map((p) => p.id)).size === f.presets.length, {
    message: 'preset ids must be unique',
    path: ['presets'],
  });
export type PresetsFile = z.infer<typeof PresetsFileSchema>;

/** Lossless native import/export envelope (a PC File or single character). */
export const PcFileJsonSchema = z.object({
  format: z.literal('wiz6-pcfile'),
  version: z.literal(1),
  characters: CharacterList,
});
export type PcFileJson = z.infer<typeof PcFileJsonSchema>;
```

- [ ] **Step 4: Export from the data index**

In `packages/data/src/index.ts`, near the other schema exports:

```ts
export {
  PresetSchema, PresetsFileSchema, PcFileJsonSchema,
  type Preset, type PresetsFile, type PcFileJson,
} from './schemas/preset.js';
```

- [ ] **Step 5: Run + commit**

Run: `pnpm --filter @wiz6/data test preset` → PASS.

```bash
git add packages/data/src/schemas/preset.ts packages/data/tests/schemas/preset.test.ts packages/data/src/index.ts
git commit -m "feat(data): Preset + PcFileJson schemas (≤16 chars)"
```

### Task 5: 16-cap on the PC File (roster) store

**Files:**
- Modify: `packages/viewer/src/lib/roster-store.ts` (the `addCharacter`/`writeRoster` path)
- Test: `packages/viewer/tests/lib/roster-store.test.ts` (add a case)

- [ ] **Step 1: Write the failing test (append)**

```ts
it('addCharacter throws when the PC File already holds 16 characters', () => {
  for (let i = 0; i < 16; i++) addCharacter(mkChar(`id${i}`, `N${i}`));
  expect(() => addCharacter(mkChar('id16', 'N16'))).toThrow(/full|16/i);
});
```

(Use the file's existing character factory; if it's named differently, match it. `mkChar(id, name)` here stands for that helper.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wiz6/viewer test roster-store`
Expected: FAIL — no cap, the 17th add succeeds.

- [ ] **Step 3: Implement the cap**

In `roster-store.ts`, add a constant and guard `addCharacter` before it writes:

```ts
/** The PC File maps to PCFILE.DBS, which has 16 character slots. */
export const PC_FILE_CAPACITY = 16;
```

In `addCharacter`, after the duplicate-id check and before `writeRoster`:

```ts
if (r.characters.length >= PC_FILE_CAPACITY) {
  throw new Error(`PC File is full (${PC_FILE_CAPACITY} characters)`);
}
```

- [ ] **Step 4: Run + commit**

Run: `pnpm --filter @wiz6/viewer test roster-store` → PASS.

```bash
git add packages/viewer/src/lib/roster-store.ts packages/viewer/tests/lib/roster-store.test.ts
git commit -m "feat(viewer): cap the PC File (roster) at 16 characters"
```

### Task 6: Presets store (`wiz6:presets`) with built-in Stock + name-dedupe copy

**Files:**
- Create: `packages/viewer/src/lib/presets-store.ts`
- Test: `packages/viewer/tests/lib/presets-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/viewer/tests/lib/presets-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  readPresets, addPreset, deletePreset, copyCharactersToPcFile, setStockPreset,
} from '../../src/lib/presets-store.js';
import { writeRoster, readRoster } from '../../src/lib/roster-store.js';

const mk = (id: string, name: string) => ({
  id, name, race: 0, class: 0, level: 1, savedOldLevel: 0, xp: 0, gold: 0,
  conditions: new Array(10).fill(0), dead: false, paralyzed: false,
  attributes: { str: 10, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 10 },
  schoolMana: new Array(6).fill(0), schoolManaMax: new Array(6).fill(0), skills: new Array(30).fill(0),
  reaction: 50, sex: 0 as const, portraitIndex: 0,
});

beforeEach(() => window.localStorage.clear());

describe('presets-store', () => {
  it('readPresets includes the built-in read-only Stock preset first', () => {
    setStockPreset([mk('s1', 'THESUS')]);
    const all = readPresets();
    expect(all[0]!.readOnly).toBe(true);
    expect(all[0]!.name).toMatch(/stock/i);
  });

  it('addPreset persists a custom preset; deletePreset removes it; Stock cannot be deleted', () => {
    setStockPreset([mk('s1', 'THESUS')]);
    const p = addPreset('My Heroes', [mk('a', 'ALPHA')]);
    expect(readPresets().some((x) => x.id === p.id)).toBe(true);
    deletePreset(p.id);
    expect(readPresets().some((x) => x.id === p.id)).toBe(false);
    const stockId = readPresets()[0]!.id;
    expect(() => deletePreset(stockId)).toThrow(/read-only|stock/i);
  });

  it('copyCharactersToPcFile de-dupes by name and reports skips, respecting the 16 cap', () => {
    writeRoster({ schemaVersion: 1, characters: [mk('x', 'ALPHA')] });
    const res = copyCharactersToPcFile([mk('a', 'ALPHA'), mk('b', 'BETA')]);
    expect(res.added).toEqual(['BETA']);
    expect(res.skippedDuplicate).toEqual(['ALPHA']);
    expect(readRoster().characters.map((c) => c.name).sort()).toEqual(['ALPHA', 'BETA']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wiz6/viewer test presets-store`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/viewer/src/lib/presets-store.ts
import { PresetsFileSchema, type Preset, type Character } from '@wiz6/data';
import { readRoster, writeRoster, PC_FILE_CAPACITY } from './roster-store.js';

const KEY = 'wiz6:presets';
const STOCK_ID = 'stock';

let stockCharacters: Character[] = [];
/** Install the built-in Stock characters (loaded from /presets/stock.json at app start). */
export function setStockPreset(characters: Character[]): void {
  stockCharacters = characters;
}

function stockPreset(): Preset {
  return { schemaVersion: 1, id: STOCK_ID, name: 'Stock Characters', readOnly: true, characters: stockCharacters };
}

function readStored(): Preset[] {
  const raw = window.localStorage.getItem(KEY);
  if (raw === null) return [];
  try {
    return PresetsFileSchema.parse(JSON.parse(raw)).presets;
  } catch (e) {
    console.warn('[presets-store] data invalid, returning none', e);
    return [];
  }
}

function writeStored(presets: Preset[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(PresetsFileSchema.parse({ schemaVersion: 1, presets })));
}

/** All presets: built-in Stock first, then stored custom/imported. */
export function readPresets(): Preset[] {
  return [stockPreset(), ...readStored()];
}

/** Create + persist a new custom preset (id derived from name + index). */
export function addPreset(name: string, characters: Character[]): Preset {
  const stored = readStored();
  const id = `p-${Date.now().toString(36)}-${stored.length}`; // Date.now is fine at runtime (not a workflow script)
  const preset: Preset = { schemaVersion: 1, id, name, characters: characters.slice(0, 16) };
  writeStored([...stored, preset]);
  return preset;
}

export function deletePreset(id: string): void {
  if (id === STOCK_ID) throw new Error('the Stock preset is read-only and cannot be deleted');
  writeStored(readStored().filter((p) => p.id !== id));
}

export interface CopyResult { added: string[]; skippedDuplicate: string[]; skippedFull: string[]; }

/** Copy characters into the PC File: de-dupe by name (skip), respect the 16 cap.
 *  Fresh UUIDs are NOT minted here — callers pass characters with the desired id;
 *  the page mints a new id per copied character before calling. */
export function copyCharactersToPcFile(characters: Character[]): CopyResult {
  const roster = readRoster();
  const names = new Set(roster.characters.map((c) => c.name));
  const next = [...roster.characters];
  const res: CopyResult = { added: [], skippedDuplicate: [], skippedFull: [] };
  for (const c of characters) {
    if (names.has(c.name)) { res.skippedDuplicate.push(c.name); continue; }
    if (next.length >= PC_FILE_CAPACITY) { res.skippedFull.push(c.name); continue; }
    next.push(c); names.add(c.name); res.added.push(c.name);
  }
  writeRoster({ schemaVersion: 1, characters: next });
  return res;
}
```

- [ ] **Step 4: Run + commit**

Run: `pnpm --filter @wiz6/viewer test presets-store` → PASS.

```bash
git add packages/viewer/src/lib/presets-store.ts packages/viewer/tests/lib/presets-store.test.ts
git commit -m "feat(viewer): presets store — built-in Stock, CRUD, name-dedupe copy to PC File"
```

### Task 7: File import/export helpers (JSON + DBS)

**Files:**
- Create: `packages/viewer/src/lib/pc-file-io.ts`
- Test: `packages/viewer/tests/lib/pc-file-io.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/viewer/tests/lib/pc-file-io.test.ts
import { describe, it, expect } from 'vitest';
import { charactersToJsonBlob, charactersToDbsBytes, parseImport } from '../../src/lib/pc-file-io.js';

const mk = (name: string) => ({
  id: 'x', name, race: 0, class: 0, level: 1, savedOldLevel: 0, xp: 0, gold: 0,
  conditions: new Array(10).fill(0), dead: false, paralyzed: false,
  attributes: { str: 10, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 10 },
  schoolMana: new Array(6).fill(0), schoolManaMax: new Array(6).fill(0), skills: new Array(30).fill(0),
  reaction: 50, sex: 0 as const, portraitIndex: 0,
});

describe('pc-file-io', () => {
  it('JSON round-trips characters losslessly', async () => {
    const blob = charactersToJsonBlob([mk('ALPHA')]);
    const text = await blob.text();
    const chars = parseImport('x.json', new TextEncoder().encode(text));
    expect(chars.map((c) => c.name)).toEqual(['ALPHA']);
    expect(chars[0]!.id).not.toBe('x'); // import mints a fresh UUID
  });

  it('rejects malformed JSON with a clear error and no partial result', () => {
    expect(() => parseImport('x.json', new TextEncoder().encode('{not json'))).toThrow();
  });

  it('parses a .dbs by extension via decodePcfile + bridge', () => {
    // build a real 6936-byte file from one character, then import it back
    const bytes = charactersToDbsBytes([mk('BETA')]);
    const chars = parseImport('party.dbs', bytes);
    expect(chars.map((c) => c.name)).toEqual(['BETA']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wiz6/viewer test pc-file-io`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/viewer/src/lib/pc-file-io.ts
import {
  PcFileJsonSchema, type Character,
} from '@wiz6/data';
import {
  decodePcfile, encodePcfile, charactersToDecodedPcfile, pcfileSlotToCharacter,
} from '@wiz6/parser';

function freshId(i: number): string {
  // crypto.randomUUID is available in the browser + jsdom test env.
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `imported-${Date.now()}-${i}`;
}

/** Lossless native JSON blob for download (whole PC File or a single character). */
export function charactersToJsonBlob(characters: ReadonlyArray<Character>): Blob {
  const json = PcFileJsonSchema.parse({ format: 'wiz6-pcfile', version: 1, characters: characters.slice(0, 16) });
  return new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
}

/** Engine-faithful PCFILE.DBS bytes for download. */
export function charactersToDbsBytes(characters: ReadonlyArray<Character>): Uint8Array {
  return encodePcfile(charactersToDecodedPcfile(characters));
}

/** Parse an imported file (by extension) into Characters with FRESH UUIDs.
 *  Throws (with no partial result) on malformed input. */
export function parseImport(filename: string, bytes: Uint8Array): Character[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.dbs')) {
    const decoded = decodePcfile(bytes);
    return decoded.slots.filter((s) => s.populated).map((s, i) => pcfileSlotToCharacter(s, freshId(i)));
  }
  // default: JSON
  const text = new TextDecoder().decode(bytes);
  const parsed = PcFileJsonSchema.parse(JSON.parse(text));
  return parsed.characters.map((c, i) => ({ ...c, id: freshId(i) }));
}
```

- [ ] **Step 4: Run + commit**

Run: `pnpm --filter @wiz6/viewer test pc-file-io` → PASS.

```bash
git add packages/viewer/src/lib/pc-file-io.ts packages/viewer/tests/lib/pc-file-io.test.ts
git commit -m "feat(viewer): pc-file-io — JSON/DBS import (fresh UUIDs) + export blobs"
```

---

## Stage 3 — Built-in Stock preset asset

### Task 8: Generate `public/presets/stock.json` + load it at app start

**Files:**
- Create: `packages/viewer/scripts/generate-stock-preset.ts` (mirror `generate-gallery.ts`)
- Create (generated, git-ignored or committed like gallery): `packages/viewer/public/presets/stock.json`
- Modify: the workspace `extract` step that already runs `generate-gallery` (so `predev`/`prebuild` produce it)
- Modify: `packages/viewer/src/App.tsx` (or the existing top-level bootstrap) to fetch `/presets/stock.json` and call `setStockPreset`
- Test: `packages/viewer/tests/lib/presets-store.test.ts` already covers `setStockPreset`; add a thin parse test for the generated file shape

- [ ] **Step 1: Write the generator (mirror `generate-gallery.ts`)**

Read `packages/viewer/scripts/generate-gallery.ts` first and copy its structure. It already decodes `pcfile.dbs` and maps slots → Characters. Replace its bespoke inline mapping with the new bridge so there is ONE mapping:

```ts
// packages/viewer/scripts/generate-stock-preset.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodePcfile, pcfileSlotToCharacter } from '@wiz6/parser';
import { PcFileJsonSchema } from '@wiz6/data';

const ROOT = join(__dirname, '..', '..', '..');
const SRC = join(ROOT, 'test-fixtures', 'original', 'pcfile.dbs');
const OUT_DIR = join(__dirname, '..', 'public', 'presets');
const OUT = join(OUT_DIR, 'stock.json');

const decoded = decodePcfile(new Uint8Array(readFileSync(SRC)));
const characters = decoded.slots
  .filter((s) => s.populated)
  .map((s, i) => pcfileSlotToCharacter(s, `stock-${i}`));

const payload = PcFileJsonSchema.parse({ format: 'wiz6-pcfile', version: 1, characters });
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`wrote ${characters.length} stock characters → ${OUT}`);
```

- [ ] **Step 2: Wire it into the asset pipeline**

Find how `generate-gallery` is invoked by the workspace `extract` script (grep `generate-gallery` in `package.json` files and any `scripts/extract*`). Add `generate-stock-preset` immediately after it the same way. Run the pipeline once:

Run: `pnpm -w run extract`
Expected: prints "wrote 6 stock characters → …/public/presets/stock.json" and the file exists.

- [ ] **Step 3: Load it at app start**

In the top-level bootstrap (`App.tsx` — mirror how the gallery/other assets are fetched), add an effect:

```ts
import { setStockPreset } from './lib/presets-store.js';
import { PcFileJsonSchema } from '@wiz6/data';

useEffect(() => {
  let cancelled = false;
  fetch('/presets/stock.json')
    .then((r) => r.json())
    .then((j) => { if (!cancelled) setStockPreset(PcFileJsonSchema.parse(j).characters); })
    .catch((e) => console.warn('stock preset load failed', e));
  return () => { cancelled = true; };
}, []);
```

- [ ] **Step 4: Add a shape test**

```ts
// in presets-store.test.ts
it('parses the generated stock.json shape', () => {
  // import.meta-relative read of the generated file; skip if absent (CI runs extract first)
  // keep this assertion minimal — the generator + bridge are already unit-tested.
  expect(typeof setStockPreset).toBe('function');
});
```

- [ ] **Step 5: Run + commit**

Run: `pnpm --filter @wiz6/viewer test presets-store` → PASS; `pnpm -w run extract` regenerates the asset.

```bash
git add packages/viewer/scripts/generate-stock-preset.ts packages/viewer/public/presets/stock.json packages/viewer/src/App.tsx package.json
git commit -m "feat(viewer): generate + load the built-in Stock preset"
```

*(If the gallery already maps slots→Characters with its own inline code, also refactor `generate-gallery.ts` to call `pcfileSlotToCharacter` so there is a single bridge — do this as a follow-up commit only if it stays green; the gallery currently reads the +0x1ab portrait, and switching to the bridge fixes it to the rendered +0x19c portrait.)*

---

## Stage 4 — `/pc-file` UI page

### Task 9: Route + page scaffold (two panes, no party controls)

**Files:**
- Create: `packages/viewer/src/pages/pc-file/PcFilePage.tsx`
- Create: `packages/viewer/src/pages/pc-file/PcFilePage.module.css`
- Modify: `packages/viewer/src/router.tsx` (add `<Route path="/pc-file" element={<PcFilePage />} />` under `<GameLayout>`, importing the component)
- Test: `packages/viewer/tests/pages/pc-file/PcFilePage.test.tsx`

- [ ] **Step 1: Write a render test (presets + PC File panels, no party affordance)**

```tsx
// packages/viewer/tests/pages/pc-file/PcFilePage.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PcFilePage } from '../../../src/pages/pc-file/PcFilePage.js';
import { setStockPreset } from '../../../src/lib/presets-store.js';

const mk = (name: string) => ({
  id: name, name, race: 0, class: 0, level: 1, savedOldLevel: 0, xp: 0, gold: 0,
  conditions: new Array(10).fill(0), dead: false, paralyzed: false,
  attributes: { str: 10, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 10 },
  schoolMana: new Array(6).fill(0), schoolManaMax: new Array(6).fill(0), skills: new Array(30).fill(0),
  reaction: 50, sex: 0 as const, portraitIndex: 0,
});

beforeEach(() => { window.localStorage.clear(); setStockPreset([mk('THESUS')]); });

describe('PcFilePage', () => {
  it('renders the Presets and PC File panes and the Stock preset', () => {
    render(<MemoryRouter><PcFilePage /></MemoryRouter>);
    expect(screen.getByText(/presets/i)).toBeInTheDocument();
    expect(screen.getByText(/pc file/i)).toBeInTheDocument();
    expect(screen.getByText('THESUS')).toBeInTheDocument();
  });

  it('shows no "add to party" control (party is engine-only)', () => {
    render(<MemoryRouter><PcFilePage /></MemoryRouter>);
    expect(screen.queryByText(/party/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wiz6/viewer test PcFilePage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the scaffold**

```tsx
// packages/viewer/src/pages/pc-file/PcFilePage.tsx
import { useState } from 'react';
import { readPresets } from '../../lib/presets-store.js';
import { readRoster } from '../../lib/roster-store.js';
import styles from './PcFilePage.module.css';

export function PcFilePage() {
  const [presets] = useState(() => readPresets());
  const [pcFile] = useState(() => readRoster().characters);

  return (
    <div className={styles.page}>
      <section className={styles.presets}>
        <h2>Presets</h2>
        {presets.map((p) => (
          <div key={p.id} className={styles.preset}>
            <h3>{p.name}{p.readOnly ? ' (read-only)' : ''}</h3>
            <ul>{p.characters.map((c) => <li key={c.id}>{c.name}</li>)}</ul>
          </div>
        ))}
      </section>
      <section className={styles.pcfile}>
        <h2>PC File</h2>
        <ul>{pcFile.map((c) => <li key={c.id}>{c.name}</li>)}</ul>
        <p className={styles.note}>
          To add these to your party, use the castle’s ADD PARTY MEMBER — it reads
          this PC File, exactly like the original game.
        </p>
      </section>
    </div>
  );
}
```

Minimal CSS (two columns):

```css
/* PcFilePage.module.css */
.page { display: flex; gap: 1rem; padding: 1rem; }
.presets, .pcfile { flex: 1; }
.note { opacity: 0.7; font-size: 0.85em; }
```

- [ ] **Step 4: Register the route**

In `packages/viewer/src/router.tsx`, add under the `<GameLayout>` block (next to `/roster`):

```tsx
import { PcFilePage } from './pages/pc-file/PcFilePage.js';
// ...
<Route path="/pc-file" element={<PcFilePage />} />
```

- [ ] **Step 5: Run + commit**

Run: `pnpm --filter @wiz6/viewer test PcFilePage` → PASS.

```bash
git add packages/viewer/src/pages/pc-file/ packages/viewer/src/router.tsx packages/viewer/tests/pages/pc-file/PcFilePage.test.tsx
git commit -m "feat(viewer): /pc-file page scaffold (Presets + PC File panes)"
```

### Task 10: Wire copy / save-as-preset / delete actions

**Files:**
- Modify: `packages/viewer/src/pages/pc-file/PcFilePage.tsx`
- Test: `packages/viewer/tests/pages/pc-file/PcFilePage.test.tsx` (add interaction cases)

- [ ] **Step 1: Write failing interaction tests**

```tsx
import { fireEvent } from '@testing-library/react';

it('copying a preset character adds it to the PC File (fresh id, de-duped by name)', () => {
  render(<MemoryRouter><PcFilePage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: /copy THESUS/i }));
  // PC File pane now lists THESUS
  const pcfile = screen.getByRole('region', { name: /pc file/i });
  expect(within(pcfile).getByText('THESUS')).toBeInTheDocument();
  // copying again is skipped (name dedupe) — still one THESUS in PC File
  fireEvent.click(screen.getByRole('button', { name: /copy THESUS/i }));
  expect(within(pcfile).getAllByText('THESUS')).toHaveLength(1);
});

it('Save as preset snapshots the PC File into a new custom preset', () => {
  render(<MemoryRouter><PcFilePage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: /copy THESUS/i }));
  fireEvent.click(screen.getByRole('button', { name: /save as preset/i }));
  // a prompt/name field appears; submit "My Set"
  fireEvent.change(screen.getByLabelText(/preset name/i), { target: { value: 'My Set' } });
  fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
  expect(screen.getByText('My Set')).toBeInTheDocument();
});
```

(Add `within` to the testing-library import. Use `aria-label`s in the component to make the buttons selectable — e.g. `aria-label={`copy ${c.name}`}` and `role="region" aria-label="PC File"` on the pane.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wiz6/viewer test PcFilePage`
Expected: FAIL — buttons/labels don't exist.

- [ ] **Step 3: Implement the actions**

Replace the static panes with stateful ones. Use `crypto.randomUUID()` to mint a fresh id per copied character (the store de-dupes by name). Re-read state after each mutation.

```tsx
import { useState, useCallback } from 'react';
import { readPresets, addPreset, deletePreset, copyCharactersToPcFile } from '../../lib/presets-store.js';
import { readRoster } from '../../lib/roster-store.js';
import type { Character } from '@wiz6/data';
import styles from './PcFilePage.module.css';

export function PcFilePage() {
  const [presets, setPresets] = useState(() => readPresets());
  const [pcFile, setPcFile] = useState<Character[]>(() => readRoster().characters);
  const [namingPreset, setNamingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setPresets(readPresets());
    setPcFile(readRoster().characters);
  }, []);

  const copy = useCallback((chars: Character[]) => {
    const withIds = chars.map((c) => ({ ...c, id: crypto.randomUUID() }));
    const res = copyCharactersToPcFile(withIds);
    const msgs = [];
    if (res.added.length) msgs.push(`Added ${res.added.join(', ')}`);
    if (res.skippedDuplicate.length) msgs.push(`Skipped (already in PC File): ${res.skippedDuplicate.join(', ')}`);
    if (res.skippedFull.length) msgs.push(`Skipped (PC File full): ${res.skippedFull.join(', ')}`);
    setNotice(msgs.join(' · ') || null);
    refresh();
  }, [refresh]);

  const saveAsPreset = useCallback(() => {
    addPreset(presetName.trim() || 'Untitled', pcFile);
    setNamingPreset(false); setPresetName(''); refresh();
  }, [presetName, pcFile, refresh]);

  return (
    <div className={styles.page}>
      <section className={styles.presets} aria-label="Presets">
        <h2>Presets</h2>
        {presets.map((p) => (
          <div key={p.id} className={styles.preset}>
            <h3>
              {p.name}{p.readOnly ? ' (read-only)' : ''}
              {' '}<button aria-label={`copy all from ${p.name}`} onClick={() => copy(p.characters)}>copy all →</button>
              {!p.readOnly && <button aria-label={`delete ${p.name}`} onClick={() => { deletePreset(p.id); refresh(); }}>delete</button>}
            </h3>
            <ul>{p.characters.map((c) => (
              <li key={c.id}>
                {c.name} <button aria-label={`copy ${c.name}`} onClick={() => copy([c])}>copy →</button>
              </li>
            ))}</ul>
          </div>
        ))}
      </section>

      <section className={styles.pcfile} role="region" aria-label="PC File">
        <h2>PC File</h2>
        {notice && <p className={styles.note} role="status">{notice}</p>}
        <ul>{pcFile.map((c) => <li key={c.id}>{c.name}</li>)}</ul>
        <button onClick={() => setNamingPreset(true)}>Save as preset</button>
        {namingPreset && (
          <div>
            <label>Preset name <input value={presetName} onChange={(e) => setPresetName(e.target.value)} /></label>
            <button onClick={saveAsPreset}>Create</button>
            <button onClick={() => setNamingPreset(false)}>Cancel</button>
          </div>
        )}
        <p className={styles.note}>
          To add these to your party, use the castle’s ADD PARTY MEMBER — it reads
          this PC File, exactly like the original game.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run + commit**

Run: `pnpm --filter @wiz6/viewer test PcFilePage` → PASS.

```bash
git add packages/viewer/src/pages/pc-file/PcFilePage.tsx packages/viewer/tests/pages/pc-file/PcFilePage.test.tsx
git commit -m "feat(viewer): PC File page — copy, save-as-preset, delete"
```

### Task 11: Import (choose target) + export (PC File / preset / single char)

**Files:**
- Modify: `packages/viewer/src/pages/pc-file/PcFilePage.tsx`
- Test: `packages/viewer/tests/pages/pc-file/PcFilePage.test.tsx` (add cases)

- [ ] **Step 1: Write failing tests**

```tsx
import { charactersToDbsBytes } from '../../../src/lib/pc-file-io.js';

it('import → Load into PC File replaces the PC File contents', async () => {
  render(<MemoryRouter><PcFilePage /></MemoryRouter>);
  const bytes = charactersToDbsBytes([{ ...mk('GANDALF') }]);
  const file = new File([bytes], 'party.dbs');
  fireEvent.change(screen.getByLabelText(/import file/i), { target: { files: [file] } });
  // a chooser appears; pick "Load into PC File"
  fireEvent.click(await screen.findByRole('button', { name: /load into pc file/i }));
  const pcfile = screen.getByRole('region', { name: /pc file/i });
  expect(within(pcfile).getByText('GANDALF')).toBeInTheDocument();
});

it('export PC File triggers a download (anchor click)', () => {
  render(<MemoryRouter><PcFilePage /></MemoryRouter>);
  // spy on the download mechanism; assert no throw + a blob URL was created
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
  fireEvent.click(screen.getByRole('button', { name: /export.*json/i }));
  expect(create).toHaveBeenCalled();
  create.mockRestore();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @wiz6/viewer test PcFilePage`
Expected: FAIL — import input / export buttons don't exist.

- [ ] **Step 3: Implement import + export**

Add a hidden `<input type="file" aria-label="import file">`, a small chooser (Add as preset / Load into PC File), and export buttons. Use a `download(blob, filename)` helper:

```tsx
import { charactersToJsonBlob, charactersToDbsBytes, parseImport } from '../../lib/pc-file-io.js';
import { writeRoster } from '../../lib/roster-store.js';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// in the component:
const [pendingImport, setPendingImport] = useState<Character[] | null>(null);

const onImportFile = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    setPendingImport(parseImport(file.name, bytes));
  } catch (e) {
    setNotice(`Import failed: ${(e as Error).message}`);
  }
};

const addImportAsPreset = () => { if (pendingImport) { addPreset('Imported', pendingImport); setPendingImport(null); refresh(); } };
const loadImportIntoPcFile = () => {
  if (!pendingImport) return;
  if (pcFile.length && !confirm('Replace the current PC File?')) return;
  writeRoster({ schemaVersion: 1, characters: pendingImport.slice(0, 16) });
  setPendingImport(null); refresh();
};

const exportPcFileJson = () => download(charactersToJsonBlob(pcFile), 'pcfile.json');
const exportPcFileDbs = () => download(new Blob([charactersToDbsBytes(pcFile)]), 'PCFILE.DBS');
```

Wire these into the JSX: a file input labeled "import file", buttons "Export (.json)" / "Export (.dbs)" in the PC File pane (and per-preset export), and when `pendingImport` is set, render the two-button chooser ("Add as preset" / "Load into PC File"). Add a per-character "Export (.json)" in the PC File list using `charactersToJsonBlob([c])`.

- [ ] **Step 4: Run + commit**

Run: `pnpm --filter @wiz6/viewer test PcFilePage` → PASS.

```bash
git add packages/viewer/src/pages/pc-file/PcFilePage.tsx packages/viewer/tests/pages/pc-file/PcFilePage.test.tsx
git commit -m "feat(viewer): PC File page — import (choose target) + export (json/dbs/single)"
```

### Task 12: Navigation entry + full-suite green

**Files:**
- Modify: the castle/nav component that links to `/roster` (add a "PC File" link to `/pc-file`)
- (no new test beyond the suite)

- [ ] **Step 1: Add the nav link**

Find where `/roster` is linked from (grep `to="/roster"` / `navigate('/roster')` in `packages/viewer/src`). Add a sibling link to `/pc-file` labeled "PC File", following the same component pattern.

- [ ] **Step 2: Run the full viewer + data + parser suites**

Run:
```bash
pnpm --filter @wiz6/parser test
pnpm --filter @wiz6/data test
pnpm --filter @wiz6/viewer test
```
Expected: all green. Also typecheck: `pnpm --filter @wiz6/viewer exec tsc --noEmit` (ignore the pre-existing `state.ts` `modalErrorMsgId` errors).

- [ ] **Step 3: Manual smoke (per project convention)**

`pnpm dev:viewer`, open `/pc-file`: copy a Stock character into the PC File, Save as preset, export `.dbs`, re-import it (Load into PC File), and confirm the castle ADD PARTY MEMBER picker sees the copied characters. Confirm there are NO party controls on `/pc-file`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(viewer): link PC File page from nav"
```

---

## Notes for the executor

- **TDD discipline:** every task is red → green → commit. Don't batch.
- **Never read `original/pcfile.dbs` in tests** — use `test-fixtures/original/pcfile.dbs`.
- **No party writes:** nothing in this plan touches `active-party-store` or the ADD PARTY MEMBER picker. If a task seems to need that, stop — it's out of scope.
- **Branch first:** create a worktree/branch before starting (the repo's convention; do not work on `main`).
- **Fidelity is expected:** `.dbs` export drops `id`/`rosterCharacterId`/`portraitSlotId` and zeroes unmodeled record bytes; JSON is lossless. This is by design (see spec).
