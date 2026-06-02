/**
 * build-state.ts — reproducible committed derivative assets from the harness.
 *
 * Two paths:
 *
 * 1. RECIPE replay (default for deterministic screens). Drives a named recipe
 *    (reused verbatim from tools/dosbox/state-catalog.ts — the macros are
 *    emulator-agnostic) through the harness, then writes BOTH committed assets:
 *      - tools/parity/fixtures/engine/<name>.idx.gz + .png  (test ground truth)
 *      - tools/libretro/states/<name>.state                 (gitignored scratch)
 *
 * 2. MINT (--mint) for NON-DETERMINISTIC screens (creation rolls). Drives the
 *    recipe via LiveSession to the waypoint, then commits a frozen machine so
 *    the fixture re-mints byte-exact regardless of the roll:
 *      - test-fixtures/states/<name>.state.gz   (COMMITTED pinned source)
 *      - tools/parity/fixtures/engine/<name>.{idx.gz,png}  (test ground truth)
 *      - tools/parity/fixtures/engine/<name>.character.json (decoded draft sidecar)
 *    --mint accepts WHATEVER roll comes up; the sidecar records the engine's
 *    decode so the parity composer renders the same character.
 *
 * --check: if a committed test-fixtures/states/<name>.state.gz exists, re-mint
 * from it (unserialize → step → fb) and diff vs the committed fixture (NO
 * driving — proves the frozen-machine re-mint is byte-exact). Otherwise falls
 * back to recipe replay + diff.
 *
 * Usage:
 *   pnpm tsx tools/libretro/build-state.ts <recipe>            # recipe → fixture + state
 *   pnpm tsx tools/libretro/build-state.ts <recipe> --mint     # serialize-state mint + sidecar
 *   pnpm tsx tools/libretro/build-state.ts <recipe> --check    # re-mint + diff (no overwrite)
 *   pnpm tsx tools/libretro/build-state.ts <recipe> --validate <fixture>
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync, mkdtempSync, cpSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { findRecipe } from '../dosbox/state-catalog.js';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { LiveSession } from '../../packages/mcp/src/live/live-session.js';
import { ALL_STRUCTS, buildStructRegistry, CreationDraftSidecarSchema } from '../../packages/data/src/index.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { COMPOSED_PALETTE, SCREEN_WIDTH, SCREEN_HEIGHT } from '../parity/decode-screen.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const FIXTURES = resolve(HERE, '..', 'parity', 'fixtures', 'engine');
const STATES = resolve(HERE, 'states'); // gitignored scratch (recipe-replay states)
const COMMITTED_STATES = resolve(REPO_ROOT, 'test-fixtures', 'states'); // committed pinned states
const PINNED_SOURCE = resolve(REPO_ROOT, 'test-fixtures', 'original');  // committed game image
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

/** Drive a recipe via LiveSession (so dumpDraft is available at the waypoint). */
async function driveRecipe(s: LiveSession, steps: readonly string[], settleMs = 0): Promise<void> {
  await s.step(3000);               // boot → title
  await s.key('enter', 'tap');      // dismiss title → MASTER OPTIONS (cursor on ADD)
  await s.step(800);
  await driveSteps(s, steps, settleMs);
}

/** Drive a recipe FORWARD from a committed base machine (no boot/title). The
 *  base freezes a non-deterministic roll once; the forward steps are roll-free,
 *  so unserialize+drive is fully reproducible (used for roster-management
 *  screens that read an existing roster). */
async function driveFromBase(
  s: LiveSession, baseState: string, steps: readonly string[], settleMs = 0,
): Promise<void> {
  const basePath = join(COMMITTED_STATES, `${baseState}.state.gz`);
  if (!existsSync(basePath)) throw new Error(`missing base state: ${basePath} (mint it first)`);
  const tmpBase = join(TMP, `${baseState}.state`);
  writeFileSync(tmpBase, gunzipSync(readFileSync(basePath)));
  await s.unserialize(tmpBase);
  await s.step(5);                  // settle the restored frame
  await driveSteps(s, steps, settleMs);
}

/** Build an ephemeral source image = pinned test-fixtures/original/ + a committed
 *  pcfile overlay (test-fixtures/states/<fixture>.pcfile.dbs). Returns the dir to
 *  pass as LiveSession `source`. Used by `pcfileFixture` recipes to boot a fresh
 *  image whose roster already contains the created character — the savestate path
 *  can't carry an in-game SAVE's disk write across a re-mount. */
function buildSourceWithPcfile(fixture: string): string {
  const pcfile = join(COMMITTED_STATES, `${fixture}.pcfile.dbs`);
  if (!existsSync(pcfile)) throw new Error(`missing pcfile fixture: ${pcfile} (run gen-nathan-pcfile.ts)`);
  const src = mkdtempSync(join(TMP, 'src-'));
  cpSync(PINNED_SOURCE, src, { recursive: true });
  writeFileSync(join(src, 'pcfile.dbs'), readFileSync(pcfile));
  return src;
}

/** Drive a recipe from a fresh boot of a CUSTOM source image (no base unserialize). */
async function driveFromSource(
  s: LiveSession, steps: readonly string[], settleMs = 0,
): Promise<void> {
  await s.step(3000);               // boot → title
  await s.key('enter', 'tap');      // dismiss title → MASTER OPTIONS
  await s.step(800);
  await driveSteps(s, steps, settleMs);
}

/** Drive the per-step key macros, settling between steps. */
async function driveSteps(s: LiveSession, steps: readonly string[], settleMs = 0): Promise<void> {
  for (const step of steps) {
    for (const k of step.split(/\s+/)) { await s.key(k, 'tap'); await s.step(120); }
    await s.step(600);              // settle between recipe steps
  }
  if (settleMs) await s.step(Math.round((settleMs / 1000) * 70));
}

function diffVs(idx: Uint8Array, committed: string): boolean {
  const ref = gunzipSync(readFileSync(join(FIXTURES, `${committed}.idx.gz`)));
  let diff = 0;
  const rows = new Set<number>();
  for (let p = 0; p < idx.length; p++) if (idx[p] !== ref[p]) { diff++; rows.add(Math.floor(p / SCREEN_WIDTH)); }
  const pct = (100 * (idx.length - diff) / idx.length).toFixed(2);
  const rowList = [...rows].sort((a, b) => a - b);
  console.log(`vs ${committed}: ${pct}% match (${diff}/${idx.length} idx differ)`);
  if (diff) console.log(`  differing rows: ${rowList[0]}..${rowList[rowList.length - 1]} (${rowList.length} rows) — see /tmp/wiz6-libretro/${committed}.regen.png`);
  return diff === 0;
}

const STRUCTS = buildStructRegistry(ALL_STRUCTS);

async function main() {
  const name = process.argv[2];
  const vi = process.argv.indexOf('--validate');
  const validateAgainst = vi >= 0 ? process.argv[vi + 1] : undefined;
  const check = process.argv.includes('--check');
  const mint = process.argv.includes('--mint');
  // --mint-base: drive the recipe from a fresh boot and freeze ONLY the machine
  // to test-fixtures/states/<name>.state.gz (no fixture, no sidecar). Used to
  // build a committed BASE that other recipes forward-drive from via baseState.
  const mintBase = process.argv.includes('--mint-base');
  const recipe = name ? findRecipe(name) : undefined;
  if (!recipe) throw new Error(`unknown recipe: ${name}`);

  mkdirSync(TMP, { recursive: true });
  mkdirSync(FIXTURES, { recursive: true });
  mkdirSync(STATES, { recursive: true });
  mkdirSync(COMMITTED_STATES, { recursive: true });

  const committedStatePath = join(COMMITTED_STATES, `${name}.state.gz`);

  // ── --mint-base: freeze the recipe machine as a committed base state ─────────
  if (mintBase) {
    const s = new LiveSession(STRUCTS);
    await driveRecipe(s, recipe.steps, recipe.settleMs);
    const tmpState = join(TMP, `${name}.state`);
    await s.serialize(tmpState);
    s.close();
    writeFileSync(committedStatePath, gzipSync(readFileSync(tmpState)));
    console.log(`minted base ${name}: ${committedStatePath}`);
    return;
  }

  // ── --check pcfileFixture recipe: boot a fresh image overlaid with the
  // committed pcfile, drive the forward steps, fb → diff. Deterministic (no
  // creation roll); reads the baked-in created char from the boot roster. ──────
  if (check && recipe.pcfileFixture) {
    const src = buildSourceWithPcfile(recipe.pcfileFixture);
    const s = new LiveSession(STRUCTS, { source: src });
    await driveFromSource(s, recipe.steps, recipe.settleMs);
    await s.screenshot(`${TMP}/build.rgba`);
    s.close();
    const rgba = new Uint8Array(readFileSync(`${TMP}/build.rgba`));
    const idx = rgbaToIndices(rgba);
    writeFileSync(join(TMP, `${name}.regen.png`), encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, rgba));
    const ok = diffVs(idx, name);
    process.exitCode = ok ? 0 : 1;
    return;
  }

  // ── --check baseState recipe: unserialize the committed BASE, drive the
  // forward steps, fb → diff. No per-fixture .state — the frozen base + the
  // roll-free forward-drive is the reproducible path. ─────────────────────────
  if (check && recipe.baseState) {
    const s = new LiveSession(STRUCTS);
    await driveFromBase(s, recipe.baseState, recipe.steps, recipe.settleMs);
    await s.screenshot(`${TMP}/build.rgba`);
    s.close();
    const rgba = new Uint8Array(readFileSync(`${TMP}/build.rgba`));
    const idx = rgbaToIndices(rgba);
    writeFileSync(join(TMP, `${name}.regen.png`), encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, rgba));
    const ok = diffVs(idx, name);
    process.exitCode = ok ? 0 : 1;
    return;
  }

  // ── --check from committed frozen state (no driving) ───────────────────────
  if (check && existsSync(committedStatePath)) {
    const tmpState = join(TMP, `${name}.state`);
    writeFileSync(tmpState, gunzipSync(readFileSync(committedStatePath)));
    const s = new LiveSession(STRUCTS);
    await s.unserialize(tmpState);
    await s.step(5);
    await s.screenshot(`${TMP}/build.rgba`);
    s.close();
    const rgba = new Uint8Array(readFileSync(`${TMP}/build.rgba`));
    const idx = rgbaToIndices(rgba);
    writeFileSync(join(TMP, `${name}.regen.png`), encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, rgba));
    const ok = diffVs(idx, name);
    process.exitCode = ok ? 0 : 1;
    return;
  }

  // ── --mint: serialize-state + sidecar (non-deterministic creation rolls) ───
  if (mint) {
    let s: LiveSession;
    if (recipe.pcfileFixture) {
      // pcfileFixture recipe: boot a fresh image overlaid with the committed
      // pcfile (the baked-in created char), forward-drive (no roll). No per-fixture
      // .state — the committed pcfile + roll-free forward-drive is the source.
      s = new LiveSession(STRUCTS, { source: buildSourceWithPcfile(recipe.pcfileFixture) });
      await driveFromSource(s, recipe.steps, recipe.settleMs);
    } else if (recipe.baseState) {
      s = new LiveSession(STRUCTS);
      // baseState recipe: forward-drive from the committed base; do NOT write a
      // per-fixture state (the base + roll-free forward-drive is the source).
      await driveFromBase(s, recipe.baseState, recipe.steps, recipe.settleMs);
    } else {
      s = new LiveSession(STRUCTS);
      await driveRecipe(s, recipe.steps, recipe.settleMs);
      // Freeze the rolled machine → committed pinned source.
      const tmpState = join(TMP, `${name}.state`);
      await s.serialize(tmpState);
      writeFileSync(committedStatePath, gzipSync(readFileSync(tmpState)));
    }

    // Decode the engine's draft → committed sidecar.
    const dump = await s.dumpDraft();
    const sidecar = CreationDraftSidecarSchema.parse(dump);
    writeFileSync(
      join(FIXTURES, `${name}.character.json`),
      JSON.stringify(sidecar, null, 2) + '\n',
    );

    // Framebuffer fixture.
    await s.screenshot(`${TMP}/build.rgba`);
    s.close();
    const rgba = new Uint8Array(readFileSync(`${TMP}/build.rgba`));
    const idx = rgbaToIndices(rgba);
    writeFileSync(join(FIXTURES, `${name}.idx.gz`), gzipSync(idx));
    writeFileSync(join(FIXTURES, `${name}.png`), encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, rgba));
    const src = recipe.pcfileFixture
      ? `(from pcfile ${recipe.pcfileFixture})`
      : recipe.baseState ? `(from base ${recipe.baseState})` : 'state.gz +';
    console.log(`minted ${name}: ${src} character.json + idx.gz + png`);
    console.log(`  roll: class=${dump.draft['class']} bonusPool=${dump.bonusPool} attrs=[${(dump.draft['attributes'] as number[]).join(',')}]`);
    return;
  }

  // ── recipe replay (deterministic screens) ──────────────────────────────────
  // HostClient boots from an ephemeral COPY of the committed test-fixtures/original/
  // image by default — deterministic, and never touches the mutable ./original.
  const h = new HostClient();
  await driveRecipeRaw(h, recipe.steps, recipe.settleMs);
  if (!check) await h.serialize(join(STATES, `${name}.state`));
  await h.fb(`${TMP}/build.rgba`);
  h.close();

  const rgba = new Uint8Array(readFileSync(`${TMP}/build.rgba`));
  const idx = rgbaToIndices(rgba);

  if (check) {
    writeFileSync(join(TMP, `${name}.regen.png`), encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, rgba));
    const ok = diffVs(idx, name);
    process.exitCode = ok ? 0 : 1;
    return;
  }

  writeFileSync(join(FIXTURES, `${name}.idx.gz`), gzipSync(idx));
  writeFileSync(join(FIXTURES, `${name}.png`), encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, rgba));
  console.log(`wrote ${name}.idx.gz + .png + states/${name}.state`);
  if (validateAgainst) diffVs(idx, validateAgainst);
}

/** Raw-HostClient recipe driver (the original behaviour; serialize lives here). */
async function driveRecipeRaw(h: HostClient, steps: readonly string[], settleMs = 0): Promise<void> {
  await h.step(3000);
  await h.key('enter', 'tap');
  await h.step(800);
  for (const step of steps) {
    for (const k of step.split(/\s+/)) { await h.key(k, 'tap'); await h.step(120); }
    await h.step(600);
  }
  if (settleMs) await h.step(Math.round((settleMs / 1000) * 70));
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error(e.message ?? e); process.exit(1); });
