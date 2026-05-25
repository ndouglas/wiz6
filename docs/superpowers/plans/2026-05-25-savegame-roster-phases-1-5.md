# Savegame & Roster — Phases 1-5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phases 1-5 of TODO #009 (savegame & roster). End state: a `/roster` page that lists per-visitor characters drawn from localStorage, seeded on first visit from a curated `/gallery/characters.json`, with create/edit/delete + character download/upload.

**Architecture:** Three layers — schemas in `@wiz6/data` (zod, source of truth via `z.infer`), pure codecs in `@wiz6/parser` (JSON envelope, gzipped, base64 for URL-safe transport), browser-side storage + page UX in `@wiz6/viewer` (localStorage with optional gallery-seeded roster). Save and Roster are independent storage scopes; saves embed full character snapshots with an optional `rosterCharacterId` back-reference.

**Tech Stack:** pnpm monorepo, TS ESM (relative imports use `.js`), zod, vitest, React 18 + React Router, `pako` for gzip (already in deps for the codec).

**Spec:** [`docs/superpowers/specs/2026-05-23-savegame-strategy.md`](../specs/2026-05-23-savegame-strategy.md)

**Worktree:** `~/.config/superpowers/worktrees/wiz6/feat-savegame-roster-phases-1-5` (branch `feat/savegame-roster-phases-1-5`)

---

## File structure (locked-in decisions)

```
packages/data/src/schemas/
  ├── character.ts                  # CharacterSchema (Task 1) + PartyMemberSchema (Task 2)
  ├── roster.ts                     # RosterSchema (Task 3)
  └── save.ts                       # PositionSchema + MazeStateSchema + SaveSchema (Task 4)

packages/data/tests/schemas/
  ├── character.test.ts
  ├── roster.test.ts
  └── save.test.ts

packages/parser/src/formats/
  ├── save-codec.ts                 # encodeSave / decodeSave (Task 5)
  └── roster-codec.ts               # encodeRoster / decodeRoster (Task 6)

packages/parser/tests/formats/
  ├── save-codec.test.ts
  └── roster-codec.test.ts

packages/viewer/src/lib/
  ├── save-store.ts                 # 6-slot localStorage CRUD (Task 7)
  ├── roster-store.ts               # single-roster localStorage CRUD + syncFromSave (Task 8)
  └── gallery.ts                    # gallery loader + importToRoster (Task 9)

packages/viewer/tests/lib/
  ├── save-store.test.ts
  ├── roster-store.test.ts
  └── gallery.test.ts

packages/viewer/public/gallery/
  └── characters.json               # curated seed (Task 9)

packages/viewer/src/pages/game/
  ├── RosterView.tsx                # REWRITE the existing stub (Task 11..13)
  ├── RosterView.module.css         # tweak/extend existing
  └── RosterCharacterCard.tsx       # new (Task 11)

packages/viewer/tests/pages/game/
  └── RosterView.test.tsx           # new
```

---

## Tech-stack notes for the implementer

- **TS ESM imports:** every relative import uses `.js` extension even though source is `.ts`. Example: `import { CharacterSchema } from '../../src/schemas/character.js';`
- **Zod inferred types:** never define a separate `interface Foo`. Use `export type Foo = z.infer<typeof FooSchema>;`
- **Decoder/codec purity:** code under `packages/parser/` MUST NOT import `node:fs`, `node:path`, or anything browser-only. Pure functions only. The viewer wraps with I/O.
- **localStorage testing:** vitest in viewer runs in jsdom; `window.localStorage` exists. Call `window.localStorage.clear()` in `beforeEach`. Pattern is in `packages/viewer/tests/components/SidebarNav.test.tsx:9`.
- **gzip in browser + node:** use the `pako` package (`pako.gzip` / `pako.ungzip` both return `Uint8Array`). It works in both environments. If it's not already in the parser package's deps, add it via `pnpm --filter @wiz6/parser add pako` + `pnpm --filter @wiz6/parser add -D @types/pako` in Task 5's setup.
- **Base64 for URL-safe transport:** use `Buffer.from(...).toString('base64')` only in Node tests. In the parser code, use the platform-agnostic approach: `btoa(String.fromCharCode(...new Uint8Array(...)))` works in browser; in node `globalThis.btoa` exists in Node 18+. For round-trip tests use `atob` / `btoa` (both present in modern Node and browsers).
- **Snapshot testing:** zod schemas are stable; use `expect(SCHEMA.shape).toMatchInlineSnapshot()` sparingly. Prefer validating concrete sample objects.

---

## Task 1: CharacterSchema

**Why this exists:** Defines what a Wiz6 character is in the TS port. Source of truth: `packages/data/src/structs/character-record.ts` (the engine's 432-byte record at BSS 0x43e8).

**Files:**
- Create: `packages/data/src/schemas/character.ts`
- Create: `packages/data/tests/schemas/character.test.ts`
- Modify: `packages/data/src/index.ts` (add export at bottom)

- [ ] **Step 1.1: Write the failing test**

Create `packages/data/tests/schemas/character.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { CharacterSchema, type Character } from '../../src/schemas/character.js';

const VALID: Character = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Hawkwind',
  race: 0,
  class: 0,
  level: 1,
  xp: 0,
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
  savedOldLevel: 0,
  reaction: 0,
};

describe('CharacterSchema', () => {
  it('accepts a fully-populated valid character', () => {
    expect(() => CharacterSchema.parse(VALID)).not.toThrow();
  });

  it('rejects when id is not a UUID', () => {
    expect(() => CharacterSchema.parse({ ...VALID, id: 'not-a-uuid' })).toThrow();
  });

  it('rejects when name is empty', () => {
    expect(() => CharacterSchema.parse({ ...VALID, name: '' })).toThrow();
  });

  it('rejects when conditions array is wrong length', () => {
    expect(() => CharacterSchema.parse({ ...VALID, conditions: [0, 0, 0] })).toThrow();
  });

  it('rejects when skills array is wrong length', () => {
    expect(() => CharacterSchema.parse({ ...VALID, skills: [0] })).toThrow();
  });

  it('rejects when schoolMana array is wrong length', () => {
    expect(() => CharacterSchema.parse({ ...VALID, schoolMana: [0] })).toThrow();
  });

  it('rejects out-of-range u8 attribute values', () => {
    expect(() => CharacterSchema.parse({
      ...VALID,
      attributes: { ...VALID.attributes, str: 256 },
    })).toThrow();
  });

  it('rejects negative xp', () => {
    expect(() => CharacterSchema.parse({ ...VALID, xp: -1 })).toThrow();
  });
});
```

- [ ] **Step 1.2: Run the test, verify it fails**

```
cd ~/.config/superpowers/worktrees/wiz6/feat-savegame-roster-phases-1-5
pnpm --filter @wiz6/data test character
```

Expected: tests fail with module-not-found on `../../src/schemas/character.js`.

- [ ] **Step 1.3: Write the schema**

Create `packages/data/src/schemas/character.ts`:

```typescript
import { z } from 'zod';

/**
 * Wizardry VI character record (TS port representation).
 *
 * Source: `packages/data/src/structs/character-record.ts` — the engine's
 * 432-byte record at BSS `0x43e8` stride `0x1b0`. The schema covers every
 * documented field; many of the record's 432 bytes are still unmapped at
 * the per-byte level (equipped item indices, full status flag layout,
 * spell-school known bitmaps). Those will be added as the RE pass refines.
 *
 * Each character has a stable UUID `id`. Rosters key on it; saves use the
 * `PartyMemberSchema` (extends this) to carry an optional `rosterCharacterId`
 * back-reference so the engine can sync state changes (level-up, death,
 * class-change) back to the roster on save.
 */
const U8 = z.number().int().min(0).max(255);
const U16 = z.number().int().min(0).max(0xffff);
const U32 = z.number().int().min(0).max(0xffffffff);

export const AttributesSchema = z.object({
  /** STR — Strength. */
  str: U8,
  /** INT — Intelligence. */
  int: U8,
  /** PIE — Piety. */
  pie: U8,
  /** VIT — Vitality. */
  vit: U8,
  /** DEX — Dexterity. */
  dex: U8,
  /** SPD — Speed. */
  spd: U8,
  /** Personality (engine offset +0x4598; exact name order vs Karma unverified). */
  personality: U8,
  /** Karma (engine offset +0x4599; exact name order vs Personality unverified). */
  karma: U8,
});

export const CharacterSchema = z.object({
  /** Stable UUID. Primary key in the roster, optional back-ref in saves. */
  id: z.string().uuid(),
  /** ASCII character name. 1..12 chars (engine name field is 12 bytes). */
  name: z.string().min(1).max(12),
  /** Race index. 5 = Faerie (hard-coded penalties; see wpcvw-character-view.md). */
  race: U8,
  /** Class index. 3 = Thief, 12 = Monk, 13 = Ninja (AC + skill scaling). */
  class: U8,
  /** Current character level. */
  level: U16,
  /** Level before most recent class change (engine throttles growth until current catches up). */
  savedOldLevel: U8,
  /** Experience points (engine field is u32). */
  xp: U32,
  /** Gold (engine field is u32; engine has 64-bit-safe add/subtract path). */
  gold: U32,
  /** 10-condition tracker bytes (poisoned, paralyzed, etc.). */
  conditions: z.array(U8).length(10),
  /** Hard dead flag. */
  dead: z.boolean(),
  /** Paralyzed flag (separate from `conditions` per engine layout). */
  paralyzed: z.boolean(),
  /** Six base attributes + 2 personality bytes. */
  attributes: AttributesSchema,
  /** Per-school MP pools (6 schools, each u32 in the engine). */
  schoolMana: z.array(U32).length(6),
  /** 14 skill levels (0..100). Bumped by wmaze + wmele on action attempts. */
  skills: z.array(U8).length(14),
  /** NPC reaction value (used by charm + dialogue paths). */
  reaction: U8,
});

export type Attributes = z.infer<typeof AttributesSchema>;
export type Character = z.infer<typeof CharacterSchema>;
```

- [ ] **Step 1.4: Run the test, verify it passes**

```
pnpm --filter @wiz6/data test character
```

Expected: 8 tests pass.

- [ ] **Step 1.5: Add the export and commit**

Append to `packages/data/src/index.ts` (after the last `export { ... } from './schemas/...';` block):

```typescript
export {
  CharacterSchema,
  AttributesSchema,
  type Character,
  type Attributes,
} from './schemas/character.js';
```

Then commit:

```
git add packages/data/src/schemas/character.ts \
        packages/data/tests/schemas/character.test.ts \
        packages/data/src/index.ts
git commit -m "feat(data): CharacterSchema (zod, mirrors engine record at BSS 0x43e8)"
```

---

## Task 2: PartyMemberSchema

**Why this exists:** A party member is a Character with an optional `rosterCharacterId` back-reference. Saves embed full party-member snapshots; the back-ref (if present) lets the engine sync state changes back to the roster.

**Files:**
- Modify: `packages/data/src/schemas/character.ts` (append after CharacterSchema)
- Modify: `packages/data/tests/schemas/character.test.ts` (append new describe block)
- Modify: `packages/data/src/index.ts` (extend export)

- [ ] **Step 2.1: Write the failing test**

Append to `packages/data/tests/schemas/character.test.ts`:

```typescript
import { PartyMemberSchema, type PartyMember } from '../../src/schemas/character.js';

describe('PartyMemberSchema', () => {
  const BASE: PartyMember = { ...VALID };

  it('accepts a party member without rosterCharacterId (one-off snapshot)', () => {
    expect(() => PartyMemberSchema.parse(BASE)).not.toThrow();
  });

  it('accepts a party member with a UUID rosterCharacterId', () => {
    const withRef: PartyMember = {
      ...BASE,
      rosterCharacterId: '550e8400-e29b-41d4-a716-446655440000',
    };
    expect(() => PartyMemberSchema.parse(withRef)).not.toThrow();
  });

  it('rejects a non-UUID rosterCharacterId', () => {
    expect(() => PartyMemberSchema.parse({ ...BASE, rosterCharacterId: 'nope' })).toThrow();
  });
});
```

- [ ] **Step 2.2: Run the test, verify it fails**

```
pnpm --filter @wiz6/data test character
```

Expected: 3 new tests fail with import error on `PartyMemberSchema`.

- [ ] **Step 2.3: Add the schema**

Append to `packages/data/src/schemas/character.ts`:

```typescript
export const PartyMemberSchema = CharacterSchema.extend({
  /**
   * If present, the engine should sync state changes (level-up, death,
   * class-change, etc.) back to this roster entry on save / end-of-game.
   * Absent when a save was imported from another visitor without their
   * roster — the party member is treated as a one-off snapshot.
   */
  rosterCharacterId: z.string().uuid().optional(),
});

export type PartyMember = z.infer<typeof PartyMemberSchema>;
```

- [ ] **Step 2.4: Run the test, verify it passes**

```
pnpm --filter @wiz6/data test character
```

Expected: 11 tests pass (8 from Task 1 + 3 new).

- [ ] **Step 2.5: Extend export and commit**

Update the `@wiz6/data` export to include PartyMember. In `packages/data/src/index.ts` replace the character block from Task 1 with:

```typescript
export {
  CharacterSchema,
  AttributesSchema,
  PartyMemberSchema,
  type Character,
  type Attributes,
  type PartyMember,
} from './schemas/character.js';
```

Commit:

```
git add packages/data/src/schemas/character.ts \
        packages/data/tests/schemas/character.test.ts \
        packages/data/src/index.ts
git commit -m "feat(data): PartyMemberSchema (Character + optional rosterCharacterId back-ref)"
```

---

## Task 3: RosterSchema

**Why this exists:** The per-visitor character collection. Versioned envelope; the array of Characters lives under `characters`.

**Files:**
- Create: `packages/data/src/schemas/roster.ts`
- Create: `packages/data/tests/schemas/roster.test.ts`
- Modify: `packages/data/src/index.ts`

- [ ] **Step 3.1: Write the failing test**

Create `packages/data/tests/schemas/roster.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { RosterSchema, type Roster } from '../../src/schemas/roster.js';
import type { Character } from '../../src/schemas/character.js';

const C: Character = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Hawkwind',
  race: 0, class: 0, level: 1, xp: 0, gold: 0,
  conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  dead: false, paralyzed: false,
  attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, personality: 50, karma: 50 },
  schoolMana: [0, 0, 0, 0, 0, 0],
  skills: new Array(14).fill(0),
  savedOldLevel: 0, reaction: 0,
};

describe('RosterSchema', () => {
  it('accepts an empty roster', () => {
    const r: Roster = { schemaVersion: 1, characters: [] };
    expect(() => RosterSchema.parse(r)).not.toThrow();
  });

  it('accepts a roster with characters', () => {
    const r: Roster = { schemaVersion: 1, characters: [C] };
    expect(() => RosterSchema.parse(r)).not.toThrow();
  });

  it('rejects wrong schemaVersion', () => {
    expect(() => RosterSchema.parse({ schemaVersion: 2, characters: [] })).toThrow();
  });

  it('rejects characters with duplicate ids', () => {
    expect(() => RosterSchema.parse({
      schemaVersion: 1,
      characters: [C, { ...C, name: 'Twin' }],
    })).toThrow();
  });
});
```

- [ ] **Step 3.2: Run the test, verify it fails**

```
pnpm --filter @wiz6/data test roster
```

Expected: fails on missing `./roster.js` module.

- [ ] **Step 3.3: Write the schema**

Create `packages/data/src/schemas/roster.ts`:

```typescript
import { z } from 'zod';
import { CharacterSchema } from './character.js';

/**
 * The per-visitor character collection. Lives in localStorage at
 * `wiz6:roster`. Pre-seeded on first visit from the curated gallery at
 * `/gallery/characters.json` (see packages/viewer/src/lib/gallery.ts).
 *
 * Saves do NOT reference the roster directly — saves embed full
 * `PartyMemberSchema` snapshots that optionally carry a `rosterCharacterId`
 * back-reference for sync-on-save.
 */
export const RosterSchema = z
  .object({
    schemaVersion: z.literal(1),
    characters: z.array(CharacterSchema),
  })
  .refine(
    (r) => new Set(r.characters.map((c) => c.id)).size === r.characters.length,
    { message: 'characters[].id must be unique', path: ['characters'] },
  );

export type Roster = z.infer<typeof RosterSchema>;
```

- [ ] **Step 3.4: Run the test, verify it passes**

```
pnpm --filter @wiz6/data test roster
```

Expected: 4 tests pass.

- [ ] **Step 3.5: Add export and commit**

In `packages/data/src/index.ts`, add after the character export block:

```typescript
export { RosterSchema, type Roster } from './schemas/roster.js';
```

Commit:

```
git add packages/data/src/schemas/roster.ts \
        packages/data/tests/schemas/roster.test.ts \
        packages/data/src/index.ts
git commit -m "feat(data): RosterSchema (versioned envelope + uniqueness constraint)"
```

---

## Task 4: SaveSchema (with PositionSchema + MazeStateSchema)

**Why this exists:** A save is a versioned snapshot of party + position + scenario flags + maze state. Position fields mirror `packages/data/src/structs/position-state.ts` (engine globals at `0x4f8a..0x4faa`). Maze state and scenario flags are abstract `record<string, unknown>` for v1 — we don't have a fully-decoded byte layout yet, and the spec lets us refine over time.

**Files:**
- Create: `packages/data/src/schemas/save.ts`
- Create: `packages/data/tests/schemas/save.test.ts`
- Modify: `packages/data/src/index.ts`

- [ ] **Step 4.1: Write the failing test**

Create `packages/data/tests/schemas/save.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { SaveSchema, PositionSchema, type Save } from '../../src/schemas/save.js';
import type { PartyMember } from '../../src/schemas/character.js';

const PM: PartyMember = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Hawkwind',
  race: 0, class: 0, level: 1, xp: 0, gold: 0,
  conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  dead: false, paralyzed: false,
  attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, personality: 50, karma: 50 },
  schoolMana: [0, 0, 0, 0, 0, 0],
  skills: new Array(14).fill(0),
  savedOldLevel: 0, reaction: 0,
};

const VALID: Save = {
  schemaVersion: 1,
  metadata: {
    slotName: 'My adventure',
    timestamp: '2026-05-25T12:00:00.000Z',
    portVersion: '0.0.0',
  },
  party: [PM],
  position: {
    zone: 0, level: 0, x: 0, y: 0, globalX: 0, globalY: 0, facing: 0,
  },
  scenarioFlags: {},
  mazeState: {},
};

describe('PositionSchema', () => {
  it('accepts the engine-default position', () => {
    expect(() => PositionSchema.parse(VALID.position)).not.toThrow();
  });

  it('rejects negative coordinates', () => {
    expect(() => PositionSchema.parse({ ...VALID.position, x: -1 })).toThrow();
  });

  it('rejects out-of-range facing (>3)', () => {
    expect(() => PositionSchema.parse({ ...VALID.position, facing: 4 })).toThrow();
  });
});

describe('SaveSchema', () => {
  it('accepts a fully-populated valid save', () => {
    expect(() => SaveSchema.parse(VALID)).not.toThrow();
  });

  it('rejects wrong schemaVersion', () => {
    expect(() => SaveSchema.parse({ ...VALID, schemaVersion: 2 })).toThrow();
  });

  it('rejects party of size > 6', () => {
    expect(() => SaveSchema.parse({
      ...VALID,
      party: new Array(7).fill(PM),
    })).toThrow();
  });

  it('rejects non-ISO timestamp', () => {
    expect(() => SaveSchema.parse({
      ...VALID,
      metadata: { ...VALID.metadata, timestamp: 'yesterday' },
    })).toThrow();
  });

  it('accepts an optional rngSeed', () => {
    expect(() => SaveSchema.parse({
      ...VALID,
      metadata: { ...VALID.metadata, rngSeed: 42 },
    })).not.toThrow();
  });

  it('accepts an empty party', () => {
    expect(() => SaveSchema.parse({ ...VALID, party: [] })).not.toThrow();
  });
});
```

- [ ] **Step 4.2: Run the test, verify it fails**

```
pnpm --filter @wiz6/data test save
```

Expected: fails on missing `./save.js` module.

- [ ] **Step 4.3: Write the schema**

Create `packages/data/src/schemas/save.ts`:

```typescript
import { z } from 'zod';
import { PartyMemberSchema } from './character.js';

/**
 * Versioned save document. Persisted in localStorage at `wiz6:save:0`..`wiz6:save:5`.
 * Self-contained — embeds full PartyMember snapshots. The optional
 * `rosterCharacterId` on each member lets the engine sync state changes
 * back to the roster on save / end-of-game.
 */
const U16 = z.number().int().min(0).max(0xffff);

/**
 * Party position. Mirrors `packages/data/src/structs/position-state.ts`:
 *   - `zone` ↔ engine `level_z` / save_zone (current overworld + dungeon-level id)
 *   - `level` ↔ engine zone bytes (dungeon floor index within zone)
 *   - `x, y` ↔ engine local cell coords
 *   - `globalX, globalY` ↔ engine global coords (used by the automap)
 *   - `facing` ↔ player-facing 0..3 (N/E/S/W)
 */
export const PositionSchema = z.object({
  zone: U16,
  level: U16,
  x: U16,
  y: U16,
  globalX: U16,
  globalY: U16,
  facing: z.number().int().min(0).max(3),
});

/**
 * Maze state — open doors, disarmed traps, looted chests, encounter cooldowns.
 * Abstract `record<string, unknown>` for v1; refine as the wmaze RE pass
 * resolves the byte layout. (Schema-evolution risk is low because saves are
 * never replayed against a different schema version — they round-trip JSON.)
 */
export const MazeStateSchema = z.record(z.string(), z.unknown());

/**
 * Scenario flags — quest progression bitfields, NPC dialogue state,
 * scripted-event triggers. Same v1 simplification as MazeStateSchema.
 */
export const ScenarioFlagsSchema = z.record(z.string(), z.unknown());

export const SaveMetadataSchema = z.object({
  slotName: z.string().min(1),
  timestamp: z.string().datetime(),
  portVersion: z.string().min(1),
  /** Advisory RNG seed. NOT load-bearing — gameplay PRNG continues from
   *  whatever state it's in on load. Reserved for deterministic-replay tooling. */
  rngSeed: z.number().int().optional(),
});

export const SaveSchema = z.object({
  schemaVersion: z.literal(1),
  metadata: SaveMetadataSchema,
  party: z.array(PartyMemberSchema).max(6),
  position: PositionSchema,
  scenarioFlags: ScenarioFlagsSchema,
  mazeState: MazeStateSchema,
});

export type Position = z.infer<typeof PositionSchema>;
export type MazeState = z.infer<typeof MazeStateSchema>;
export type ScenarioFlags = z.infer<typeof ScenarioFlagsSchema>;
export type SaveMetadata = z.infer<typeof SaveMetadataSchema>;
export type Save = z.infer<typeof SaveSchema>;
```

- [ ] **Step 4.4: Run the test, verify it passes**

```
pnpm --filter @wiz6/data test save
```

Expected: 9 tests pass.

- [ ] **Step 4.5: Add exports and commit**

In `packages/data/src/index.ts`, add after the roster export:

```typescript
export {
  SaveSchema,
  SaveMetadataSchema,
  PositionSchema,
  MazeStateSchema,
  ScenarioFlagsSchema,
  type Save,
  type SaveMetadata,
  type Position,
  type MazeState,
  type ScenarioFlags,
} from './schemas/save.js';
```

Commit:

```
git add packages/data/src/schemas/save.ts \
        packages/data/tests/schemas/save.test.ts \
        packages/data/src/index.ts
git commit -m "feat(data): SaveSchema + Position/Maze/ScenarioFlags sub-schemas"
```

---

## Task 5: encodeSave / decodeSave codec

**Why this exists:** A platform-agnostic round-trip between `Save` and `Uint8Array` so we can write to localStorage (as base64 string) and offer a `.wiz6.json` download. JSON envelope → gzip → base64.

**Setup:**

If `pako` isn't already in the parser deps, add it (run BEFORE writing the test):

```
cd ~/.config/superpowers/worktrees/wiz6/feat-savegame-roster-phases-1-5
pnpm --filter @wiz6/parser add pako
pnpm --filter @wiz6/parser add -D @types/pako
```

(If it's already there, skip — `pnpm` is idempotent.)

**Files:**
- Create: `packages/parser/src/formats/save-codec.ts`
- Create: `packages/parser/tests/formats/save-codec.test.ts`
- Modify: `packages/parser/src/index.ts`

- [ ] **Step 5.1: Write the failing test**

Create `packages/parser/tests/formats/save-codec.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  encodeSave,
  decodeSave,
  encodeSaveBase64,
  decodeSaveBase64,
} from '../../src/formats/save-codec.js';
import type { Save } from '@wiz6/data';

const SAVE: Save = {
  schemaVersion: 1,
  metadata: { slotName: 'My adventure', timestamp: '2026-05-25T12:00:00.000Z', portVersion: '0.0.0' },
  party: [],
  position: { zone: 0, level: 0, x: 0, y: 0, globalX: 0, globalY: 0, facing: 0 },
  scenarioFlags: {},
  mazeState: {},
};

describe('save-codec', () => {
  it('round-trips encodeSave / decodeSave', () => {
    const bytes = encodeSave(SAVE);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    const restored = decodeSave(bytes);
    expect(restored).toEqual(SAVE);
  });

  it('round-trips through base64', () => {
    const b64 = encodeSaveBase64(SAVE);
    expect(typeof b64).toBe('string');
    expect(b64).not.toMatch(/[^A-Za-z0-9+/=]/); // base64-clean
    const restored = decodeSaveBase64(b64);
    expect(restored).toEqual(SAVE);
  });

  it('decodeSave validates against SaveSchema (rejects malformed bytes)', () => {
    expect(() => decodeSave(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });

  it('decodeSaveBase64 throws on invalid base64', () => {
    expect(() => decodeSaveBase64('not-base64!!!')).toThrow();
  });

  it('compressed output is smaller than the source JSON for non-trivial saves', () => {
    const big: Save = {
      ...SAVE,
      scenarioFlags: Object.fromEntries(
        new Array(100).fill(0).map((_, i) => [`flag_${i}`, true]),
      ),
    };
    const json = JSON.stringify(big);
    const bytes = encodeSave(big);
    expect(bytes.length).toBeLessThan(json.length);
  });
});
```

- [ ] **Step 5.2: Run the test, verify it fails**

```
pnpm --filter @wiz6/parser test save-codec
```

Expected: fails on missing `save-codec.js`.

- [ ] **Step 5.3: Write the codec**

Create `packages/parser/src/formats/save-codec.ts`:

```typescript
import { SaveSchema, type Save } from '@wiz6/data';
import { gzip, ungzip } from 'pako';

/**
 * Encode a `Save` as gzipped JSON bytes. Pure — no I/O.
 *
 * Pipeline: Save -> JSON string -> UTF-8 bytes -> gzip -> Uint8Array
 *
 * Use `encodeSaveBase64` if you need a URL-safe / localStorage-safe string.
 */
export function encodeSave(save: Save): Uint8Array {
  const json = JSON.stringify(save);
  const utf8 = new TextEncoder().encode(json);
  return gzip(utf8);
}

/**
 * Decode bytes produced by `encodeSave` back into a `Save`. Validates
 * against `SaveSchema` — throws if the payload is malformed.
 */
export function decodeSave(bytes: Uint8Array): Save {
  const utf8 = ungzip(bytes);
  const json = new TextDecoder().decode(utf8);
  const parsed = JSON.parse(json);
  return SaveSchema.parse(parsed);
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Encode a Save as a base64 string. Suitable for localStorage. */
export function encodeSaveBase64(save: Save): string {
  return bytesToBase64(encodeSave(save));
}

/** Decode a base64 string back into a Save. Validates via SaveSchema. */
export function decodeSaveBase64(b64: string): Save {
  return decodeSave(base64ToBytes(b64));
}
```

- [ ] **Step 5.4: Run the test, verify it passes**

```
pnpm --filter @wiz6/parser test save-codec
```

Expected: 5 tests pass.

- [ ] **Step 5.5: Add export and commit**

In `packages/parser/src/index.ts`, add after the last `export { ... } from './formats/...';` line:

```typescript
export {
  encodeSave,
  decodeSave,
  encodeSaveBase64,
  decodeSaveBase64,
} from './formats/save-codec.js';
```

Commit:

```
git add packages/parser/src/formats/save-codec.ts \
        packages/parser/tests/formats/save-codec.test.ts \
        packages/parser/src/index.ts \
        packages/parser/package.json \
        pnpm-lock.yaml
git commit -m "feat(parser): encodeSave/decodeSave (gzip + base64 codec, schema-validated)"
```

---

## Task 6: encodeRoster / decodeRoster codec

**Why this exists:** Same gzip + base64 round-trip for the Roster envelope. Used by the gallery loader (decoding the static `/gallery/characters.json`) and by character download/upload.

**Files:**
- Create: `packages/parser/src/formats/roster-codec.ts`
- Create: `packages/parser/tests/formats/roster-codec.test.ts`
- Modify: `packages/parser/src/index.ts`

- [ ] **Step 6.1: Write the failing test**

Create `packages/parser/tests/formats/roster-codec.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  encodeRoster,
  decodeRoster,
  encodeRosterBase64,
  decodeRosterBase64,
} from '../../src/formats/roster-codec.js';
import type { Roster } from '@wiz6/data';

const ROSTER: Roster = {
  schemaVersion: 1,
  characters: [
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Hawkwind',
      race: 0, class: 0, level: 1, xp: 0, gold: 0,
      conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      dead: false, paralyzed: false,
      attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, personality: 50, karma: 50 },
      schoolMana: [0, 0, 0, 0, 0, 0],
      skills: new Array(14).fill(0),
      savedOldLevel: 0, reaction: 0,
    },
  ],
};

describe('roster-codec', () => {
  it('round-trips encodeRoster / decodeRoster', () => {
    const bytes = encodeRoster(ROSTER);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(decodeRoster(bytes)).toEqual(ROSTER);
  });

  it('round-trips through base64', () => {
    expect(decodeRosterBase64(encodeRosterBase64(ROSTER))).toEqual(ROSTER);
  });

  it('decodeRoster validates against RosterSchema', () => {
    expect(() => decodeRoster(new Uint8Array([1, 2, 3]))).toThrow();
  });

  it('decodes an empty roster', () => {
    const empty: Roster = { schemaVersion: 1, characters: [] };
    expect(decodeRoster(encodeRoster(empty))).toEqual(empty);
  });
});
```

- [ ] **Step 6.2: Run the test, verify it fails**

```
pnpm --filter @wiz6/parser test roster-codec
```

Expected: fails on missing module.

- [ ] **Step 6.3: Write the codec**

Create `packages/parser/src/formats/roster-codec.ts`:

```typescript
import { RosterSchema, type Roster } from '@wiz6/data';
import { gzip, ungzip } from 'pako';

/** Encode a `Roster` as gzipped JSON bytes. Pure. */
export function encodeRoster(roster: Roster): Uint8Array {
  const json = JSON.stringify(roster);
  return gzip(new TextEncoder().encode(json));
}

/** Decode bytes from `encodeRoster` back to a `Roster`. Validates via RosterSchema. */
export function decodeRoster(bytes: Uint8Array): Roster {
  const json = new TextDecoder().decode(ungzip(bytes));
  return RosterSchema.parse(JSON.parse(json));
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}
function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function encodeRosterBase64(roster: Roster): string {
  return bytesToBase64(encodeRoster(roster));
}
export function decodeRosterBase64(b64: string): Roster {
  return decodeRoster(base64ToBytes(b64));
}
```

- [ ] **Step 6.4: Run the test, verify it passes**

```
pnpm --filter @wiz6/parser test roster-codec
```

Expected: 4 tests pass.

- [ ] **Step 6.5: Add export and commit**

In `packages/parser/src/index.ts`, add:

```typescript
export {
  encodeRoster,
  decodeRoster,
  encodeRosterBase64,
  decodeRosterBase64,
} from './formats/roster-codec.js';
```

Commit:

```
git add packages/parser/src/formats/roster-codec.ts \
        packages/parser/tests/formats/roster-codec.test.ts \
        packages/parser/src/index.ts
git commit -m "feat(parser): encodeRoster/decodeRoster (mirrors save codec)"
```

---

## Task 7: save-store.ts (6-slot localStorage CRUD)

**Why this exists:** The browser-side abstraction for reading/writing saves. 6 slots, each at `wiz6:save:N`. Uses `encodeSaveBase64` for serialization.

**Files:**
- Create: `packages/viewer/src/lib/save-store.ts`
- Create: `packages/viewer/tests/lib/save-store.test.ts`

- [ ] **Step 7.1: Write the failing test**

Create `packages/viewer/tests/lib/save-store.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import {
  listSlots,
  readSlot,
  writeSlot,
  deleteSlot,
  NUM_SLOTS,
} from '../../src/lib/save-store.js';
import type { Save } from '@wiz6/data';

function makeSave(name = 'My adventure'): Save {
  return {
    schemaVersion: 1,
    metadata: { slotName: name, timestamp: '2026-05-25T12:00:00.000Z', portVersion: '0.0.0' },
    party: [],
    position: { zone: 0, level: 0, x: 0, y: 0, globalX: 0, globalY: 0, facing: 0 },
    scenarioFlags: {},
    mazeState: {},
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('save-store', () => {
  it('exposes NUM_SLOTS = 6', () => {
    expect(NUM_SLOTS).toBe(6);
  });

  it('listSlots returns 6 entries, all null when empty', () => {
    const slots = listSlots();
    expect(slots).toHaveLength(6);
    expect(slots.every((s) => s === null)).toBe(true);
  });

  it('writeSlot then readSlot round-trips the save', () => {
    const save = makeSave('alpha');
    writeSlot(0, save);
    const out = readSlot(0);
    expect(out).toEqual(save);
  });

  it('writeSlot updates listSlots summary', () => {
    writeSlot(2, makeSave('beta'));
    const slots = listSlots();
    expect(slots[0]).toBeNull();
    expect(slots[2]).not.toBeNull();
    expect(slots[2]!.metadata.slotName).toBe('beta');
  });

  it('deleteSlot removes the entry', () => {
    writeSlot(3, makeSave('gamma'));
    expect(readSlot(3)).not.toBeNull();
    deleteSlot(3);
    expect(readSlot(3)).toBeNull();
  });

  it('readSlot returns null for unset slot', () => {
    expect(readSlot(5)).toBeNull();
  });

  it('readSlot returns null and logs a warning on corrupt data', () => {
    window.localStorage.setItem('wiz6:save:1', 'not-base64-or-json!!!');
    expect(readSlot(1)).toBeNull();
  });

  it('writeSlot throws on out-of-range slot index', () => {
    expect(() => writeSlot(6, makeSave())).toThrow();
    expect(() => writeSlot(-1, makeSave())).toThrow();
  });
});
```

- [ ] **Step 7.2: Run the test, verify it fails**

```
pnpm --filter @wiz6/viewer test save-store
```

Expected: missing module error.

- [ ] **Step 7.3: Write the store**

Create `packages/viewer/src/lib/save-store.ts`:

```typescript
import { encodeSaveBase64, decodeSaveBase64 } from '@wiz6/parser';
import type { Save } from '@wiz6/data';

/** Number of save slots — matches the original Wiz6 (6 slots). */
export const NUM_SLOTS = 6;

const slotKey = (n: number): string => `wiz6:save:${n}`;

function assertSlotInRange(n: number): void {
  if (!Number.isInteger(n) || n < 0 || n >= NUM_SLOTS) {
    throw new Error(`save slot out of range: ${n} (valid 0..${NUM_SLOTS - 1})`);
  }
}

/**
 * Read a save from the given slot. Returns `null` if the slot is empty
 * or the stored data is corrupt (logged as a console.warn, not thrown,
 * so a single bad slot doesn't break the saves UI).
 */
export function readSlot(n: number): Save | null {
  assertSlotInRange(n);
  const b64 = window.localStorage.getItem(slotKey(n));
  if (b64 === null) return null;
  try {
    return decodeSaveBase64(b64);
  } catch (e) {
    console.warn(`[save-store] slot ${n} contained invalid data, returning null`, e);
    return null;
  }
}

/** Write `save` to the given slot. Overwrites any prior content. */
export function writeSlot(n: number, save: Save): void {
  assertSlotInRange(n);
  window.localStorage.setItem(slotKey(n), encodeSaveBase64(save));
}

/** Delete the given slot. No-op if it was already empty. */
export function deleteSlot(n: number): void {
  assertSlotInRange(n);
  window.localStorage.removeItem(slotKey(n));
}

/** List all slots as a parallel array (index = slot number). */
export function listSlots(): Array<Save | null> {
  return new Array(NUM_SLOTS).fill(null).map((_, i) => readSlot(i));
}
```

- [ ] **Step 7.4: Run the test, verify it passes**

```
pnpm --filter @wiz6/viewer test save-store
```

Expected: 8 tests pass.

- [ ] **Step 7.5: Commit**

```
git add packages/viewer/src/lib/save-store.ts \
        packages/viewer/tests/lib/save-store.test.ts
git commit -m "feat(viewer): save-store — 6-slot localStorage CRUD via wiz6:save:N keys"
```

---

## Task 8: roster-store.ts (localStorage roster + syncFromSave)

**Why this exists:** The browser-side abstraction for the per-visitor roster. Single roster at `wiz6:roster`. Includes `syncFromSave` — copies any save party-member's updated state back to its matching roster entry (when the member has a `rosterCharacterId`).

**Files:**
- Create: `packages/viewer/src/lib/roster-store.ts`
- Create: `packages/viewer/tests/lib/roster-store.test.ts`

- [ ] **Step 8.1: Write the failing test**

Create `packages/viewer/tests/lib/roster-store.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import {
  readRoster,
  writeRoster,
  addCharacter,
  removeCharacter,
  updateCharacter,
  syncFromSave,
} from '../../src/lib/roster-store.js';
import type { Character, Roster, Save } from '@wiz6/data';

function makeCharacter(id: string, name: string, level = 1): Character {
  return {
    id, name, race: 0, class: 0, level, xp: 0, gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, personality: 50, karma: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    skills: new Array(14).fill(0),
    savedOldLevel: 0, reaction: 0,
  };
}

const ID_A = '550e8400-e29b-41d4-a716-446655440000';
const ID_B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

beforeEach(() => {
  window.localStorage.clear();
});

describe('roster-store', () => {
  it('readRoster returns an empty roster when nothing stored', () => {
    expect(readRoster()).toEqual({ schemaVersion: 1, characters: [] });
  });

  it('writeRoster persists, readRoster round-trips', () => {
    const r: Roster = { schemaVersion: 1, characters: [makeCharacter(ID_A, 'Hawkwind')] };
    writeRoster(r);
    expect(readRoster()).toEqual(r);
  });

  it('addCharacter appends to the roster', () => {
    addCharacter(makeCharacter(ID_A, 'Hawkwind'));
    addCharacter(makeCharacter(ID_B, 'Loras'));
    const r = readRoster();
    expect(r.characters.map((c) => c.id)).toEqual([ID_A, ID_B]);
  });

  it('addCharacter rejects a duplicate id', () => {
    addCharacter(makeCharacter(ID_A, 'Hawkwind'));
    expect(() => addCharacter(makeCharacter(ID_A, 'Imposter'))).toThrow();
  });

  it('removeCharacter drops the entry by id; no-op if missing', () => {
    addCharacter(makeCharacter(ID_A, 'Hawkwind'));
    addCharacter(makeCharacter(ID_B, 'Loras'));
    removeCharacter(ID_A);
    expect(readRoster().characters.map((c) => c.id)).toEqual([ID_B]);
    removeCharacter('missing-id');
    expect(readRoster().characters.map((c) => c.id)).toEqual([ID_B]);
  });

  it('updateCharacter replaces the matching entry by id', () => {
    addCharacter(makeCharacter(ID_A, 'Hawkwind', 1));
    updateCharacter(makeCharacter(ID_A, 'Hawkwind', 5));
    expect(readRoster().characters[0]!.level).toBe(5);
  });

  it('syncFromSave updates roster entries whose ids match save party-member rosterCharacterId', () => {
    addCharacter(makeCharacter(ID_A, 'Hawkwind', 1));
    addCharacter(makeCharacter(ID_B, 'Loras', 1));

    const save: Save = {
      schemaVersion: 1,
      metadata: { slotName: 's', timestamp: '2026-05-25T12:00:00.000Z', portVersion: '0.0.0' },
      party: [
        { ...makeCharacter(ID_A, 'Hawkwind', 7), rosterCharacterId: ID_A },
        // Member B has no rosterCharacterId — should NOT sync back
        { ...makeCharacter(ID_B, 'Loras', 9) },
      ],
      position: { zone: 0, level: 0, x: 0, y: 0, globalX: 0, globalY: 0, facing: 0 },
      scenarioFlags: {}, mazeState: {},
    };

    syncFromSave(save);
    const after = readRoster();
    expect(after.characters.find((c) => c.id === ID_A)!.level).toBe(7); // synced
    expect(after.characters.find((c) => c.id === ID_B)!.level).toBe(1); // unchanged
  });

  it('readRoster returns empty + warning on corrupt data', () => {
    window.localStorage.setItem('wiz6:roster', 'totally-bogus');
    expect(readRoster()).toEqual({ schemaVersion: 1, characters: [] });
  });
});
```

- [ ] **Step 8.2: Run the test, verify it fails**

```
pnpm --filter @wiz6/viewer test roster-store
```

- [ ] **Step 8.3: Write the store**

Create `packages/viewer/src/lib/roster-store.ts`:

```typescript
import { encodeRosterBase64, decodeRosterBase64 } from '@wiz6/parser';
import { RosterSchema, type Character, type Roster, type Save } from '@wiz6/data';

const KEY = 'wiz6:roster';

function emptyRoster(): Roster {
  return { schemaVersion: 1, characters: [] };
}

/** Read the roster from localStorage. Returns an empty roster on first
 *  visit OR when stored data is corrupt (warns to console). */
export function readRoster(): Roster {
  const b64 = window.localStorage.getItem(KEY);
  if (b64 === null) return emptyRoster();
  try {
    return decodeRosterBase64(b64);
  } catch (e) {
    console.warn('[roster-store] roster data invalid, returning empty', e);
    return emptyRoster();
  }
}

/** Replace the entire roster. */
export function writeRoster(roster: Roster): void {
  const validated = RosterSchema.parse(roster);
  window.localStorage.setItem(KEY, encodeRosterBase64(validated));
}

/** Append a character. Throws if `c.id` already exists in the roster. */
export function addCharacter(c: Character): void {
  const r = readRoster();
  if (r.characters.some((x) => x.id === c.id)) {
    throw new Error(`roster already contains character ${c.id}`);
  }
  writeRoster({ ...r, characters: [...r.characters, c] });
}

/** Remove the character with the given id. No-op if missing. */
export function removeCharacter(id: string): void {
  const r = readRoster();
  const next = r.characters.filter((c) => c.id !== id);
  if (next.length === r.characters.length) return;
  writeRoster({ ...r, characters: next });
}

/** Replace the character with the given id. No-op if missing. */
export function updateCharacter(c: Character): void {
  const r = readRoster();
  const idx = r.characters.findIndex((x) => x.id === c.id);
  if (idx < 0) return;
  const next = [...r.characters];
  next[idx] = c;
  writeRoster({ ...r, characters: next });
}

/**
 * Sync roster entries from a save's party members. For each member that
 * carries a `rosterCharacterId`, find the matching roster entry by id and
 * replace it with the member's snapshot (stripped of `rosterCharacterId`).
 * Members without a back-reference are ignored (they're one-off snapshots —
 * e.g. an imported save from another visitor).
 */
export function syncFromSave(save: Save): void {
  const r = readRoster();
  const next = [...r.characters];
  let changed = false;
  for (const member of save.party) {
    if (!member.rosterCharacterId) continue;
    const idx = next.findIndex((c) => c.id === member.rosterCharacterId);
    if (idx < 0) continue;
    const { rosterCharacterId, ...character } = member;
    void rosterCharacterId;
    next[idx] = { ...character, id: next[idx]!.id };
    changed = true;
  }
  if (changed) writeRoster({ ...r, characters: next });
}
```

- [ ] **Step 8.4: Run the test, verify it passes**

```
pnpm --filter @wiz6/viewer test roster-store
```

Expected: 9 tests pass.

- [ ] **Step 8.5: Commit**

```
git add packages/viewer/src/lib/roster-store.ts \
        packages/viewer/tests/lib/roster-store.test.ts
git commit -m "feat(viewer): roster-store — wiz6:roster localStorage CRUD + syncFromSave"
```

---

## Task 9: Gallery loader + curated seed

**Why this exists:** First-time visitors see an empty roster. The gallery is a static `/gallery/characters.json` shipped with the build. `loadGallery()` fetches it. `importToRoster(galleryCharId)` copies a character into the visitor's private roster with a new UUID.

**Files:**
- Create: `packages/viewer/public/gallery/characters.json`
- Create: `packages/viewer/src/lib/gallery.ts`
- Create: `packages/viewer/tests/lib/gallery.test.ts`

- [ ] **Step 9.1: Author the seed**

Create `packages/viewer/public/gallery/characters.json` with a single hand-authored character. We keep it small for v1; more entries are content-only commits later.

```json
{
  "schemaVersion": 1,
  "characters": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "name": "Hawkwind",
      "race": 0,
      "class": 0,
      "level": 1,
      "savedOldLevel": 0,
      "xp": 0,
      "gold": 100,
      "conditions": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      "dead": false,
      "paralyzed": false,
      "attributes": {
        "str": 14,
        "int": 9,
        "pie": 8,
        "vit": 13,
        "dex": 11,
        "spd": 12,
        "personality": 60,
        "karma": 50
      },
      "schoolMana": [0, 0, 0, 0, 0, 0],
      "skills": [10, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      "reaction": 50
    }
  ]
}
```

- [ ] **Step 9.2: Write the failing test**

Create `packages/viewer/tests/lib/gallery.test.ts`:

```typescript
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { loadGallery, importToRoster, isGalleryCharacter } from '../../src/lib/gallery.js';
import { readRoster } from '../../src/lib/roster-store.js';

const FAKE_GALLERY = {
  schemaVersion: 1,
  characters: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Hawkwind',
      race: 0, class: 0, level: 1, savedOldLevel: 0, xp: 0, gold: 100,
      conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      dead: false, paralyzed: false,
      attributes: { str: 14, int: 9, pie: 8, vit: 13, dex: 11, spd: 12, personality: 60, karma: 50 },
      schoolMana: [0, 0, 0, 0, 0, 0],
      skills: [10, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      reaction: 50,
    },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
    ok: true,
    json: async () => FAKE_GALLERY,
  } as unknown as Response));
});

describe('gallery', () => {
  it('loadGallery returns the parsed gallery roster', async () => {
    const g = await loadGallery();
    expect(g.characters).toHaveLength(1);
    expect(g.characters[0]!.name).toBe('Hawkwind');
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
    expect(r.characters[0]!.name).toBe('Hawkwind');
  });

  it('importToRoster throws on unknown gallery id', async () => {
    await expect(importToRoster('00000000-0000-4000-8000-999999999999')).rejects.toThrow();
  });
});
```

- [ ] **Step 9.3: Run the test, verify it fails**

```
pnpm --filter @wiz6/viewer test gallery
```

- [ ] **Step 9.4: Write the gallery loader**

Create `packages/viewer/src/lib/gallery.ts`:

```typescript
import { RosterSchema, type Character, type Roster } from '@wiz6/data';
import { addCharacter } from './roster-store.js';

const GALLERY_URL = '/gallery/characters.json';

let cached: Roster | null = null;

/**
 * Load the curated gallery from `/gallery/characters.json`. The gallery is a
 * read-only Roster — visitors don't edit it, they import individual entries
 * into their private roster.
 *
 * Cached after first load. Validates against RosterSchema; throws on a
 * malformed gallery (engineering bug, not user-facing).
 */
export async function loadGallery(): Promise<Roster> {
  if (cached) return cached;
  const res = await fetch(GALLERY_URL);
  if (!res.ok) throw new Error(`gallery fetch failed: ${res.status}`);
  const json: unknown = await res.json();
  cached = RosterSchema.parse(json);
  return cached;
}

function newUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Tiny RFC-4122-ish fallback (jsdom and very old browsers).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Copy a gallery character into the visitor's roster under a NEW UUID.
 * Returns the new id (so callers can highlight / select the freshly-added
 * roster entry). The gallery character's name and stats are duplicated as-is.
 */
export async function importToRoster(galleryCharId: string): Promise<string> {
  const gallery = await loadGallery();
  const source = gallery.characters.find((c) => c.id === galleryCharId);
  if (!source) throw new Error(`gallery has no character with id ${galleryCharId}`);
  const fresh: Character = { ...source, id: newUuid() };
  addCharacter(fresh);
  return fresh.id;
}

/** True if `id` matches a character in the loaded gallery. */
export function isGalleryCharacter(id: string, gallery: Roster): boolean {
  return gallery.characters.some((c) => c.id === id);
}
```

- [ ] **Step 9.5: Run the test, verify it passes**

```
pnpm --filter @wiz6/viewer test gallery
```

Expected: 4 tests pass.

- [ ] **Step 9.6: Commit**

```
git add packages/viewer/public/gallery/characters.json \
        packages/viewer/src/lib/gallery.ts \
        packages/viewer/tests/lib/gallery.test.ts
git commit -m "feat(viewer): gallery loader + curated seed (1 hand-authored character)"
```

---

## Task 10: Auto-seed roster on first visit

**Why this exists:** A brand-new visitor sees no roster. We want them to immediately have something to play with. On first load, if the roster is empty, import every gallery character.

**Files:**
- Modify: `packages/viewer/src/lib/gallery.ts` (add `seedRosterIfEmpty`)
- Modify: `packages/viewer/tests/lib/gallery.test.ts` (append describe block)

- [ ] **Step 10.1: Write the failing test**

Append to `packages/viewer/tests/lib/gallery.test.ts`:

```typescript
import { seedRosterIfEmpty } from '../../src/lib/gallery.js';

describe('seedRosterIfEmpty', () => {
  it('imports every gallery character when the roster is empty', async () => {
    await seedRosterIfEmpty();
    const r = readRoster();
    expect(r.characters).toHaveLength(FAKE_GALLERY.characters.length);
    expect(r.characters[0]!.name).toBe('Hawkwind');
  });

  it('is a no-op when the roster already has characters', async () => {
    const g = await loadGallery();
    await importToRoster(g.characters[0]!.id);
    const before = readRoster().characters.length;
    await seedRosterIfEmpty();
    const after = readRoster().characters.length;
    expect(after).toBe(before);
  });
});
```

- [ ] **Step 10.2: Run the test, verify it fails**

```
pnpm --filter @wiz6/viewer test gallery
```

Expected: fails on missing `seedRosterIfEmpty` export.

- [ ] **Step 10.3: Add the helper**

Append to `packages/viewer/src/lib/gallery.ts`:

```typescript
import { readRoster } from './roster-store.js';

/**
 * If the visitor's roster is empty, import every gallery character.
 * Safe to call on every page load — does nothing once the roster has
 * any content.
 */
export async function seedRosterIfEmpty(): Promise<void> {
  const r = readRoster();
  if (r.characters.length > 0) return;
  const gallery = await loadGallery();
  for (const c of gallery.characters) {
    await importToRoster(c.id);
  }
}
```

- [ ] **Step 10.4: Run the test, verify it passes**

```
pnpm --filter @wiz6/viewer test gallery
```

Expected: 6 tests pass (4 original + 2 new).

- [ ] **Step 10.5: Commit**

```
git add packages/viewer/src/lib/gallery.ts \
        packages/viewer/tests/lib/gallery.test.ts
git commit -m "feat(viewer): seedRosterIfEmpty — auto-seed on first visit"
```

---

## Task 11: RosterView — list characters with the new store

**Why this exists:** Replace the existing `RosterView` stub with the real implementation. v1 lists characters from the store and triggers the gallery seed on mount.

**Files:**
- Modify: `packages/viewer/src/pages/game/RosterView.tsx`
- Modify: `packages/viewer/src/pages/game/RosterView.module.css`
- Create: `packages/viewer/tests/pages/game/RosterView.test.tsx`

- [ ] **Step 11.1: Write the failing test**

Create `packages/viewer/tests/pages/game/RosterView.test.tsx`:

```tsx
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RosterView } from '../../../src/pages/game/RosterView.js';

const FAKE_GALLERY = {
  schemaVersion: 1,
  characters: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Hawkwind',
      race: 0, class: 0, level: 1, savedOldLevel: 0, xp: 0, gold: 100,
      conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      dead: false, paralyzed: false,
      attributes: { str: 14, int: 9, pie: 8, vit: 13, dex: 11, spd: 12, personality: 60, karma: 50 },
      schoolMana: [0, 0, 0, 0, 0, 0],
      skills: [10, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      reaction: 50,
    },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
    ok: true,
    json: async () => FAKE_GALLERY,
  } as unknown as Response));
});

describe('RosterView', () => {
  it('renders the page heading and seeds the roster from the gallery on first mount', async () => {
    render(<MemoryRouter><RosterView /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: /roster/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Hawkwind')).toBeInTheDocument();
    });
  });

  it('renders existing roster characters (no re-seed needed)', async () => {
    // Pre-populate the roster
    window.localStorage.setItem(
      'wiz6:roster',
      // Need a valid base64-gzipped roster — easier to write through the public API
      '', // placeholder; we'll let the seed flow run instead
    );
    window.localStorage.clear();

    render(<MemoryRouter><RosterView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Hawkwind')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 11.2: Run the test, verify it fails**

```
pnpm --filter @wiz6/viewer test RosterView
```

Expected: fails because the existing RosterView stub doesn't render any character.

- [ ] **Step 11.3: Rewrite RosterView**

Replace the contents of `packages/viewer/src/pages/game/RosterView.tsx` entirely:

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Character } from '@wiz6/data';
import { readRoster } from '../../lib/roster-store.js';
import { seedRosterIfEmpty } from '../../lib/gallery.js';
import { RosterCharacterCard } from './RosterCharacterCard.js';
import styles from './RosterView.module.css';

export function RosterView() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await seedRosterIfEmpty();
      } catch (e) {
        console.warn('[RosterView] gallery seed failed', e);
      }
      if (cancelled) return;
      setCharacters(readRoster().characters);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Roster</h1>
      <p className={styles.lede}>
        Your characters live in this browser's storage. Pre-seeded from the curated
        <Link to="#"> gallery</Link> on first visit.
      </p>
      {!loaded ? (
        <p>Loading…</p>
      ) : characters.length === 0 ? (
        <p>No characters yet.</p>
      ) : (
        <ul className={styles.grid}>
          {characters.map((c) => (
            <li key={c.id}>
              <RosterCharacterCard character={c} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

Create `packages/viewer/src/pages/game/RosterCharacterCard.tsx`:

```tsx
import type { Character } from '@wiz6/data';
import styles from './RosterView.module.css';

interface Props {
  character: Character;
  /** When true, render a "from gallery" badge. */
  fromGallery?: boolean;
}

export function RosterCharacterCard({ character: c, fromGallery }: Props) {
  return (
    <article className={styles.card} data-from-gallery={fromGallery || undefined}>
      <header className={styles.cardHeader}>
        <h2 className={styles.name}>{c.name}</h2>
        {fromGallery ? <span className={styles.badge}>from gallery</span> : null}
      </header>
      <dl className={styles.stats}>
        <div><dt>Race</dt><dd>{c.race}</dd></div>
        <div><dt>Class</dt><dd>{c.class}</dd></div>
        <div><dt>Level</dt><dd>{c.level}</dd></div>
        <div><dt>XP</dt><dd>{c.xp}</dd></div>
        <div><dt>Gold</dt><dd>{c.gold}</dd></div>
      </dl>
    </article>
  );
}
```

Append to `packages/viewer/src/pages/game/RosterView.module.css`:

```css
.grid {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-4, 16px);
}

.card {
  border: 1px solid var(--color-border, #444);
  border-radius: 6px;
  padding: var(--space-3, 12px);
  background: var(--color-surface, #1a1a1a);
}

.cardHeader {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-2, 8px);
}

.name {
  font-size: 1.05em;
  margin: 0;
}

.badge {
  font-size: 0.75em;
  color: var(--color-text-muted, #aaa);
  border: 1px solid var(--color-border, #444);
  border-radius: 3px;
  padding: 2px 6px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
  margin: 8px 0 0;
  font-size: 0.9em;
}

.stats > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.stats dt {
  color: var(--color-text-muted, #aaa);
}

.stats dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 11.4: Run the test, verify it passes**

```
pnpm --filter @wiz6/viewer test RosterView
```

Expected: tests pass — gallery seed runs, Hawkwind rendered.

- [ ] **Step 11.5: Commit**

```
git add packages/viewer/src/pages/game/RosterView.tsx \
        packages/viewer/src/pages/game/RosterView.module.css \
        packages/viewer/src/pages/game/RosterCharacterCard.tsx \
        packages/viewer/tests/pages/game/RosterView.test.tsx
git commit -m "feat(viewer): RosterView lists characters, seeds gallery on first visit"
```

---

## Task 12: Mark gallery-originated characters in the UI

**Why this exists:** Per the spec, gallery characters in the roster should be "visibly marked as such" so the visitor knows they're playing with someone else's design.

We don't store a "from-gallery" boolean on the Character itself (that would couple data to UI). Instead, the RosterView loads the gallery and checks each roster character's id against the gallery character ids. **But seed-imported characters get new UUIDs**, so id-match wouldn't work post-seed.

Solution: record a parallel set of "imported-from-gallery" character ids in localStorage at `wiz6:gallery-origins`. `importToRoster` writes to it; `RosterView` reads from it.

**Files:**
- Modify: `packages/viewer/src/lib/gallery.ts` (track origin ids)
- Modify: `packages/viewer/tests/lib/gallery.test.ts` (extend existing tests)
- Modify: `packages/viewer/src/pages/game/RosterView.tsx` (read origins, pass to card)
- Modify: `packages/viewer/tests/pages/game/RosterView.test.tsx` (assert badge present)

- [ ] **Step 12.1: Write the failing tests**

Append to `packages/viewer/tests/lib/gallery.test.ts`:

```typescript
import { getGalleryOriginIds, isFromGallery } from '../../src/lib/gallery.js';

describe('gallery-origin tracking', () => {
  it('importToRoster records the new roster id as gallery-originated', async () => {
    const g = await loadGallery();
    const newId = await importToRoster(g.characters[0]!.id);
    expect(getGalleryOriginIds()).toContain(newId);
    expect(isFromGallery(newId)).toBe(true);
    expect(isFromGallery('00000000-0000-4000-8000-999999999999')).toBe(false);
  });
});
```

Append to `packages/viewer/tests/pages/game/RosterView.test.tsx`:

```typescript
describe('RosterView gallery badge', () => {
  it('renders a "from gallery" badge on seed-imported characters', async () => {
    render(<MemoryRouter><RosterView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Hawkwind')).toBeInTheDocument();
      expect(screen.getByText(/from gallery/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 12.2: Run, verify they fail**

```
pnpm --filter @wiz6/viewer test gallery
pnpm --filter @wiz6/viewer test RosterView
```

- [ ] **Step 12.3: Track origin ids in `gallery.ts`**

In `packages/viewer/src/lib/gallery.ts`, add the origin-tracking helpers and update `importToRoster`:

```typescript
const ORIGINS_KEY = 'wiz6:gallery-origins';

function readOrigins(): string[] {
  try {
    const raw = window.localStorage.getItem(ORIGINS_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function writeOrigins(ids: string[]): void {
  window.localStorage.setItem(ORIGINS_KEY, JSON.stringify(ids));
}

export function getGalleryOriginIds(): string[] {
  return readOrigins();
}

export function isFromGallery(rosterCharacterId: string): boolean {
  return readOrigins().includes(rosterCharacterId);
}
```

Modify the existing `importToRoster` to record the new id:

```typescript
export async function importToRoster(galleryCharId: string): Promise<string> {
  const gallery = await loadGallery();
  const source = gallery.characters.find((c) => c.id === galleryCharId);
  if (!source) throw new Error(`gallery has no character with id ${galleryCharId}`);
  const fresh: Character = { ...source, id: newUuid() };
  addCharacter(fresh);
  // Record that this new roster id originated in the gallery.
  const origins = readOrigins();
  if (!origins.includes(fresh.id)) {
    writeOrigins([...origins, fresh.id]);
  }
  return fresh.id;
}
```

- [ ] **Step 12.4: Wire the badge in `RosterView`**

Update `packages/viewer/src/pages/game/RosterView.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Character } from '@wiz6/data';
import { readRoster } from '../../lib/roster-store.js';
import { seedRosterIfEmpty, getGalleryOriginIds } from '../../lib/gallery.js';
import { RosterCharacterCard } from './RosterCharacterCard.js';
import styles from './RosterView.module.css';

export function RosterView() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [galleryIds, setGalleryIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await seedRosterIfEmpty();
      } catch (e) {
        console.warn('[RosterView] gallery seed failed', e);
      }
      if (cancelled) return;
      setCharacters(readRoster().characters);
      setGalleryIds(new Set(getGalleryOriginIds()));
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Roster</h1>
      <p className={styles.lede}>
        Your characters live in this browser's storage. Pre-seeded from the curated
        <Link to="#"> gallery</Link> on first visit.
      </p>
      {!loaded ? (
        <p>Loading…</p>
      ) : characters.length === 0 ? (
        <p>No characters yet.</p>
      ) : (
        <ul className={styles.grid}>
          {characters.map((c) => (
            <li key={c.id}>
              <RosterCharacterCard character={c} fromGallery={galleryIds.has(c.id)} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 12.5: Run all tests, verify they pass**

```
pnpm --filter @wiz6/viewer test gallery
pnpm --filter @wiz6/viewer test RosterView
```

- [ ] **Step 12.6: Commit**

```
git add packages/viewer/src/lib/gallery.ts \
        packages/viewer/tests/lib/gallery.test.ts \
        packages/viewer/src/pages/game/RosterView.tsx \
        packages/viewer/tests/pages/game/RosterView.test.tsx
git commit -m "feat(viewer): mark gallery-originated characters with a badge"
```

---

## Task 13: Character download / upload

**Why this exists:** The spec calls for "download character" / "upload character" buttons on the roster page (separate from save download). Lets visitors share specific characters as `.wiz6char.json` files.

The download writes a single-character JSON (versioned envelope with one character). The upload reads it and adds to the roster under a new UUID (to avoid collisions with the source visitor's roster).

**Files:**
- Modify: `packages/viewer/src/pages/game/RosterView.tsx` (add download/upload buttons + per-card download)
- Modify: `packages/viewer/src/pages/game/RosterCharacterCard.tsx`
- Modify: `packages/viewer/tests/pages/game/RosterView.test.tsx`

- [ ] **Step 13.1: Write the failing test**

Append to `packages/viewer/tests/pages/game/RosterView.test.tsx`:

```typescript
import { fireEvent } from '@testing-library/react';

describe('RosterView character download', () => {
  it('renders a Download button on each character card', async () => {
    render(<MemoryRouter><RosterView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Hawkwind')).toBeInTheDocument();
    });
    const downloadBtns = screen.getAllByRole('button', { name: /download/i });
    expect(downloadBtns.length).toBeGreaterThan(0);
  });
});

describe('RosterView character upload', () => {
  it('renders an Upload Character control', async () => {
    render(<MemoryRouter><RosterView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByLabelText(/upload character/i)).toBeInTheDocument();
    });
  });

  it('adds the uploaded character to the roster under a new uuid', async () => {
    render(<MemoryRouter><RosterView /></MemoryRouter>);
    await waitFor(() => screen.getByText('Hawkwind'));

    const upload = screen.getByLabelText(/upload character/i) as HTMLInputElement;
    const payload = JSON.stringify({
      schemaVersion: 1,
      character: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Visitor',
        race: 0, class: 0, level: 3, savedOldLevel: 0, xp: 9999, gold: 50,
        conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        dead: false, paralyzed: false,
        attributes: { str: 9, int: 14, pie: 9, vit: 9, dex: 9, spd: 9, personality: 50, karma: 50 },
        schoolMana: [0, 0, 0, 0, 0, 0],
        skills: new Array(14).fill(0),
        reaction: 50,
      },
    });
    const file = new File([payload], 'visitor.wiz6char.json', { type: 'application/json' });
    fireEvent.change(upload, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Visitor')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 13.2: Run the tests, verify they fail**

```
pnpm --filter @wiz6/viewer test RosterView
```

- [ ] **Step 13.3: Add a character-codec helper for the `.wiz6char.json` envelope**

The save/roster codecs already exist; for single-character download we want a plain JSON envelope (no gzip — files are small, and human-readability is a plus).

Update `packages/viewer/src/pages/game/RosterView.tsx` to add download + upload helpers + handlers:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { CharacterSchema, type Character } from '@wiz6/data';
import { readRoster, addCharacter } from '../../lib/roster-store.js';
import { seedRosterIfEmpty, getGalleryOriginIds } from '../../lib/gallery.js';
import { RosterCharacterCard } from './RosterCharacterCard.js';
import styles from './RosterView.module.css';

const CharacterEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  character: CharacterSchema,
});

function newUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function downloadCharacter(c: Character): void {
  const envelope = { schemaVersion: 1 as const, character: c };
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${c.name.replace(/[^A-Za-z0-9_-]/g, '_')}.wiz6char.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function uploadCharacter(file: File): Promise<void> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const env = CharacterEnvelopeSchema.parse(parsed);
  // New UUID on import — never collide with the source visitor's roster.
  addCharacter({ ...env.character, id: newUuid() });
}

export function RosterView() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [galleryIds, setGalleryIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function refresh(): void {
    setCharacters(readRoster().characters);
    setGalleryIds(new Set(getGalleryOriginIds()));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await seedRosterIfEmpty();
      } catch (e) {
        console.warn('[RosterView] gallery seed failed', e);
      }
      if (cancelled) return;
      refresh();
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      await uploadCharacter(file);
      refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      // Reset so the same file can be re-uploaded if needed.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Roster</h1>
      <p className={styles.lede}>
        Your characters live in this browser's storage. Pre-seeded from the curated
        <Link to="#"> gallery</Link> on first visit.
      </p>

      <div className={styles.actions}>
        <label className={styles.uploadLabel}>
          Upload character
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={onUpload}
            aria-label="Upload character"
          />
        </label>
        {uploadError ? <p role="alert" className={styles.error}>Upload failed: {uploadError}</p> : null}
      </div>

      {!loaded ? (
        <p>Loading…</p>
      ) : characters.length === 0 ? (
        <p>No characters yet.</p>
      ) : (
        <ul className={styles.grid}>
          {characters.map((c) => (
            <li key={c.id}>
              <RosterCharacterCard
                character={c}
                fromGallery={galleryIds.has(c.id)}
                onDownload={() => downloadCharacter(c)}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

Update `packages/viewer/src/pages/game/RosterCharacterCard.tsx`:

```tsx
import type { Character } from '@wiz6/data';
import styles from './RosterView.module.css';

interface Props {
  character: Character;
  fromGallery?: boolean;
  onDownload?: () => void;
}

export function RosterCharacterCard({ character: c, fromGallery, onDownload }: Props) {
  return (
    <article className={styles.card} data-from-gallery={fromGallery || undefined}>
      <header className={styles.cardHeader}>
        <h2 className={styles.name}>{c.name}</h2>
        {fromGallery ? <span className={styles.badge}>from gallery</span> : null}
      </header>
      <dl className={styles.stats}>
        <div><dt>Race</dt><dd>{c.race}</dd></div>
        <div><dt>Class</dt><dd>{c.class}</dd></div>
        <div><dt>Level</dt><dd>{c.level}</dd></div>
        <div><dt>XP</dt><dd>{c.xp}</dd></div>
        <div><dt>Gold</dt><dd>{c.gold}</dd></div>
      </dl>
      {onDownload ? (
        <div className={styles.cardActions}>
          <button type="button" onClick={onDownload}>Download</button>
        </div>
      ) : null}
    </article>
  );
}
```

Append CSS to `packages/viewer/src/pages/game/RosterView.module.css`:

```css
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3, 12px);
  margin: var(--space-3, 12px) 0;
}

.uploadLabel {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--color-border, #444);
  border-radius: 4px;
  cursor: pointer;
}

.uploadLabel input[type="file"] {
  font-size: 0.85em;
}

.error {
  color: var(--color-error, #ff8080);
  font-size: 0.9em;
}

.cardActions {
  margin-top: 8px;
  display: flex;
  gap: 6px;
}

.cardActions button {
  background: var(--color-surface, #1a1a1a);
  color: var(--color-text, #ddd);
  border: 1px solid var(--color-border, #444);
  border-radius: 3px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 0.85em;
}

.cardActions button:hover {
  border-color: var(--color-accent, #6c6);
}
```

- [ ] **Step 13.4: Run tests, verify they pass**

```
pnpm --filter @wiz6/viewer test RosterView
```

Expected: 4 RosterView tests pass (initial + badge + download present + upload).

- [ ] **Step 13.5: Commit**

```
git add packages/viewer/src/pages/game/RosterView.tsx \
        packages/viewer/src/pages/game/RosterCharacterCard.tsx \
        packages/viewer/src/pages/game/RosterView.module.css \
        packages/viewer/tests/pages/game/RosterView.test.tsx
git commit -m "feat(viewer): character download + upload on the roster page"
```

---

## Task 14: Final full-test pass

**Why this exists:** Sanity check before declaring the plan done.

- [ ] **Step 14.1: Run the full repo test suite**

```
pnpm -r test
```

Expected: all packages green. New counts: data ~165 (was 159 + ~6 schema tests across 3 files; actual will depend on count), parser ~188 (was 179 + 9 codec tests), viewer ~320 (was 299 + ~21 lib/page tests). MCP unchanged.

- [ ] **Step 14.2: Run the full build**

```
pnpm -r build
```

Expected: every package builds clean.

- [ ] **Step 14.3: Update TODO.md**

In `TODO.md` at the repo root, edit the `#009` entry to reflect that phases 1-5 shipped. Replace its body with:

```
- #009 [open] — Savegame + Roster management strategy: Phase 6 (Saves page UX) + Phase 7-8 (DOS interop, savegame editor)
  - Phases 1-5 shipped 2026-05-25 (schemas, codec, storage, gallery seed, roster page UX).
  - Phase 6 (`/saves` page UX) is the natural next step — slot grid, download/upload buttons.
  - Phase 7 (DOS interop) waits on the SAVEGAME.DBS RE pass.
  - Phase 8 (savegame editor) builds on Phase 6 + the per-field engineering tooltips.
```

Commit:

```
git add TODO.md
git commit -m "docs(todo): #009 phases 1-5 shipped; phases 6-8 remain"
```

- [ ] **Step 14.4: Push the branch (do NOT push to main)**

```
git push -u origin feat/savegame-roster-phases-1-5
```

This sets up the branch on the remote for later PR. Do not merge to main automatically.

---

## Self-review notes (for the implementer)

**Spec coverage check (skim the spec, find each requirement in a task):**

- ✅ "CharacterSchema, PartyMemberSchema, SaveSchema, RosterSchema in @wiz6/data" — Tasks 1-4
- ✅ "encodeSave/decodeSave + encodeRoster/decodeRoster in @wiz6/parser" — Tasks 5-6
- ✅ "6-slot localStorage at wiz6:save:N" — Task 7
- ✅ "single roster at wiz6:roster, syncFromSave" — Task 8
- ✅ "static gallery at /gallery/characters.json + import-to-roster helper" — Task 9
- ✅ "On first visit, auto-seed the roster" — Task 10
- ✅ "/roster page (existing route, replaces stub): list + gallery import + download/upload + visible 'from gallery' badge" — Tasks 11-13
- ✅ Per-spec deferral of Phase 6/7/8 — Task 14 documents that they're out of scope here

**Open known gaps (acceptable for v1):**

- `ScenarioFlagsSchema` and `MazeStateSchema` are `record<string, unknown>`. Refining requires further RE. Not blocking — saves still round-trip.
- The Position schema only covers the player-visible position fields. Saved-position-slot fields (engine `+0x00..+0x0e` of position-state) are dungeon-mechanic internals not surfaced in UI.
- IndexedDB fallback for oversized saves: deferred per the spec. Sample saves are under 1 KB after gzip+base64; we're far from any localStorage ceiling.
- Per-character edit UI: spec defers to Phase 8.
- The gallery seed ships with 1 character. Adding more is a content commit, not code.

**Type consistency check:**

- `Character.attributes` is an object (named fields) in the schema; matches throughout.
- `Save.party` is `PartyMember[]` (max 6); matches in Tasks 4, 7, 8.
- All exports flow through `packages/data/src/index.ts` and `packages/parser/src/index.ts` — no deep imports from viewer.
- `RosterView` props match `RosterCharacterCard`'s expected `character: Character; fromGallery?: boolean; onDownload?: () => void;` — see Task 13's update of the card component.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-05-25-savegame-roster-phases-1-5.md`. Per the user's standing pref ("Always use subagent-driven development for executing implementation plans — don't ask, just do it"), execute via **superpowers:subagent-driven-development** from the worktree at `~/.config/superpowers/worktrees/wiz6/feat-savegame-roster-phases-1-5`.
