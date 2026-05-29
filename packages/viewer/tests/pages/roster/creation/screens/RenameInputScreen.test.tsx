import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { WichmannHill, WIZ6_MAIN } from '@wiz6/data';
import type { Character, MessageDb } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import { RenameInputScreen } from '../../../../../src/pages/roster/creation/screens/RenameInputScreen.js';
import { writeRoster } from '../../../../../src/lib/roster-store.js';
import { initialCreationState } from '../../../../../src/pages/roster/creation/state.js';
import * as audio from '../../../../../src/lib/audio.js';

const ID_A = '550e8400-e29b-41d4-a716-446655440000';
const ID_B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

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

const STUB_FONT_SET: FontSet = {
  font0: null, font1: null, font2: null, font3: null, font4: null,
};

function stubDb(): MessageDb {
  const entries: Array<{ id: number; decodedText: string }> = [
    { id: 0x0468, decodedText: 'NEW NAME >' },
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

describe('RenameInputScreen dup-name modal', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(audio, 'playInvalidActionBeep').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks rename to another character's name", () => {
    writeRoster({
      schemaVersion: 1,
      characters: [makeCharacter(ID_A, 'NATHAN'), makeCharacter(ID_B, 'GANDALF')],
    });
    const dispatch = vi.fn();
    // rosterIndex=0 selects character ID_A = NATHAN
    const state = {
      ...initialCreationState(new WichmannHill(3000, 1, 29999)),
      screen: 'renameInput' as const,
      rosterIndex: 0,
    };
    render(
      <RenameInputScreen state={state} dispatch={dispatch}
        fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()} />,
    );
    for (const ch of 'GANDALF') {
      fireEvent.keyDown(window, { key: ch });
    }
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SHOW_DUP_NAME_MODAL' });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'CONFIRM_RENAME' }));
    expect(audio.playInvalidActionBeep).toHaveBeenCalledOnce();
  });

  it("allows renaming a character to its own current name (no-op rename, excludeId)", () => {
    writeRoster({
      schemaVersion: 1,
      characters: [makeCharacter(ID_A, 'NATHAN'), makeCharacter(ID_B, 'GANDALF')],
    });
    const dispatch = vi.fn();
    const state = {
      ...initialCreationState(new WichmannHill(3000, 1, 29999)),
      screen: 'renameInput' as const,
      rosterIndex: 0,
    };
    render(
      <RenameInputScreen state={state} dispatch={dispatch}
        fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()} />,
    );
    for (const ch of 'NATHAN') {
      fireEvent.keyDown(window, { key: ch });
    }
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'CONFIRM_RENAME', name: 'NATHAN' });
  });

  it('modal-active key dispatches MODAL_DISMISS', () => {
    const dispatch = vi.fn();
    const state = {
      ...initialCreationState(new WichmannHill(3000, 1, 29999)),
      screen: 'renameInput' as const,
      rosterIndex: 0,
      modalErrorMsgId: 0x044e,
    };
    writeRoster({
      schemaVersion: 1,
      characters: [makeCharacter(ID_A, 'NATHAN')],
    });
    render(
      <RenameInputScreen state={state} dispatch={dispatch}
        fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()} />,
    );
    fireEvent.keyDown(window, { key: 'a' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MODAL_DISMISS' });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'CONFIRM_RENAME' }));
  });

  it('auto-dismisses after 5 seconds', () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const state = {
      ...initialCreationState(new WichmannHill(3000, 1, 29999)),
      screen: 'renameInput' as const,
      rosterIndex: 0,
      modalErrorMsgId: 0x044e,
    };
    writeRoster({
      schemaVersion: 1,
      characters: [makeCharacter(ID_A, 'NATHAN')],
    });
    render(
      <RenameInputScreen state={state} dispatch={dispatch}
        fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} db={stubDb()} />,
    );
    vi.advanceTimersByTime(5000);
    expect(dispatch).toHaveBeenCalledWith({ type: 'MODAL_DISMISS' });
    vi.useRealTimers();
  });
});
