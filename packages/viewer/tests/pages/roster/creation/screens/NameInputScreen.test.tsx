// packages/viewer/tests/pages/roster/creation/screens/NameInputScreen.test.tsx
//
// RTL tests for NameInputScreen — screen-00 name entry.
//
// Name entry is raw-key text input (NOT the §8 arrow model):
//   - Printable ASCII appends to buffer (capped at NAME_MAX_LENGTH = 7)
//   - Backspace removes last character
//   - Enter with non-empty buffer dispatches SET_NAME { name }
//   - Enter on empty buffer does nothing (no dispatch)
//   - Escape does nothing (no dispatch)
//
// jsdom canvas is non-functional — we assert dispatch behavior and
// canvas mounting, not pixels.
//
// Spec: docs/re/wpcmk-screens.md §1 (screen-00), CharacterSchema name max=7.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { WIZ6_MAIN } from '@wiz6/data';
import { WichmannHill } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { Character } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../../../../../src/pages/roster/creation/state.js';
import { initialCreationState } from '../../../../../src/pages/roster/creation/state.js';
import { NameInputScreen } from '../../../../../src/pages/roster/creation/screens/NameInputScreen.js';
import { writeRoster } from '../../../../../src/lib/roster-store.js';
import * as audio from '../../../../../src/lib/audio.js';

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
 * Minimal stub MessageDb covering only the IDs used by NameInputScreen.
 */
function stubDb(): MessageDb {
  const entries: Array<{ id: number; decodedText: string }> = [
    // screen-00: "CHARACTER NAME >"
    { id: 0x044c, decodedText: 'CHARACTER NAME >' },
    // screen-00: "* CHARACTER ALREADY EXISTS *"
    { id: 0x044e, decodedText: '* CHARACTER ALREADY EXISTS *' },
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
// Helper: build a state at the 'name' screen
// ---------------------------------------------------------------------------

function makeNameState(): CreationState {
  const rng = new WichmannHill(3000, 1, 29999);
  return initialCreationState(rng);
}

// ---------------------------------------------------------------------------
// Test fixtures for dup-name modal tests
// ---------------------------------------------------------------------------

function makeCharacter(id: string, name: string, level = 1): Character {
  return {
    id, name, race: 0, class: 0, sex: 0, level, xp: 0, gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0) as number[],
    savedOldLevel: 0, reaction: 0,
  };
}

const ID_A = '550e8400-e29b-41d4-a716-446655440000';

// ---------------------------------------------------------------------------
// Canvas mounting
// ---------------------------------------------------------------------------

describe('NameInputScreen — canvas mounting', () => {
  it('renders a <canvas> element', () => {
    const state = makeNameState();
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <NameInputScreen
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
    const state = makeNameState();
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <NameInputScreen
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
// Typing "NUG" then Enter dispatches SET_NAME { name: 'NUG' }
// ---------------------------------------------------------------------------

describe('NameInputScreen — typing and confirm', () => {
  it('typing "NUG" then Enter dispatches SET_NAME with name "NUG"', () => {
    const state = makeNameState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <NameInputScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'N' });
    fireEvent.keyDown(window, { key: 'U' });
    fireEvent.keyDown(window, { key: 'G' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_NAME', name: 'NUG' });
  });

  it('typing a single character and Enter dispatches SET_NAME', () => {
    const state = makeNameState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <NameInputScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'A' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_NAME', name: 'A' });
  });
});

// ---------------------------------------------------------------------------
// Enter on empty buffer does NOT dispatch SET_NAME
// ---------------------------------------------------------------------------

describe('NameInputScreen — empty Enter does nothing', () => {
  it('Enter on empty buffer does not dispatch SET_NAME', () => {
    const state = makeNameState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <NameInputScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('typing then deleting all chars, then Enter does not dispatch', () => {
    const state = makeNameState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <NameInputScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'A' });
    fireEvent.keyDown(window, { key: 'Backspace' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Backspace editing
// ---------------------------------------------------------------------------

describe('NameInputScreen — Backspace editing', () => {
  it('Backspace removes the last typed character', () => {
    const state = makeNameState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <NameInputScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Type "AB", backspace to get "A", then Enter → "A"
    fireEvent.keyDown(window, { key: 'A' });
    fireEvent.keyDown(window, { key: 'B' });
    fireEvent.keyDown(window, { key: 'Backspace' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_NAME', name: 'A' });
  });

  it('Backspace on empty buffer does nothing (no crash)', () => {
    const state = makeNameState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <NameInputScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Backspace on empty — should not throw
    fireEvent.keyDown(window, { key: 'Backspace' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Input is length-capped at NAME_MAX_LENGTH = 7
// ---------------------------------------------------------------------------

describe('NameInputScreen — name length cap (max 7)', () => {
  it('does not accept more than 7 characters', () => {
    const state = makeNameState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <NameInputScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Type 10 characters — only first 7 should be kept
    'ABCDEFGHIJ'.split('').forEach((ch) => {
      fireEvent.keyDown(window, { key: ch });
    });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_NAME', name: 'ABCDEFG' });
  });

  it('accepts exactly 7 characters', () => {
    const state = makeNameState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <NameInputScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    'ABCDEFG'.split('').forEach((ch) => {
      fireEvent.keyDown(window, { key: ch });
    });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_NAME', name: 'ABCDEFG' });
  });
});

// ---------------------------------------------------------------------------
// Escape does nothing
// ---------------------------------------------------------------------------

describe('NameInputScreen — Escape does nothing', () => {
  it('Escape does not dispatch any event', () => {
    const state = makeNameState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <NameInputScreen
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

  it('Escape after typing does not dispatch', () => {
    const state = makeNameState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <NameInputScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'A' });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(dispatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Non-printable / special keys are ignored
// ---------------------------------------------------------------------------

describe('NameInputScreen — non-printable keys are ignored', () => {
  it('ArrowUp does not append to buffer', () => {
    const state = makeNameState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <NameInputScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'Enter' });

    // Buffer was empty — no dispatch
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('Tab does not append to buffer', () => {
    const state = makeNameState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <NameInputScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'Tab' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Dup-name modal
// ---------------------------------------------------------------------------

describe('dup-name modal', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(audio, 'playInvalidActionBeep').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the modal (dispatches SHOW_DUP_NAME_MODAL) on Enter with duplicate name', () => {
    writeRoster({ schemaVersion: 1, characters: [makeCharacter(ID_A, 'NATHAN')] });
    const dispatch = vi.fn();
    const state = { ...initialCreationState(new WichmannHill(3000, 1, 29999)), screen: 'name' as const };
    render(
      <NameInputScreen
        state={state} dispatch={dispatch}
        fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()}
      />,
    );
    for (const ch of 'NATHAN') {
      fireEvent.keyDown(window, { key: ch });
    }
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SHOW_DUP_NAME_MODAL' });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_NAME' }));
    expect(audio.playInvalidActionBeep).toHaveBeenCalledOnce();
  });

  it('dispatches SET_NAME on Enter with unique name', () => {
    writeRoster({ schemaVersion: 1, characters: [makeCharacter(ID_A, 'NATHAN')] });
    const dispatch = vi.fn();
    const state = { ...initialCreationState(new WichmannHill(3000, 1, 29999)), screen: 'name' as const };
    render(
      <NameInputScreen
        state={state} dispatch={dispatch}
        fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()}
      />,
    );
    for (const ch of 'GANDALF') {
      fireEvent.keyDown(window, { key: ch });
    }
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_NAME', name: 'GANDALF' });
    expect(audio.playInvalidActionBeep).not.toHaveBeenCalled();
  });

  it('catches lowercase duplicate (case-insensitive uppercasing before dup check)', () => {
    writeRoster({ schemaVersion: 1, characters: [makeCharacter(ID_A, 'NATHAN')] });
    const dispatch = vi.fn();
    const state = { ...initialCreationState(new WichmannHill(3000, 1, 29999)), screen: 'name' as const };
    render(
      <NameInputScreen
        state={state} dispatch={dispatch}
        fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()}
      />,
    );
    // Type lowercase. The display layer renders uppercase anyway; the dup check
    // must also normalize before comparing against the all-uppercase roster.
    for (const ch of 'nathan') {
      fireEvent.keyDown(window, { key: ch });
    }
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SHOW_DUP_NAME_MODAL' });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_NAME' }));
  });

  it('any key while modal is open dispatches MODAL_DISMISS', () => {
    const dispatch = vi.fn();
    const state = {
      ...initialCreationState(new WichmannHill(3000, 1, 29999)),
      screen: 'name' as const,
      modalErrorMsgId: 0x044e,
    };
    render(
      <NameInputScreen
        state={state} dispatch={dispatch}
        fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()}
      />,
    );
    fireEvent.keyDown(window, { key: 'a' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MODAL_DISMISS' });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_NAME' }));
  });

  it('auto-dismisses after ~500ms', () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const state = {
      ...initialCreationState(new WichmannHill(3000, 1, 29999)),
      screen: 'name' as const,
      modalErrorMsgId: 0x044e,
    };
    render(
      <NameInputScreen
        state={state} dispatch={dispatch}
        fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()}
      />,
    );
    vi.advanceTimersByTime(500);
    expect(dispatch).toHaveBeenCalledWith({ type: 'MODAL_DISMISS' });
    vi.useRealTimers();
  });
});
