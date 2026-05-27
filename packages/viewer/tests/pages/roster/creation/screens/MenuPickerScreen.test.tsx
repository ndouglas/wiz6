// packages/viewer/tests/pages/roster/creation/screens/MenuPickerScreen.test.tsx
//
// RTL tests for MenuPickerScreen + ScreenProps contract + mapKey helper.
//
// jsdom canvas is non-functional — we assert on dispatch behavior and
// canvas mounting, not pixels (pixel correctness is B3's domain).
//
// Spec: docs/re/wpcmk-screens.md §7 (menu-picker), §8 (key model).

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { WIZ6_MAIN } from '@wiz6/data';
import { meetsClassRequirements } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../../../../../src/pages/roster/creation/state.js';
import { initialCreationState } from '../../../../../src/pages/roster/creation/state.js';
import { WichmannHill } from '@wiz6/data';
import { mapKey } from '../../../../../src/pages/roster/creation/screens/ScreenProps.js';
import { MenuPickerScreen } from '../../../../../src/pages/roster/creation/screens/MenuPickerScreen.js';

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
 * Minimal stub MessageDb covering only the IDs used by MenuPickerScreen.
 * Uses real name strings matching §3 so text-content assertions work.
 */
function stubDb(): MessageDb {
  const entries: Array<{ id: number; decodedText: string }> = [
    // screen-02 race
    { id: 0x0450, decodedText: 'SELECT CHARACTER RACE' },
    { id: 0x045c, decodedText: 'CHARACTER RACE' },
    // screen-03 sex
    { id: 0x0451, decodedText: 'SELECT CHARACTER SEX' },
    { id: 0x045d, decodedText: 'CHARACTER SEX' },
    // screen-05 class
    { id: 0x0452, decodedText: 'SELECT CHARACTER PROFESSION' },
    { id: 0x045e, decodedText: 'PROFESSION' },
    // Race names (0x64..0x6e — 11 races)
    { id: 0x64, decodedText: 'HUMAN' },
    { id: 0x65, decodedText: 'ELF' },
    { id: 0x66, decodedText: 'DWARF' },
    { id: 0x67, decodedText: 'GNOME' },
    { id: 0x68, decodedText: 'HOBBIT' },
    { id: 0x69, decodedText: 'FAERIE' },
    { id: 0x6a, decodedText: 'LIZARDMAN' },
    { id: 0x6b, decodedText: 'DRACON' },
    { id: 0x6c, decodedText: 'FELPURR' },
    { id: 0x6d, decodedText: 'RAWULF' },
    { id: 0x6e, decodedText: 'MOOK' },
    // Sex names (0x8c..0x8d)
    { id: 0x8c, decodedText: 'MALE' },
    { id: 0x8d, decodedText: 'FEMALE' },
    // Class names (0x78..0x85 — 14 classes)
    { id: 0x78, decodedText: 'FIGHTER' },
    { id: 0x79, decodedText: 'MAGE' },
    { id: 0x7a, decodedText: 'PRIEST' },
    { id: 0x7b, decodedText: 'THIEF' },
    { id: 0x7c, decodedText: 'RANGER' },
    { id: 0x7d, decodedText: 'ALCHEMIST' },
    { id: 0x7e, decodedText: 'BARD' },
    { id: 0x7f, decodedText: 'PSIONIC' },
    { id: 0x80, decodedText: 'VALKYRIE' },
    { id: 0x81, decodedText: 'BISHOP' },
    { id: 0x82, decodedText: 'LORD' },
    { id: 0x83, decodedText: 'SAMURAI' },
    { id: 0x84, decodedText: 'MONK' },
    { id: 0x85, decodedText: 'NINJA' },
  ];

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
// Helper: build a state at the 'race' screen with minimal valid data
// ---------------------------------------------------------------------------

function makeRaceState(): CreationState {
  const rng = new WichmannHill(3000, 1, 29999);
  const s = initialCreationState(rng);
  // Advance to 'race' screen (as if name was set)
  return {
    ...s,
    screen: 'race',
    draft: { ...s.draft, name: 'TEST' },
  };
}

/**
 * Build a state at the 'sex' screen (race=0 Human, so we're in sex mode).
 */
function makeSexState(): CreationState {
  const s = makeRaceState();
  return {
    ...s,
    screen: 'sex',
    draft: {
      ...s.draft,
      race: 0,
      attributes: { str: 10, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 0 },
    },
  };
}

/**
 * Build a state at the 'class' screen with attributes that qualify only
 * Fighter (index 0): str≥12, all else 0 → exactly qualifies Fighter.
 * All higher-requirement classes (Mage requires int≥12, etc.) are disabled.
 */
function makeClassStatePartial(): CreationState {
  const s = makeRaceState();
  // Attributes that qualify Fighter (str=12) and Mage (int=12), but NOT Ranger
  // (requires str≥10,int≥8,pie≥8,vit≥11,dex≥10,spd≥8,per≥8).
  // We want at least 2 enabled classes so cursor can navigate.
  return {
    ...s,
    screen: 'class',
    draft: {
      ...s.draft,
      race: 0,
      sex: 0,
      bonusPool: 0,
      attributes: { str: 12, int: 12, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0 },
    },
  };
}

// ---------------------------------------------------------------------------
// mapKey — §8 key model
// ---------------------------------------------------------------------------

describe('mapKey', () => {
  it('maps ArrowLeft → 1', () => {
    expect(mapKey({ key: 'ArrowLeft' })).toBe(1);
  });

  it('maps ArrowUp → 2', () => {
    expect(mapKey({ key: 'ArrowUp' })).toBe(2);
  });

  it('maps ArrowRight → 3', () => {
    expect(mapKey({ key: 'ArrowRight' })).toBe(3);
  });

  it('maps ArrowDown → 4', () => {
    expect(mapKey({ key: 'ArrowDown' })).toBe(4);
  });

  it('maps Enter → 5', () => {
    expect(mapKey({ key: 'Enter' })).toBe(5);
  });

  it('maps ESC → null (ignored)', () => {
    expect(mapKey({ key: 'Escape' })).toBeNull();
  });

  it('maps unknown key → null', () => {
    expect(mapKey({ key: 'Tab' })).toBeNull();
    expect(mapKey({ key: 'a' })).toBeNull();
    expect(mapKey({ key: '1' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MenuPickerScreen — canvas mounting
// ---------------------------------------------------------------------------

describe('MenuPickerScreen (race) — canvas mounting', () => {
  it('renders a <canvas> element', () => {
    const state = makeRaceState();
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <MenuPickerScreen
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

  it('renders a <canvas> with width=320 and height=200', () => {
    const state = makeRaceState();
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <MenuPickerScreen
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
// MenuPickerScreen (race) — ArrowDown then Enter dispatches PICK_RACE index 1
// ---------------------------------------------------------------------------

describe('MenuPickerScreen (race) — navigation + confirm', () => {
  it('ArrowDown then Enter dispatches PICK_RACE with index 1', () => {
    const state = makeRaceState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <MenuPickerScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Move cursor down one row (index 0 → 1)
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    // Confirm selection
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_RACE', index: 1 });
  });

  it('Enter without navigation dispatches PICK_RACE with index 0 (first entry)', () => {
    const state = makeRaceState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <MenuPickerScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_RACE', index: 0 });
  });

  it('ArrowUp at first entry does not move cursor (no wrap)', () => {
    const state = makeRaceState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <MenuPickerScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Try to move up from index 0 (should be no-op, stays at 0)
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_RACE', index: 0 });
  });

  it('ArrowDown at last entry does not move cursor (no wrap)', () => {
    const state = makeRaceState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <MenuPickerScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Move to the end (11 races, 0-indexed last = 10)
    for (let i = 0; i < 15; i++) {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    }
    fireEvent.keyDown(window, { key: 'Enter' });

    // Should be clamped at index 10 (last race = MOOK)
    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_RACE', index: 10 });
  });
});

// ---------------------------------------------------------------------------
// MenuPickerScreen (sex) — dispatches PICK_SEX
// ---------------------------------------------------------------------------

describe('MenuPickerScreen (sex)', () => {
  it('Enter at default position dispatches PICK_SEX with index 0 (MALE)', () => {
    const state = makeSexState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <MenuPickerScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_SEX', index: 0 });
  });

  it('ArrowDown then Enter dispatches PICK_SEX with index 1 (FEMALE)', () => {
    const state = makeSexState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <MenuPickerScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_SEX', index: 1 });
  });
});

// ---------------------------------------------------------------------------
// MenuPickerScreen (class) — disabled entries are skipped
// ---------------------------------------------------------------------------

describe('MenuPickerScreen (class) — qualification gating', () => {
  it('cursor starts on first enabled class', () => {
    // Attributes that only qualify Fighter (index 0): str=12, all else 0.
    // Fighter needs str≥12; Mage needs int≥12; etc. Only Fighter qualifies here.
    const state = makeRaceState();
    const onlyFighterState: CreationState = {
      ...state,
      screen: 'class',
      draft: {
        ...state.draft,
        race: 0,
        sex: 0,
        bonusPool: 0,
        attributes: { str: 12, int: 0, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0 },
      },
    };

    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <MenuPickerScreen
        state={onlyFighterState}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Only one enabled class (Fighter=0). Enter dispatches index 0.
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_CLASS', index: 0 });
  });

  it('cursor skips disabled entries (ArrowDown lands on next enabled class)', () => {
    // Attributes that qualify Fighter (0) and Mage (1), but NOT Thief etc.
    // Fighter: str≥12 ✓ (str=12, int=0, etc.)
    // Mage: int≥12 ✓ (int=12)
    // Priest: pie≥12 — pie=0, NOT qualified
    // Thief: dex≥12, spd≥8 — NOT qualified
    // etc. — only Fighter(0) and Mage(1) are enabled.
    const s = makeClassStatePartial(); // str=12, int=12, others=0
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    // Verify our test attributes actually qualify exactly Fighter and Mage
    const attrs = s.draft.attributes;
    expect(meetsClassRequirements(attrs, 0)).toBe(true);  // Fighter
    expect(meetsClassRequirements(attrs, 1)).toBe(true);  // Mage
    expect(meetsClassRequirements(attrs, 2)).toBe(false); // Priest (pie=0)
    expect(meetsClassRequirements(attrs, 3)).toBe(false); // Thief (dex=0)

    render(
      <MenuPickerScreen
        state={s}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Start at Fighter (0). Move down — should land on Mage (1), not Priest (2).
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });

    // Cursor should be on Mage (index 1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_CLASS', index: 1 });
  });

  it('cannot navigate past last enabled class (no wrap)', () => {
    // Only Fighter(0) and Mage(1) enabled. Pressing ArrowDown twice should
    // land on Mage (1) and stay there, not wrap or advance further.
    const s = makeClassStatePartial(); // str=12, int=12
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <MenuPickerScreen
        state={s}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Pressing ArrowDown many times should clamp at last enabled (Mage=1)
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    }
    fireEvent.keyDown(window, { key: 'Enter' });

    // Still dispatches Mage (1), not beyond
    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_CLASS', index: 1 });
  });

  it('dispatches the ORIGINAL index (not enabled-subset index)', () => {
    // Fighter=0 enabled; Mage=1 enabled. When cursor is on Mage,
    // dispatch sends index=1 (original), not index=1-in-enabled-subset=1.
    // This is the same for this case, but conceptually the original index is what matters.
    // Let's make a case where original index differs from subset index.
    // attrs: only qualify Mage (int=12), not Fighter (str<12).
    // Fighter=0 disabled, Mage=1 enabled. First enabled = Mage at original index 1.
    const state = makeRaceState();
    const mageOnlyState: CreationState = {
      ...state,
      screen: 'class',
      draft: {
        ...state.draft,
        race: 0,
        sex: 0,
        bonusPool: 0,
        attributes: { str: 0, int: 12, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0 },
      },
    };

    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <MenuPickerScreen
        state={mageOnlyState}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Fighter is disabled; cursor should start on Mage (original index 1).
    fireEvent.keyDown(window, { key: 'Enter' });
    // Dispatches original index 1 (Mage), NOT 0
    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_CLASS', index: 1 });
  });
});

// ---------------------------------------------------------------------------
// MenuPickerScreen — ESC key is ignored (no dispatch, no crash)
// ---------------------------------------------------------------------------

describe('MenuPickerScreen — ESC is silently ignored', () => {
  it('ESC does not dispatch any event', () => {
    const state = makeRaceState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <MenuPickerScreen
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
