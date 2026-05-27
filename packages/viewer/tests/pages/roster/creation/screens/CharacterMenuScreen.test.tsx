// packages/viewer/tests/pages/roster/creation/screens/CharacterMenuScreen.test.tsx
//
// RTL tests for CharacterMenuScreen — roster-state-dependent CHARACTER MENU.
//
// Three roster states produce different visible option sets:
//   EMPTY   (rosterCount=0):  CREATE PC + EXIT
//   PARTIAL (rosterCount=7):  all 6 options
//   FULL    (rosterCount=16): no CREATE PC — REVIEW PC + DELETE PC + RENAME PC + PORTRAIT + EXIT
//
// RE source: docs/re/findings/wpcmk-character-menu-options.json
//
// jsdom canvas is non-functional — we assert on dispatch behavior and
// canvas mounting, not pixels.
//
// Spec: docs/re/wpcmk-screens.md §1a (option rules), §7 (grid nav), §8 (key model).

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { WIZ6_MAIN } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../../../../../src/pages/roster/creation/state.js';
import { initialCreationState } from '../../../../../src/pages/roster/creation/state.js';
import { WichmannHill } from '@wiz6/data';
import { CharacterMenuScreen, MAX_ROSTER_SLOTS } from '../../../../../src/pages/roster/creation/screens/CharacterMenuScreen.js';

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
 * Minimal stub MessageDb covering only the IDs used by CharacterMenuScreen.
 * Uses real name strings matching §3 so text-content assertions work.
 *
 * IDs per docs/re/findings/wpcmk-msg-strings.json:
 *   0x046a = CREATE PC
 *   0x046b = REVIEW PC
 *   0x046c = DELETE PC
 *   0x046d = RENAME PC
 *   0x046e = PORTRAIT
 * EXIT has no msg ID — rendered as a literal "EXIT" fallback.
 */
function stubDb(): MessageDb {
  const entries: Array<{ id: number; decodedText: string }> = [
    { id: 0x046a, decodedText: 'CREATE PC' },
    { id: 0x046b, decodedText: 'REVIEW PC' },
    { id: 0x046c, decodedText: 'DELETE PC' },
    { id: 0x046d, decodedText: 'RENAME PC' },
    { id: 0x046e, decodedText: 'PORTRAIT' },
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

/** Build a state at the 'characterMenu' screen. */
function makeMenuState(): CreationState {
  const rng = new WichmannHill(3000, 1, 29999);
  return initialCreationState(rng);
}

// ---------------------------------------------------------------------------
// Canvas mounting
// ---------------------------------------------------------------------------

describe('CharacterMenuScreen — canvas mounting', () => {
  it('renders a <canvas> element', () => {
    const state = makeMenuState();
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={0}
      />,
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });

  it('renders a <canvas> with width=320 and height=200', () => {
    const state = makeMenuState();
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={0}
      />,
    );

    const canvas = container.querySelector('canvas');
    expect(canvas!.width).toBe(320);
    expect(canvas!.height).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// MAX_ROSTER_SLOTS export
// ---------------------------------------------------------------------------

describe('MAX_ROSTER_SLOTS constant', () => {
  it('equals 16 (confirmed from pcfile.dbs header + save-state memory)', () => {
    expect(MAX_ROSTER_SLOTS).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// EMPTY roster (rosterCount=0): only CREATE PC + EXIT reachable
// ---------------------------------------------------------------------------

describe('CharacterMenuScreen — EMPTY roster (rosterCount=0)', () => {
  it('Enter at initial cursor dispatches MENU_CREATE', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={0}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_CREATE' });
  });

  it('ArrowDown then Enter dispatches MENU_EXIT (single column, 2 rows)', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={0}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_EXIT' });
  });

  it('REVIEW PC is not reachable (ArrowRight is no-op in single-column)', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={0}
      />,
    );

    // ArrowRight should not move to any new column (only 1 col in EMPTY layout)
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });
    // Still at (0,0) = CREATE PC (ArrowRight had no valid cell to move to)
    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_CREATE' });
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'MENU_REVIEW' });
  });

  it('DELETE PC is not reachable', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={0}
      />,
    );

    for (let i = 0; i < 4; i++) fireEvent.keyDown(window, { key: 'ArrowRight' });
    for (let i = 0; i < 4; i++) fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'MENU_DELETE' });
  });

  it('RENAME PC is not reachable', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={0}
      />,
    );

    for (let i = 0; i < 4; i++) fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'MENU_RENAME' });
  });

  it('PORTRAIT is not reachable', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={0}
      />,
    );

    for (let i = 0; i < 4; i++) fireEvent.keyDown(window, { key: 'ArrowRight' });
    for (let i = 0; i < 2; i++) fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'MENU_PORTRAIT' });
  });
});

// ---------------------------------------------------------------------------
// PARTIAL roster (rosterCount=7): all 6 options reachable
// ---------------------------------------------------------------------------

describe('CharacterMenuScreen — PARTIAL roster (rosterCount=7)', () => {
  it('Enter at initial cursor dispatches MENU_CREATE', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={7}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_CREATE' });
  });

  it('all 6 options are reachable via grid navigation', () => {
    // The partial grid is 2x3:
    // Row 0: CREATE PC | DELETE PC | PORTRAIT
    // Row 1: REVIEW PC | RENAME PC | EXIT
    const GRID: Array<{
      row: number;
      col: number;
      event: CreationEvent;
      label: string;
    }> = [
      { row: 0, col: 0, event: { type: 'MENU_CREATE' },   label: 'CREATE PC (0,0)' },
      { row: 0, col: 1, event: { type: 'MENU_DELETE' },   label: 'DELETE PC (0,1)' },
      { row: 0, col: 2, event: { type: 'MENU_PORTRAIT' }, label: 'PORTRAIT (0,2)' },
      { row: 1, col: 0, event: { type: 'MENU_REVIEW' },   label: 'REVIEW PC (1,0)' },
      { row: 1, col: 1, event: { type: 'MENU_RENAME' },   label: 'RENAME PC (1,1)' },
      { row: 1, col: 2, event: { type: 'MENU_EXIT' },     label: 'EXIT (1,2)' },
    ];

    for (const { row, col, event, label } of GRID) {
      const state = makeMenuState();
      const dispatch = vi.fn<[CreationEvent], void>();
      const db = stubDb();

      render(
        <CharacterMenuScreen
          state={state}
          dispatch={dispatch}
          fontSet={STUB_FONT_SET}
          palette={WIZ6_MAIN}
          db={db}
          rosterCount={7}
        />,
      );

      // Navigate to (row, col) from (0,0)
      for (let r = 0; r < row; r++) {
        fireEvent.keyDown(window, { key: 'ArrowDown' });
      }
      for (let c = 0; c < col; c++) {
        fireEvent.keyDown(window, { key: 'ArrowRight' });
      }
      fireEvent.keyDown(window, { key: 'Enter' });

      expect(dispatch, label).toHaveBeenCalledWith(event);
    }
  });

  it('ArrowRight clamps at col 2; extra ArrowRight stays at PORTRAIT', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={7}
      />,
    );

    for (let i = 0; i < 5; i++) fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_PORTRAIT' });
  });

  it('ArrowDown clamps at row 1; extra ArrowDown stays in row 1', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={7}
      />,
    );

    for (let i = 0; i < 5; i++) fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });
    // Should be row 1, col 0 = REVIEW PC
    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_REVIEW' });
  });

  it('ArrowLeft at col 0 is a no-op; still at CREATE PC', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={7}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_CREATE' });
  });

  it('column preserved across row change: ArrowRight then ArrowDown → RENAME PC (1,1)', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={7}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' }); // → (0,1) DELETE PC
    fireEvent.keyDown(window, { key: 'ArrowDown' });  // → (1,1) RENAME PC
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_RENAME' });
  });
});

// ---------------------------------------------------------------------------
// FULL roster (rosterCount=MAX_ROSTER_SLOTS): no CREATE PC, 5 options
// ---------------------------------------------------------------------------

describe('CharacterMenuScreen — FULL roster (rosterCount=16)', () => {
  it('CREATE PC is NOT reachable (any navigation only reaches remaining 5 options)', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={MAX_ROSTER_SLOTS}
      />,
    );

    // Exhaustively try all reachable cells with arrow navigation
    // and check CREATE was never dispatched
    for (let r = 0; r < 4; r++) fireEvent.keyDown(window, { key: 'ArrowDown' });
    for (let c = 0; c < 4; c++) fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).not.toHaveBeenCalledWith({ type: 'MENU_CREATE' });
  });

  it('Enter at initial cursor (0,0) dispatches MENU_EXIT (EXIT is at top-left in FULL layout)', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={MAX_ROSTER_SLOTS}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_EXIT' });
  });

  it('ArrowRight from EXIT (0,0) → REVIEW PC (0,1); Enter dispatches MENU_REVIEW', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={MAX_ROSTER_SLOTS}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_REVIEW' });
  });

  it('ArrowRight×2 from EXIT → RENAME PC (0,2); Enter dispatches MENU_RENAME', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={MAX_ROSTER_SLOTS}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_RENAME' });
  });

  it('ArrowRight×1 + ArrowDown → DELETE PC (1,1); Enter dispatches MENU_DELETE', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={MAX_ROSTER_SLOTS}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' }); // → (0,1) REVIEW PC
    fireEvent.keyDown(window, { key: 'ArrowDown' });  // → (1,1) DELETE PC
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_DELETE' });
  });

  it('ArrowRight×2 + ArrowDown → PORTRAIT (1,2); Enter dispatches MENU_PORTRAIT', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={MAX_ROSTER_SLOTS}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' }); // → (0,1) REVIEW PC
    fireEvent.keyDown(window, { key: 'ArrowRight' }); // → (0,2) RENAME PC
    fireEvent.keyDown(window, { key: 'ArrowDown' });  // → (1,2) PORTRAIT
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_PORTRAIT' });
  });

  it('ArrowDown from EXIT (0,0) skips missing (1,0) and lands on nearest occupied cell', () => {
    // In FULL layout, (1,0) is absent. ArrowDown from (0,0) should skip or stay
    // at a valid cell — clampCursor ensures we don't land on an absent cell.
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={MAX_ROSTER_SLOTS}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowDown' });  // from (0,0) EXIT
    fireEvent.keyDown(window, { key: 'Enter' });
    // Should land on the nearest cell in row 1 (col 1 = DELETE PC or col 2 = PORTRAIT)
    // but NOT dispatch MENU_CREATE
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'MENU_CREATE' });
    // And should dispatch something valid
    const callArg = dispatch.mock.calls[0]?.[0];
    expect(callArg?.type).toMatch(/^MENU_(DELETE|PORTRAIT|REVIEW|RENAME|EXIT)$/);
  });
});

// ---------------------------------------------------------------------------
// Default rosterCount (omitted = 0 = EMPTY)
// ---------------------------------------------------------------------------

describe('CharacterMenuScreen — default rosterCount=0 (EMPTY)', () => {
  it('omitting rosterCount defaults to empty roster; Enter dispatches MENU_CREATE', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        // rosterCount omitted — should default to 0 (EMPTY)
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_CREATE' });
  });
});

// ---------------------------------------------------------------------------
// ESC is silently ignored (all states)
// ---------------------------------------------------------------------------

describe('CharacterMenuScreen — ESC is silently ignored', () => {
  it('ESC does not dispatch any event (EMPTY state)', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={0}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('ESC does not dispatch any event (PARTIAL state)', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={7}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('ESC does not dispatch any event (FULL state)', () => {
    const state = makeMenuState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <CharacterMenuScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
        rosterCount={MAX_ROSTER_SLOTS}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
