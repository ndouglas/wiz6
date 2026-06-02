/**
 * build-state.ts — reproducible committed derivative assets from the harness.
 *
 * Drives a named recipe (reused verbatim from tools/dosbox/state-catalog.ts —
 * the macros are emulator-agnostic) through the dosbox-pure harness, then writes
 * BOTH committed assets:
 *   - tools/parity/fixtures/engine/<name>.idx.gz + .png  (the test ground truth)
 *   - tools/libretro/states/<name>.state                 (fast-reload serialize)
 *
 * Streaming vs batching: a recipe is just a batch of key/step commands; the same
 * harness serves interactive single commands. --validate <committed> diffs the
 * regenerated fixture against an existing committed fixture.
 *
 * Usage: pnpm tsx tools/libretro/build-state.ts <recipe> [--validate <fixture>]
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { findRecipe } from '../dosbox/state-catalog.js';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { COMPOSED_PALETTE, indicesToRgba, SCREEN_WIDTH, SCREEN_HEIGHT } from '../parity/decode-screen.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, '..', 'parity', 'fixtures', 'engine');
const STATES = resolve(HERE, 'states');
const TMP = '/tmp/wiz6-libretro';

const rgbToIdx = new Map<number, number>();
COMPOSED_PALETTE.forEach(([r, g, b], i) => rgbToIdx.set((r << 16) | (g << 8) | b, i));
function rgbaToIndices(rgba: Uint8Array): Uint8Array {
  const idx = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
  for (let p = 0; p < idx.length; p++) {
    const i = rgbToIdx.get((rgba[p * 4]! << 16) | (rgba[p * 4 + 1]! << 8) | rgba[p * 4 + 2]!);
    if (i === undefined) throw new Error(`pixel ${p}: non-WIZ6_MAIN colour (divergence?)`);
    idx[p] = i;
  }
  return idx;
}

async function driveRecipe(h: HostClient, steps: readonly string[], settleMs = 0): Promise<void> {
  await h.step(3000);            // boot → title
  await h.key('enter', 'tap');   // dismiss title → MASTER OPTIONS (cursor on ADD)
  await h.step(800);
  for (const step of steps) {
    for (const k of step.split(/\s+/)) { await h.key(k, 'tap'); await h.step(120); }
    await h.step(600);           // settle between recipe steps
  }
  if (settleMs) await h.step(Math.round((settleMs / 1000) * 70));
}

function diffVs(idx: Uint8Array, committed: string): void {
  const ref = gunzipSync(readFileSync(join(FIXTURES, `${committed}.idx.gz`)));
  let diff = 0;
  const rows = new Set<number>();
  for (let p = 0; p < idx.length; p++) if (idx[p] !== ref[p]) { diff++; rows.add(Math.floor(p / SCREEN_WIDTH)); }
  const pct = (100 * (idx.length - diff) / idx.length).toFixed(2);
  const rowList = [...rows].sort((a, b) => a - b);
  console.log(`vs ${committed}: ${pct}% match (${diff}/${idx.length} idx differ)`);
  if (diff) console.log(`  differing rows: ${rowList[0]}..${rowList[rowList.length - 1]} (${rowList.length} rows) — see /tmp/wiz6-libretro/${committed}.regen.png`);
}

async function main() {
  const name = process.argv[2];
  const vi = process.argv.indexOf('--validate');
  const validateAgainst = vi >= 0 ? process.argv[vi + 1] : undefined;
  // --check: regenerate + diff against the SAME-named committed fixture WITHOUT
  // overwriting it (the verification loop for authoring recipes).
  const check = process.argv.includes('--check');
  const recipe = name ? findRecipe(name) : undefined;
  if (!recipe) throw new Error(`unknown recipe: ${name}`);

  mkdirSync(TMP, { recursive: true });
  mkdirSync(FIXTURES, { recursive: true });
  mkdirSync(STATES, { recursive: true });

  // HostClient boots from an ephemeral COPY of the committed test-fixtures/original/
  // image by default — deterministic, and never touches the mutable ./original.
  const h = new HostClient();
  await driveRecipe(h, recipe.steps, recipe.settleMs);
  if (!check) await h.serialize(join(STATES, `${name}.state`));
  await h.fb(`${TMP}/build.rgba`);
  h.close();

  const rgba = new Uint8Array(readFileSync(`${TMP}/build.rgba`));
  const idx = rgbaToIndices(rgba);

  if (check) {
    writeFileSync(join(TMP, `${name}.regen.png`), encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, rgba));
    diffVs(idx, name);
    return;
  }

  writeFileSync(join(FIXTURES, `${name}.idx.gz`), gzipSync(idx));
  writeFileSync(join(FIXTURES, `${name}.png`), encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, rgba));
  console.log(`wrote ${name}.idx.gz + .png + states/${name}.state`);
  if (validateAgainst) diffVs(idx, validateAgainst);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message ?? e); process.exit(1); });
