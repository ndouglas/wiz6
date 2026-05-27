// packages/viewer/tests/pages/roster/creation/screens/PersonalityScreen.test.tsx
//
// RTL tests for PersonalityScreen (screen-08).
//
// Screen-08 behaviour per docs/re/wpcmk-screens.md §1/§3:
//   - Display "CASTING KARMA - PRESS \x15" label (MSG 0x0457) in bottomBar.
//   - Wait for RETURN (Enter) → dispatch ACCEPT_PERSONALITY.
//   - All other keys are no-ops (engine uses CR-only path; §8 note).
//   - The karma value lives in state.draft.attributes.kar (rolled by the reducer
//     on ACCEPT_PERSONALITY, so pre-roll it may be 0 — that's fine).
//
// Enforcement: the reducer owns the actual karma roll.
// The screen only dispatches ACCEPT_PERSONALITY on Enter.
//
// Spec: docs/re/wpcmk-screens.md §1, §3, §8

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { WIZ6_MAIN } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../../../../../src/pages/roster/creation/state.js';
import { initialCreationState } from '../../../../../src/pages/roster/creation/state.js';
import { WichmannHill } from '@wiz6/data';
import { PersonalityScreen } from '../../../../../src/pages/roster/creation/screens/PersonalityScreen.js';

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
 * Minimal stub MessageDb covering the IDs used by PersonalityScreen (§3):
 *   0x0457 = "CASTING KARMA - PRESS ►" (the exact display text from msg.dbs)
 */
function stubDb(): MessageDb {
  const entries: Array<{ id: number; decodedText: string }> = [
    { id: 0x0457, decodedText: 'CASTING KARMA - PRESS \x15' },
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
// Helper: build a state at the 'personality' screen
// ---------------------------------------------------------------------------

/**
 * Build a state at the 'personality' screen.
 * The karma value in attributes.kar starts at 0 (not yet rolled — rolling fires
 * only when the reducer handles ACCEPT_PERSONALITY).
 */
function makePersonalityState(karOverride = 0): CreationState {
  const rng = new WichmannHill(3000, 1, 29999);
  const s = initialCreationState(rng);

  return {
    ...s,
    screen: 'personality',
    draft: {
      ...s.draft,
      name: 'TESTCHAR',
      race: 0,
      sex: 0,
      class: 0,
      attributes: {
        str: 8, int: 8, pie: 8, vit: 8, dex: 8, spd: 8, per: 8,
        kar: karOverride,
      },
      bonusPool: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// PersonalityScreen — canvas mounting
// ---------------------------------------------------------------------------

describe('PersonalityScreen — canvas mounting', () => {
  it('renders a <canvas> element', () => {
    const state = makePersonalityState();
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <PersonalityScreen
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
    const state = makePersonalityState();
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <PersonalityScreen
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
// Enter → ACCEPT_PERSONALITY
// ---------------------------------------------------------------------------

describe('PersonalityScreen — Enter dispatches ACCEPT_PERSONALITY', () => {
  it('Enter dispatches ACCEPT_PERSONALITY', () => {
    const state = makePersonalityState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <PersonalityScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ACCEPT_PERSONALITY' });
  });

  it('Enter dispatches ACCEPT_PERSONALITY regardless of current kar value', () => {
    // Even with a non-zero kar (e.g. previously rolled / test-injected value),
    // Enter should always dispatch ACCEPT_PERSONALITY — the reducer re-rolls.
    const state = makePersonalityState(12);
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <PersonalityScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'ACCEPT_PERSONALITY' });
  });
});

// ---------------------------------------------------------------------------
// Non-Enter keys are no-ops
// ---------------------------------------------------------------------------

describe('PersonalityScreen — non-Enter keys do not dispatch', () => {
  it('ArrowUp does not dispatch', () => {
    const state = makePersonalityState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <PersonalityScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowUp' });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('ArrowDown does not dispatch', () => {
    const state = makePersonalityState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <PersonalityScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowDown' });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('Escape does not dispatch', () => {
    const state = makePersonalityState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <PersonalityScreen
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

  it('random key does not dispatch', () => {
    const state = makePersonalityState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <PersonalityScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'Space' });

    expect(dispatch).not.toHaveBeenCalled();
  });
});
