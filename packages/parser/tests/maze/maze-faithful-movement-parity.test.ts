import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tryStepForward, passabilityFromTable, type ForwardVerdict } from '../../src/maze/movement.js';
import { MazeBlockSchema, type MazeBlock } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../..');
const FIX = resolve(ROOT, 'tools/parity/fixtures/engine');
const BLOCK: MazeBlock = MazeBlockSchema.parse(JSON.parse(readFileSync(resolve(FIX, 'maze-frames.json'), 'utf8')).mazeBlock);

describe('faithful movement — passability gate', () => {
  it('uses the captured verdict: open steps, blocked/encounter no-op', () => {
    const table = { cells: [
      { gx: 10, gy: 20, facing: 0, forward: 'open' as ForwardVerdict },
      { gx: 11, gy: 20, facing: 0, forward: 'blocked' as ForwardVerdict },
      { gx: 12, gy: 20, facing: 0, forward: 'encounter' as ForwardVerdict },
    ] };
    const map = passabilityFromTable(table);
    expect(tryStepForward({ gx: 10, gy: 20, z: 0, facing: 0 }, BLOCK, { passability: map })).toEqual({ gx: 10, gy: 21, z: 0, facing: 0 });
    expect(tryStepForward({ gx: 11, gy: 20, z: 0, facing: 0 }, BLOCK, { passability: map })).toEqual({ gx: 11, gy: 20, z: 0, facing: 0 });
    expect(tryStepForward({ gx: 12, gy: 20, z: 0, facing: 0 }, BLOCK, { passability: map })).toEqual({ gx: 12, gy: 20, z: 0, facing: 0 });
  });

  it('falls back to the wall model when no verdict is captured for the key', () => {
    const empty = new Map<string, ForwardVerdict>();
    expect(tryStepForward({ gx: 127, gy: 121, z: 0, facing: 0 }, BLOCK, { passability: empty }))
      .toEqual({ gx: 127, gy: 122, z: 0, facing: 0 });
  });

  it('no opts behaves exactly like the legacy model (backward compatible)', () => {
    expect(tryStepForward({ gx: 127, gy: 121, z: 0, facing: 0 }, BLOCK))
      .toEqual({ gx: 127, gy: 122, z: 0, facing: 0 });
  });
});
