/**
 * build-passability.ts — derive the faithful-movement passability asset from the
 * committed engine reachability fixture (maze-reachability.json). Pure transform;
 * reproducible without the harness. Emits the viewer asset (extracted/maze, the Vite
 * publicDir) + the parity-test fixture copy.
 *
 * Run: pnpm tsx tools/parity/build-passability.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const FIX = resolve(ROOT, 'tools', 'parity', 'fixtures', 'engine');

interface ForwardRec { gx: number; gy: number; facing: number; forward: 'open' | 'blocked' | 'encounter'; }

function main(): void {
  const src = JSON.parse(readFileSync(resolve(FIX, 'maze-reachability.json'), 'utf8')) as {
    entrance: { gx: number; gy: number; facing: number };
    forward: ForwardRec[];
  };
  const cells = src.forward
    .map((r) => ({ gx: r.gx, gy: r.gy, facing: r.facing, forward: r.forward }))
    .sort((a, b) => a.gx - b.gx || a.gy - b.gy || a.facing - b.facing);
  const payload = JSON.stringify({
    _comment: 'Faithful-movement passability gate (level-0). forward verdict per engine-reachable (gx,gy,facing). Derived from maze-reachability.json by tools/parity/build-passability.ts.',
    entrance: src.entrance,
    cells,
  }, null, 2);
  writeFileSync(resolve(FIX, 'maze-passability.json'), payload);
  writeFileSync(resolve(ROOT, 'extracted', 'maze', 'passability.json'), payload);
  console.log(`build-passability: ${cells.length} verdicts -> fixture + extracted/maze/passability.json`);
}

main();
