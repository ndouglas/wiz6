// packages/viewer/tests/pages/roster/creation/screens/PortraitPickerScreen.test.tsx
//
// RTL tests for PortraitPickerScreen (screen-10).
//
// Screen-10 behaviour per docs/re/wpcmk-screens.md §6:
//   - 42 portraits total (0..41), NO race/sex/class filter.
//   - ArrowLeft  (key 1) cycles left:  (idx + 41) % 42  (wraps 0 → 41)
//   - ArrowRight (key 3) cycles right: (idx + 1)  % 42  (wraps 41 → 0)
//   - Enter      (key 5) → dispatch PICK_PORTRAIT { index }
//   - ArrowUp / ArrowDown are no-ops (§6 only defines Left/Right/Return).
//   - Default starting index is 0 (per §6 "new-character default = portrait 0").
//   - Labels: MSG 0x0458 "↑↓ TO REVIEW PORTRAITS", MSG 0x0459 "PRESS ► TO SELECT".
//   - Renders a <canvas> (CreationCanvas).
//
// Spec: docs/re/wpcmk-screens.md §6, §8

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { WIZ6_MAIN } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../../../../../src/pages/roster/creation/state.js';
import { initialCreationState } from '../../../../../src/pages/roster/creation/state.js';
import { WichmannHill } from '@wiz6/data';
import { PortraitPickerScreen } from '../../../../../src/pages/roster/creation/screens/PortraitPickerScreen.js';

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
 * Minimal stub MessageDb covering the IDs used by PortraitPickerScreen (§3):
 *   0x0458 = "↑↓ TO REVIEW PORTRAITS"
 *   0x0459 = "PRESS ► TO SELECT"
 */
function stubDb(): MessageDb {
  const entries: Array<{ id: number; decodedText: string }> = [
    { id: 0x0458, decodedText: '\x11\x12 TO REVIEW PORTRAITS' },
    { id: 0x0459, decodedText: 'PRESS \x15 TO SELECT' },
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
// Helper: build a state at the 'portrait' screen
// ---------------------------------------------------------------------------

function makePortraitState(): CreationState {
  const rng = new WichmannHill(3000, 1, 29999);
  const s = initialCreationState(rng);

  return {
    ...s,
    screen: 'portrait',
    draft: {
      ...s.draft,
      name: 'TESTCHAR',
      race: 0,
      sex: 0,
      class: 0,
      attributes: {
        str: 8, int: 8, pie: 8, vit: 8, dex: 8, spd: 8, per: 8,
        kar: 5,
      },
      bonusPool: 0,
      portrait: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// PortraitPickerScreen — canvas mounting
// ---------------------------------------------------------------------------

describe('PortraitPickerScreen — canvas mounting', () => {
  it('renders a <canvas> element', () => {
    const state = makePortraitState();
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <PortraitPickerScreen
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
    const state = makePortraitState();
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <PortraitPickerScreen
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
// Default index is 0 + Enter dispatches PICK_PORTRAIT { index: 0 }
// ---------------------------------------------------------------------------

describe('PortraitPickerScreen — Enter at default index dispatches PICK_PORTRAIT {index:0}', () => {
  it('Enter at start dispatches PICK_PORTRAIT with index 0', () => {
    const state = makePortraitState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <PortraitPickerScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_PORTRAIT', index: 0 });
  });
});

// ---------------------------------------------------------------------------
// ArrowRight cycles forward, then Enter dispatches with new index
// ---------------------------------------------------------------------------

describe('PortraitPickerScreen — ArrowRight cycles forward', () => {
  it('ArrowRight then Enter dispatches PICK_PORTRAIT {index:1}', () => {
    const state = makePortraitState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <PortraitPickerScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_PORTRAIT', index: 1 });
  });

  it('ArrowRight twice then Enter dispatches PICK_PORTRAIT {index:2}', () => {
    const state = makePortraitState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <PortraitPickerScreen
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

    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_PORTRAIT', index: 2 });
  });
});

// ---------------------------------------------------------------------------
// ArrowLeft wraps from 0 to 41
// ---------------------------------------------------------------------------

describe('PortraitPickerScreen — ArrowLeft wraps from 0 to 41', () => {
  it('ArrowLeft from index 0 wraps to index 41', () => {
    const state = makePortraitState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <PortraitPickerScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_PORTRAIT', index: 41 });
  });
});

// ---------------------------------------------------------------------------
// ArrowRight wraps from 41 to 0
// ---------------------------------------------------------------------------

describe('PortraitPickerScreen — ArrowRight wraps from 41 to 0', () => {
  it('41 ArrowRight presses wraps back to index 0', () => {
    const state = makePortraitState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <PortraitPickerScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // 42 ArrowRight presses from index 0 wraps back to 0
    for (let i = 0; i < 42; i++) {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    }
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_PORTRAIT', index: 0 });
  });
});

// ---------------------------------------------------------------------------
// ArrowUp / ArrowDown are no-ops (§6 only defines Left/Right/Return)
// ---------------------------------------------------------------------------

describe('PortraitPickerScreen — ArrowUp/ArrowDown do not change index', () => {
  it('ArrowUp then Enter still dispatches index 0', () => {
    const state = makePortraitState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <PortraitPickerScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_PORTRAIT', index: 0 });
  });

  it('ArrowDown then Enter still dispatches index 0', () => {
    const state = makePortraitState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <PortraitPickerScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_PORTRAIT', index: 0 });
  });
});

// ---------------------------------------------------------------------------
// Escape does not dispatch
// ---------------------------------------------------------------------------

describe('PortraitPickerScreen — Escape does not dispatch', () => {
  it('Escape does not dispatch any event', () => {
    const state = makePortraitState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <PortraitPickerScreen
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
