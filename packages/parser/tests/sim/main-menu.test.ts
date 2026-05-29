import { describe, expect, it } from 'vitest';
import {
  MAIN_MENU_OPTIONS,
  isOptionEnabled,
  visibleMenuOptions,
  type MainMenuContext,
} from '../../src/sim/main-menu.js';

const FIRST_LAUNCH: MainMenuContext = {
  partySize: 0,
  pcFileHasUnloadedChars: true,
};

const FULL_PARTY: MainMenuContext = {
  partySize: 6,
  pcFileHasUnloadedChars: false,
};

const PARTIAL_PARTY: MainMenuContext = {
  partySize: 2,
  pcFileHasUnloadedChars: true,
};

const NO_CHARS_AT_ALL: MainMenuContext = {
  partySize: 0,
  pcFileHasUnloadedChars: false,
};

describe('MAIN_MENU_OPTIONS', () => {
  it('has exactly 9 slots matching the engine jump table', () => {
    expect(MAIN_MENU_OPTIONS).toHaveLength(9);
  });

  it('slots are in 0..8 order', () => {
    expect(MAIN_MENU_OPTIONS.map((o) => o.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('labels match extracted msg.json verbatim (0x3ea..0x3f2)', () => {
    expect(MAIN_MENU_OPTIONS[0]!.label).toBe('ADD PARTY MEMBER');
    expect(MAIN_MENU_OPTIONS[1]!.label).toBe('REVIEW MEMBER');
    expect(MAIN_MENU_OPTIONS[2]!.label).toBe('DISMISS MEMBER');
    expect(MAIN_MENU_OPTIONS[3]!.label).toBe('START NEW GAME');
    expect(MAIN_MENU_OPTIONS[4]!.label).toBe('RESUME SAVED GAME');
    expect(MAIN_MENU_OPTIONS[5]!.label).toBe('CHARACTER MENU');
    expect(MAIN_MENU_OPTIONS[6]!.label).toBe('GAME CONFIGURATION');
    expect(MAIN_MENU_OPTIONS[7]!.label).toBe('SHOW TITLE PAGE');
    expect(MAIN_MENU_OPTIONS[8]!.label).toBe('QUIT GAME');
  });
});

describe('isOptionEnabled', () => {
  it('slot 0 (add party member) needs unloaded chars and room in party', () => {
    expect(isOptionEnabled(0, FIRST_LAUNCH)).toBe(true);
    expect(isOptionEnabled(0, FULL_PARTY)).toBe(false); // party full
    expect(isOptionEnabled(0, NO_CHARS_AT_ALL)).toBe(false); // no chars to add
  });

  it('slots 1 + 2 require partySize >= 1', () => {
    expect(isOptionEnabled(1, FIRST_LAUNCH)).toBe(false);
    expect(isOptionEnabled(2, FIRST_LAUNCH)).toBe(false);
    expect(isOptionEnabled(1, PARTIAL_PARTY)).toBe(true);
    expect(isOptionEnabled(2, PARTIAL_PARTY)).toBe(true);
  });

  it('slot 3 (remove party member) requires partySize >= 2', () => {
    expect(isOptionEnabled(3, FIRST_LAUNCH)).toBe(false);
    expect(isOptionEnabled(3, { partySize: 1, pcFileHasUnloadedChars: false })).toBe(false);
    expect(isOptionEnabled(3, PARTIAL_PARTY)).toBe(true);
  });

  it('slot 4 (resume saved game) only enabled when no party loaded', () => {
    expect(isOptionEnabled(4, FIRST_LAUNCH)).toBe(true);
    expect(isOptionEnabled(4, PARTIAL_PARTY)).toBe(false);
  });

  it('slots 5..8 are always enabled', () => {
    for (const ctx of [FIRST_LAUNCH, PARTIAL_PARTY, FULL_PARTY, NO_CHARS_AT_ALL]) {
      expect(isOptionEnabled(5, ctx)).toBe(true);
      expect(isOptionEnabled(6, ctx)).toBe(true);
      expect(isOptionEnabled(7, ctx)).toBe(true);
      expect(isOptionEnabled(8, ctx)).toBe(true);
    }
  });
});

describe('visibleMenuOptions', () => {
  it('first launch (no party, has unloaded chars) shows 6 options matching the screenshot', () => {
    const visible = visibleMenuOptions(FIRST_LAUNCH);
    expect(visible.map((o) => o.slot)).toEqual([0, 4, 5, 6, 7, 8]);
    expect(visible.map((o) => o.label)).toEqual([
      'ADD PARTY MEMBER',
      'RESUME SAVED GAME',
      'CHARACTER MENU', // slot 5
      'GAME CONFIGURATION',
      'SHOW TITLE PAGE',
      'QUIT GAME',
    ]);
  });

  it('with partial party, ADD/CHOOSE/CHAR-MENU/REMOVE become available; RESUME goes away', () => {
    const visible = visibleMenuOptions(PARTIAL_PARTY);
    const slots = visible.map((o) => o.slot);
    expect(slots).toContain(0); // ADD: still room + has unloaded
    expect(slots).toContain(1); // REVIEW MEMBER
    expect(slots).toContain(2); // DISMISS MEMBER
    expect(slots).toContain(3); // START NEW GAME: party >= 2
    expect(slots).not.toContain(4); // RESUME: party already loaded
    expect(slots).toContain(5);
    expect(slots).toContain(6);
    expect(slots).toContain(7);
    expect(slots).toContain(8);
  });

  it('with full party, ADD goes away', () => {
    const visible = visibleMenuOptions(FULL_PARTY);
    expect(visible.map((o) => o.slot)).not.toContain(0);
  });
});
