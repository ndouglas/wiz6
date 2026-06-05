import { describe, it, expect, beforeEach } from 'vitest';
import { initGameSession, readGameSession, updateParty, clearGameSession } from '../../src/game/game-session-store.js';
import type { DungeonLevel } from '@wiz6/data';

const LEVEL: DungeonLevel = { id: 0, entrance: { gx: 2, gy: 3, z: 0, facing: 0 },
  mazeBlock: { gxBase: new Array(12).fill(0), gyBase: new Array(12).fill(0), regions: [[]] } };

describe('GameSession store', () => {
  beforeEach(() => clearGameSession());
  it('init places the party at the level entrance; read returns it', () => {
    initGameSession(LEVEL);
    const s = readGameSession();
    expect(s?.party).toEqual({ gx: 2, gy: 3, z: 0, facing: 0 });
    expect(s?.level.id).toBe(0);
  });
  it('updateParty mutates + persists the party', () => {
    initGameSession(LEVEL);
    updateParty({ facing: 1 });
    expect(readGameSession()?.party.facing).toBe(1);
  });
  it('read returns null when no session', () => { expect(readGameSession()).toBeNull(); });
});
