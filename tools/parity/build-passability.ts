/**
 * build-passability.ts — derive the faithful-movement passability asset from the
 * committed engine reachability fixture (maze-reachability.json). Pure transform;
 * reproducible without the harness. Emits the viewer asset (extracted/maze, the Vite
 * publicDir) + the parity-test fixture copy.
 *
 * Reclassifies an `open` verdict to `warp` when the engine moved but the NORMAL
 * neighbour isn't reachable (a stairs/teleporter jump) — a deferred verdict that
 * movement no-ops until the stairs/teleporter sub-project.
 *
 * Run: pnpm tsx tools/parity/build-passability.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const FIX = resolve(ROOT, 'tools', 'parity', 'fixtures', 'engine');

type Verdict = 'open' | 'blocked' | 'encounter' | 'warp';
interface ForwardRec { gx: number; gy: number; facing: number; forward: 'open' | 'blocked' | 'encounter'; }
const FWD: Record<number, [number, number]> = { 0: [0, 1], 1: [1, 0], 2: [0, -1], 3: [-1, 0] };

function main(): void {
  const src = JSON.parse(readFileSync(resolve(FIX, 'maze-reachability.json'), 'utf8')) as {
    entrance: { gx: number; gy: number; facing: number };
    forward: ForwardRec[];
    reachable: Array<{ gx: number; gy: number; facing: number }>;
  };
  const reachableCells = new Set(src.reachable.map((r) => `${r.gx},${r.gy}`));
  const cells = src.forward
    .map((r) => {
      let forward: Verdict = r.forward;
      // The 'encounter' verdict is NOT a fixed-tile property: Wiz6 encounters are RANDOM
      // step-rolls (~8%/step — verified at 131,121,f3 via `trace-maze.ts encprobe`: 1/12).
      // collmap recorded 'encounter' wherever a step happened to roll combat during its
      // probe (here, exactly one tile). The underlying move is geometrically open (edge 0,
      // dest reachable), so it's really 'open'; wandering-monster encounters are a separate
      // (unimplemented) per-step system, not a passability gate. Reclassify → 'open'.
      if (forward === 'encounter') forward = 'open';
      if (forward === 'open') {
        const [dx, dy] = FWD[r.facing]!;
        if (!reachableCells.has(`${r.gx + dx},${r.gy + dy}`)) forward = 'warp';
      }
      return { gx: r.gx, gy: r.gy, facing: r.facing, forward };
    })
    .sort((a, b) => a.gx - b.gx || a.gy - b.gy || a.facing - b.facing);
  const payload = JSON.stringify({
    _comment: 'Faithful-movement passability gate (level-0). Verdict per engine-reachable (gx,gy,facing): open|blocked|encounter|warp. warp = stairs/teleporter (engine moved to a non-adjacent cell); no-op until the stairs sub-project. Derived from maze-reachability.json by tools/parity/build-passability.ts.',
    entrance: src.entrance,
    cells,
  }, null, 2);
  writeFileSync(resolve(FIX, 'maze-passability.json'), payload);
  writeFileSync(resolve(ROOT, 'extracted', 'maze', 'passability.json'), payload);
  const counts = cells.reduce((a, c) => ((a[c.forward] = (a[c.forward] || 0) + 1), a), {} as Record<string, number>);
  console.log(`build-passability: ${cells.length} verdicts (${JSON.stringify(counts)}) -> fixture + extracted/maze/passability.json`);
}

main();
