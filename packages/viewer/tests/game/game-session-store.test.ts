import { describe, it, expect, beforeEach } from 'vitest';
import { initGameSession, readGameSession, updateParty, clearGameSession } from '../../src/game/game-session-store.js';
import type { DungeonLevel } from '@wiz6/data';

const MAZE_BLOCK = {
  gxBase: new Array(12).fill(0),
  gyBase: new Array(12).fill(0),
  regions: [[]],
};

// Level WITHOUT a scriptedEntry (back-compat path).
const LEVEL: DungeonLevel = {
  id: 0,
  entrance: { gx: 2, gy: 3, z: 0, facing: 0 },
  mazeBlock: MAZE_BLOCK,
};

// Level WITH a scriptedEntry.
const LEVEL_WITH_ENTRY: DungeonLevel = {
  id: 0,
  entrance: { gx: 127, gy: 121, z: 0, facing: 0 },
  mazeBlock: MAZE_BLOCK,
  scriptedEntry: {
    start: { gx: 127, gy: 117, z: 0, facing: 0 },
    steps: 4,
    titleMsgIds: [1212, 1213],
    narrationMsgIds: [10010, 10011, 10012],
    bumpMsgId: 10020,
  },
};

describe('GameSession store', () => {
  beforeEach(() => clearGameSession());

  // ── back-compat: level without scriptedEntry ─────────────────────────────

  it('init places the party at the level entrance; read returns it', () => {
    initGameSession(LEVEL);
    const s = readGameSession();
    expect(s?.party).toEqual({ gx: 2, gy: 3, z: 0, facing: 0 });
    expect(s?.level.id).toBe(0);
  });

  it('init without scriptedEntry seeds entryMode:free + stepsRemaining:0', () => {
    initGameSession(LEVEL);
    const s = readGameSession();
    expect(s?.entryMode).toBe('free');
    expect(s?.stepsRemaining).toBe(0);
  });

  it('updateParty mutates + persists the party', () => {
    initGameSession(LEVEL);
    updateParty({ facing: 1 });
    expect(readGameSession()?.party.facing).toBe(1);
  });

  it('read returns null when no session', () => { expect(readGameSession()).toBeNull(); });

  // ── scriptedEntry path ───────────────────────────────────────────────────

  it('init WITH scriptedEntry seeds party = start coords (gy=117, the title frame)', () => {
    initGameSession(LEVEL_WITH_ENTRY);
    const s = readGameSession();
    expect(s?.party).toEqual({ gx: 127, gy: 117, z: 0, facing: 0 });
  });

  it('init WITH scriptedEntry seeds entryMode:door-open (the castle doors slide apart first)', () => {
    initGameSession(LEVEL_WITH_ENTRY);
    const s = readGameSession();
    expect(s?.entryMode).toBe('door-open');
  });

  it('init WITH scriptedEntry seeds stepsRemaining = steps (4)', () => {
    initGameSession(LEVEL_WITH_ENTRY);
    const s = readGameSession();
    expect(s?.stepsRemaining).toBe(4);
  });

  it('entrance is NOT overwritten by scriptedEntry.start', () => {
    initGameSession(LEVEL_WITH_ENTRY);
    const s = readGameSession();
    // level.entrance stays gy=121; scriptedEntry.start is gy=117 (party only)
    expect(s?.level.entrance.gy).toBe(121);
  });

  // ── old-version blob compat ──────────────────────────────────────────────

  it('readGameSession returns null for a stored v1 blob', () => {
    window.localStorage.setItem(
      'wiz6:session',
      JSON.stringify({
        schemaVersion: 1,
        level: LEVEL,
        party: { gx: 2, gy: 3, z: 0, facing: 0 },
      }),
    );
    expect(readGameSession()).toBeNull();
  });

  it('readGameSession discards a stored v2 blob (old 3-state FSM)', () => {
    // A valid-shaped v2 session must be discarded after the schemaVersion bump.
    window.localStorage.setItem(
      'wiz6:session',
      JSON.stringify({
        schemaVersion: 2,
        level: LEVEL,
        party: { gx: 2, gy: 3, z: 0, facing: 0 },
        entryMode: 'narration',
        stepsRemaining: 3,
      }),
    );
    expect(readGameSession()).toBeNull();
  });
});
