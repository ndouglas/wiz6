// packages/viewer/tests/pages/roster/creation/screens/ConfirmScreen.test.tsx
//
// RTL tests for ConfirmScreen (screen-15).
//
// Screen-15 behaviour per docs/re/wpcmk-screens.md §3, §8, §10:
//   - Renders the assembled character sheet in the top window:
//       name, race name, sex name, class name, STR/INT/PIE/VIT/DEX/SPD/PER/KAR,
//       HP (derived.hpInitial), STM (derived.stamina), gold (derived.goldInitial).
//   - Renders "SAVE THIS CHARACTER?" (MSG 0x044f) in bottomBar.
//   - Renders YES/NO options (MSG 0x045a) as a 2-option picker in bottomBar.
//   - Cursor starts at YES (index 0).
//   - ArrowLeft/ArrowRight or ArrowUp/ArrowDown toggles the YES/NO cursor.
//   - Enter → dispatch CONFIRM { keep: cursor===0 } (YES=true, NO=false).
//   - Escape is silently ignored per §8.
//   - Renders via CreationCanvas (<canvas> element).
//
// Spec: docs/re/wpcmk-screens.md §3, §8, §10

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { WIZ6_MAIN } from '@wiz6/data';
import { WichmannHill } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../../../../../src/pages/roster/creation/state.js';
import { initialCreationState } from '../../../../../src/pages/roster/creation/state.js';
import { ConfirmScreen } from '../../../../../src/pages/roster/creation/screens/ConfirmScreen.js';

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
 * Build a minimal stub MessageDb covering the confirm screen strings:
 *   0x044f = "SAVE THIS CHARACTER?" (confirm prompt)
 *   0x045a = "YES" (options)
 * Plus race, sex, class names needed for char sheet rendering:
 *   RACE_NAME_BASE = 0x64..0x6e (11 races)
 *   SEX_NAME_BASE  = 0x8c..0x8d (2 sexes)
 *   CLASS_NAME_BASE = 0x78..0x85 (14 classes)
 * Plus attribute labels (0x00c8..):
 *   We stub a representative subset.
 */
function stubDb(): MessageDb {
  const entries: Array<{ id: number; decodedText: string }> = [
    { id: 0x044f, decodedText: 'SAVE THIS CHARACTER?' },
    { id: 0x045a, decodedText: 'YES' },
    // Race names (0x64..0x6e)
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
    // Class names (0x78..0x85) — 14 classes
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
// Helper: build a fully-populated state at the 'confirm' screen
// ---------------------------------------------------------------------------

/**
 * Build a CreationState at the 'confirm' screen with a fully-populated draft.
 * All fields are set to known values so the character sheet can render.
 */
function makeConfirmState(): CreationState {
  const rng = new WichmannHill(3000, 1, 29999);
  const s = initialCreationState(rng);
  return {
    ...s,
    screen: 'confirm',
    draft: {
      ...s.draft,
      name: 'TESTCHAR',
      race: 0,          // HUMAN
      sex: 0,           // MALE
      class: 0,         // FIGHTER
      attributes: {
        str: 12,
        int: 10,
        pie: 10,
        vit: 11,
        dex: 10,
        spd: 10,
        per: 10,
        kar: 5,
      },
      bonusPool: 0,
      skillBudget: 0,
      skills: new Array(30).fill(0) as number[],
      portrait: 3,
      spellPicks: [],
      derived: {
        hpInitial: 8,
        stamina: 66,
        goldInitial: 690,
        age: 20000,
        encumbranceMin: 10,
        encumbranceMax: 20,
        level: 1,
        xp: 1,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Canvas mounting
// ---------------------------------------------------------------------------

describe('ConfirmScreen — canvas mounting', () => {
  it('renders a <canvas> element', () => {
    const state = makeConfirmState();
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <ConfirmScreen
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
    const state = makeConfirmState();
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <ConfirmScreen
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
// Enter on YES (cursor=0) → CONFIRM { keep: true }
// ---------------------------------------------------------------------------

describe('ConfirmScreen — Enter on YES dispatches CONFIRM { keep: true }', () => {
  it('Enter at initial cursor (YES) dispatches CONFIRM { keep: true }', () => {
    const state = makeConfirmState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <ConfirmScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'CONFIRM', keep: true });
  });
});

// ---------------------------------------------------------------------------
// Enter on NO (cursor=1, after moving right) → CONFIRM { keep: false }
// ---------------------------------------------------------------------------

describe('ConfirmScreen — Enter on NO dispatches CONFIRM { keep: false }', () => {
  it('ArrowRight then Enter dispatches CONFIRM { keep: false }', () => {
    const state = makeConfirmState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <ConfirmScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'CONFIRM', keep: false });
  });

  it('ArrowDown then Enter dispatches CONFIRM { keep: false }', () => {
    const state = makeConfirmState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <ConfirmScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'CONFIRM', keep: false });
  });
});

// ---------------------------------------------------------------------------
// Cursor toggles: moving back to YES works
// ---------------------------------------------------------------------------

describe('ConfirmScreen — cursor toggles YES/NO', () => {
  it('ArrowRight then ArrowLeft (back to YES) then Enter dispatches CONFIRM { keep: true }', () => {
    const state = makeConfirmState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <ConfirmScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'CONFIRM', keep: true });
  });

  it('ArrowDown then ArrowUp (back to YES) then Enter dispatches CONFIRM { keep: true }', () => {
    const state = makeConfirmState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <ConfirmScreen
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

    expect(dispatch).toHaveBeenCalledWith({ type: 'CONFIRM', keep: true });
  });

  it('multiple ArrowRight presses clamp at NO (index 1, no wrap)', () => {
    const state = makeConfirmState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <ConfirmScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Press ArrowRight 5 times — should clamp at NO (index 1)
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    }
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'CONFIRM', keep: false });
  });

  it('multiple ArrowLeft presses from YES clamp at YES (index 0, no wrap)', () => {
    const state = makeConfirmState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <ConfirmScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Press ArrowLeft 5 times from YES — should clamp at YES (index 0)
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
    }
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'CONFIRM', keep: true });
  });
});

// ---------------------------------------------------------------------------
// Escape is silently ignored
// ---------------------------------------------------------------------------

describe('ConfirmScreen — Escape is silently ignored', () => {
  it('Escape does not dispatch any event', () => {
    const state = makeConfirmState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <ConfirmScreen
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
// Renders without throwing for all valid draft states
// ---------------------------------------------------------------------------

describe('ConfirmScreen — renders without throwing', () => {
  it('renders without error for a fully-populated state', () => {
    const state = makeConfirmState();
    const dispatch = vi.fn();
    const db = stubDb();

    expect(() =>
      render(
        <ConfirmScreen
          state={state}
          dispatch={dispatch}
          fontSet={STUB_FONT_SET}
          palette={WIZ6_MAIN}
          db={db}
        />,
      ),
    ).not.toThrow();
  });

  it('renders without error when derived stats are empty (Partial<>)', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const s = initialCreationState(rng);
    const state: CreationState = {
      ...s,
      screen: 'confirm',
      draft: {
        ...s.draft,
        name: 'NODERIVED',
        race: 0,
        sex: 0,
        class: 0,
        attributes: {
          str: 10, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 0,
        },
        derived: {},  // all optional — should render gracefully
      },
    };
    const dispatch = vi.fn();
    const db = stubDb();

    expect(() =>
      render(
        <ConfirmScreen
          state={state}
          dispatch={dispatch}
          fontSet={STUB_FONT_SET}
          palette={WIZ6_MAIN}
          db={db}
        />,
      ),
    ).not.toThrow();
  });
});
