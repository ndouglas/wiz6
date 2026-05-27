// packages/viewer/tests/pages/roster/creation/screens/CharacterMenuScreen.test.tsx
//
// RTL tests for CharacterMenuScreen — the 6-option entry menu rendered over
// window chrome matching the 2-row × 3-column layout:
//   Row 0: CREATE PC  |  DELETE PC  |  PORTRAIT
//   Row 1: REVIEW PC  |  RENAME PC  |  EXIT
//
// Grid navigation: ArrowLeft/Right change col (clamp, no wrap);
//                  ArrowUp/Down change row (clamp, no wrap).
// Enter at cursor dispatches the matching event.
//
// jsdom canvas is non-functional — we assert on dispatch behavior and
// canvas mounting, not pixels.
//
// Spec: docs/re/wpcmk-screens.md §7 (grid nav), §8 (key model).

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { WIZ6_MAIN } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../../../../../src/pages/roster/creation/state.js';
import { initialCreationState } from '../../../../../src/pages/roster/creation/state.js';
import { WichmannHill } from '@wiz6/data';
import { CharacterMenuScreen } from '../../../../../src/pages/roster/creation/screens/CharacterMenuScreen.js';

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
      />,
    );

    const canvas = container.querySelector('canvas');
    expect(canvas!.width).toBe(320);
    expect(canvas!.height).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Default cursor: Enter at top-left (CREATE PC) dispatches MENU_CREATE
// ---------------------------------------------------------------------------

describe('CharacterMenuScreen — initial cursor on CREATE PC', () => {
  it('Enter at initial cursor position dispatches MENU_CREATE', () => {
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
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_CREATE' });
  });
});

// ---------------------------------------------------------------------------
// Grid navigation — row 0 (CREATE PC, DELETE PC, PORTRAIT)
// ---------------------------------------------------------------------------

describe('CharacterMenuScreen — row 0 navigation', () => {
  it('ArrowRight from CREATE PC (0,0) → DELETE PC (0,1); Enter dispatches MENU_DELETE', () => {
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
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_DELETE' });
  });

  it('ArrowRight×2 from CREATE PC → PORTRAIT (0,2); Enter dispatches MENU_PORTRAIT', () => {
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
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_PORTRAIT' });
  });

  it('ArrowRight clamps at rightmost column (col=2); extra ArrowRight stays at PORTRAIT', () => {
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
      />,
    );

    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    }
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_PORTRAIT' });
  });

  it('ArrowLeft at leftmost column (col=0) is a no-op; still dispatches MENU_CREATE', () => {
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
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_CREATE' });
  });
});

// ---------------------------------------------------------------------------
// Grid navigation — row 1 (REVIEW PC, RENAME PC, EXIT)
// ---------------------------------------------------------------------------

describe('CharacterMenuScreen — row 1 navigation', () => {
  it('ArrowDown from CREATE PC → REVIEW PC (1,0); Enter dispatches MENU_REVIEW', () => {
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
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_REVIEW' });
  });

  it('ArrowDown + ArrowRight → RENAME PC (1,1); Enter dispatches MENU_RENAME', () => {
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
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_RENAME' });
  });

  it('ArrowDown + ArrowRight×2 → EXIT (1,2); Enter dispatches MENU_EXIT', () => {
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
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_EXIT' });
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
      />,
    );

    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    }
    fireEvent.keyDown(window, { key: 'Enter' });

    // Should be in row 1, col 0 = REVIEW PC
    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_REVIEW' });
  });

  it('ArrowUp from row 1 returns to row 0; Enter dispatches row 0 option', () => {
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
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowDown' }); // → (1,0) REVIEW PC
    fireEvent.keyDown(window, { key: 'ArrowUp' });   // → (0,0) CREATE PC
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_CREATE' });
  });
});

// ---------------------------------------------------------------------------
// Column preserved across row changes
// ---------------------------------------------------------------------------

describe('CharacterMenuScreen — column preserved across row changes', () => {
  it('ArrowRight then ArrowDown preserves col → RENAME PC (1,1)', () => {
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
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' }); // → (0,1) DELETE PC
    fireEvent.keyDown(window, { key: 'ArrowDown' });  // → (1,1) RENAME PC
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_RENAME' });
  });

  it('ArrowRight×2 then ArrowDown preserves col → EXIT (1,2)', () => {
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
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' }); // → (0,1)
    fireEvent.keyDown(window, { key: 'ArrowRight' }); // → (0,2) PORTRAIT
    fireEvent.keyDown(window, { key: 'ArrowDown' });  // → (1,2) EXIT
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'MENU_EXIT' });
  });
});

// ---------------------------------------------------------------------------
// ESC is silently ignored
// ---------------------------------------------------------------------------

describe('CharacterMenuScreen — ESC is silently ignored', () => {
  it('ESC does not dispatch any event', () => {
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
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(dispatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// All 6 options — verify each dispatches its correct event via exhaustive nav
// ---------------------------------------------------------------------------

describe('CharacterMenuScreen — all 6 options dispatch correct events', () => {
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
    it(`${label} dispatches ${event.type}`, () => {
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

      expect(dispatch).toHaveBeenCalledWith(event);
    });
  }
});
