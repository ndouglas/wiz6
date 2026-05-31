// packages/viewer/tests/pages/roster/creation/screens/SpellPickScreen.test.tsx
//
// Tests for SpellPickScreen (screen-14) — 3x2 school grid ⇄ sub-list state machine.
//
// Pure-helper tests verify the exported grid/sublist navigation helpers.
// Canvas smoke test verifies the component mounts for a Mage.
//
// Spec: docs/re/wpcmk-screens.md §5, §8, §9
//       docs/re/findings/spell-picker-eligibility.json

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { WIZ6_MAIN } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState } from '../../../../../src/pages/roster/creation/state.js';
import { initialCreationState } from '../../../../../src/pages/roster/creation/state.js';
import { WichmannHill } from '@wiz6/data';
import {
  SpellPickScreen,
  gridNextSchool,
  sublistNextIdx,
} from '../../../../../src/pages/roster/creation/screens/SpellPickScreen.js';

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

const STUB_FONT_SET: FontSet = {
  font0: null,
  font1: null,
  font2: null,
  font3: null,
  font4: null,
};

function stubDb(): MessageDb {
  const entries: Array<{ id: number; decodedText: string }> = [
    { id: 0x02bc, decodedText: '      SPELLS      ' },
    { id: 0x0f75, decodedText: 'COST' },
    { id: 0x02bf, decodedText: 'SELECT A NEW SPELL FOR YOUR SPELLBOOK' },
  ];
  const SPELL_NAMES = [
    'ENERGY BLAST', 'BLINDING FLASH', 'FIREBALL', 'FROST BYTE', 'DEADLY AIR',
    'METEOR SHOWER', 'MASS CONFUSION', 'NUCLEAR BLAST', 'SIZZLE',
    'DRAINING CLOUD', 'KNOCK KNOCK', 'ACID RAIN', 'POISON BOLT', 'SLOW DEATH',
    'MAGE CANE', 'CURE DISEASE', 'ACID SPLASH', 'RESTORE SIGHT', 'SORECER',
    'TREMOR', 'COLD SNAP', 'NOXIOUS FUMES', 'ASPHYXIATION', 'WHIRLWIND',
    'FUME CLOUD', 'VAPORIZE', 'ROCK BLASTE', 'EARTH ELEMENTAL', 'FLASH FREEZE',
    'ACID CLOUD', 'SAND STORM', 'CRUSH', 'QUICKSAND', 'COALESCE',
    'EARTHQUAKE', 'MIND SCAN', 'CHAOS', 'RAZZLE DAZZLE', 'HYPNOTIC STAR',
    'HOLY WATER', 'CONFUSE FEAR', 'MAGIC RESIN', 'PHANTASM', 'MIND FLAY',
    'BRAIN BLASTER', 'FATAL ATTRACTION', 'ANTI-MAGIC', 'MINDBLAST', 'HEAL',
    'CONFUSION', 'ARMORPLATE', 'GUARDIAN ANGEL', 'DISPEL UNDEAD', 'CURE ALL',
    'WATCHMEN', 'DIVINE TRAP', 'HOLY SWORD', 'BLESS', 'CURE WOUNDS',
    'PARALYZE', 'RESURRECT', 'HOLY WATER 2', 'SMITE', 'TURN UNDEAD',
    'DETECT', 'MASS PARALYZE', 'LIGHT', 'WIZARD EYE', 'SACRED FIRE',
    'ALMIGHTY', 'INSTANT DEATH', 'AWAKEN', 'LIFESTEAL', 'VAMPIRIC TOUCH',
    'FATAL FLAW', 'DEATH GRASP', 'SOUL SUCKER', 'DEATH WISH', 'HOLY WATER3',
    'HELPFOOD', 'MAGICFOOD',
  ];
  for (let i = 0; i < 82 && i < SPELL_NAMES.length; i++) {
    entries.push({ id: 0x0fa0 + i, decodedText: SPELL_NAMES[i] ?? `SPELL_${i}` });
  }
  return {
    banks: [],
    indexedMessages: entries.map((e) => ({
      id: e.id,
      decodedText: e.decodedText,
      rawBytes: new Uint8Array(0),
    })),
  } as unknown as MessageDb;
}

function makeSpellPickState(classIdx: number, spellPicks: number[] = []): CreationState {
  const rng = new WichmannHill(3000, 1, 29999);
  const s = initialCreationState(rng);
  return {
    ...s,
    screen: 'spellPick',
    draft: {
      ...s.draft,
      name: 'TESTCHAR',
      race: 0,
      sex: 0,
      class: classIdx,
      attributes: {
        str: 10, int: 15, pie: 10, vit: 10, dex: 10, spd: 10, per: 10,
        kar: 5,
      },
      bonusPool: 0,
      skillBudget: 0,
      skills: new Array(30).fill(0) as number[],
      spellPicks,
    },
  };
}

// ---------------------------------------------------------------------------
// gridNextSchool — pure navigation helper
// ---------------------------------------------------------------------------

describe('gridNextSchool — grid-mode school navigation', () => {
  it('grid: right from FIRE(0) → EARTH(3); right from row1 clamps', () => {
    expect(gridNextSchool(0, 3)).toBe(3);
    expect(gridNextSchool(3, 3)).toBe(3); // school>=3 → no right
  });

  it('grid: down moves within row, clamps at col 2', () => {
    expect(gridNextSchool(0, 4)).toBe(1);
    expect(gridNextSchool(1, 4)).toBe(2);
    expect(gridNextSchool(2, 4)).toBe(2); // clamp
  });

  it('grid: up clamps at col 0; left clamps at row 0', () => {
    expect(gridNextSchool(0, 2)).toBe(0);
    expect(gridNextSchool(3, 2)).toBe(3);
    expect(gridNextSchool(0, 1)).toBe(0);
    expect(gridNextSchool(3, 1)).toBe(0);
  });

  it('grid: left from EARTH(3) → FIRE(0); down from EARTH(3) → MENTAL(4)', () => {
    expect(gridNextSchool(3, 1)).toBe(0);
    expect(gridNextSchool(3, 4)).toBe(4);
  });

  it('grid: right from MENTAL(4) clamps (school>=3 no-op)', () => {
    // right moves row0→row1 only; school>=3 already on row1 → no-op
    expect(gridNextSchool(4, 3)).toBe(4);
    expect(gridNextSchool(5, 3)).toBe(5);
    // left from row1 MENTAL(4) → row0 FIRE+1 = AIR(1)? No: school-3 = 1
    expect(gridNextSchool(4, 1)).toBe(1);
    expect(gridNextSchool(5, 1)).toBe(2);
  });

  it('grid: up from AIR(1) → FIRE(0); up from MENTAL(4) → EARTH(3)', () => {
    // up means col>0 → school-1; school=1 col=1 → school=0
    expect(gridNextSchool(1, 2)).toBe(0);
    // school=4 col=1 → school=3
    expect(gridNextSchool(4, 2)).toBe(3);
    // school=5 col=2 → school=4
    expect(gridNextSchool(5, 2)).toBe(4);
  });

  it('grid: unknown code returns school unchanged', () => {
    expect(gridNextSchool(2, 99)).toBe(2);
    expect(gridNextSchool(5, 0)).toBe(5); // esc is no-op in grid
  });
});

// ---------------------------------------------------------------------------
// sublistNextIdx — pure navigation helper
// ---------------------------------------------------------------------------

describe('sublistNextIdx — sublist-mode navigation', () => {
  it('sublist: down clamps to len-1, up clamps to 0', () => {
    expect(sublistNextIdx(0, 2, 4)).toBe(1);
    expect(sublistNextIdx(1, 2, 4)).toBe(1);
    expect(sublistNextIdx(1, 2, 2)).toBe(0);
    expect(sublistNextIdx(0, 2, 2)).toBe(0);
  });

  it('sublist: down from mid of list moves forward', () => {
    expect(sublistNextIdx(2, 5, 4)).toBe(3);
  });

  it('sublist: up from mid of list moves backward', () => {
    expect(sublistNextIdx(3, 5, 2)).toBe(2);
  });

  it('sublist: unknown code returns idx unchanged', () => {
    expect(sublistNextIdx(2, 5, 99)).toBe(2);
    expect(sublistNextIdx(2, 5, 5)).toBe(2); // enter/esc handled by component
  });
});

// ---------------------------------------------------------------------------
// Canvas smoke test — component mounts without error
// ---------------------------------------------------------------------------

describe('SpellPickScreen — canvas mounting', () => {
  it('renders a <canvas> element for a Mage', () => {
    const state = makeSpellPickState(1);
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <SpellPickScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });

  it('renders a <canvas> with width=320 height=200', () => {
    const state = makeSpellPickState(1);
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <SpellPickScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    const canvas = container.querySelector('canvas');
    expect(canvas!.width).toBe(320);
    expect(canvas!.height).toBe(200);
  });

  it('renders without error for all caster classes', () => {
    const casterClasses = [1, 2, 5, 7, 9]; // Mage, Priest, Alchemist, Psionic, Bishop
    const dispatch = vi.fn();
    const db = stubDb();

    for (const classIdx of casterClasses) {
      const state = makeSpellPickState(classIdx);
      expect(() =>
        render(
          <SpellPickScreen
            state={state}
            dispatch={dispatch}
            fontSet={STUB_FONT_SET}
            palette={WIZ6_MAIN}
            db={db}
          />,
        ),
      ).not.toThrow();
    }
  });
});
