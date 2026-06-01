# ADD PARTY MEMBER Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the MASTER OPTIONS → ADD PARTY MEMBER feature with byte-exact cell-grid parity against the engine, plus a new active-party localStorage store and castle-screen portrait integration.

**Architecture:** New `AddPartyPage` (approach A from spec) renders the castle background + a two-panel picker overlay. Picker layout is byte-exact against `tools/dosbox/save/1.sav`'s cell-grid state (NATHAN + cursor on it). Active party persists to `wiz6:active-party`; `CastleScreen` reads `partySize` from it and blits portraits to the engine's left-side positions.

**Tech Stack:** TypeScript ESM, React, Vite, vitest, zod, pnpm monorepo (`@wiz6/data`, `@wiz6/parser`, viewer package), Python3 for `dump-cells.py` extension.

**Spec:** [`docs/superpowers/specs/2026-05-28-add-party-member-design.md`](../specs/2026-05-28-add-party-member-design.md)

---

## File layout

**Create:**
- `tools/parity/fixtures/cells/add-party-picker-1char.json` — engine fixture
- `packages/data/src/schemas/active-party.ts`
- `packages/data/tests/active-party-schema.test.ts`
- `packages/viewer/src/lib/active-party-store.ts`
- `packages/viewer/tests/lib/active-party-store.test.ts`
- `packages/viewer/src/pages/castle/AddPartyPage.tsx`
- `packages/viewer/src/pages/castle/compose-add-party-picker-frame.ts`
- `packages/viewer/tests/pages/castle/compose-add-party-picker-frame.test.ts`
- `packages/viewer/tests/pages/castle/AddPartyPage.test.tsx`
- `packages/viewer/tests/pages/castle/add-party-cell-parity.test.ts`

**Modify:**
- `tools/parity/dump-cells.py` — add wbase-picker extraction mode
- `packages/data/src/index.ts` — re-export `ActivePartySchema` + types
- `packages/viewer/src/pages/game/castle-frame.ts` — accept partyMembers, blit portraits
- `packages/viewer/src/pages/game/CastleScreen.tsx` — read partySize from store
- `packages/viewer/src/pages/game/CastleStub.tsx` — remove `add-party` entry
- `packages/viewer/src/router.tsx` — `/castle/add-party` → `AddPartyPage`

---

## Task 1: Extend `dump-cells.py` to extract the wbase ADD PARTY picker windows

**Why first:** Every subsequent task depends on having the cell-grid fixture. The wbase picker uses dynamically-allocated windows (not the fixed wpcmk handles); we need an empirical scan to find them.

**Files:**
- Modify: `tools/parity/dump-cells.py`
- Create: `tools/parity/fixtures/cells/add-party-picker-1char.json`

### Steps

- [ ] **Step 1.1: Verify the canonical save**

Run: `python3 tools/parity/dump-cells.py tools/dosbox/save/1.sav 2>&1 | head -20`

Expected: shows wpcmk windows in stale/garbage state (state 0xffff sentinel; party_size=0; one PCFILE char NATHAN). Confirms save/1.sav is in the right context.

- [ ] **Step 1.2: Scan memory for the picker's cell pattern**

Use the existing MCP helpers (or a one-off Python script) to find the cell pattern `4e 50 41 50 54 50 48 50 41 50 4e 50` (NATHAN with attr 0x50) in save/1.sav's `Memory` blob. Expected: at least one match around physical offset 0x1f910.

```python
# Helper at top of dump-cells.py (or inline in extension):
def find_cell_pattern(blob: bytes, pattern: bytes) -> list[int]:
    matches = []
    i = 0
    while True:
        j = blob.find(pattern, i)
        if j < 0:
            break
        matches.append(j)
        i = j + 1
    return matches
```

- [ ] **Step 1.3: Reverse the wbase window struct layout**

The wpcmk struct is `u8 w@0, u8 h@1, u8 x@2, u8 y@3, u8 attr@4, cells@+0x10`. The wbase picker's window struct may differ. Approach: find the picker's window struct by walking backwards from the cell pattern (cells start at struct+0x10 in the wpcmk format; try this assumption first), decode the dimensions, and verify they're plausible (w ≤ 40, h ≤ 25, x in 0..40, y in 0..25). If the wpcmk format doesn't fit, document the wbase struct format in `docs/re/findings/wbase-window-struct.json`.

Save investigation notes inline as comments in `dump-cells.py`.

- [ ] **Step 1.4: Add a `--picker` mode to `dump-cells.py`**

Modify `tools/parity/dump-cells.py` to support an `--picker` flag that:
1. Locates the picker's two windows by searching the Memory blob for plausible struct headers (small w/h, x/y in screen bounds, cells region not all zeros).
2. Identifies the two picker panels (left has "CANCEL" cells with attr 0x03; right has the NATHAN+attr-0x50 cell pattern).
3. Outputs both as a JSON file with the same shape as existing fixtures: `{"save": "1.sav", "windows": {"leftPanel": {...}, "rightPanel": {...}}}`.

Add this near the end of `dump-cells.py`:

```python
def find_picker_windows(blob: bytes) -> dict:
    """Locate the wbase ADD PARTY picker's two windows in save memory.

    The picker uses dynamically-allocated windows (not the fixed wpcmk handles).
    We find them by scanning for cell-content signatures:
      - Right panel: contains "NATHAN" with attr 0x50 (cursor highlight).
      - Left panel: contains "CANCEL" with attr 0x03.
    """
    NATHAN_HL = bytes.fromhex("4e 50 41 50 54 50 48 50 41 50 4e 50")
    CANCEL_NORMAL = bytes.fromhex("43 03 41 03 4e 03 43 03 45 03 4c 03")

    nathan_offsets = find_cell_pattern(blob, NATHAN_HL)
    cancel_offsets = find_cell_pattern(blob, CANCEL_NORMAL)
    if not nathan_offsets or not cancel_offsets:
        raise RuntimeError("picker cells not found — is save/1.sav at the ADD PARTY picker?")

    # The struct header is 16 bytes before the cell containing the pattern's
    # row-start. We walk backwards from each match looking for a header where
    # w*h*2 + 0x10 bytes back, with plausible w/h/x/y. Document findings.
    right = scan_back_for_struct(blob, nathan_offsets[0])
    left = scan_back_for_struct(blob, cancel_offsets[0])
    return {"leftPanel": left, "rightPanel": right}
```

(The `scan_back_for_struct` helper is what Step 1.3's investigation produces. Implement it based on what struct layout actually works.)

- [ ] **Step 1.5: Generate and commit the fixture**

Run: `python3 tools/parity/dump-cells.py tools/dosbox/save/1.sav --picker tools/parity/fixtures/cells/add-party-picker-1char.json`

Expected: writes the fixture JSON. Inspect it manually:

```bash
cat tools/parity/fixtures/cells/add-party-picker-1char.json | python3 -c "import sys, json; d = json.load(sys.stdin); print(list(d['windows'].keys())); print('left w×h:', d['windows']['leftPanel']['w'], 'x', d['windows']['leftPanel']['h']); print('right w×h:', d['windows']['rightPanel']['w'], 'x', d['windows']['rightPanel']['h'])"
```

Expected: two windows present, plausible dimensions (w ≤ 40, h ≤ 25 each).

- [ ] **Step 1.6: Commit**

```bash
git add tools/parity/dump-cells.py tools/parity/fixtures/cells/add-party-picker-1char.json
git commit -m "tools(parity): extend dump-cells with wbase ADD PARTY picker extraction"
```

If a new findings JSON was needed for the wbase window struct format, include it:

```bash
git add docs/re/findings/wbase-window-struct.json  # if created in Step 1.3
git commit -m "re(wbase): document the dynamic window struct format used by pickers"
```

---

## Task 2: `ActivePartySchema` + `ActivePartyMemberSchema` in `@wiz6/data`

**Files:**
- Create: `packages/data/src/schemas/active-party.ts`
- Modify: `packages/data/src/index.ts`
- Test: `packages/data/tests/active-party-schema.test.ts`

### Steps

- [ ] **Step 2.1: Write the failing schema test**

Create `packages/data/tests/active-party-schema.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { ActivePartySchema, ActivePartyMemberSchema } from '../src/schemas/active-party.js';

const VALID_MEMBER = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'NATHAN',
  race: 9, class: 0, sex: 0, level: 1, xp: 0, gold: 0,
  conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  dead: false, paralyzed: false,
  attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
  schoolMana: [0, 0, 0, 0, 0, 0],
  schoolManaMax: [0, 0, 0, 0, 0, 0],
  skills: new Array(30).fill(0),
  savedOldLevel: 0, reaction: 0,
  portraitSlotId: 0,
};

describe('ActivePartySchema', () => {
  it('accepts an empty party', () => {
    expect(ActivePartySchema.parse({ schemaVersion: 1, members: [] })).toEqual({
      schemaVersion: 1, members: [],
    });
  });

  it('accepts a single-member party', () => {
    const p = { schemaVersion: 1, members: [VALID_MEMBER] };
    expect(ActivePartySchema.parse(p)).toEqual(p);
  });

  it('rejects more than 6 members', () => {
    const tooMany = { schemaVersion: 1, members: new Array(7).fill(VALID_MEMBER) };
    expect(() => ActivePartySchema.parse(tooMany)).toThrow();
  });

  it('rejects portraitSlotId out of range 0..5', () => {
    const bad = { ...VALID_MEMBER, portraitSlotId: 6 };
    expect(() => ActivePartyMemberSchema.parse(bad)).toThrow();
  });

  it('rejects schemaVersion != 1', () => {
    expect(() => ActivePartySchema.parse({ schemaVersion: 2, members: [] })).toThrow();
  });
});
```

- [ ] **Step 2.2: Run the test, confirm it fails**

```bash
pnpm --filter @wiz6/data test active-party-schema 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module './schemas/active-party.js'".

- [ ] **Step 2.3: Implement the schema**

Create `packages/data/src/schemas/active-party.ts`:

```typescript
import { z } from 'zod';
import { PartyMemberSchema } from './character.js';

/**
 * Active-party member — extends PartyMember with the portraitSlotId field that
 * determines screen Y position on the castle's left side.
 *
 * Engine reference: FUN_0c2c (smallest-free allocator) + FUN_0b0e (blit at
 * X=2, Y=portraitSlotId*9+0x48). See
 * docs/re/findings/wbase-add-party-member.json.
 */
export const ActivePartyMemberSchema = PartyMemberSchema.extend({
  portraitSlotId: z.number().int().min(0).max(5),
});

/**
 * Active party — the 0..6 members currently in the player's party, before save.
 * Persisted at localStorage key `wiz6:active-party` (viewer-side store).
 */
export const ActivePartySchema = z.object({
  schemaVersion: z.literal(1),
  members: z.array(ActivePartyMemberSchema).max(6),
});

export type ActivePartyMember = z.infer<typeof ActivePartyMemberSchema>;
export type ActiveParty = z.infer<typeof ActivePartySchema>;
```

- [ ] **Step 2.4: Re-export from `@wiz6/data` index**

Edit `packages/data/src/index.ts` — find the existing schema re-exports and add:

```typescript
export {
  ActivePartySchema,
  ActivePartyMemberSchema,
  type ActiveParty,
  type ActivePartyMember,
} from './schemas/active-party.js';
```

- [ ] **Step 2.5: Run tests, confirm they pass**

```bash
pnpm --filter @wiz6/data test active-party-schema 2>&1 | tail -15
```

Expected: 5 tests passing.

- [ ] **Step 2.6: Run typecheck**

```bash
pnpm -r typecheck 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 2.7: Commit**

```bash
git add packages/data/src/schemas/active-party.ts packages/data/src/index.ts packages/data/tests/active-party-schema.test.ts
git commit -m "feat(data): add ActivePartySchema for in-progress party state"
```

---

## Task 3: `active-party-store.ts` (localStorage layer + portrait allocator)

**Files:**
- Create: `packages/viewer/src/lib/active-party-store.ts`
- Test: `packages/viewer/tests/lib/active-party-store.test.ts`

### Steps

- [ ] **Step 3.1: Write the failing store test**

Create `packages/viewer/tests/lib/active-party-store.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import {
  readActiveParty,
  writeActiveParty,
  addMember,
  dismissAllMembers,
  availableRosterFor,
} from '../../src/lib/active-party-store.js';
import type { ActiveParty, Character, Roster } from '@wiz6/data';

function makeChar(id: string, name: string): Character {
  return {
    id, name, race: 0, class: 0, sex: 0, level: 1, xp: 0, gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0, reaction: 0,
  };
}

const ID = (i: number) => `00000000-0000-0000-0000-${i.toString().padStart(12, '0')}`;

beforeEach(() => {
  window.localStorage.clear();
});

describe('active-party-store', () => {
  it('readActiveParty returns empty on first visit', () => {
    expect(readActiveParty()).toEqual({ schemaVersion: 1, members: [] });
  });

  it('writeActiveParty round-trips via readActiveParty', () => {
    const p: ActiveParty = { schemaVersion: 1, members: [] };
    writeActiveParty(p);
    expect(readActiveParty()).toEqual(p);
  });

  it('addMember appends with portraitSlotId=0 to an empty party', () => {
    addMember(makeChar(ID(1), 'NATHAN'));
    const p = readActiveParty();
    expect(p.members).toHaveLength(1);
    expect(p.members[0]!.id).toBe(ID(1));
    expect(p.members[0]!.portraitSlotId).toBe(0);
  });

  it('addMember allocates smallest unused portraitSlotId', () => {
    addMember(makeChar(ID(1), 'A'));  // slot 0
    addMember(makeChar(ID(2), 'B'));  // slot 1
    addMember(makeChar(ID(3), 'C'));  // slot 2
    expect(readActiveParty().members.map((m) => m.portraitSlotId)).toEqual([0, 1, 2]);
  });

  it('addMember throws when party is full', () => {
    for (let i = 0; i < 6; i++) addMember(makeChar(ID(i), `M${i}`));
    expect(() => addMember(makeChar(ID(99), 'EXTRA'))).toThrow(/full/);
  });

  it('addMember throws when adding a duplicate id', () => {
    addMember(makeChar(ID(1), 'NATHAN'));
    expect(() => addMember(makeChar(ID(1), 'NATHAN-COPY'))).toThrow(/already/);
  });

  it('dismissAllMembers empties the party', () => {
    addMember(makeChar(ID(1), 'A'));
    addMember(makeChar(ID(2), 'B'));
    dismissAllMembers();
    expect(readActiveParty().members).toEqual([]);
  });

  it('availableRosterFor returns roster minus active-party ids', () => {
    addMember(makeChar(ID(1), 'IN_PARTY'));
    const roster: Roster = {
      schemaVersion: 1,
      characters: [makeChar(ID(1), 'IN_PARTY'), makeChar(ID(2), 'AVAILABLE')],
    };
    const result = availableRosterFor(roster.characters, readActiveParty());
    expect(result.map((c) => c.id)).toEqual([ID(2)]);
  });
});
```

- [ ] **Step 3.2: Run the test, confirm it fails**

```bash
pnpm --filter @wiz6/viewer test active-party-store 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement the store**

Create `packages/viewer/src/lib/active-party-store.ts`:

```typescript
import {
  ActivePartySchema,
  type ActiveParty,
  type ActivePartyMember,
  type Character,
} from '@wiz6/data';

const KEY = 'wiz6:active-party';

function emptyParty(): ActiveParty {
  return { schemaVersion: 1, members: [] };
}

/** Read the active party from localStorage. Empty on first visit OR when
 *  stored data is corrupt (logs to console). */
export function readActiveParty(): ActiveParty {
  const raw = window.localStorage.getItem(KEY);
  if (raw === null) return emptyParty();
  try {
    return ActivePartySchema.parse(JSON.parse(raw));
  } catch (e) {
    console.warn('[active-party-store] data invalid, returning empty', e);
    return emptyParty();
  }
}

/** Replace the entire active party. */
export function writeActiveParty(p: ActiveParty): void {
  const validated = ActivePartySchema.parse(p);
  window.localStorage.setItem(KEY, JSON.stringify(validated));
}

/** Allocate the smallest unused portraitSlotId in 0..5. Mirrors engine FUN_0c2c. */
function allocatePortraitSlotId(members: ReadonlyArray<ActivePartyMember>): number {
  const used = new Set(members.map((m) => m.portraitSlotId));
  for (let id = 0; id <= 5; id++) {
    if (!used.has(id)) return id;
  }
  throw new Error('no free portraitSlotId — party should not exceed 6 members');
}

/** Add a roster character to the active party. Throws on full or duplicate. */
export function addMember(rosterChar: Character): void {
  const p = readActiveParty();
  if (p.members.length >= 6) throw new Error('active party is full');
  if (p.members.some((m) => m.id === rosterChar.id)) {
    throw new Error(`character ${rosterChar.id} already in active party`);
  }
  const portraitSlotId = allocatePortraitSlotId(p.members);
  const member: ActivePartyMember = {
    ...rosterChar,
    portraitSlotId,
    rosterCharacterId: rosterChar.id,
  };
  writeActiveParty({ ...p, members: [...p.members, member] });
}

/** Empty the active party. */
export function dismissAllMembers(): void {
  writeActiveParty(emptyParty());
}

/** Filter a roster down to characters not currently in the active party. */
export function availableRosterFor(
  roster: ReadonlyArray<Character>,
  activeParty: ActiveParty,
): Character[] {
  const inParty = new Set(activeParty.members.map((m) => m.id));
  return roster.filter((c) => !inParty.has(c.id));
}
```

- [ ] **Step 3.4: Run tests, confirm they pass**

```bash
pnpm --filter @wiz6/viewer test active-party-store 2>&1 | tail -15
```

Expected: 8 tests passing.

- [ ] **Step 3.5: Commit**

```bash
git add packages/viewer/src/lib/active-party-store.ts packages/viewer/tests/lib/active-party-store.test.ts
git commit -m "feat(viewer): add active-party localStorage store"
```

---

## Task 4: `compose-add-party-picker-frame.ts` + cell-grid parity test

**Why this order:** With the fixture in place (Task 1) and the data model defined (Tasks 2–3), TDD the composer using the fixture as the authoritative target.

**Files:**
- Create: `packages/viewer/src/pages/castle/compose-add-party-picker-frame.ts`
- Create: `packages/viewer/tests/pages/castle/compose-add-party-picker-frame.test.ts` (unit tests)
- Create: `packages/viewer/tests/pages/castle/add-party-cell-parity.test.ts` (fixture parity)

### Steps

- [ ] **Step 4.1: Write the cell-grid parity test**

Create `packages/viewer/tests/pages/castle/add-party-cell-parity.test.ts`. Use the existing `cell-parity.test.ts` (in `pages/roster/creation/ega/`) as the structural template. Load the fixture, build a single-candidate `composeAddPartyPickerFrame` input (NATHAN, cursorIdx=0, onCancel=false), assert cells equal.

```typescript
/**
 * add-party-cell-parity.test.ts — BYTE-EXACT tile parity for the ADD PARTY picker.
 *
 * Drives composeAddPartyPickerFrame against the engine's live cell memory
 * dumped from save/1.sav (NATHAN as the only candidate, cursor on NATHAN).
 *
 * Fixture: tools/parity/fixtures/cells/add-party-picker-1char.json
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageDbSchema } from '@wiz6/data';
import type { Character } from '@wiz6/data';
import { composeAddPartyPickerFrame } from '../../../src/pages/castle/compose-add-party-picker-frame.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');

function mainRoot(): string {
  try {
    const g = readFileSync(join(REPO_ROOT, '.git'), 'utf-8');
    const m = /gitdir:\s*(.+)/.exec(g);
    if (m) return resolve(m[1]!.trim().replace(/\/worktrees\/[^/]+$/, ''), '..');
  } catch {}
  return REPO_ROOT;
}

const FIXTURES = join(mainRoot(), 'tools', 'parity', 'fixtures', 'cells');

interface EngineWindow {
  w: number; h: number; x: number; y: number; attr: number;
  cells: [number, number][][];
}

function loadFixture(): Record<string, EngineWindow> {
  const path = join(FIXTURES, 'add-party-picker-1char.json');
  return JSON.parse(readFileSync(path, 'utf-8')).windows;
}

function nathan(): Character {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'NATHAN',
    race: 9, class: 0, sex: 0, level: 1, xp: 0, gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0, reaction: 0,
  };
}

describe('ADD PARTY picker — cell-grid parity', () => {
  it('1-candidate state matches save/1.sav byte-exact', () => {
    const fixture = loadFixture();
    const msgDbPath = join(mainRoot(), 'extracted', 'msg.json');
    const db = MessageDbSchema.parse(JSON.parse(readFileSync(msgDbPath, 'utf-8')));

    const windows = composeAddPartyPickerFrame(
      { candidates: [nathan()], cursorIdx: 0, onCancel: false },
      db,
    );

    // Map composer outputs to fixture window keys.
    const left = windows.find((w) => w.cells[0]?.[0]?.[0] !== undefined && fixture.leftPanel.w === w.w);
    const right = windows.find((w) => w !== left && w.h === fixture.rightPanel.h);

    expect(left).toBeDefined();
    expect(right).toBeDefined();

    expect(left!.cells).toEqual(fixture.leftPanel.cells);
    expect(right!.cells).toEqual(fixture.rightPanel.cells);
  });
});
```

- [ ] **Step 4.2: Run the test, confirm it fails**

```bash
pnpm --filter @wiz6/viewer test add-party-cell-parity 2>&1 | tail -15
```

Expected: FAIL — module `compose-add-party-picker-frame.js` not found.

- [ ] **Step 4.3: Implement the composer skeleton (signature + empty return)**

Create `packages/viewer/src/pages/castle/compose-add-party-picker-frame.ts`:

```typescript
/**
 * composeAddPartyPickerFrame — pure cell-grid composer for the wbase ADD PARTY
 * picker. Byte-exact against tools/parity/fixtures/cells/add-party-picker-1char.json
 * (the engine's cells from save/1.sav).
 *
 * Engine reference: wbase_pcfile_picker @ wbase.ovr 0x2143.
 * RE: docs/re/findings/wbase-add-party-member.json
 * Prose: docs/re/wbase-main-menu.md §"Slot 0 — ADD PARTY MEMBER (deep dive)"
 */
import { createTileWindow, type TileWindow } from '@wiz6/parser';
import type { Character, MessageDb } from '@wiz6/data';

export interface AddPartyPickerView {
  candidates: ReadonlyArray<Character>;
  cursorIdx: number;
  onCancel: boolean;
}

export function composeAddPartyPickerFrame(
  view: AddPartyPickerView,
  db: MessageDb,
): TileWindow[] {
  // TODO: implement once fixture geometry is loaded.
  return [];
}
```

- [ ] **Step 4.4: Inspect the fixture to derive layout constants**

```bash
cat tools/parity/fixtures/cells/add-party-picker-1char.json | python3 -m json.tool | head -30
```

Note the exact w/h/x/y/attr for left + right panels. These become hard-coded constants in the composer (the panels' positions are engine-determined and don't depend on candidate count).

- [ ] **Step 4.5: Implement the LEFT panel composer**

Drive cell-by-cell from the fixture. The left panel content for save/1.sav contains "ADD WHO?" and "CANCEL" (verified empirically). Read the fixture's `leftPanel.cells` to determine exact row/column placement.

Add to `compose-add-party-picker-frame.ts` (replace the TODO):

```typescript
import { createTileWindow, setCursor, puts, clearWindow, type TileWindow } from '@wiz6/parser';
import { raceName, className, sexName } from '../roster/creation/messages.js';

// Geometry — read from tools/parity/fixtures/cells/add-party-picker-1char.json.
// Update these constants if the fixture is regenerated with different dims.
const LEFT_X = /* fill from fixture leftPanel.x */ 0;
const LEFT_Y = /* fill from fixture leftPanel.y */ 0;
const LEFT_W = /* fill from fixture leftPanel.w */ 0;
const LEFT_H = /* fill from fixture leftPanel.h */ 0;

const RIGHT_X = /* fill from fixture rightPanel.x */ 0;
const RIGHT_Y = /* fill from fixture rightPanel.y */ 0;
const RIGHT_W = /* fill from fixture rightPanel.w */ 0;
const RIGHT_H = /* fill from fixture rightPanel.h */ 0;

// Title strings observed in save/1.sav cells (msg.dbs 0x4b1/0x4b6/0x4b7).
const ADD_WHO_TITLE = 'ADD WHO?';
const CANCEL_LABEL = 'CANCEL';

function composeLeftPanel(view: AddPartyPickerView): TileWindow {
  const w = createTileWindow(LEFT_W, LEFT_H, LEFT_X, LEFT_Y, /* attr */ 0x03);
  clearWindow(w, 0x20, 0x03);

  // Position "ADD WHO?" — coordinates from fixture cell positions.
  // Position "CANCEL" — coordinates from fixture, highlighted attr 0x50 when onCancel.
  const cancelAttr = view.onCancel ? 0x50 : 0x03;
  // (Fill in setCursor + puts for the title and cancel button per the fixture's
  //  exact (row, col) positions.)
  return w;
}
```

(Fill in the exact `setCursor(w, col, row); puts(w, 'ADD WHO?', 0x03);` lines based on where the fixture has those cells.)

- [ ] **Step 4.6: Implement the RIGHT panel composer**

```typescript
const RACE_ABBR_LEN = 3;
const CLASS_ABBR_LEN = 3;

function composeRightPanel(view: AddPartyPickerView, db: MessageDb): TileWindow {
  const w = createTileWindow(RIGHT_W, RIGHT_H, RIGHT_X, RIGHT_Y, /* attr */ 0x03);
  clearWindow(w, 0x20, 0x03);

  // Scrollbar arrows — match the wpcmk roster-picker convention:
  //   row 0 col ? = 'E' (top arrow) attr 0x02
  //   middle rows = 'G' (track)
  //   bottom row = 'F' (bottom arrow)
  // Exact column comes from fixture.

  // Sliding 5-row window centered on cursorIdx. For each visible row that maps
  // to a real candidate, emit:
  //   NAME (highlight attr if selected & !onCancel, else 0x03)
  //   2-space pad attr 0x10
  //   SEX(1ch) attr 0x70
  //   '-' attr 0x90
  //   RACE_ABBR(3ch) attr 0x60
  //   space attr 0x10
  //   CLASS_ABBR(3ch) attr 0x30
  for (let visualRow = -2; visualRow <= 2; visualRow++) {
    const idx = view.cursorIdx + visualRow;
    if (idx < 0 || idx >= view.candidates.length) continue;
    const ch = view.candidates[idx]!;
    const selected = visualRow === 0 && !view.onCancel;
    const nameAttr = selected ? 0x50 : 0x03;

    const row = /* fixture-driven row index for the center row + visualRow offset */ 0;
    // (Implement the row layout: name + pad + sex + dash + race + pad + class.)
  }

  return w;
}

export function composeAddPartyPickerFrame(
  view: AddPartyPickerView,
  db: MessageDb,
): TileWindow[] {
  return [composeLeftPanel(view), composeRightPanel(view, db)];
}
```

- [ ] **Step 4.7: Run the parity test repeatedly, iterating until byte-exact**

```bash
pnpm --filter @wiz6/viewer test add-party-cell-parity 2>&1 | tail -30
```

The first run will fail with specific cell mismatches. Use those to refine the composer (cell positions, attrs, padding) until the test passes. Each failure should be a small targeted fix.

Expected end-state: PASS — both panels' cells equal the fixture byte-exact.

- [ ] **Step 4.8: Write the unit tests for synthetic states**

Create `packages/viewer/tests/pages/castle/compose-add-party-picker-frame.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageDbSchema } from '@wiz6/data';
import type { Character, MessageDb } from '@wiz6/data';
import { composeAddPartyPickerFrame } from '../../../src/pages/castle/compose-add-party-picker-frame.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');
function mainRoot(): string {
  try {
    const g = readFileSync(join(REPO_ROOT, '.git'), 'utf-8');
    const m = /gitdir:\s*(.+)/.exec(g);
    if (m) return resolve(m[1]!.trim().replace(/\/worktrees\/[^/]+$/, ''), '..');
  } catch {}
  return REPO_ROOT;
}

function loadMsgDb(): MessageDb {
  const path = join(mainRoot(), 'extracted', 'msg.json');
  return MessageDbSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
}

function makeChar(id: string, name: string, race = 0, cls = 0, sex = 0): Character {
  return {
    id, name, race, class: cls, sex: sex as 0 | 1, level: 1, xp: 0, gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0, reaction: 0,
  };
}

function findHighlightRow(w: { cells: [number, number][][] }): { row: number; col: number } | null {
  for (let r = 0; r < w.cells.length; r++) {
    for (let c = 0; c < w.cells[r]!.length; c++) {
      if (w.cells[r]![c]![1] === 0x50) return { row: r, col: c };
    }
  }
  return null;
}

describe('composeAddPartyPickerFrame', () => {
  const db = loadMsgDb();

  it('highlights the cursor row when not on cancel', () => {
    const view = {
      candidates: [makeChar('a', 'ALPHA'), makeChar('b', 'BETA'), makeChar('c', 'GAMMA')],
      cursorIdx: 1, onCancel: false,
    };
    const [left, right] = composeAddPartyPickerFrame(view, db);
    expect(findHighlightRow(right!)).not.toBeNull();
    expect(findHighlightRow(left!)).toBeNull();
  });

  it('moves highlight to CANCEL label when onCancel=true', () => {
    const view = {
      candidates: [makeChar('a', 'ALPHA')],
      cursorIdx: 0, onCancel: true,
    };
    const [left, right] = composeAddPartyPickerFrame(view, db);
    expect(findHighlightRow(left!)).not.toBeNull();
    expect(findHighlightRow(right!)).toBeNull();
  });

  it('renders empty right-panel rows for out-of-range slots', () => {
    const view = {
      candidates: [makeChar('a', 'SOLO')],
      cursorIdx: 0, onCancel: false,
    };
    const [, right] = composeAddPartyPickerFrame(view, db);
    // With 1 candidate at cursor 0, visualRow -2/-1/+1/+2 should all be blank.
    // Spot-check by counting how many rows contain non-space chars.
    const contentRows = right!.cells.filter((row) =>
      row.some(([ch, _]) => ch !== 0x20 && (ch < 0x01 || ch > 0x08)),
    );
    expect(contentRows.length).toBeGreaterThanOrEqual(1);
    expect(contentRows.length).toBeLessThan(5);
  });

  it('scrolls cursor when far down the candidate list', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => makeChar(`id${i}`, `NAME${i}`));
    const view = { candidates, cursorIdx: 7, onCancel: false };
    const [, right] = composeAddPartyPickerFrame(view, db);
    // The highlight cell should be in the center row.
    const hl = findHighlightRow(right!)!;
    expect(hl).not.toBeNull();
  });
});
```

- [ ] **Step 4.9: Run the unit tests, confirm they pass**

```bash
pnpm --filter @wiz6/viewer test compose-add-party-picker-frame 2>&1 | tail -15
```

Expected: 4 tests passing.

- [ ] **Step 4.10: Commit**

```bash
git add packages/viewer/src/pages/castle/compose-add-party-picker-frame.ts packages/viewer/tests/pages/castle/compose-add-party-picker-frame.test.ts packages/viewer/tests/pages/castle/add-party-cell-parity.test.ts
git commit -m "feat(viewer): add ADD PARTY picker composer with byte-exact cell parity"
```

---

## Task 5: `AddPartyPage` component + component test

**Files:**
- Create: `packages/viewer/src/pages/castle/AddPartyPage.tsx`
- Test: `packages/viewer/tests/pages/castle/AddPartyPage.test.tsx`

### Steps

- [ ] **Step 5.1: Write the failing component test**

Create `packages/viewer/tests/pages/castle/AddPartyPage.test.tsx`:

```typescript
/**
 * AddPartyPage component test — covers key handling and store integration.
 * Uses mocked asset loaders to avoid fetch() in vitest.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import {
  addCharacter,
  readRoster,
  writeRoster,
} from '../../../src/lib/roster-store.js';
import {
  readActiveParty,
  writeActiveParty,
} from '../../../src/lib/active-party-store.js';
import type { Character } from '@wiz6/data';

function makeChar(id: string, name: string): Character {
  return {
    id, name, race: 0, class: 0, sex: 0, level: 1, xp: 0, gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0, reaction: 0,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

async function renderPage() {
  const { AddPartyPage } = await import('../../../src/pages/castle/AddPartyPage.js');
  return render(
    <MemoryRouter initialEntries={['/castle/add-party']}>
      <Routes>
        <Route path="/castle/add-party" element={<AddPartyPage skipAssetLoad />} />
        <Route path="/castle" element={<div data-testid="castle">CASTLE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AddPartyPage', () => {
  it('Escape returns to /castle without adding', async () => {
    writeRoster({ schemaVersion: 1, characters: [makeChar('a', 'NATHAN')] });
    await renderPage();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('castle')).toBeTruthy());
    expect(readActiveParty().members).toEqual([]);
  });

  it('Enter on a candidate adds them and returns to /castle', async () => {
    writeRoster({ schemaVersion: 1, characters: [makeChar('a', 'NATHAN')] });
    await renderPage();
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('castle')).toBeTruthy());
    const p = readActiveParty();
    expect(p.members).toHaveLength(1);
    expect(p.members[0]!.id).toBe('a');
    expect(p.members[0]!.portraitSlotId).toBe(0);
  });

  it('ArrowUp moves to CANCEL; Enter then returns without adding', async () => {
    writeRoster({ schemaVersion: 1, characters: [makeChar('a', 'NATHAN')] });
    await renderPage();
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('castle')).toBeTruthy());
    expect(readActiveParty().members).toEqual([]);
  });

  it('returns to /castle immediately when roster is empty', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('castle')).toBeTruthy());
  });
});
```

- [ ] **Step 5.2: Run the test, confirm it fails**

```bash
pnpm --filter @wiz6/viewer test AddPartyPage 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement `AddPartyPage`**

Create `packages/viewer/src/pages/castle/AddPartyPage.tsx`:

```typescript
/**
 * AddPartyPage — top-level component for the wbase ADD PARTY picker.
 *
 * Owns:
 *  - useState for cursor index + onCancel flag (two-state cursor matching
 *    findings/wpcmk-roster-picker-input.json)
 *  - useEffect for loading fonts + MessageDb + PortraitSet
 *  - Key handling: arrows/Enter/Escape per the spec's key table
 *  - On commit: addMember(rosterChar) then navigate('/castle')
 *  - On cancel: navigate('/castle') with no state change
 *
 * Renders the castle background (composeCastleFrame) plus the picker overlay
 * (composeAddPartyPickerFrame) via CreationCanvas.
 *
 * Spec: docs/superpowers/specs/2026-05-28-add-party-member-design.md
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { WIZ6_MAIN, type Font, type Font4bpp, type MessageDb, type PortraitSet } from '@wiz6/data';
import { loadCreationFontSet } from '../roster/creation/ega/assets.js';
import {
  loadMessageDb as defaultLoadMessageDb,
  loadPortraitSet as defaultLoadPortraitSet,
} from '../../data-loader.js';
import { readRoster } from '../../lib/roster-store.js';
import {
  readActiveParty,
  addMember,
  availableRosterFor,
} from '../../lib/active-party-store.js';
import { CreationCanvas } from '../roster/creation/ega/CreationCanvas.js';
import { composeAddPartyPickerFrame } from './compose-add-party-picker-frame.js';
import type { FontSet } from '@wiz6/parser';

export interface AddPartyPageProps {
  /** Skip async asset loading; useful in vitest. */
  skipAssetLoad?: boolean;
}

export function AddPartyPage({ skipAssetLoad = false }: AddPartyPageProps): JSX.Element {
  const navigate = useNavigate();
  const [fontSet, setFontSet] = useState<FontSet | null>(null);
  const [db, setDb] = useState<MessageDb | null>(null);
  const [cursorIdx, setCursorIdx] = useState(0);
  const [onCancel, setOnCancel] = useState(false);

  const candidates = useMemo(() => {
    return availableRosterFor(readRoster().characters, readActiveParty());
  }, []);

  // Empty-list guard — return immediately.
  useEffect(() => {
    if (candidates.length === 0) navigate('/castle');
  }, [candidates.length, navigate]);

  useEffect(() => {
    if (skipAssetLoad) return;
    let cancelled = false;
    (async () => {
      const [fs, m] = await Promise.all([
        loadCreationFontSet(),
        defaultLoadMessageDb('/msg.json'),
      ]);
      if (!cancelled) {
        setFontSet(fs);
        setDb(m);
      }
    })();
    return () => { cancelled = true; };
  }, [skipAssetLoad]);

  const handleCommit = useCallback(() => {
    if (onCancel || candidates.length === 0) {
      navigate('/castle');
      return;
    }
    const picked = candidates[cursorIdx];
    if (picked) addMember(picked);
    navigate('/castle');
  }, [onCancel, candidates, cursorIdx, navigate]);

  const handleCancel = useCallback(() => navigate('/castle'), [navigate]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      switch (e.key) {
        case 'Escape':
          handleCancel();
          break;
        case 'Enter':
          handleCommit();
          break;
        case 'ArrowUp':
          setOnCancel(true);
          break;
        case 'ArrowDown':
          setOnCancel(false);
          break;
        case 'ArrowLeft':
          if (onCancel) setOnCancel(false);
          else setCursorIdx((c) => Math.max(0, c - 1));
          break;
        case 'ArrowRight':
          if (onCancel) setOnCancel(false);
          else setCursorIdx((c) => Math.min(candidates.length - 1, c + 1));
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, candidates.length, handleCommit, handleCancel]);

  if (skipAssetLoad) return <div data-testid="add-party-stub" />;
  if (!fontSet || !db) return <div>Loading…</div>;

  const windows = composeAddPartyPickerFrame(
    { candidates, cursorIdx, onCancel },
    db,
  );

  return <CreationCanvas windows={windows} fontSet={fontSet} palette={WIZ6_MAIN} />;
}
```

- [ ] **Step 5.4: Run the test, confirm it passes**

```bash
pnpm --filter @wiz6/viewer test AddPartyPage 2>&1 | tail -15
```

Expected: 4 tests passing.

- [ ] **Step 5.5: Commit**

```bash
git add packages/viewer/src/pages/castle/AddPartyPage.tsx packages/viewer/tests/pages/castle/AddPartyPage.test.tsx
git commit -m "feat(viewer): add AddPartyPage component (engine slot 0)"
```

---

## Task 6: Wire route to AddPartyPage; remove the stub entry

**Files:**
- Modify: `packages/viewer/src/router.tsx`
- Modify: `packages/viewer/src/pages/game/CastleStub.tsx`

### Steps

- [ ] **Step 6.1: Update the router**

In `packages/viewer/src/router.tsx`, add the lazy import next to the other castle imports:

```typescript
const AddPartyPage = lazy(() =>
  import('./pages/castle/AddPartyPage.js').then((m) => ({ default: m.AddPartyPage })),
);
```

And change the `/castle/add-party` route:

```typescript
// Before:
<Route path="/castle/:stub" element={<CastleStub />} />
// After (add this route BEFORE the wildcard :stub route so React Router prefers it):
<Route path="/castle/add-party" element={<AddPartyPage />} />
<Route path="/castle/:stub" element={<CastleStub />} />
```

- [ ] **Step 6.2: Remove the add-party entry from CastleStub**

In `packages/viewer/src/pages/game/CastleStub.tsx`, delete the `'add-party'` key from `STUB_INFO`:

```typescript
// Remove this block:
'add-party': {
  title: 'Add Party Member',
  description:
    'Pick from PCFILE.DBS. Requires the character-data subsystem and PCFILE I/O — not yet implemented.',
},
```

- [ ] **Step 6.3: Run the router tests**

```bash
pnpm --filter @wiz6/viewer test router 2>&1 | tail -15
```

Expected: passes (the existing router test should still cover the route shape).

- [ ] **Step 6.4: Commit**

```bash
git add packages/viewer/src/router.tsx packages/viewer/src/pages/game/CastleStub.tsx
git commit -m "feat(viewer): wire /castle/add-party to AddPartyPage"
```

---

## Task 7: CastleScreen integration — read partySize + render portraits

**Why last in this batch:** Independent of the picker, but needed for "the user can see the result." Splits cleanly into two sub-changes.

**Files:**
- Modify: `packages/viewer/src/pages/game/castle-frame.ts`
- Modify: `packages/viewer/src/pages/game/CastleScreen.tsx`
- Test: extend `tools/parity/castle-parity.test.ts` (already exists)

### Steps

- [ ] **Step 7.1: Update CastleScreen to read partySize from the store**

In `packages/viewer/src/pages/game/CastleScreen.tsx`, replace the hard-coded `DEFAULT_CONTEXT`:

```typescript
// Before:
const DEFAULT_CONTEXT: MainMenuContext = {
  partySize: 0,
  pcFileHasUnloadedChars: true,
};
// ...
const visible = useMemo(
  () => visibleMenuOptions(DEFAULT_CONTEXT).filter((opt) => opt.slot !== 8),
  [],
);

// After:
import { readActiveParty } from '../../lib/active-party-store.js';
import { readRoster } from '../../lib/roster-store.js';
// ...
const visible = useMemo(() => {
  const ctx: MainMenuContext = {
    partySize: readActiveParty().members.length,
    pcFileHasUnloadedChars: readRoster().characters.length > 0,
  };
  return visibleMenuOptions(ctx).filter((opt) => opt.slot !== 8);
}, []);
```

- [ ] **Step 7.2: Run existing castle-parity test to confirm no regression**

```bash
pnpm --filter @wiz6/viewer test castle 2>&1 | tail -15
```

Expected: existing tests still pass. CastleScreen now reads state from the store but the visible menu options for an empty roster + empty party should be unchanged.

- [ ] **Step 7.3: Commit the partySize wiring**

```bash
git add packages/viewer/src/pages/game/CastleScreen.tsx
git commit -m "feat(viewer): CastleScreen reads partySize from active-party store"
```

- [ ] **Step 7.4: Extend `composeCastleFrame` to accept partyMembers**

In `packages/viewer/src/pages/game/castle-frame.ts`, add a new optional parameter and use it to blit portraits at the engine's left-side positions.

The engine blits at `(X=2, Y = portraitSlotId × 9 + 0x48)` per the spec. Each portrait is 9 rows tall, 64 px wide (matches the PortraitSet sprite dimensions from `wport1.ega`).

Add to `composeCastleFrame`'s signature:

```typescript
import type { ActivePartyMember, PortraitSet } from '@wiz6/data';

export function composeCastleFrame(
  parity: number,
  dragonscRgba: Uint8ClampedArray | null,
  mon08Pic: Pic | null,
  mon08Decoded: number[] | null,
  wfont3: Font4bpp | null,
  wfont0: Font | null,
  menuOptions: readonly MainMenuOption[],
  selectedIdx: number,
  wfont1: Font4bpp | null = null,
  partyMembers: ReadonlyArray<ActivePartyMember> = [],
  portraitSet: PortraitSet | null = null,
): Uint8ClampedArray {
  // ... existing body ...

  // After the existing rendering, before returning buf:
  if (portraitSet && partyMembers.length > 0) {
    for (const member of partyMembers) {
      blitPortrait(buf, portraitSet, member.portraitIndex ?? 0, /* x */ 2, /* y */ member.portraitSlotId * 9 + 0x48);
    }
  }

  return buf;
}

/** Blit one 64×9 portrait sprite from `portraitSet` into `buf` at (x, y). */
function blitPortrait(
  buf: Uint8ClampedArray,
  portraitSet: PortraitSet,
  portraitIndex: number,
  x: number,
  y: number,
): void {
  const sprite = portraitSet.portraits[portraitIndex];
  if (!sprite) return;
  // Sprite is a 64×9 RGBA buffer in the existing PortraitSet schema; copy into buf.
  // (Use the same blit pattern as the existing PortraitPickerScreen — see
  //  packages/viewer/src/pages/roster/creation/ega/render-frame.ts.)
  const SPRITE_W = 64;
  const SPRITE_H = 9;
  for (let dy = 0; dy < SPRITE_H; dy++) {
    for (let dx = 0; dx < SPRITE_W; dx++) {
      const sx = dx;
      const sy = dy;
      const sIdx = (sy * SPRITE_W + sx) * 4;
      const dIdx = ((y + dy) * ENGINE_W + (x + dx)) * 4;
      if (dIdx + 3 >= buf.length) continue;
      buf[dIdx] = sprite[sIdx]!;
      buf[dIdx + 1] = sprite[sIdx + 1]!;
      buf[dIdx + 2] = sprite[sIdx + 2]!;
      buf[dIdx + 3] = sprite[sIdx + 3]!;
    }
  }
}
```

**Reality-check note:** The exact pixel format of PortraitSet sprites needs to match what's loaded. If `PortraitSet.portraits[i]` is already RGBA-decoded, the loop above works. If it's index-mapped (per-pixel palette indices), the loop needs to map through `WIZ6_MAIN.colors`. Check the existing PortraitPickerScreen for the working pattern and copy it.

- [ ] **Step 7.5: Wire CastleScreen to pass the new args**

In `CastleScreen.tsx`, where `composeCastleFrame` is called:

```typescript
import { loadPortraitSet } from '../../data-loader.js';
// ...
const [portraitSet, setPortraitSet] = useState<PortraitSet | null>(null);
const activeMembers = useMemo(() => readActiveParty().members, []);

useEffect(() => {
  let cancelled = false;
  loadPortraitSet('/portraits/wport1.json').then((ps) => {
    if (!cancelled) setPortraitSet(ps);
  });
  return () => { cancelled = true; };
}, []);

// Update the composeCastleFrame call site to include the new args:
const buf = composeCastleFrame(
  parity, dragonscRgba, mon08Pic, mon08Decoded, wfont3, wfont0,
  visible, selectedIdxRef.current, wfont1,
  activeMembers, portraitSet,
);
```

- [ ] **Step 7.6: Run castle-parity tests — they should still pass for the empty-party case**

```bash
pnpm --filter @wiz6/viewer test castle 2>&1 | tail -20
```

Expected: existing parity tests (which use empty active-party state) still pass byte-exact.

- [ ] **Step 7.7: Commit the portrait integration**

```bash
git add packages/viewer/src/pages/game/castle-frame.ts packages/viewer/src/pages/game/CastleScreen.tsx
git commit -m "feat(viewer): CastleScreen blits party portraits on the left side"
```

---

## Task 8: Manual end-to-end verification

**Files:** none. This is the "does it actually work?" gate.

### Steps

- [ ] **Step 8.1: Start the dev server**

```bash
pnpm dev:viewer
```

Expected: server starts at `http://localhost:5173` (or as configured). The predev script re-extracts JSON assets.

- [ ] **Step 8.2: Walk through the feature**

In a browser:

1. Navigate to `http://localhost:5173/castle/character-menu` and create a character (e.g. "ALPHA").
2. Navigate to `http://localhost:5173/castle/character-menu` again and create a second character ("BETA").
3. Navigate to `http://localhost:5173/castle`. Confirm: MASTER OPTIONS menu shows ADD PARTY MEMBER as an option.
4. Select ADD PARTY MEMBER. Confirm: picker overlay appears with both ALPHA and BETA listed.
5. Press Enter on ALPHA. Confirm: returns to MASTER OPTIONS, ALPHA's portrait appears on the left side, slot 4 (RESUME) is no longer in the menu, slot 5 (CHARACTER MENU) is still there.
6. Select ADD PARTY MEMBER again. Confirm: only BETA is listed (ALPHA filtered out).
7. Press ArrowUp to highlight CANCEL, then Enter. Confirm: returns to MASTER OPTIONS, party state unchanged.
8. Reload the browser. Confirm: ALPHA still in party (localStorage persistence).
9. Open devtools console: run `localStorage.removeItem('wiz6:active-party')` then reload. Confirm: party emptied.

- [ ] **Step 8.3: Document any QoL gaps**

If any of the above steps surface a missing feature or rough edge, note it in `TODO.md` as a follow-up. The acceptance criterion for this plan: byte-exact picker + the manual flow above works.

- [ ] **Step 8.4: Add the TODO entry tracking remaining work**

Add an entry to `TODO.md` summarizing the follow-up scope from the spec:

```markdown
- #023 [open] — DISMISS A PARTY MEMBER (wbase character_submenu, slot 2)
  - Needs RE pass on wbase character_submenu (FUN_25cc @ wbase 0x25cc) to identify per-member options.
  - Sibling to #022. Spec lives next to add-party-member-design.md after RE.
- #024 [open] — Right-side party panel rendering (FUN_1b2d)
  - Needs RE on 0x526/0x532 lookup tables (status icons + condition severity), equipment-tile rendering.
  - Currently CastleScreen renders portraits only (left side); right side is empty.
- #025 [open] — msg.dbs ID-to-text decoding for IDs ≥ 718
  - load_msg_into_buf (wroot 0x75b) has an ID→section/offset encoding not yet reversed.
  - Blocks reading exact engine strings for any msg ID > 717. ADD PARTY uses fixture-captured strings, so not blocked.
```

(Bump the `Next free ID` at the top of TODO.md accordingly.)

- [ ] **Step 8.5: Commit**

```bash
git add TODO.md
git commit -m "todo: track DISMISS + right-side panel + msg.dbs decoding follow-ups"
```

---

## Self-review checklist (run before declaring complete)

- All 8 tasks complete with green tests.
- `pnpm -r typecheck` clean.
- `pnpm -r lint` clean.
- Manual walkthrough in Step 8.2 succeeded.
- Cell-grid parity test in Task 4 is byte-exact (no diffs).
- `tools/parity/fixtures/cells/add-party-picker-1char.json` committed and inspectable.
- Spec requirements (data model, picker UI, castle integration) all mapped to a task above.
- No `// TODO` in shipping code without an issue number.

## Notes for the engineer

- **Worktree:** If working in a git worktree per the `using-git-worktrees` skill, all paths above are relative to the worktree root.
- **Existing patterns to follow:** the wpcmk roster picker at `packages/viewer/src/pages/roster/creation/screens/ReviewPickerScreen.tsx` + `ega/review-picker-frame.ts` is the closest precedent for a two-state-cursor picker. If `useRosterPicker` from there generalizes, lift it to `packages/viewer/src/hooks/` and use from both; otherwise duplicate the logic in `AddPartyPage`'s keydown effect (Step 5.3 already does this).
- **Iteration on Task 4:** the parity test in Step 4.7 will likely fail several times before you've nailed the exact cell positions. That's expected — read the test failure output, compare to the fixture's `cells` array, fix the composer's `setCursor` + `puts` calls, repeat.
- **PortraitSet pixel format:** Step 7.4 has a reality-check note; check the existing portrait blit pattern in `roster/creation/screens/PortraitPickerScreen.tsx` for the working approach.
