import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tryStepForward, turn, passabilityFromTable, type ForwardVerdict } from '../../src/maze/movement.js';
import { MazeBlockSchema, type MazeBlock } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../..');
const FIX = resolve(ROOT, 'tools/parity/fixtures/engine');
const BLOCK: MazeBlock = MazeBlockSchema.parse(JSON.parse(readFileSync(resolve(FIX, 'maze-frames.json'), 'utf8')).mazeBlock);

describe('faithful movement — passability gate', () => {
  it('uses the captured verdict: open steps, blocked/encounter/warp no-op', () => {
    const table = { cells: [
      { gx: 10, gy: 20, facing: 0, forward: 'open' as ForwardVerdict },
      { gx: 11, gy: 20, facing: 0, forward: 'blocked' as ForwardVerdict },
      { gx: 12, gy: 20, facing: 0, forward: 'encounter' as ForwardVerdict },
      { gx: 13, gy: 20, facing: 0, forward: 'warp' as ForwardVerdict },
    ] };
    const map = passabilityFromTable(table);
    expect(tryStepForward({ gx: 10, gy: 20, z: 0, facing: 0 }, BLOCK, { passability: map })).toEqual({ gx: 10, gy: 21, z: 0, facing: 0 });
    expect(tryStepForward({ gx: 11, gy: 20, z: 0, facing: 0 }, BLOCK, { passability: map })).toEqual({ gx: 11, gy: 20, z: 0, facing: 0 });
    expect(tryStepForward({ gx: 12, gy: 20, z: 0, facing: 0 }, BLOCK, { passability: map })).toEqual({ gx: 12, gy: 20, z: 0, facing: 0 });
    expect(tryStepForward({ gx: 13, gy: 20, z: 0, facing: 0 }, BLOCK, { passability: map })).toEqual({ gx: 13, gy: 20, z: 0, facing: 0 });
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

interface ReachJson {
  entrance: { gx: number; gy: number; facing: number };
  reachableViews: number;
  reachableCells: number;
  forward: Array<{ gx: number; gy: number; facing: number; forward: ForwardVerdict }>;
  reachable: Array<{ gx: number; gy: number; facing: number }>;
}
const REACH = JSON.parse(readFileSync(resolve(FIX, 'maze-reachability.json'), 'utf8')) as ReachJson;
const PASS = JSON.parse(readFileSync(resolve(FIX, 'maze-passability.json'), 'utf8')) as {
  entrance: { gx: number; gy: number; facing: number };
  cells: Array<{ gx: number; gy: number; facing: number; forward: ForwardVerdict }>;
};
const FWD: Record<number, [number, number]> = { 0: [0, 1], 1: [1, 0], 2: [0, -1], 3: [-1, 0] };

describe('faithful movement — verdict parity (gate)', () => {
  const map = passabilityFromTable(PASS);
  it('reproduces every passability verdict (open steps; blocked/encounter/warp no-op)', () => {
    for (const r of PASS.cells) {
      const party = { gx: r.gx, gy: r.gy, z: 0, facing: r.facing };
      const next = tryStepForward(party, BLOCK, { passability: map });
      if (r.forward === 'open') {
        const [dx, dy] = FWD[r.facing]!;
        expect(next, `open ${r.gx},${r.gy},f${r.facing}`).toEqual({ gx: r.gx + dx, gy: r.gy + dy, z: 0, facing: r.facing });
      } else {
        expect(next, `${r.forward} ${r.gx},${r.gy},f${r.facing}`).toEqual(party);
      }
    }
  });
});

describe('faithful movement — reachability (gate)', () => {
  const map = passabilityFromTable(PASS);
  it('gated BFS reaches the 51-cell normal-connected component, never outside the engine set', () => {
    const key = (p: { gx: number; gy: number; facing: number }) => `${p.gx},${p.gy},${p.facing}`;
    const start = { ...REACH.entrance, z: 0 };
    const seen = new Set<string>([key(start)]);
    const queue = [start];
    while (queue.length) {
      const p = queue.shift()!;
      for (const n of [turn(p, 'left'), turn(p, 'right'), tryStepForward(p, BLOCK, { passability: map })]) {
        const k = key(n);
        if (!seen.has(k)) { seen.add(k); queue.push(n); }
      }
    }
    const reachedCells = new Set([...seen].map((k) => k.split(',').slice(0, 2).join(',')));
    const engineCells = new Set(REACH.reachable.map((r) => `${r.gx},${r.gy}`));
    // FAITHFULNESS: the gated walker never reaches a cell the engine can't (vs the old
    // model's 303). Every reached cell is in the engine's 74.
    for (const c of reachedCells) expect(engineCells.has(c), `over-permit ${c}`).toBe(true);
    // It reaches exactly the normal-connected component; warps/encounters block, so the
    // far warp-only cluster (gx<100) is unreachable and the 23 warp-only cells are excluded.
    expect(reachedCells.size).toBe(51);
    expect([...reachedCells].some((c) => Number(c.split(',')[0]) < 100), 'far warp cluster reached').toBe(false);
  });
});
