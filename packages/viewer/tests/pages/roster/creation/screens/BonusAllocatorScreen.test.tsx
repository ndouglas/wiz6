// packages/viewer/tests/pages/roster/creation/screens/BonusAllocatorScreen.test.tsx
//
// RTL tests for BonusAllocatorScreen (screen-06).
//
// §4 key model:
//   ArrowLeft  (code 1) → ALLOC_ADJUST {attr:cursor, delta:-1}
//   ArrowUp    (code 2) → cursor = cursor<=0 ? 6 : cursor-1  (wraps)
//   ArrowRight (code 3) → ALLOC_ADJUST {attr:cursor, delta:+1}
//   ArrowDown  (code 4) → cursor = cursor>=6 ? 0 : cursor+1  (wraps)
//   Enter      (code 5) → ALLOC_CONFIRM
//
// Enforcement: reducer owns cap (18) / floor (race base) / pool (>0) guards.
// The screen simply dispatches; it must NOT double-enforce.
//
// Spec: docs/re/wpcmk-screens.md §4, §8

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { WIZ6_MAIN } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../../../../../src/pages/roster/creation/state.js';
import { initialCreationState } from '../../../../../src/pages/roster/creation/state.js';
import { WichmannHill } from '@wiz6/data';
import { BonusAllocatorScreen } from '../../../../../src/pages/roster/creation/screens/BonusAllocatorScreen.js';

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
 * Minimal stub MessageDb covering the IDs used by BonusAllocatorScreen (§3):
 *   0x0460 = "ASSIGN ABILITY SCORE BONUS"
 *   0x0454 = "↑↓ ADJUSTS ABILITY"
 *   0x0455 = "←→ SELECTS ABILITY"
 *   0x0453 = "BONUS"
 */
function stubDb(): MessageDb {
  const entries: Array<{ id: number; decodedText: string }> = [
    { id: 0x0460, decodedText: 'ASSIGN ABILITY SCORE BONUS' },
    { id: 0x0454, decodedText: '↑↓ ADJUSTS ABILITY' },
    { id: 0x0455, decodedText: '←→ SELECTS ABILITY' },
    { id: 0x0453, decodedText: 'BONUS' },
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
// Helper: build a state at the 'bonusAllocator' screen with a known pool
// ---------------------------------------------------------------------------

/**
 * Build a state at the 'bonusAllocator' screen.
 * Race = 0 (Human), class = 0 (Fighter).
 * Attributes seeded with Human base stats + extra per the test needs.
 * bonusPool = 5 by default (lowest possible, so we have points to spend).
 */
function makeBonusState(bonusPool = 5): CreationState {
  const rng = new WichmannHill(3000, 1, 29999);
  const s = initialCreationState(rng);

  // Human base stats (race index 0) — str/int/pie/vit/dex/spd/per all 8
  const attrs = { str: 8, int: 8, pie: 8, vit: 8, dex: 8, spd: 8, per: 8, kar: 0 };

  return {
    ...s,
    screen: 'bonusAllocator',
    draft: {
      ...s.draft,
      name: 'TEST',
      race: 0,
      sex: 0,
      class: 0, // Fighter
      attributes: attrs,
      bonusPool,
    },
    // undo counters start at 0 (no points spent yet)
    scratch: { undo: new Array(7).fill(0) as number[] },
  };
}

/** Build a state with bonusPool=0 (all points spent — confirm should be allowed). */
function makeFullyAllocatedState(): CreationState {
  return makeBonusState(0);
}

// ---------------------------------------------------------------------------
// BonusAllocatorScreen — canvas mounting
// ---------------------------------------------------------------------------

describe('BonusAllocatorScreen — canvas mounting', () => {
  it('renders a <canvas> element', () => {
    const state = makeBonusState();
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <BonusAllocatorScreen
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
    const state = makeBonusState();
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <BonusAllocatorScreen
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
// ArrowRight → ALLOC_ADJUST {attr:0, delta:+1} (increase STR — cursor starts at 0)
// ---------------------------------------------------------------------------

describe('BonusAllocatorScreen — ArrowRight increases current attr', () => {
  it('ArrowRight dispatches ALLOC_ADJUST {attr:0, delta:+1} when cursor is at STR (0)', () => {
    const state = makeBonusState(5);
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <BonusAllocatorScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ALLOC_ADJUST', attr: 0, delta: 1 });
  });
});

// ---------------------------------------------------------------------------
// ArrowLeft → ALLOC_ADJUST {attr:0, delta:-1} (decrease STR — cursor starts at 0)
// ---------------------------------------------------------------------------

describe('BonusAllocatorScreen — ArrowLeft decreases current attr', () => {
  it('ArrowLeft dispatches ALLOC_ADJUST {attr:0, delta:-1} when cursor is at STR (0)', () => {
    const state = makeBonusState(5);
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <BonusAllocatorScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowLeft' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ALLOC_ADJUST', attr: 0, delta: -1 });
  });
});

// ---------------------------------------------------------------------------
// ArrowDown → moves cursor to next attr (wraps 6→0)
// ---------------------------------------------------------------------------

describe('BonusAllocatorScreen — ArrowDown moves cursor', () => {
  it('ArrowDown then ArrowRight dispatches ALLOC_ADJUST {attr:1, delta:+1} (INT after one Down)', () => {
    const state = makeBonusState(5);
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <BonusAllocatorScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Move cursor to INT (index 1)
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    // Now ArrowRight should target INT (attr=1)
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ALLOC_ADJUST', attr: 1, delta: 1 });
  });

  it('ArrowDown 6 times then ArrowDown wraps cursor from PER (6) back to STR (0)', () => {
    const state = makeBonusState(5);
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <BonusAllocatorScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Move to PER (index 6) — requires 6 downs from STR (index 0)
    for (let i = 0; i < 6; i++) {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    }
    // One more wraps to 0 (STR)
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    // ArrowRight should now target attr 0 (STR)
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ALLOC_ADJUST', attr: 0, delta: 1 });
  });
});

// ---------------------------------------------------------------------------
// ArrowUp → moves cursor to prev attr (wraps 0→6)
// ---------------------------------------------------------------------------

describe('BonusAllocatorScreen — ArrowUp moves cursor', () => {
  it('ArrowUp from STR (0) wraps cursor to PER (6)', () => {
    const state = makeBonusState(5);
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <BonusAllocatorScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Cursor starts at 0 (STR). ArrowUp should wrap to 6 (PER).
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    // ArrowRight should now target attr 6 (PER)
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ALLOC_ADJUST', attr: 6, delta: 1 });
  });

  it('ArrowDown then ArrowUp returns to STR (0)', () => {
    const state = makeBonusState(5);
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <BonusAllocatorScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Move to INT (1), then back to STR (0)
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    // ArrowRight should now target attr 0 (STR)
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ALLOC_ADJUST', attr: 0, delta: 1 });
  });
});

// ---------------------------------------------------------------------------
// Enter → ALLOC_CONFIRM
// ---------------------------------------------------------------------------

describe('BonusAllocatorScreen — Enter dispatches ALLOC_CONFIRM', () => {
  it('Enter dispatches ALLOC_CONFIRM (reducer guards pool check)', () => {
    // State with bonusPool=0 so the reducer actually accepts the confirm.
    // (But the screen dispatches regardless — the reducer gates it.)
    const state = makeFullyAllocatedState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <BonusAllocatorScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ALLOC_CONFIRM' });
  });

  it('Enter dispatches ALLOC_CONFIRM even when pool > 0 (reducer will no-op it)', () => {
    // The screen should dispatch unconditionally and let the reducer gate.
    const state = makeBonusState(5); // pool=5, reducer will no-op the confirm
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <BonusAllocatorScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ALLOC_CONFIRM' });
  });
});

// ---------------------------------------------------------------------------
// Navigation sequences
// ---------------------------------------------------------------------------

describe('BonusAllocatorScreen — multi-step navigation', () => {
  it('navigates to VIT (3) and increases it', () => {
    const state = makeBonusState(5);
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <BonusAllocatorScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // STR(0) → INT(1) → PIE(2) → VIT(3)
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    // Increase VIT
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ALLOC_ADJUST', attr: 3, delta: 1 });
  });

  it('navigates up from VIT (3) to STR (0)', () => {
    const state = makeBonusState(5);
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <BonusAllocatorScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Move to VIT (3)
    for (let i = 0; i < 3; i++) {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    }
    // Now move back up to STR (0)
    for (let i = 0; i < 3; i++) {
      fireEvent.keyDown(window, { key: 'ArrowUp' });
    }
    // Increase STR
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ALLOC_ADJUST', attr: 0, delta: 1 });
  });
});

// ---------------------------------------------------------------------------
// ESC is silently ignored
// ---------------------------------------------------------------------------

describe('BonusAllocatorScreen — ESC is silently ignored', () => {
  it('ESC does not dispatch any event', () => {
    const state = makeBonusState(5);
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <BonusAllocatorScreen
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
