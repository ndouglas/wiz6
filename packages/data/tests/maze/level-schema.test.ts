import { describe, it, expect } from 'vitest';
import { DungeonLevelSchema, type DungeonLevel } from '@wiz6/data';

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
});
