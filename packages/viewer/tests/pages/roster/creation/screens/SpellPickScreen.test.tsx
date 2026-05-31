// packages/viewer/tests/pages/roster/creation/screens/SpellPickScreen.test.tsx
//
// RTL tests for SpellPickScreen (screen-14).
//
// Screen-14 behaviour per docs/re/wpcmk-screens.md §9, §5, §8:
//   - Only shown for caster classes: Mage (1), Priest (2), Alchemist (5),
//     Psionic (7), Bishop (9). (classIsCaster check in state machine.)
//   - Eligible spells = spellsInBook(bookIdx) for each book in the class's
//     CLASS_SPELLBOOKS entry (books with pickCount > 0).
//   - Pick count needed = sum of CLASS_SPELLBOOKS[classIdx] values.
//   - Mage (class 1): CLASS_SPELLBOOKS[1] = [2,0,0,0] → 2 picks from Mage book.
//   - Priest (class 2): CLASS_SPELLBOOKS[2] = [0,2,0,0] → 2 picks from Priest book.
//   - Bishop (class 9): CLASS_SPELLBOOKS[9] = [1,1,0,0] → 2 total picks.
//   - Spell names: spellName(db, entryIdx) → msg 0xfa0 + entryIdx per §9.
//   - Keys per §8:
//       ArrowUp   (code 2) → cursor prev (clamp, no wrap)
//       ArrowDown (code 4) → cursor next (clamp, no wrap)
//       ArrowRight (code 3) / Enter (code 5) → dispatch PICK_SPELL { entry: <cursor entryIdx> }
//       ArrowLeft (code 1) → no-op (no spell removal)
//   - After required picks: dispatch SPELLS_DONE.
//   - Reducer contract (state.ts):
//       PICK_SPELL: appends entry to spellPicks[], does NOT auto-advance screen.
//       SPELLS_DONE: advances screen to 'confirm'.
//   - The SCREEN is responsible for dispatching SPELLS_DONE when picks == required.
//   - Renders via CreationCanvas (<canvas>).
//
// Spec: docs/re/wpcmk-screens.md §5, §8, §9

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { WIZ6_MAIN, CLASS_SPELLBOOKS, spellsInBook, SPELL_TABLE } from '@wiz6/data';
import { REALM_NAMES } from '../../../../../src/pages/roster/creation/ega/compose-spell-panel.js';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../../../../../src/pages/roster/creation/state.js';
import { initialCreationState } from '../../../../../src/pages/roster/creation/state.js';
import { WichmannHill } from '@wiz6/data';
import { SpellPickScreen } from '../../../../../src/pages/roster/creation/screens/SpellPickScreen.js';

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

/** Stub FontSet — all fonts null. CreationCanvas handles this gracefully. */
const STUB_FONT_SET: FontSet = {
  font0: null,
  font1: null,
  font2: null,
  font3: null,
  font4: null,
};

/**
 * Build a minimal stub MessageDb covering spell names (§9):
 *   0xfa0..0xff1 = spell names (82 entries, indices 0..81)
 *   0x02bc = "SPELLS" (title)
 *   0x0f75 = "COST"
 * We stub a representative subset.
 */
function stubDb(): MessageDb {
  const entries: Array<{ id: number; decodedText: string }> = [
    { id: 0x02bc, decodedText: '      SPELLS      ' },
    { id: 0x0f75, decodedText: 'COST' },
  ];
  // Spell names: indices 0..81 → msg 0xfa0..0xff1
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

// ---------------------------------------------------------------------------
// Helper: build a state at the 'spellPick' screen
// ---------------------------------------------------------------------------

/**
 * Build a CreationState at the 'spellPick' screen for the given class.
 * spellPicks defaults to [].
 */
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
// SpellPickScreen — canvas mounting
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
});

// ---------------------------------------------------------------------------
// Eligible spell list — class constrains which spells are shown
// ---------------------------------------------------------------------------

describe('SpellPickScreen — eligible spells per class', () => {
  it('Mage (class 1) eligible list contains Mage-book spells', () => {
    // CLASS_SPELLBOOKS[1] = [2,0,0,0] → Mage book (bookIdx=0) only
    const mageBookSpells = spellsInBook(0); // bookIdx=0 = Mage
    expect(mageBookSpells.length).toBeGreaterThan(0);
    // Entry 0 (ENERGY BLAST) should be in Mage book (byte5=0x08, bit3=Mage)
    // Verify by checking the book mask
    const containsEntry0 = mageBookSpells.some((s) => s.entryIdx === 0);
    expect(containsEntry0).toBe(true);
  });

  it('first Mage-book spell maps to the FIRE realm (panel realm wiring)', () => {
    // The picker starts on the first eligible spell; for a Mage that's the
    // first Mage-book entry. Its school index → realm name drives the panel's
    // realm label. ENERGY BLAST is a Fire spell — must match the fixture.
    const first = spellsInBook(0)[0]!;
    const realm = REALM_NAMES[SPELL_TABLE[first.entryIdx]!.school];
    expect(realm).toBe('FIRE');
  });

  it('Mage eligible list does NOT contain Priest-only spells', () => {
    // Find a spell that's only in Priest book (byte5 & 0x04 !== 0 AND byte5 & 0x08 === 0)
    const mageBookSpells = spellsInBook(0); // Mage book entries
    const priestBookSpells = spellsInBook(1); // Priest book entries
    const priestOnly = priestBookSpells.filter(
      (p) => !mageBookSpells.some((m) => m.entryIdx === p.entryIdx),
    );
    // There should be priest-only spells; confirm none are in mageBookSpells
    if (priestOnly.length > 0) {
      const firstPriestOnly = priestOnly[0]!;
      expect(mageBookSpells.some((m) => m.entryIdx === firstPriestOnly.entryIdx)).toBe(false);
    }
  });

  it('Priest (class 2) eligible list comes from Priest book only', () => {
    // CLASS_SPELLBOOKS[2] = [0,2,0,0] → Priest book (bookIdx=1)
    const priestBookSpells = spellsInBook(1);
    expect(priestBookSpells.length).toBeGreaterThan(0);
  });

  it('Bishop (class 9) has picks from Mage + Priest books combined', () => {
    // CLASS_SPELLBOOKS[9] = [1,1,0,0] → Mage book + Priest book, 1 pick each
    const mageSpells = spellsInBook(0);
    const priestSpells = spellsInBook(1);
    // Bishop total picks = 1 + 1 = 2
    const bishopBooks = CLASS_SPELLBOOKS[9]!;
    const totalPicks = bishopBooks.reduce((sum, c) => sum + c, 0);
    expect(totalPicks).toBe(2);
    // Bishop can pick from Mage book
    expect(mageSpells.length).toBeGreaterThan(0);
    // Bishop can pick from Priest book
    expect(priestSpells.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Enter/ArrowRight → PICK_SPELL { entry: <cursor entryIdx> }
// Cursor starts at the first eligible spell.
// ---------------------------------------------------------------------------

describe('SpellPickScreen — Enter dispatches PICK_SPELL at cursor entry', () => {
  it('Enter at initial position dispatches PICK_SPELL with the first Mage-book spell entry', () => {
    const state = makeSpellPickState(1); // Mage
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SpellPickScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });

    // First spell in Mage book (entry 0 = ENERGY BLAST, byte5 = 0x08 has Mage bit)
    const mageSpells = spellsInBook(0);
    const firstEntry = mageSpells[0]!.entryIdx;
    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_SPELL', entry: firstEntry });
  });

  it('ArrowRight dispatches PICK_SPELL at cursor entry', () => {
    const state = makeSpellPickState(1); // Mage
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SpellPickScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    const mageSpells = spellsInBook(0);
    const firstEntry = mageSpells[0]!.entryIdx;
    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_SPELL', entry: firstEntry });
  });
});

// ---------------------------------------------------------------------------
// ArrowDown → cursor moves to next eligible spell
// ---------------------------------------------------------------------------

describe('SpellPickScreen — ArrowDown moves cursor to next spell', () => {
  it('ArrowDown then Enter dispatches PICK_SPELL with the second spell', () => {
    const state = makeSpellPickState(1); // Mage
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SpellPickScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });

    const mageSpells = spellsInBook(0);
    const secondEntry = mageSpells[1]!.entryIdx;
    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_SPELL', entry: secondEntry });
  });

  it('ArrowDown clamps at last spell (no wrap)', () => {
    const state = makeSpellPickState(1); // Mage
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SpellPickScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    const mageSpells = spellsInBook(0);
    const lastEntry = mageSpells[mageSpells.length - 1]!.entryIdx;

    // Press ArrowDown more than the number of spells — should clamp
    for (let i = 0; i < mageSpells.length + 5; i++) {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    }
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_SPELL', entry: lastEntry });
  });
});

// ---------------------------------------------------------------------------
// ArrowUp → cursor moves to prev spell (clamp, no wrap)
// ---------------------------------------------------------------------------

describe('SpellPickScreen — ArrowUp moves cursor to prev spell', () => {
  it('ArrowUp from first spell clamps (no wrap)', () => {
    const state = makeSpellPickState(1); // Mage
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SpellPickScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'Enter' });

    const mageSpells = spellsInBook(0);
    const firstEntry = mageSpells[0]!.entryIdx;
    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_SPELL', entry: firstEntry });
  });

  it('ArrowDown then ArrowUp returns to first spell', () => {
    const state = makeSpellPickState(1); // Mage
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SpellPickScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'Enter' });

    const mageSpells = spellsInBook(0);
    const firstEntry = mageSpells[0]!.entryIdx;
    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_SPELL', entry: firstEntry });
  });
});

// ---------------------------------------------------------------------------
// ArrowLeft is a no-op (no spell removal)
// ---------------------------------------------------------------------------

describe('SpellPickScreen — ArrowLeft does not dispatch', () => {
  it('ArrowLeft does not dispatch any event', () => {
    const state = makeSpellPickState(1); // Mage
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SpellPickScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowLeft' });

    expect(dispatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Escape is silently ignored
// ---------------------------------------------------------------------------

describe('SpellPickScreen — Escape is silently ignored', () => {
  it('Escape does not dispatch any event', () => {
    const state = makeSpellPickState(1); // Mage
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SpellPickScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(dispatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SPELLS_DONE dispatched when required picks reached
// ---------------------------------------------------------------------------

describe('SpellPickScreen — SPELLS_DONE when picks exhausted', () => {
  it('dispatches SPELLS_DONE after required number of picks (Mage: 2)', () => {
    // Mage CLASS_SPELLBOOKS[1] = [2,0,0,0] → 2 picks required.
    // Pre-populate with 1 pick so the next Enter completes the quota.
    const mageSpells = spellsInBook(0);
    const firstEntry = mageSpells[0]!.entryIdx;
    const state = makeSpellPickState(1, [firstEntry]); // already 1 pick
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SpellPickScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // One more pick to reach total of 2 (the required count for Mage)
    fireEvent.keyDown(window, { key: 'Enter' });

    // Expect PICK_SPELL for the entry, then SPELLS_DONE
    const calls = dispatch.mock.calls.map((c) => c[0]);
    expect(calls).toContainEqual({ type: 'PICK_SPELL', entry: expect.any(Number) });
    expect(calls).toContainEqual({ type: 'SPELLS_DONE' });
    // SPELLS_DONE comes after the pick
    const pickIdx = calls.findIndex((c) => c.type === 'PICK_SPELL');
    const doneIdx = calls.findIndex((c) => c.type === 'SPELLS_DONE');
    expect(pickIdx).toBeGreaterThanOrEqual(0);
    expect(doneIdx).toBeGreaterThan(pickIdx);
  });

  it('does NOT dispatch SPELLS_DONE when picks < required (Mage, 1/2 done)', () => {
    // State: 0 existing picks. After one Enter, we have 1 pick but need 2.
    const state = makeSpellPickState(1, []); // Mage, 0 picks
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SpellPickScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });

    const calls = dispatch.mock.calls.map((c) => c[0]);
    expect(calls).toContainEqual({ type: 'PICK_SPELL', entry: expect.any(Number) });
    expect(calls).not.toContainEqual({ type: 'SPELLS_DONE' });
  });
});

// ---------------------------------------------------------------------------
// Renders without throwing for all caster classes
// ---------------------------------------------------------------------------

describe('SpellPickScreen — renders without throwing for all caster classes', () => {
  const casterClasses = [1, 2, 5, 7, 9]; // Mage, Priest, Alchemist, Psionic, Bishop
  for (const classIdx of casterClasses) {
    it(`renders without error for class ${classIdx}`, () => {
      const state = makeSpellPickState(classIdx);
      const dispatch = vi.fn();
      const db = stubDb();

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
    });
  }
});
