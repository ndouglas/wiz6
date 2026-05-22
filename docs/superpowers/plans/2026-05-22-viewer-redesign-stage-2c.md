# Viewer Redesign — Stage 2c (Monsters Depth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three more tabs to `MonsterDetail` (`Sprites & IDs`, `Raw bytes`, `Family`) and wire up bidirectional byte-field highlighting between the Overview / Attacks / Saves tabs and the Raw bytes view. Hovering a stat on any tab pulses the bytes that produced it. The Raw bytes view is a 16-column hex grid coloured by field group with hover tooltips. The Family tab lists every monster sharing the current familyId. The Sprites & IDs tab consolidates the sprite/ID fields with "shared with" lookups for each value.

**Architecture:**
- New `monster-byte-map.ts` in the viewer: a flat array mapping each byte offset in `statBytes` (0-157) to a decoded `ScenarioMonster` field. Source of truth for both colouring the hex grid and looking up "which bytes did field X come from."
- New `HexGrid` component: reusable 16-column hex grid taking bytes + byte map + highlighted-field state.
- New `MonsterDetailContext`: tiny React context holding the currently-hovered field name. Set by any tab on `onMouseEnter`/`onMouseLeave`; read by the Raw bytes tab to pulse the matching cells.
- New tab components: `SpritesIdsTab`, `RawBytesTab`, `FamilyTab`.
- Existing tabs (`OverviewTab`, `AttacksTab`, `SavesTab`) get small additions to emit hover events; no other refactor.

**Tech Stack:** React 18, TypeScript, Vite, vitest, @testing-library/react. Reference spec: `docs/superpowers/specs/2026-05-21-viewer-redesign-design.md` (sections "Tab: Sprites & IDs", "Tab: Raw bytes", "Tab: Family"). Prior stage plan: `docs/superpowers/plans/2026-05-21-viewer-redesign-stage-2b.md`.

**Out of scope (deferred):**
- Actual monster sprite rendering — needs `.pic` decoding (stage 1j.6 or its own data-archaeology stage). The Sprites & IDs tab shows a placeholder slot where the rendered sprite will land later.
- Compare mode (2-4 monsters) → Stage 2d
- Family-grouped index view, `Copy raw bytes` / `Copy as JSON` header buttons → Stage 2d
- CLI `wiz6 hex` command that reuses the byte map → separate CLI follow-up

---

## Pre-flight

- [ ] **Set up worktree on the latest `main`**

```bash
cd ~/Projects/ndouglas/wiz6
git worktree add ~/.config/superpowers/worktrees/wiz6/stage-2c -b stage-2c
cd ~/.config/superpowers/worktrees/wiz6/stage-2c
pnpm install --frozen-lockfile
```

- [ ] **Baseline tests**

```bash
pnpm -r test 2>&1 | grep "Tests" | tail -5
```

Expected: 82 data + 96 parser + 41 cli + 199 viewer = 418 tests passing.

---

## Task 1: `monster-byte-map.ts` — the source of truth

Maps every decoded byte offset in `statBytes` (0..157) to a `ScenarioMonster` field. Used for colouring the hex grid AND for the reverse lookup (field → byte offsets) used by bidirectional highlighting.

**Files:**
- Create: `packages/viewer/src/lib/monster-byte-map.ts`
- Test: `packages/viewer/tests/lib/monster-byte-map.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/lib/monster-byte-map.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  MONSTER_BYTE_MAP,
  byteRangeForField,
  fieldAtOffset,
  type MonsterFieldName,
} from '../../src/lib/monster-byte-map.js';

describe('MONSTER_BYTE_MAP', () => {
  it('no offset is double-claimed', () => {
    const seen = new Set<number>();
    for (const entry of MONSTER_BYTE_MAP) {
      for (let i = 0; i < entry.length; i++) {
        const off = entry.offset + i;
        expect(seen.has(off), `byte ${off} claimed twice (last entry: ${entry.fieldName})`).toBe(false);
        seen.add(off);
      }
    }
  });

  it('all offsets are within statBytes range [0, 158)', () => {
    for (const entry of MONSTER_BYTE_MAP) {
      expect(entry.offset).toBeGreaterThanOrEqual(0);
      expect(entry.offset + entry.length).toBeLessThanOrEqual(158);
    }
  });

  it('every entry has length >= 1', () => {
    for (const entry of MONSTER_BYTE_MAP) {
      expect(entry.length).toBeGreaterThanOrEqual(1);
    }
  });

  it.each([
    'xpOnKill',
    'attack1DiceCount',
    'attack2PoisonChance',
    'attack3DamageBonus',
    'groupDiceCount',
    'hpDiceCount',
    'moveStat',
    'monsterLevel',
    'monsterLevelMax',
    'monsterAC',
    'monsterClass',
    'monsterSubClass',
    'monsterSex',
    'monsterBehaviorClass',
    'creatureKind',
    'spriteGroup',
    'specialAttackElement',
    'goldStat',
    'familyId',
    'saveTable',
    'effectChanceTable',
    'attributeSaves',
    'extendedSaves',
    'combatSpriteId',
    'combatSpriteAlt',
    'secondarySpriteId',
    'magicResistChance',
    'combatTraitId',
    'auxSave103',
    'spellPowerChance',
    'auxSave106',
    'flyEvadeChance',
  ] as MonsterFieldName[])('includes field %s in the byte map', (field) => {
    expect(MONSTER_BYTE_MAP.some((e) => e.fieldName === field)).toBe(true);
  });
});

describe('byteRangeForField', () => {
  it('returns the list of offsets for a single-byte field', () => {
    expect(byteRangeForField('monsterAC')).toEqual([126]);
  });

  it('returns all offsets for a multi-byte field', () => {
    expect(byteRangeForField('saveTable')).toEqual([113, 114, 115, 116, 117]);
    expect(byteRangeForField('familyId')).toEqual([70, 71, 72, 73]);
    expect(byteRangeForField('extendedSaves')).toEqual([85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96]);
  });

  it('returns multiple offsets when one field maps to non-contiguous bytes', () => {
    // attack1Extra is bytes 18-19; if a field is split across regions this still works.
    expect(byteRangeForField('attack1Extra')).toEqual([18, 19]);
  });

  it('returns empty array for unknown field', () => {
    expect(byteRangeForField('totallyMadeUpField' as MonsterFieldName)).toEqual([]);
  });
});

describe('fieldAtOffset', () => {
  it('returns the entry containing the given offset', () => {
    const e = fieldAtOffset(113);
    expect(e?.fieldName).toBe('saveTable');
  });

  it('returns the entry for the middle of a multi-byte range', () => {
    const e = fieldAtOffset(115);
    expect(e?.fieldName).toBe('saveTable');
  });

  it('returns null for unmapped offsets', () => {
    // Byte 80 is in the gap between familyId (70..73) and extendedSaves (85..96).
    expect(fieldAtOffset(80)).toBeNull();
  });

  it('returns null for out-of-range offsets', () => {
    expect(fieldAtOffset(-1)).toBeNull();
    expect(fieldAtOffset(158)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/lib/monster-byte-map.test.ts
```

Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement the byte map**

Create `packages/viewer/src/lib/monster-byte-map.ts`:

```typescript
import type { ScenarioMonster } from '@wiz6/data';

export type MonsterFieldName = keyof ScenarioMonster;
export type MonsterByteGroup =
  | 'core'
  | 'attack'
  | 'save'
  | 'sprite'
  | 'family'
  | 'meta';

export interface MonsterByteField {
  /** First byte offset within statBytes (0..157). */
  readonly offset: number;
  /** Number of consecutive bytes consumed (1 for scalars, N for arrays / u16s). */
  readonly length: number;
  /** Matches a property on ScenarioMonster (compile-time-checked via the
   *  MonsterFieldName type). */
  readonly fieldName: MonsterFieldName;
  /** Human-friendly label shown in the hex grid legend + tooltips. */
  readonly label: string;
  /** Coarse grouping used for cell colouring. */
  readonly group: MonsterByteGroup;
}

/**
 * Source of truth mapping each decoded byte of statBytes to its ScenarioMonster
 * field. Derived by hand from packages/parser/src/formats/scenario-db.ts.
 *
 * Gaps in the offset list are intentional — those bytes are still unmapped /
 * unknown (see docs/re/scenario-dbs.md). The HexGrid component handles
 * unmapped bytes by rendering them in the "unknown" colour.
 *
 * Multi-byte entries cover contiguous ranges. Non-contiguous fields (e.g. an
 * attack record's per-byte fields like attackNPoisonChance at bytes 10, 26, 42)
 * appear as separate entries with the same fieldName-prefix but distinct
 * fieldNames (attack1PoisonChance, attack2PoisonChance, attack3PoisonChance).
 */
export const MONSTER_BYTE_MAP: readonly MonsterByteField[] = [
  // --- Core stats ----------------------------------------------------------
  { offset: 0,   length: 2, fieldName: 'xpOnKill',             label: 'XP on kill (u16 LE)',  group: 'core' },
  // --- Attack 1 (bytes 6..20) ---------------------------------------------
  { offset: 6,   length: 1, fieldName: 'attack1DiceCount',     label: 'Atk1 dice count',      group: 'attack' },
  { offset: 7,   length: 1, fieldName: 'attack1DiceSides',     label: 'Atk1 dice sides',      group: 'attack' },
  { offset: 8,   length: 1, fieldName: 'attack1HpDrainChance', label: 'Atk1 HP drain %',      group: 'attack' },
  { offset: 9,   length: 1, fieldName: 'attack1SpecialChance', label: 'Atk1 special %',       group: 'attack' },
  { offset: 10,  length: 1, fieldName: 'attack1PoisonChance',  label: 'Atk1 poison %',        group: 'attack' },
  { offset: 11,  length: 1, fieldName: 'attack1AgeChance',     label: 'Atk1 age %',           group: 'attack' },
  { offset: 13,  length: 1, fieldName: 'attack1DrainChance',   label: 'Atk1 drain %',         group: 'attack' },
  { offset: 14,  length: 1, fieldName: 'attack1DecapitateChance', label: 'Atk1 decapitate %', group: 'attack' },
  { offset: 15,  length: 1, fieldName: 'attack1StunChance',    label: 'Atk1 stun %',          group: 'attack' },
  { offset: 16,  length: 1, fieldName: 'attack1PoisonStrength', label: 'Atk1 poison strength', group: 'attack' },
  { offset: 17,  length: 1, fieldName: 'attack1Style',         label: 'Atk1 style',           group: 'attack' },
  { offset: 18,  length: 2, fieldName: 'attack1Extra',         label: 'Atk1 extra bytes',     group: 'attack' },
  { offset: 20,  length: 1, fieldName: 'attack1DamageBonus',   label: 'Atk1 damage bonus',    group: 'attack' },
  // --- Attack 2 (bytes 22..36) --------------------------------------------
  { offset: 22,  length: 1, fieldName: 'attack2DiceCount',     label: 'Atk2 dice count',      group: 'attack' },
  { offset: 23,  length: 1, fieldName: 'attack2DiceSides',     label: 'Atk2 dice sides',      group: 'attack' },
  { offset: 24,  length: 1, fieldName: 'attack2HpDrainChance', label: 'Atk2 HP drain %',      group: 'attack' },
  { offset: 25,  length: 1, fieldName: 'attack2SpecialChance', label: 'Atk2 special %',       group: 'attack' },
  { offset: 26,  length: 1, fieldName: 'attack2PoisonChance',  label: 'Atk2 poison %',        group: 'attack' },
  { offset: 27,  length: 1, fieldName: 'attack2AgeChance',     label: 'Atk2 age %',           group: 'attack' },
  { offset: 29,  length: 1, fieldName: 'attack2DrainChance',   label: 'Atk2 drain %',         group: 'attack' },
  { offset: 30,  length: 1, fieldName: 'attack2DecapitateChance', label: 'Atk2 decapitate %', group: 'attack' },
  { offset: 31,  length: 1, fieldName: 'attack2StunChance',    label: 'Atk2 stun %',          group: 'attack' },
  { offset: 32,  length: 1, fieldName: 'attack2PoisonStrength', label: 'Atk2 poison strength', group: 'attack' },
  { offset: 33,  length: 1, fieldName: 'attack2Style',         label: 'Atk2 style',           group: 'attack' },
  { offset: 34,  length: 2, fieldName: 'attack2Extra',         label: 'Atk2 extra bytes',     group: 'attack' },
  { offset: 36,  length: 1, fieldName: 'attack2DamageBonus',   label: 'Atk2 damage bonus',    group: 'attack' },
  // --- Attack 3 (bytes 38..52) --------------------------------------------
  { offset: 38,  length: 1, fieldName: 'attack3DiceCount',     label: 'Atk3 dice count',      group: 'attack' },
  { offset: 39,  length: 1, fieldName: 'attack3DiceSides',     label: 'Atk3 dice sides',      group: 'attack' },
  { offset: 40,  length: 1, fieldName: 'attack3HpDrainChance', label: 'Atk3 HP drain %',      group: 'attack' },
  { offset: 41,  length: 1, fieldName: 'attack3SpecialChance', label: 'Atk3 special %',       group: 'attack' },
  { offset: 42,  length: 1, fieldName: 'attack3PoisonChance',  label: 'Atk3 poison %',        group: 'attack' },
  { offset: 43,  length: 1, fieldName: 'attack3AgeChance',     label: 'Atk3 age %',           group: 'attack' },
  { offset: 45,  length: 1, fieldName: 'attack3DrainChance',   label: 'Atk3 drain %',         group: 'attack' },
  { offset: 46,  length: 1, fieldName: 'attack3DecapitateChance', label: 'Atk3 decapitate %', group: 'attack' },
  { offset: 47,  length: 1, fieldName: 'attack3StunChance',    label: 'Atk3 stun %',          group: 'attack' },
  { offset: 48,  length: 1, fieldName: 'attack3PoisonStrength', label: 'Atk3 poison strength', group: 'attack' },
  { offset: 49,  length: 1, fieldName: 'attack3Style',         label: 'Atk3 style',           group: 'attack' },
  { offset: 50,  length: 2, fieldName: 'attack3Extra',         label: 'Atk3 extra bytes',     group: 'attack' },
  { offset: 52,  length: 1, fieldName: 'attack3DamageBonus',   label: 'Atk3 damage bonus',    group: 'attack' },
  // --- Encounter / HP / level / family ------------------------------------
  { offset: 54,  length: 1, fieldName: 'groupDiceCount',       label: 'Group dice count',     group: 'core' },
  { offset: 55,  length: 1, fieldName: 'groupDiceSides',       label: 'Group dice sides',     group: 'core' },
  { offset: 56,  length: 1, fieldName: 'goldStat',             label: 'Gold drop',            group: 'core' },
  { offset: 58,  length: 1, fieldName: 'hpDiceCount',          label: 'HP dice count',        group: 'core' },
  { offset: 59,  length: 1, fieldName: 'hpDiceSides',          label: 'HP dice sides',        group: 'core' },
  { offset: 60,  length: 1, fieldName: 'moveStat',             label: 'Move stat',            group: 'core' },
  { offset: 62,  length: 1, fieldName: 'monsterLevel',         label: 'Level',                group: 'core' },
  { offset: 63,  length: 1, fieldName: 'monsterLevelMax',      label: 'Level max',            group: 'core' },
  { offset: 64,  length: 1, fieldName: 'creatureKind',         label: 'Creature kind',        group: 'meta' },
  { offset: 70,  length: 4, fieldName: 'familyId',             label: 'Family ID (4 bytes)',  group: 'family' },
  // --- Extended saves -----------------------------------------------------
  { offset: 85,  length: 12, fieldName: 'extendedSaves',       label: 'Extended saves (12)',  group: 'save' },
  // --- Sprite / trait IDs (100-cluster) -----------------------------------
  { offset: 98,  length: 1, fieldName: 'combatSpriteId',       label: 'Combat sprite ID',     group: 'sprite' },
  { offset: 99,  length: 1, fieldName: 'combatSpriteAlt',      label: 'Combat sprite alt',    group: 'sprite' },
  { offset: 100, length: 1, fieldName: 'secondarySpriteId',    label: 'Secondary sprite',     group: 'sprite' },
  { offset: 102, length: 1, fieldName: 'magicResistChance',    label: 'Magic resist %',       group: 'save' },
  { offset: 103, length: 1, fieldName: 'auxSave103',           label: 'Aux save (byte 103)',  group: 'save' },
  { offset: 104, length: 1, fieldName: 'spellPowerChance',     label: 'Spell power %',        group: 'save' },
  { offset: 106, length: 1, fieldName: 'auxSave106',           label: 'Aux save (byte 106)',  group: 'save' },
  { offset: 111, length: 1, fieldName: 'flyEvadeChance',       label: 'Fly evade %',          group: 'save' },
  { offset: 112, length: 1, fieldName: 'combatTraitId',        label: 'Combat trait ID',      group: 'sprite' },
  // --- Save / effect-chance tables ----------------------------------------
  { offset: 113, length: 5, fieldName: 'saveTable',            label: 'Save table (5)',       group: 'save' },
  { offset: 121, length: 5, fieldName: 'effectChanceTable',    label: 'Effect chance (5)',    group: 'save' },
  { offset: 126, length: 1, fieldName: 'monsterAC',            label: 'Monster AC (signed)',  group: 'core' },
  // --- Attribute saves + class / sex / element / behavior / sprite group --
  { offset: 144, length: 4, fieldName: 'attributeSaves',       label: 'Attribute saves (4)',  group: 'save' },
  { offset: 148, length: 1, fieldName: 'monsterClass',         label: 'Class tier',           group: 'meta' },
  { offset: 149, length: 1, fieldName: 'monsterSubClass',      label: 'Sub-class',            group: 'meta' },
  { offset: 150, length: 1, fieldName: 'monsterSex',           label: 'Sex',                  group: 'meta' },
  { offset: 152, length: 1, fieldName: 'specialAttackElement', label: 'Special atk element',  group: 'meta' },
  { offset: 156, length: 1, fieldName: 'monsterBehaviorClass', label: 'Behavior class',       group: 'meta' },
  { offset: 157, length: 1, fieldName: 'spriteGroup',          label: 'Sprite group',         group: 'sprite' },
] as const;

/**
 * Reverse lookup: given a field name, return every byte offset that field
 * occupies. Used to compute "which bytes should pulse when I hover this field
 * on the Overview tab."
 */
export function byteRangeForField(fieldName: MonsterFieldName): number[] {
  const offsets: number[] = [];
  for (const entry of MONSTER_BYTE_MAP) {
    if (entry.fieldName === fieldName) {
      for (let i = 0; i < entry.length; i++) offsets.push(entry.offset + i);
    }
  }
  return offsets;
}

/**
 * Forward lookup: given a byte offset (0..157), return the byte-map entry that
 * claims it, or null if the byte is unmapped.
 */
export function fieldAtOffset(offset: number): MonsterByteField | null {
  if (offset < 0 || offset >= 158) return null;
  for (const entry of MONSTER_BYTE_MAP) {
    if (offset >= entry.offset && offset < entry.offset + entry.length) return entry;
  }
  return null;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @wiz6/viewer test tests/lib/monster-byte-map.test.ts
```

Expected: all tests pass (~32 by my count — 4 structural + 28 field-presence).

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/lib/monster-byte-map.ts packages/viewer/tests/lib/monster-byte-map.test.ts
git commit -m "feat(viewer): monster-byte-map — source of truth for statBytes layout"
```

---

## Task 2: `HexGrid` component

Reusable 16-column hex grid. Renders bytes with per-cell colouring (by group), tooltips, and a hover callback. The currently-highlighted field (if any) gets a pulse animation across the matching cells.

**Files:**
- Create: `packages/viewer/src/components/HexGrid.tsx`
- Create: `packages/viewer/src/components/HexGrid.module.css`
- Test: `packages/viewer/tests/components/HexGrid.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/components/HexGrid.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HexGrid } from '../../src/components/HexGrid.js';
import { MONSTER_BYTE_MAP } from '../../src/lib/monster-byte-map.js';

const ZEROS = Array(158).fill(0);

describe('HexGrid', () => {
  it('renders one cell per byte', () => {
    render(<HexGrid bytes={ZEROS} byteMap={MONSTER_BYTE_MAP} />);
    expect(screen.getAllByRole('cell').length).toBe(158);
  });

  it('renders hex value in each cell (two lowercase hex digits)', () => {
    const bytes = ZEROS.slice();
    bytes[0] = 0xab;
    bytes[127] = 0x0f;
    render(<HexGrid bytes={bytes} byteMap={MONSTER_BYTE_MAP} />);
    expect(screen.getAllByText('ab').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('0f').length).toBeGreaterThanOrEqual(1);
  });

  it('annotates each cell with its byte offset via title attribute', () => {
    render(<HexGrid bytes={ZEROS} byteMap={MONSTER_BYTE_MAP} />);
    const firstCell = screen.getAllByRole('cell')[0]!;
    expect(firstCell.getAttribute('title')).toMatch(/byte 0/i);
    const acCell = screen.getAllByRole('cell')[126]!;
    expect(acCell.getAttribute('title')).toMatch(/byte 126.*monster ?ac|monsterAC/i);
  });

  it('marks cells in the highlighted field range', () => {
    render(<HexGrid bytes={ZEROS} byteMap={MONSTER_BYTE_MAP} highlightedField="saveTable" />);
    // saveTable lives at bytes 113-117 (5 cells)
    const cells = screen.getAllByRole('cell');
    const highlighted = cells.filter((c) => c.className.match(/highlight/i));
    expect(highlighted.length).toBe(5);
  });

  it('fires onHover with the byte offset on mouse enter', () => {
    const onHover = vi.fn();
    render(<HexGrid bytes={ZEROS} byteMap={MONSTER_BYTE_MAP} onHover={onHover} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.mouseEnter(cells[42]!);
    expect(onHover).toHaveBeenCalledWith(42);
  });

  it('fires onHover with null on mouse leave', () => {
    const onHover = vi.fn();
    render(<HexGrid bytes={ZEROS} byteMap={MONSTER_BYTE_MAP} onHover={onHover} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.mouseLeave(cells[42]!);
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it('renders a legend listing each group present in the byte map', () => {
    render(<HexGrid bytes={ZEROS} byteMap={MONSTER_BYTE_MAP} showLegend />);
    expect(screen.getByText(/legend/i)).toBeInTheDocument();
    for (const label of ['core', 'attack', 'save', 'sprite', 'family', 'meta']) {
      expect(screen.getByText(new RegExp(`\\b${label}\\b`, 'i'))).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/components/HexGrid.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create the CSS**

Create `packages/viewer/src/components/HexGrid.module.css`:

```css
.grid {
  display: grid;
  grid-template-columns: 40px repeat(16, 1fr);
  gap: 2px;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  margin-bottom: var(--space-3);
}

.headerCorner {
  /* top-left corner cell */
}

.colHeader,
.rowHeader {
  color: var(--color-text-faint);
  text-align: center;
  padding: 2px 0;
  font-size: 0.75rem;
}

.rowHeader {
  text-align: right;
  padding-right: var(--space-2);
}

.cell {
  text-align: center;
  padding: var(--space-1) 0;
  border-radius: 2px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  cursor: default;
  user-select: none;
  position: relative;
  transition: background-color 100ms ease;
}

.cell:hover {
  outline: 1px solid var(--color-accent);
  outline-offset: -1px;
  color: var(--color-text);
}

.groupCore { background: rgba(109, 139, 216, 0.18); color: var(--color-text); }
.groupAttack { background: rgba(216, 112, 56, 0.18); color: var(--color-text); }
.groupSave { background: rgba(109, 184, 112, 0.18); color: var(--color-text); }
.groupSprite { background: rgba(154, 109, 200, 0.18); color: var(--color-text); }
.groupFamily { background: rgba(216, 168, 80, 0.18); color: var(--color-text); }
.groupMeta { background: rgba(109, 184, 216, 0.18); color: var(--color-text); }

.highlight {
  outline: 2px solid var(--color-accent);
  outline-offset: -1px;
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--color-accent); }
  50% { box-shadow: 0 0 6px 1px var(--color-accent); }
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-3);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.legendItem {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.legendSwatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
}
```

- [ ] **Step 4: Implement the component**

Create `packages/viewer/src/components/HexGrid.tsx`:

```typescript
import type { MonsterByteField, MonsterByteGroup, MonsterFieldName } from '../lib/monster-byte-map.js';
import { fieldAtOffset } from '../lib/monster-byte-map.js';
import styles from './HexGrid.module.css';

const GROUP_CLASS: Record<MonsterByteGroup, string> = {
  core: styles.groupCore!,
  attack: styles.groupAttack!,
  save: styles.groupSave!,
  sprite: styles.groupSprite!,
  family: styles.groupFamily!,
  meta: styles.groupMeta!,
};

const GROUP_ORDER: MonsterByteGroup[] = ['core', 'attack', 'save', 'sprite', 'family', 'meta'];

interface HexGridProps {
  bytes: readonly number[];
  byteMap: readonly MonsterByteField[];
  highlightedField?: MonsterFieldName | null;
  onHover?: (offset: number | null) => void;
  showLegend?: boolean;
}

function toHex(b: number): string {
  return b.toString(16).padStart(2, '0');
}

export function HexGrid({
  bytes,
  byteMap,
  highlightedField,
  onHover,
  showLegend = false,
}: HexGridProps) {
  const total = bytes.length;
  const rows = Math.ceil(total / 16);

  // Compute which offsets belong to the highlighted field (if any).
  const highlightOffsets = new Set<number>();
  if (highlightedField) {
    for (const entry of byteMap) {
      if (entry.fieldName === highlightedField) {
        for (let i = 0; i < entry.length; i++) highlightOffsets.add(entry.offset + i);
      }
    }
  }

  const cells: React.ReactNode[] = [];

  // Top-left corner + 16 column headers
  cells.push(
    <div key="corner" className={styles.headerCorner} />,
    ...Array.from({ length: 16 }, (_, c) => (
      <div key={`col-${c}`} className={styles.colHeader}>
        {c.toString(16)}
      </div>
    )),
  );

  for (let row = 0; row < rows; row++) {
    cells.push(
      <div key={`row-${row}`} className={styles.rowHeader}>
        {(row * 16).toString(16).padStart(3, '0')}
      </div>,
    );
    for (let col = 0; col < 16; col++) {
      const offset = row * 16 + col;
      if (offset >= total) {
        cells.push(<div key={`empty-${offset}`} />);
        continue;
      }
      const entry = fieldAtOffset(offset);
      const groupClass = entry ? GROUP_CLASS[entry.group] : '';
      const isHighlighted = highlightOffsets.has(offset);
      const className = `${styles.cell} ${groupClass} ${isHighlighted ? styles.highlight : ''}`.trim();
      const title = entry
        ? `byte ${offset}: ${entry.label} (${entry.fieldName})`
        : `byte ${offset}: unmapped`;
      cells.push(
        <div
          key={offset}
          role="cell"
          className={className}
          title={title}
          onMouseEnter={() => onHover?.(offset)}
          onMouseLeave={() => onHover?.(null)}
        >
          {toHex(bytes[offset]!)}
        </div>,
      );
    }
  }

  return (
    <div>
      <div className={styles.grid}>{cells}</div>
      {showLegend ? (
        <div className={styles.legend}>
          <span>legend:</span>
          {GROUP_ORDER.map((g) => (
            <span key={g} className={styles.legendItem}>
              <span
                className={`${styles.legendSwatch} ${GROUP_CLASS[g] ?? ''}`.trim()}
              />
              {g}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @wiz6/viewer test tests/components/HexGrid.test.tsx
```

Expected: 7/7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/components/HexGrid.tsx packages/viewer/src/components/HexGrid.module.css packages/viewer/tests/components/HexGrid.test.tsx
git commit -m "feat(viewer): HexGrid component with per-group colouring + highlight pulse"
```

---

## Task 3: `MonsterDetailContext`

Tiny React context carrying the currently-hovered field name. Set by any tab on hover, read by `RawBytesTab` to pulse the matching cells.

**Files:**
- Create: `packages/viewer/src/pages/monsters/MonsterDetailContext.tsx`
- Test: `packages/viewer/tests/pages/monsters/MonsterDetailContext.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/monsters/MonsterDetailContext.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  MonsterDetailProvider,
  useMonsterDetail,
} from '../../../src/pages/monsters/MonsterDetailContext.js';

function Probe() {
  const { highlightedField, setHighlightedField } = useMonsterDetail();
  return (
    <>
      <p data-testid="value">{highlightedField ?? 'null'}</p>
      <button onClick={() => setHighlightedField('saveTable')}>set</button>
      <button onClick={() => setHighlightedField(null)}>clear</button>
    </>
  );
}

describe('MonsterDetailContext', () => {
  it('starts with no highlighted field', () => {
    render(
      <MonsterDetailProvider>
        <Probe />
      </MonsterDetailProvider>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('null');
  });

  it('updates when setHighlightedField is called', () => {
    render(
      <MonsterDetailProvider>
        <Probe />
      </MonsterDetailProvider>,
    );
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('value')).toHaveTextContent('saveTable');
    fireEvent.click(screen.getByText('clear'));
    expect(screen.getByTestId('value')).toHaveTextContent('null');
  });

  it('throws when used outside the provider', () => {
    expect(() => render(<Probe />)).toThrow(/MonsterDetailProvider/);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/MonsterDetailContext.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement the context**

Create `packages/viewer/src/pages/monsters/MonsterDetailContext.tsx`:

```typescript
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { MonsterFieldName } from '../../lib/monster-byte-map.js';

interface MonsterDetailState {
  highlightedField: MonsterFieldName | null;
  setHighlightedField: (next: MonsterFieldName | null) => void;
}

const MonsterDetailCtx = createContext<MonsterDetailState | undefined>(undefined);

export function MonsterDetailProvider({ children }: { children: ReactNode }) {
  const [highlightedField, setHighlightedField] = useState<MonsterFieldName | null>(null);
  return (
    <MonsterDetailCtx.Provider value={{ highlightedField, setHighlightedField }}>
      {children}
    </MonsterDetailCtx.Provider>
  );
}

export function useMonsterDetail(): MonsterDetailState {
  const ctx = useContext(MonsterDetailCtx);
  if (!ctx) throw new Error('useMonsterDetail must be used inside MonsterDetailProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/MonsterDetailContext.test.tsx
```

Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/monsters/MonsterDetailContext.tsx packages/viewer/tests/pages/monsters/MonsterDetailContext.test.tsx
git commit -m "feat(viewer): MonsterDetailContext for cross-tab field highlighting"
```

---

## Task 4: `RawBytesTab` + tab-bar integration

Renders the 158-byte statBytes via `HexGrid`, listens to `MonsterDetailContext` for the highlighted field, and emits `onHover` on every cell so the user can hover bytes themselves and learn what field they belong to (the reverse direction).

**Files:**
- Create: `packages/viewer/src/pages/monsters/tabs/RawBytesTab.tsx`
- Modify: `packages/viewer/src/pages/monsters/MonsterDetail.tsx` — wrap with `MonsterDetailProvider`, add `raw` tab
- Test: `packages/viewer/tests/pages/monsters/tabs/RawBytesTab.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/monsters/tabs/RawBytesTab.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RawBytesTab } from '../../../../src/pages/monsters/tabs/RawBytesTab.js';
import { MonsterDetailProvider } from '../../../../src/pages/monsters/MonsterDetailContext.js';
import { FIXTURE_SCENARIO_DB } from '../../../fixtures/scenario-fixture.js';

const RAT = FIXTURE_SCENARIO_DB.monsters[0]!;

function renderTab(monster = RAT) {
  return render(
    <MonsterDetailProvider>
      <RawBytesTab monster={monster} />
    </MonsterDetailProvider>,
  );
}

describe('RawBytesTab', () => {
  it('renders 158 cells (one per stat byte)', () => {
    renderTab();
    expect(screen.getAllByRole('cell').length).toBe(158);
  });

  it('shows the legend', () => {
    renderTab();
    expect(screen.getByText(/legend/i)).toBeInTheDocument();
  });

  it("renders the monster's actual stat bytes", () => {
    // GIANT RAT has xpOnKill 450 → bytes 0,1 = 0xc2, 0x01
    renderTab();
    const cells = screen.getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('c2');
    expect(cells[1]).toHaveTextContent('01');
  });

  it('cells inside saveTable have the save group class', () => {
    renderTab();
    const cells = screen.getAllByRole('cell');
    expect(cells[113]?.className).toMatch(/groupSave/i);
    expect(cells[117]?.className).toMatch(/groupSave/i);
  });

  it('byte 80 is unmapped (no group class)', () => {
    renderTab();
    const cells = screen.getAllByRole('cell');
    expect(cells[80]?.className).not.toMatch(/group(Core|Attack|Save|Sprite|Family|Meta)/);
  });
});
```

- [ ] **Step 2: Run test to confirm fail**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/tabs/RawBytesTab.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `RawBytesTab`**

Create `packages/viewer/src/pages/monsters/tabs/RawBytesTab.tsx`:

```typescript
import type { ScenarioMonster } from '@wiz6/data';
import { HexGrid } from '../../../components/HexGrid.js';
import { MONSTER_BYTE_MAP } from '../../../lib/monster-byte-map.js';
import { useMonsterDetail } from '../MonsterDetailContext.js';

interface RawBytesTabProps {
  monster: ScenarioMonster;
}

export function RawBytesTab({ monster }: RawBytesTabProps) {
  const { highlightedField, setHighlightedField } = useMonsterDetail();
  return (
    <HexGrid
      bytes={monster.statBytes}
      byteMap={MONSTER_BYTE_MAP}
      highlightedField={highlightedField}
      onHover={(offset) => {
        if (offset === null) {
          setHighlightedField(null);
          return;
        }
        // Find which field this byte belongs to and set it.
        for (const entry of MONSTER_BYTE_MAP) {
          if (offset >= entry.offset && offset < entry.offset + entry.length) {
            setHighlightedField(entry.fieldName);
            return;
          }
        }
        setHighlightedField(null);
      }}
      showLegend
    />
  );
}
```

- [ ] **Step 4: Wire into `MonsterDetail`**

Open `packages/viewer/src/pages/monsters/MonsterDetail.tsx`. Two changes:

1. Add `raw` to the `TabId` type and `TABS` list.

```typescript
type TabId = 'overview' | 'attacks' | 'saves' | 'raw';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'attacks', label: 'Attacks' },
  { id: 'saves', label: 'Saves & Resistances' },
  { id: 'raw', label: 'Raw bytes' },
];
```

2. Wrap the tab body with `MonsterDetailProvider`, and dispatch the `raw` tab to `RawBytesTab`.

Replace the existing tabpanel section:

```typescript
      <div role="tabpanel" data-testid={`tab-${currentTab}`}>
        {currentTab === 'overview' ? (
          <OverviewTab monster={monster} />
        ) : currentTab === 'attacks' ? (
          <AttacksTab monster={monster} />
        ) : (
          <SavesTab monster={monster} />
        )}
      </div>
```

with:

```typescript
      <MonsterDetailProvider>
        <div role="tabpanel" data-testid={`tab-${currentTab}`}>
          {currentTab === 'overview' ? (
            <OverviewTab monster={monster} />
          ) : currentTab === 'attacks' ? (
            <AttacksTab monster={monster} />
          ) : currentTab === 'saves' ? (
            <SavesTab monster={monster} />
          ) : (
            <RawBytesTab monster={monster} />
          )}
        </div>
      </MonsterDetailProvider>
```

Add the imports near the top:

```typescript
import { RawBytesTab } from './tabs/RawBytesTab.js';
import { MonsterDetailProvider } from './MonsterDetailContext.js';
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/
```

Expected: all green. The existing MonsterDetail test expects `TABS` to include Raw bytes — verify it still passes (the test asserts only the first three tab names are present; adding a fourth shouldn't break it).

If the existing MonsterDetail test's `it.each` references only Overview/Attacks/Saves, that's fine — it doesn't say "no other tabs." If anything fails, capture and report.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/pages/monsters/tabs/RawBytesTab.tsx packages/viewer/src/pages/monsters/MonsterDetail.tsx packages/viewer/tests/pages/monsters/tabs/RawBytesTab.test.tsx
git commit -m "feat(viewer): RawBytesTab — 158-byte hex grid with field colouring"
```

---

## Task 5: `FamilyTab`

Lists every monster sharing the current monster's `familyId[4]`. Clicking a family-sharer navigates to that monster.

**Files:**
- Create: `packages/viewer/src/pages/monsters/tabs/FamilyTab.tsx`
- Modify: `packages/viewer/src/pages/monsters/MonsterDetail.tsx` — add `family` tab
- Test: `packages/viewer/tests/pages/monsters/tabs/FamilyTab.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/monsters/tabs/FamilyTab.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { FamilyTab } from '../../../../src/pages/monsters/tabs/FamilyTab.js';
import { FIXTURE_SCENARIO_DB } from '../../../fixtures/scenario-fixture.js';

const FIXTURE = FIXTURE_SCENARIO_DB;
const WRAITH = FIXTURE.monsters[3]!; // familyId [10,12,12,12]
const ZOMBIE = FIXTURE.monsters[1]!; // familyId [12,12,16,12]

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.pathname}</p>;
}

function renderFamily(monster = WRAITH) {
  return render(
    <MemoryRouter initialEntries={['/monsters/wraith']}>
      <FamilyTab monster={monster} allMonsters={FIXTURE.monsters} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('FamilyTab', () => {
  it('shows the current monster as the family anchor', () => {
    renderFamily(WRAITH);
    expect(screen.getByText(/wraith/i)).toBeInTheDocument();
  });

  it('shows the family ID', () => {
    renderFamily(WRAITH);
    expect(screen.getByText(/10,12,12,12/)).toBeInTheDocument();
  });

  it('lists no other family members when the family is unique', () => {
    // WRAITH is the only [10,12,12,12] in the fixture (intentionally)
    renderFamily(WRAITH);
    expect(screen.getByText(/no other monsters in this family/i)).toBeInTheDocument();
  });

  it('lists family sharers when present', () => {
    // Augment the fixture with a fake family-sharer of WRAITH
    const monsters = [...FIXTURE.monsters];
    monsters[5] = {
      ...monsters[5]!,
      nameIdSingular: 'PHANTASM',
      empty: false,
      familyId: [10, 12, 12, 12],
    };
    render(
      <MemoryRouter initialEntries={['/monsters/wraith']}>
        <FamilyTab monster={WRAITH} allMonsters={monsters} />
      </MemoryRouter>,
    );
    expect(screen.getByText('PHANTASM')).toBeInTheDocument();
  });

  it('clicking a family-sharer navigates to their slug', () => {
    const monsters = [...FIXTURE.monsters];
    monsters[5] = {
      ...monsters[5]!,
      nameIdSingular: 'PHANTASM',
      empty: false,
      familyId: [10, 12, 12, 12],
    };
    render(
      <MemoryRouter initialEntries={['/monsters/wraith']}>
        <FamilyTab monster={WRAITH} allMonsters={monsters} />
        <LocationProbe />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('PHANTASM'));
    expect(screen.getByTestId('location')).toHaveTextContent('/monsters/phantasm');
  });

  it('excludes the current monster from the family list', () => {
    const monsters = [...FIXTURE.monsters];
    monsters[5] = {
      ...monsters[5]!,
      nameIdSingular: 'PHANTASM',
      empty: false,
      familyId: [10, 12, 12, 12],
    };
    render(
      <MemoryRouter initialEntries={['/monsters/wraith']}>
        <FamilyTab monster={WRAITH} allMonsters={monsters} />
      </MemoryRouter>,
    );
    // WRAITH should NOT appear in the family-members list (it's the anchor).
    // The anchor heading text already mentions WRAITH; check the list area
    // explicitly by counting occurrences in the family-list region.
    const familyList = screen.getByRole('list', { name: /family members/i });
    expect(familyList.textContent).not.toMatch(/WRAITH/);
    expect(familyList.textContent).toMatch(/PHANTASM/);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/tabs/FamilyTab.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `FamilyTab`**

Create `packages/viewer/src/pages/monsters/tabs/FamilyTab.tsx`:

```typescript
import { useNavigate } from 'react-router-dom';
import type { ScenarioMonster } from '@wiz6/data';
import { familyKey, monsterSlug } from '@wiz6/parser';

interface FamilyTabProps {
  monster: ScenarioMonster;
  allMonsters: readonly ScenarioMonster[];
}

export function FamilyTab({ monster, allMonsters }: FamilyTabProps) {
  const navigate = useNavigate();
  const key = familyKey(monster.familyId);
  const family = allMonsters.filter(
    (m) =>
      !m.empty &&
      m.index !== monster.index &&
      familyKey(m.familyId) === key,
  );

  return (
    <div>
      <p style={{ color: 'var(--color-text-muted)' }}>
        Family ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{key}</span>
      </p>
      <h3 style={{ marginTop: 'var(--space-4)' }}>{monster.nameIdSingular}</h3>
      {family.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>
          no other monsters in this family
        </p>
      ) : (
        <ul
          aria-label="family members"
          style={{ listStyle: 'none', padding: 0, margin: 0 }}
        >
          {family.map((m) => (
            <li key={m.index} style={{ marginBottom: 'var(--space-1)' }}>
              <button
                type="button"
                onClick={() => navigate(`/monsters/${monsterSlug(m)}`)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                  padding: 'var(--space-1) var(--space-3)',
                  borderRadius: 2,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '0.92rem',
                }}
              >
                {m.nameIdSingular || `(empty slot ${m.index})`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire `family` tab into `MonsterDetail`**

Add `family` to the `TabId` type and `TABS` list:

```typescript
type TabId = 'overview' | 'attacks' | 'saves' | 'raw' | 'family';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'attacks', label: 'Attacks' },
  { id: 'saves', label: 'Saves & Resistances' },
  { id: 'raw', label: 'Raw bytes' },
  { id: 'family', label: 'Family' },
];
```

To render the FamilyTab, `MonsterDetail` needs `allMonsters` — which means `MonsterDetail` needs that prop. Currently it only receives `monster`. Add a new prop:

```typescript
interface MonsterDetailProps {
  monster: ScenarioMonster;
  allMonsters: readonly ScenarioMonster[];
}

export function MonsterDetail({ monster, allMonsters }: MonsterDetailProps) {
  // ...
}
```

Update the tab-panel dispatch to handle `family`:

```typescript
          ) : currentTab === 'family' ? (
            <FamilyTab monster={monster} allMonsters={allMonsters} />
          ) : (
            <RawBytesTab monster={monster} />
          )}
```

(Reorder so `family` is checked before the `raw` fallback. The cleanest restructuring is a switch statement; pick whichever you prefer.)

Add the import:

```typescript
import { FamilyTab } from './tabs/FamilyTab.js';
```

Update `MonstersPage.tsx` (the caller) to pass `allMonsters`:

```typescript
<MonsterDetail monster={selected} allMonsters={data.monsters} />
```

- [ ] **Step 5: Update MonsterDetail's existing test to provide `allMonsters`**

The existing `tests/pages/monsters/MonsterDetail.test.tsx` calls `<MonsterDetail monster={WRAITH} />`. Add an `allMonsters` prop:

```typescript
<MonsterDetail monster={WRAITH} allMonsters={FIXTURE_SCENARIO_DB.monsters} />
```

In each test that renders MonsterDetail. The fixture's monsters array is already in scope (or import it if not).

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/viewer/src/pages/monsters/tabs/FamilyTab.tsx packages/viewer/src/pages/monsters/MonsterDetail.tsx packages/viewer/src/pages/monsters/MonstersPage.tsx packages/viewer/tests/pages/monsters/MonsterDetail.test.tsx packages/viewer/tests/pages/monsters/tabs/FamilyTab.test.tsx
git commit -m "feat(viewer): FamilyTab — list family-sharers with click-to-navigate"
```

---

## Task 6: `SpritesIdsTab` + "shared with" helper

Consolidates the sprite / ID fields (`combatSpriteId`, `combatSpriteAlt`, `secondarySpriteId`, `combatTraitId`, `magicResistChance`, `spellPowerChance`, `auxSave103`, `auxSave106`, `flyEvadeChance`) into one tab. Each row shows the field value plus a "shared with" list of other monsters with the same value.

The "shared with" lookup needs a small helper.

**Files:**
- Create: `packages/viewer/src/pages/monsters/tabs/SpritesIdsTab.tsx`
- Modify: `packages/viewer/src/pages/monsters/MonsterDetail.tsx` — add `sprites` tab
- Test: `packages/viewer/tests/pages/monsters/tabs/SpritesIdsTab.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/monsters/tabs/SpritesIdsTab.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SpritesIdsTab } from '../../../../src/pages/monsters/tabs/SpritesIdsTab.js';
import { FIXTURE_SCENARIO_DB } from '../../../fixtures/scenario-fixture.js';

const PIT_FIEND = FIXTURE_SCENARIO_DB.monsters[2]!;
const WRAITH = FIXTURE_SCENARIO_DB.monsters[3]!;

function renderTab(monster = PIT_FIEND) {
  return render(
    <MemoryRouter>
      <SpritesIdsTab monster={monster} allMonsters={FIXTURE_SCENARIO_DB.monsters} />
    </MemoryRouter>,
  );
}

describe('SpritesIdsTab', () => {
  it('renders each sprite / ID field', () => {
    renderTab(PIT_FIEND);
    for (const label of [
      /combat sprite/i,
      /secondary sprite/i,
      /magic resist/i,
      /spell power/i,
      /aux save .* 103/i,
      /aux save .* 106/i,
      /fly evade/i,
      /combat trait/i,
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows the field's decoded value", () => {
    renderTab(PIT_FIEND);
    // PIT FIEND magicResistChance = 80
    expect(screen.getByText(/^80(%| )?/)).toBeInTheDocument();
  });

  it('renders a sprite placeholder slot', () => {
    renderTab(PIT_FIEND);
    expect(screen.getByTestId('sprite-placeholder')).toBeInTheDocument();
  });

  it('shows zero "shared with" when the value is unique', () => {
    // PIT FIEND in the fixture has magicResistChance 80 — likely unique
    renderTab(PIT_FIEND);
    // Should not crash; should mention "no others" somewhere or omit the list
    // We just verify the tab renders without error and the field is present.
    expect(screen.getByText(/magic resist/i)).toBeInTheDocument();
  });

  it('shows shared-with names when other monsters have the same value', () => {
    // Both WRAITH and PIT FIEND have non-zero magicResistChance in the fixture.
    // Inject a fake monster with the same magicResistChance as PIT FIEND (80).
    const monsters = [...FIXTURE_SCENARIO_DB.monsters];
    monsters[6] = {
      ...monsters[6]!,
      nameIdSingular: 'GREATER DEMON',
      empty: false,
      magicResistChance: 80,
    };
    render(
      <MemoryRouter>
        <SpritesIdsTab monster={PIT_FIEND} allMonsters={monsters} />
      </MemoryRouter>,
    );
    // The PIT FIEND row for magicResistChance: 80% should now mention GREATER DEMON in its shared-with line.
    expect(screen.getByText(/GREATER DEMON/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/tabs/SpritesIdsTab.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `SpritesIdsTab`**

Create `packages/viewer/src/pages/monsters/tabs/SpritesIdsTab.tsx`:

```typescript
import { Link } from 'react-router-dom';
import type { ScenarioMonster } from '@wiz6/data';
import { monsterSlug } from '@wiz6/parser';

interface SpritesIdsTabProps {
  monster: ScenarioMonster;
  allMonsters: readonly ScenarioMonster[];
}

type SpriteField = keyof Pick<
  ScenarioMonster,
  | 'combatSpriteId'
  | 'combatSpriteAlt'
  | 'secondarySpriteId'
  | 'combatTraitId'
  | 'magicResistChance'
  | 'spellPowerChance'
  | 'auxSave103'
  | 'auxSave106'
  | 'flyEvadeChance'
>;

const FIELDS: { name: SpriteField; label: string; isPercent?: boolean }[] = [
  { name: 'combatSpriteId', label: 'Combat sprite' },
  { name: 'combatSpriteAlt', label: 'Combat sprite (alt)' },
  { name: 'secondarySpriteId', label: 'Secondary sprite' },
  { name: 'combatTraitId', label: 'Combat trait' },
  { name: 'magicResistChance', label: 'Magic resist', isPercent: true },
  { name: 'spellPowerChance', label: 'Spell power', isPercent: true },
  { name: 'auxSave103', label: 'Aux save (byte 103)', isPercent: true },
  { name: 'auxSave106', label: 'Aux save (byte 106)', isPercent: true },
  { name: 'flyEvadeChance', label: 'Fly evade', isPercent: true },
];

function sharedWith(
  monster: ScenarioMonster,
  allMonsters: readonly ScenarioMonster[],
  field: SpriteField,
): ScenarioMonster[] {
  const value = monster[field];
  if (value === 0) return []; // skip the noisy "everyone has 0" case
  return allMonsters.filter(
    (m) =>
      !m.empty && m.index !== monster.index && m[field] === value,
  );
}

export function SpritesIdsTab({ monster, allMonsters }: SpritesIdsTabProps) {
  return (
    <div>
      <div
        data-testid="sprite-placeholder"
        style={{
          width: 96,
          height: 96,
          background: 'var(--color-surface)',
          border: '1px dashed var(--color-border)',
          color: 'var(--color-text-faint)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          marginBottom: 'var(--space-4)',
        }}
      >
        sprite{'\n'}TBD
      </div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.88rem',
        }}
      >
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
            <th style={{ textAlign: 'left', padding: 'var(--space-1) 0' }}>field</th>
            <th style={{ textAlign: 'right', padding: 'var(--space-1) 0' }}>value</th>
            <th style={{ textAlign: 'left', padding: 'var(--space-1) var(--space-3)' }}>shared with</th>
          </tr>
        </thead>
        <tbody>
          {FIELDS.map(({ name, label, isPercent }) => {
            const value = monster[name];
            const sharers = sharedWith(monster, allMonsters, name);
            return (
              <tr key={name} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: 'var(--space-1) 0', color: 'var(--color-text-muted)' }}>
                  {label}
                </td>
                <td style={{ padding: 'var(--space-1) 0', textAlign: 'right', color: 'var(--color-text)' }}>
                  {value}
                  {isPercent ? '%' : ''}
                </td>
                <td style={{ padding: 'var(--space-1) var(--space-3)', color: 'var(--color-text-faint)' }}>
                  {sharers.length === 0 ? (
                    <span>—</span>
                  ) : (
                    sharers.slice(0, 5).map((m, i) => (
                      <span key={m.index}>
                        {i > 0 ? ', ' : ''}
                        <Link to={`/monsters/${monsterSlug(m)}`}>{m.nameIdSingular}</Link>
                      </span>
                    ))
                  )}
                  {sharers.length > 5 ? <span> +{sharers.length - 5} more</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Wire `sprites` tab into `MonsterDetail`**

Add to `TabId` and `TABS`:

```typescript
type TabId = 'overview' | 'attacks' | 'saves' | 'sprites' | 'raw' | 'family';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'attacks', label: 'Attacks' },
  { id: 'saves', label: 'Saves & Resistances' },
  { id: 'sprites', label: 'Sprites & IDs' },
  { id: 'raw', label: 'Raw bytes' },
  { id: 'family', label: 'Family' },
];
```

Wire in the dispatch (alongside the other tab cases):

```typescript
          ) : currentTab === 'sprites' ? (
            <SpritesIdsTab monster={monster} allMonsters={allMonsters} />
          ) : ...
```

Add the import:

```typescript
import { SpritesIdsTab } from './tabs/SpritesIdsTab.js';
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/pages/monsters/tabs/SpritesIdsTab.tsx packages/viewer/src/pages/monsters/MonsterDetail.tsx packages/viewer/tests/pages/monsters/tabs/SpritesIdsTab.test.tsx
git commit -m "feat(viewer): SpritesIdsTab — sprite/ID fields with shared-with lookups"
```

---

## Task 7: Bidirectional highlighting on Overview / Attacks / Saves

Add hover handlers on the existing tabs so hovering a stat sets `highlightedField` in the context — making the Raw bytes view pulse the matching cells when the user navigates back there.

This task makes the highlighting WORK the other direction too. The Raw tab already sets the field on hover (Task 4). Now the data tabs do too.

**Files:**
- Modify: `packages/viewer/src/pages/monsters/tabs/OverviewTab.tsx`
- Modify: `packages/viewer/src/pages/monsters/tabs/SavesTab.tsx`
- Modify: `packages/viewer/src/components/HeatmapRow.tsx` — accept an `onHover` for the row label
- Test: `packages/viewer/tests/pages/monsters/tabs/bidirectional-highlight.test.tsx`

- [ ] **Step 1: Write the integration test**

Create `packages/viewer/tests/pages/monsters/tabs/bidirectional-highlight.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  MonsterDetailProvider,
  useMonsterDetail,
} from '../../../../src/pages/monsters/MonsterDetailContext.js';
import { OverviewTab } from '../../../../src/pages/monsters/tabs/OverviewTab.js';
import { SavesTab } from '../../../../src/pages/monsters/tabs/SavesTab.js';
import { FIXTURE_SCENARIO_DB } from '../../../fixtures/scenario-fixture.js';

const PIT_FIEND = FIXTURE_SCENARIO_DB.monsters[2]!;

function HighlightProbe() {
  const { highlightedField } = useMonsterDetail();
  return <p data-testid="highlight">{highlightedField ?? 'null'}</p>;
}

describe('bidirectional highlighting from data tabs', () => {
  it('hovering the AC row on Overview sets highlightedField to monsterAC', () => {
    render(
      <MonsterDetailProvider>
        <OverviewTab monster={PIT_FIEND} />
        <HighlightProbe />
      </MonsterDetailProvider>,
    );
    const acLabel = screen.getByLabelText(/^ac$/i);
    fireEvent.mouseEnter(acLabel);
    expect(screen.getByTestId('highlight')).toHaveTextContent('monsterAC');
    fireEvent.mouseLeave(acLabel);
    expect(screen.getByTestId('highlight')).toHaveTextContent('null');
  });

  it('hovering the saveTable row on Saves sets highlightedField to saveTable', () => {
    render(
      <MonsterDetailProvider>
        <SavesTab monster={PIT_FIEND} />
        <HighlightProbe />
      </MonsterDetailProvider>,
    );
    const saveLabel = screen.getByText('saveTable');
    fireEvent.mouseEnter(saveLabel);
    expect(screen.getByTestId('highlight')).toHaveTextContent('saveTable');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/tabs/bidirectional-highlight.test.tsx
```

Expected: FAIL (Overview + Saves don't wire context yet).

- [ ] **Step 3: Add hover-emit to `OverviewTab`**

Open `packages/viewer/src/pages/monsters/tabs/OverviewTab.tsx`. Import the context:

```typescript
import { useMonsterDetail } from '../MonsterDetailContext.js';
import type { MonsterFieldName } from '../../../lib/monster-byte-map.js';
```

In the `Row` helper, accept a `fieldName` prop and wire `onMouseEnter`/`onMouseLeave` to set/clear the context:

Replace:

```typescript
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className={styles.label} aria-label={label}>
        {label}
      </div>
      <div className={styles.value}>{children}</div>
    </>
  );
}
```

with:

```typescript
function Row({
  label,
  fieldName,
  children,
}: {
  label: string;
  fieldName?: MonsterFieldName;
  children: React.ReactNode;
}) {
  // useMonsterDetail throws when outside the provider — but we want Overview
  // to also work standalone (e.g. in old tests). Wrap in a try/catch to
  // degrade gracefully.
  let setHighlightedField: ((f: MonsterFieldName | null) => void) | null = null;
  try {
    setHighlightedField = useMonsterDetail().setHighlightedField;
  } catch {
    setHighlightedField = null;
  }
  const handleEnter = () => {
    if (fieldName && setHighlightedField) setHighlightedField(fieldName);
  };
  const handleLeave = () => {
    if (setHighlightedField) setHighlightedField(null);
  };
  return (
    <>
      <div
        className={styles.label}
        aria-label={label}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {label}
      </div>
      <div
        className={styles.value}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {children}
      </div>
    </>
  );
}
```

⚠️ The try/catch around `useMonsterDetail()` is a hooks-rules violation if the context status changes between renders. Better pattern: don't try/catch. Instead, make the context have a no-op default, OR require all Overview consumers to wrap in the provider. The MonsterDetail wrapper already does this (Task 4). For tests that don't wrap, they shouldn't be exercising the highlight behavior anyway. Just call `useMonsterDetail()` directly without try/catch.

Cleaner approach: change `MonsterDetailContext.tsx` so the default value is a no-op rather than throwing. Then `useMonsterDetail()` always returns a valid state (the no-op is fine standalone). Update the context:

In `packages/viewer/src/pages/monsters/MonsterDetailContext.tsx`, replace:

```typescript
const MonsterDetailCtx = createContext<MonsterDetailState | undefined>(undefined);

export function useMonsterDetail(): MonsterDetailState {
  const ctx = useContext(MonsterDetailCtx);
  if (!ctx) throw new Error('useMonsterDetail must be used inside MonsterDetailProvider');
  return ctx;
}
```

with:

```typescript
const NOOP_STATE: MonsterDetailState = {
  highlightedField: null,
  setHighlightedField: () => {},
};

const MonsterDetailCtx = createContext<MonsterDetailState>(NOOP_STATE);

export function useMonsterDetail(): MonsterDetailState {
  return useContext(MonsterDetailCtx);
}
```

This change requires updating the existing context test (the "throws when used outside the provider" test) — that behavior is removed. Update the test to assert that highlightedField is null outside the provider:

In `packages/viewer/tests/pages/monsters/MonsterDetailContext.test.tsx`, replace the "throws when used outside the provider" test with:

```typescript
  it('returns no-op state when used outside the provider (no throw)', () => {
    render(<Probe />);
    expect(screen.getByTestId('value')).toHaveTextContent('null');
    // calling set is also fine — it's a no-op
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('value')).toHaveTextContent('null');
  });
```

Now back to `Row`:

```typescript
function Row({
  label,
  fieldName,
  children,
}: {
  label: string;
  fieldName?: MonsterFieldName;
  children: React.ReactNode;
}) {
  const { setHighlightedField } = useMonsterDetail();
  const handleEnter = () => {
    if (fieldName) setHighlightedField(fieldName);
  };
  const handleLeave = () => setHighlightedField(null);
  return (
    <>
      <div
        className={styles.label}
        aria-label={label}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {label}
      </div>
      <div
        className={styles.value}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {children}
      </div>
    </>
  );
}
```

Pass `fieldName` to each Row call in `OverviewTab`. Map the labels to ScenarioMonster field names:

- `<Row label="class">` → `fieldName="monsterClass"`
- `<Row label="level">` → `fieldName="monsterLevel"` (also covers `monsterLevelMax` but we only highlight one; pick `monsterLevel`)
- `<Row label="ac">` → `fieldName="monsterAC"`
- `<Row label="hp">` → `fieldName="hpDiceCount"` (covers bytes 58-59; pick the first)
- `<Row label="group dice">` → `fieldName="groupDiceCount"` — note: this row was removed in Task 8 of stage 2b due to a test ambiguity; if it's still removed, skip it
- `<Row label="xp on kill">` → `fieldName="xpOnKill"`
- `<Row label="gold">` → `fieldName="goldStat"`
- `<Row label="element">` → `fieldName="specialAttackElement"`
- `<Row label="sex">` → `fieldName="monsterSex"`
- `<Row label="creature kind">` → `fieldName="creatureKind"`
- `<Row label="behavior">` → `fieldName="monsterBehaviorClass"`
- `<Row label="move stat">` → `fieldName="moveStat"`
- `<Row label="sprite group">` → `fieldName="spriteGroup"`
- `<Row label="family">` → `fieldName="familyId"`

- [ ] **Step 4: Add hover-emit to `SavesTab`**

The `HeatmapRow` component is what renders each save row. Add an `onHover` prop:

Open `packages/viewer/src/components/HeatmapRow.tsx`. Add an optional `onHover` prop:

```typescript
interface HeatmapRowProps {
  label: string;
  values: readonly number[];
  startOffset: number;
  onHover?: (entered: boolean) => void;
}

export function HeatmapRow({ label, values, startOffset, onHover }: HeatmapRowProps) {
  return (
    <div
      className={styles.row}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      <div className={styles.label}>{label}</div>
      {/* … rest unchanged … */}
```

In `SavesTab`, import `useMonsterDetail` and call it. Each `HeatmapRow` gets an `onHover` that sets / clears the matching `fieldName`:

Open `packages/viewer/src/pages/monsters/tabs/SavesTab.tsx`. Modify to:

```typescript
import type { ScenarioMonster } from '@wiz6/data';
import { HeatmapRow } from '../../../components/HeatmapRow.js';
import { useMonsterDetail } from '../MonsterDetailContext.js';
import type { MonsterFieldName } from '../../../lib/monster-byte-map.js';

interface SavesTabProps {
  monster: ScenarioMonster;
}

export function SavesTab({ monster: m }: SavesTabProps) {
  const { setHighlightedField } = useMonsterDetail();
  const hover = (field: MonsterFieldName) => (entered: boolean) => {
    setHighlightedField(entered ? field : null);
  };
  return (
    <div>
      <HeatmapRow label="saveTable" values={m.saveTable} startOffset={113} onHover={hover('saveTable')} />
      <HeatmapRow label="effectChanceTable" values={m.effectChanceTable} startOffset={121} onHover={hover('effectChanceTable')} />
      <HeatmapRow label="extendedSaves" values={m.extendedSaves} startOffset={85} onHover={hover('extendedSaves')} />
      <HeatmapRow label="attributeSaves" values={m.attributeSaves} startOffset={144} onHover={hover('attributeSaves')} />
    </div>
  );
}
```

- [ ] **Step 5: Run the integration test**

```bash
pnpm --filter @wiz6/viewer test tests/pages/monsters/tabs/bidirectional-highlight.test.tsx
```

Expected: 2/2 pass.

- [ ] **Step 6: Run the full monsters test directory + viewer suite**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: all green. The previous `MonsterDetailContext.test.tsx` had a "throws outside provider" test that we updated to "returns no-op state" — make sure that's fixed.

- [ ] **Step 7: Commit**

```bash
git add packages/viewer/src/pages/monsters/MonsterDetailContext.tsx packages/viewer/tests/pages/monsters/MonsterDetailContext.test.tsx packages/viewer/src/pages/monsters/tabs/OverviewTab.tsx packages/viewer/src/pages/monsters/tabs/SavesTab.tsx packages/viewer/src/components/HeatmapRow.tsx packages/viewer/tests/pages/monsters/tabs/bidirectional-highlight.test.tsx
git commit -m "feat(viewer): bidirectional byte-field highlighting from Overview + Saves

Hovering a stat label on Overview or a heatmap row on Saves sets
MonsterDetailContext.highlightedField. The Raw bytes tab listens and
pulses the matching cells. Context default switched to no-op state
so non-wrapped consumers (e.g. component tests) degrade gracefully."
```

---

## Task 8: Final smoke check + deploy cycle

Full tests + typecheck + production build + the standard goldentooth deploy.

- [ ] **Step 1: Final tests**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-2c
pnpm -r test 2>&1 | grep "Tests" | tail -5
```

Expected: 82 data + 96 parser + 41 cli + ~220-240 viewer = ~440-460 total (+30-40 from this stage).

- [ ] **Step 2: Typecheck + build**

```bash
pnpm -r typecheck 2>&1 | tail -3
pnpm -r build 2>&1 | tail -5
```

Expected: green; build emits per-route chunks.

- [ ] **Step 3: Merge worktree to main, push, build, deploy**

```bash
cd ~/Projects/ndouglas/wiz6
git checkout main
git merge stage-2c --no-ff -m "Merge stage 2c (monsters depth): Raw bytes, Sprites & IDs, Family tabs

Adds three tabs to MonsterDetail and wires bidirectional byte-field
highlighting between the data tabs and the Raw bytes hex grid."
pnpm -r test 2>&1 | grep "Tests" | tail -5
git push origin main 2>&1 | tail -3
git worktree remove --force ~/.config/superpowers/worktrees/wiz6/stage-2c
git worktree prune
git branch -d stage-2c
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

- [ ] **Step 5: Bump goldentooth deployment image**

```bash
cd ~/Projects/goldentooth/gitops
git pull
cat apps/wiz6/deployment.yaml | grep "image:"
```

Use the `Edit` tool to swap the image SHA. Then:

```bash
git diff apps/wiz6/deployment.yaml
git add apps/wiz6/deployment.yaml
git commit -m "chore(wiz6): bump image to pick up stage 2c (monsters depth tabs)"
git push origin main 2>&1 | tail -3
flux reconcile kustomization apps --with-source --timeout=2m 2>&1 | tail -3
flux reconcile kustomization wiz6 --with-source --timeout=2m 2>&1 | tail -3
sleep 5
kubectl rollout status deployment/wiz6 -n wiz6 --timeout=2m 2>&1 | tail -3
```

- [ ] **Step 6: Verify live**

```bash
curl -fsSk -o /dev/null -w "/: %{http_code}\n" https://wiz6.goldentooth.net/
curl -fsSk -o /dev/null -w "/monsters/giant-rat: %{http_code}\n" https://wiz6.goldentooth.net/monsters/giant-rat
```

Browser-level verification: open `/monsters/wraith`, click through the tabs (Overview → Attacks → Saves & Resistances → Sprites & IDs → Raw bytes → Family). Hover the AC value on Overview → switch to Raw bytes → confirm bytes pulse.

---

## Out of scope (deferred)

- Compare mode + family-grouped index + Copy buttons → Stage 2d
- Items polish → Stage 2e
- Quest records / files overview / breadth polish → Stage 2f
- Actual monster sprites → blocked on `.pic` decoding (stage 1j.6 or later)
- CLI `wiz6 hex` command that reuses the byte map → separate CLI follow-up
