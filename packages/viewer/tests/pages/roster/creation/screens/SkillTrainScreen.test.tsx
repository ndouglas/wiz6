// packages/viewer/tests/pages/roster/creation/screens/SkillTrainScreen.test.tsx
//
// RTL tests for SkillTrainScreen (screen-13).
//
// Screen-13 behaviour per docs/re/wpcmk-screens.md §5:
//   - Player spends `state.draft.skillBudget` points on trainable skill slots.
//   - Trainable slots derived from CLASS_SKILL_AVAILABILITY[state.draft.class].
//   - ArrowUp   (code 2) → cursor = prev trainable slot (no wrap / clamp at start)
//   - ArrowDown (code 4) → cursor = next trainable slot (no wrap / clamp at end)
//   - ArrowRight (code 3) / Enter (code 5) → dispatch TRAIN_SKILL { slot: <cursor slot> }
//   - ArrowLeft (code 1) → no-op for this screen (no decrease for skills)
//   - Reducer owns budget decrement + skills[] increment + auto-advance when budget hits 0.
//   - Screen does NOT need to dispatch SKILLS_DONE — reducer auto-advances.
//   - Renders via CreationCanvas (<canvas>).
//
// Spec: docs/re/wpcmk-screens.md §5, §8

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { WIZ6_MAIN, availableSkillSlots } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../../../../../src/pages/roster/creation/state.js';
import { initialCreationState } from '../../../../../src/pages/roster/creation/state.js';
import { WichmannHill } from '@wiz6/data';
import { SkillTrainScreen } from '../../../../../src/pages/roster/creation/screens/SkillTrainScreen.js';

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
 * Minimal stub MessageDb covering IDs used by SkillTrainScreen (§3, §5):
 *   0x159a = "SKILL POINTS"
 *   0x0258..0x025b = WEAPONRY / PHYSICAL / PERSONAL / ACADEMIA
 *   0x157c..0x1599 = skill slot names (30 slots, indices 0..29)
 *   We stub a representative subset.
 */
function stubDb(): MessageDb {
  const entries: Array<{ id: number; decodedText: string }> = [
    { id: 0x159a, decodedText: 'SKILL POINTS' },
    { id: 0x0258, decodedText: 'WEAPONRY' },
    { id: 0x0259, decodedText: 'PHYSICAL' },
    { id: 0x025a, decodedText: 'PERSONAL' },
    { id: 0x025b, decodedText: 'ACADEMIA' },
    // Skill slot names (slots 0..29 → msg 0x157c..0x1599)
    { id: 0x157c, decodedText: 'SWORD' },
    { id: 0x157d, decodedText: 'AXE' },
    { id: 0x157e, decodedText: 'POLEARM' },
    { id: 0x157f, decodedText: 'MACE & FLAIL' },
    { id: 0x1580, decodedText: 'DAGGER' },
    { id: 0x1581, decodedText: 'STAFF & WAND' },
    { id: 0x1582, decodedText: 'SHIELD' },
    { id: 0x1583, decodedText: 'MODERN WEAPONS' },
    { id: 0x1584, decodedText: 'BOW' },
    { id: 0x1585, decodedText: 'THROWN WEAPONS' },
    { id: 0x1586, decodedText: 'HOLE SLOT 10' },
    { id: 0x1587, decodedText: 'SLING' },
    { id: 0x1588, decodedText: 'WHIP' },
    { id: 0x1589, decodedText: 'MUSIC' },
    { id: 0x158a, decodedText: 'LEGERDEMAIN' },
    { id: 0x158b, decodedText: 'SKULDUGGERY' },
    { id: 0x158c, decodedText: 'NINJUTSU' },
    { id: 0x158d, decodedText: 'HOLE 17' },
    { id: 0x158e, decodedText: 'HOLE 18' },
    { id: 0x158f, decodedText: 'HOLE 19' },
    { id: 0x1590, decodedText: 'HOLE 20' },
    { id: 0x1591, decodedText: 'HOLE 21' },
    { id: 0x1592, decodedText: 'SCOUTING' },
    { id: 0x1593, decodedText: 'MYTHOLOGY' },
    { id: 0x1594, decodedText: 'SCRIBE' },
    { id: 0x1595, decodedText: 'ALCHEMY' },
    { id: 0x1596, decodedText: 'THEOLOGY' },
    { id: 0x1597, decodedText: 'THEOSOPHY' },
    { id: 0x1598, decodedText: 'THAUMATURGY' },
    { id: 0x1599, decodedText: 'KIRIJUTSU' },
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
// Helper: build a state at the 'skillTrain' screen
// ---------------------------------------------------------------------------

/**
 * Build a state at the 'skillTrain' screen.
 * Class = 0 (Fighter), skillBudget = 2 by default.
 * Fighter trainable slots per CLASS_SKILL_AVAILABILITY[0]:
 *   `111111111001000000000011100000` → slots 0,1,2,3,4,5,6,7,8,11,23,24,25
 */
function makeSkillTrainState(skillBudget = 2, classIdx = 0): CreationState {
  const rng = new WichmannHill(3000, 1, 29999);
  const s = initialCreationState(rng);

  return {
    ...s,
    screen: 'skillTrain',
    draft: {
      ...s.draft,
      name: 'TESTCHAR',
      race: 0,
      sex: 0,
      class: classIdx,
      attributes: {
        str: 12, int: 8, pie: 8, vit: 10, dex: 9, spd: 8, per: 8,
        kar: 5,
      },
      bonusPool: 0,
      skillBudget,
      skills: new Array(30).fill(0) as number[],
    },
  };
}

// ---------------------------------------------------------------------------
// SkillTrainScreen — canvas mounting
// ---------------------------------------------------------------------------

describe('SkillTrainScreen — canvas mounting', () => {
  it('renders a <canvas> element', () => {
    const state = makeSkillTrainState();
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <SkillTrainScreen
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
    const state = makeSkillTrainState();
    const dispatch = vi.fn();
    const db = stubDb();

    const { container } = render(
      <SkillTrainScreen
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
// Trainable skill list — class constrains visible slots
// ---------------------------------------------------------------------------

describe('SkillTrainScreen — trainable slots reflect class', () => {
  it('Fighter (class 0) has trainable slots from CLASS_SKILL_AVAILABILITY[0]', () => {
    // availableSkillSlots(0) returns the indices where the Fighter can train
    const slots = availableSkillSlots(0);
    expect(slots.length).toBeGreaterThan(0);
    // Fighter should have Sword (slot 0) trainable
    expect(slots).toContain(0);
    // And Axe (slot 1)
    expect(slots).toContain(1);
  });
});

// ---------------------------------------------------------------------------
// Enter/ArrowRight → TRAIN_SKILL { slot: <cursor slot> }
// Cursor starts at the first trainable slot for the class.
// ---------------------------------------------------------------------------

describe('SkillTrainScreen — Enter dispatches TRAIN_SKILL at cursor slot', () => {
  it('Enter at initial position dispatches TRAIN_SKILL with the first trainable slot', () => {
    const state = makeSkillTrainState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SkillTrainScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });

    // Fighter's first trainable slot is slot 0 (Sword)
    const firstSlot = availableSkillSlots(0)[0]!;
    expect(dispatch).toHaveBeenCalledWith({ type: 'TRAIN_SKILL', slot: firstSlot });
  });

  it('ArrowRight dispatches TRAIN_SKILL at cursor slot', () => {
    const state = makeSkillTrainState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SkillTrainScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    const firstSlot = availableSkillSlots(0)[0]!;
    expect(dispatch).toHaveBeenCalledWith({ type: 'TRAIN_SKILL', slot: firstSlot });
  });
});

// ---------------------------------------------------------------------------
// ArrowDown → moves cursor to next trainable slot
// ---------------------------------------------------------------------------

describe('SkillTrainScreen — ArrowDown moves cursor to next trainable slot', () => {
  it('ArrowDown then Enter dispatches TRAIN_SKILL with the second trainable slot', () => {
    const state = makeSkillTrainState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SkillTrainScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Move cursor to second trainable slot
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });

    const slots = availableSkillSlots(0);
    const secondSlot = slots[1]!;
    expect(dispatch).toHaveBeenCalledWith({ type: 'TRAIN_SKILL', slot: secondSlot });
  });

  it('ArrowDown clamps at the last trainable slot (no wrap)', () => {
    const state = makeSkillTrainState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SkillTrainScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    const slots = availableSkillSlots(0);
    const lastSlot = slots[slots.length - 1]!;

    // Press ArrowDown more times than there are slots — should clamp
    for (let i = 0; i < slots.length + 5; i++) {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    }
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'TRAIN_SKILL', slot: lastSlot });
  });
});

// ---------------------------------------------------------------------------
// ArrowUp → moves cursor to prev trainable slot (clamp at start, no wrap)
// ---------------------------------------------------------------------------

describe('SkillTrainScreen — ArrowUp moves cursor to prev trainable slot', () => {
  it('ArrowUp from first trainable slot clamps (no wrap)', () => {
    const state = makeSkillTrainState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SkillTrainScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Arrow up from the start — should stay at first slot
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'Enter' });

    const firstSlot = availableSkillSlots(0)[0]!;
    expect(dispatch).toHaveBeenCalledWith({ type: 'TRAIN_SKILL', slot: firstSlot });
  });

  it('ArrowDown then ArrowUp returns to first trainable slot', () => {
    const state = makeSkillTrainState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SkillTrainScreen
        state={state}
        dispatch={dispatch}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        db={db}
      />,
    );

    // Move to second, then back to first
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'Enter' });

    const firstSlot = availableSkillSlots(0)[0]!;
    expect(dispatch).toHaveBeenCalledWith({ type: 'TRAIN_SKILL', slot: firstSlot });
  });
});

// ---------------------------------------------------------------------------
// ArrowLeft is a no-op (no skill point removal)
// ---------------------------------------------------------------------------

describe('SkillTrainScreen — ArrowLeft does not dispatch', () => {
  it('ArrowLeft does not dispatch any event', () => {
    const state = makeSkillTrainState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SkillTrainScreen
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

describe('SkillTrainScreen — Escape is silently ignored', () => {
  it('Escape does not dispatch any event', () => {
    const state = makeSkillTrainState();
    const dispatch = vi.fn<[CreationEvent], void>();
    const db = stubDb();

    render(
      <SkillTrainScreen
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
// Budget is displayed (smoke test — canvas content not directly inspectable,
// but at least verifies the component doesn't throw with a given budget value)
// ---------------------------------------------------------------------------

describe('SkillTrainScreen — renders without throwing with various budgets', () => {
  it('renders with skillBudget=1 without error', () => {
    const state = makeSkillTrainState(1);
    const dispatch = vi.fn();
    const db = stubDb();

    expect(() =>
      render(
        <SkillTrainScreen
          state={state}
          dispatch={dispatch}
          fontSet={STUB_FONT_SET}
          palette={WIZ6_MAIN}
          db={db}
        />,
      ),
    ).not.toThrow();
  });

  it('renders with skillBudget=15 without error', () => {
    const state = makeSkillTrainState(15);
    const dispatch = vi.fn();
    const db = stubDb();

    expect(() =>
      render(
        <SkillTrainScreen
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
