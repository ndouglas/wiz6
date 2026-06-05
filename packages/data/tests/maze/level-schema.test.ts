import { describe, it, expect } from 'vitest';
import { DungeonLevelSchema, ScriptedEntrySchema, type DungeonLevel, type ScriptedEntry } from '@wiz6/data';

const MAZE_BLOCK = {
  gxBase: new Array(12).fill(0),
  gyBase: new Array(12).fill(0),
  regions: [[]],
};

describe('DungeonLevel schema', () => {
  it('parses a level with an entrance + a MazeBlock', () => {
    const lvl: DungeonLevel = DungeonLevelSchema.parse({
      id: 0,
      entrance: { gx: 0, gy: 0, z: 0, facing: 0 },
      mazeBlock: { gxBase: new Array(12).fill(0), gyBase: new Array(12).fill(0), regions: [[]] },
    });
    expect(lvl.entrance.facing).toBe(0);
  });
  it('rejects facing out of 0..3', () => {
    expect(() => DungeonLevelSchema.parse({
      id: 0, entrance: { gx: 0, gy: 0, z: 0, facing: 4 },
      mazeBlock: { gxBase: [], gyBase: [], regions: [] },
    })).toThrow();
  });

  it('parses a level WITH a valid scriptedEntry (round-trips)', () => {
    const scriptedEntry: ScriptedEntry = {
      start: { gx: 127, gy: 118, z: 0, facing: 0 },
      steps: 3,
      narrationMsgIds: [10010, 10011, 10012],
      bumpMsgId: 10020,
    };
    const lvl: DungeonLevel = DungeonLevelSchema.parse({
      id: 0,
      entrance: { gx: 127, gy: 121, z: 0, facing: 0 },
      mazeBlock: MAZE_BLOCK,
      scriptedEntry,
    });
    expect(lvl.scriptedEntry).toEqual(scriptedEntry);
    expect(lvl.entrance.gy).toBe(121);
  });

  it('parses a level WITHOUT scriptedEntry (optional)', () => {
    const lvl: DungeonLevel = DungeonLevelSchema.parse({
      id: 0,
      entrance: { gx: 127, gy: 121, z: 0, facing: 0 },
      mazeBlock: MAZE_BLOCK,
    });
    expect(lvl.scriptedEntry).toBeUndefined();
  });
});

describe('ScriptedEntrySchema', () => {
  it('accepts a valid scripted entry', () => {
    const entry: ScriptedEntry = ScriptedEntrySchema.parse({
      start: { gx: 127, gy: 118, z: 0, facing: 0 },
      steps: 3,
      narrationMsgIds: [10010, 10011, 10012],
      bumpMsgId: 10020,
    });
    expect(entry.steps).toBe(3);
    expect(entry.narrationMsgIds).toHaveLength(3);
  });

  it('rejects negative steps', () => {
    expect(() => ScriptedEntrySchema.parse({
      start: { gx: 127, gy: 118, z: 0, facing: 0 },
      steps: -1,
      narrationMsgIds: [],
      bumpMsgId: 10020,
    })).toThrow();
  });

  it('accepts steps === 0 (nonnegative boundary)', () => {
    expect(() => ScriptedEntrySchema.parse({
      start: { gx: 127, gy: 118, z: 0, facing: 0 },
      steps: 0,
      narrationMsgIds: [],
      bumpMsgId: 10020,
    })).not.toThrow();
  });
});
