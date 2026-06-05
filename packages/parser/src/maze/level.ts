/**
 * level.ts — loader for committed extracted/maze/level-<id>.json assets.
 *
 * Reads the committed JSON from the repo's extracted/ directory, validates it
 * against DungeonLevelSchema, and returns a typed DungeonLevel. This is the
 * canonical entry point for the viewer and tests to access dungeon level data.
 *
 * In the viewer, the same JSON is served statically via Vite's publicDir
 * (which points at extracted/), so the viewer can fetch('/maze/level-0.json')
 * directly. This Node-side loader is for tests and server-side use.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DungeonLevelSchema, type DungeonLevel } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
// packages/parser/src/maze/ → up 4 = repo root (wiz6)
const REPO_ROOT = join(here, '..', '..', '..', '..');

export function loadDungeonLevel(id: number): DungeonLevel {
  const path = join(REPO_ROOT, 'extracted', 'maze', `level-${id}.json`);
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  return DungeonLevelSchema.parse(raw);
}
