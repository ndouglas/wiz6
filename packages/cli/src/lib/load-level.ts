/**
 * load-level.ts — Node-fs loader for committed extracted/maze/level-<id>.json assets.
 *
 * CLI-layer (Node-only) wrapper. Reads the committed JSON from the repo's
 * extracted/ directory, validates it against DungeonLevelSchema, and returns a
 * typed DungeonLevel.
 *
 * For the browser, use the fetch-based loadDungeonLevel in @wiz6/viewer's
 * data-loader.ts instead (extracted/ is Vite's publicDir, so
 * /maze/level-0.json resolves in the browser).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DungeonLevelSchema, type DungeonLevel } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
// packages/cli/src/lib/ → up 4 = repo root (wiz6)
const REPO_ROOT = join(here, '..', '..', '..', '..');

export function loadDungeonLevel(id: number): DungeonLevel {
  const path = join(REPO_ROOT, 'extracted', 'maze', `level-${id}.json`);
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  return DungeonLevelSchema.parse(raw);
}
