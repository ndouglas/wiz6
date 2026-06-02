/**
 * gen-nathan-pcfile.ts — generate the committed 1-char NATHAN roster pcfile.
 *
 * The dosbox-pure savestate does NOT capture host-mounted-file writes (proven in
 * docs/re/findings/creation-save-persistence.json): an in-game SAVE lands in the
 * ephemeral gameDir's pcfile.dbs and in RAM occupancy, but a fresh boot re-reads
 * the pinned pcfile, so the roster record is lost on re-mount. To get a
 * REPRODUCIBLE created character on the roster we BAKE it into the source pcfile.
 *
 * This drives the `minimal-roster` creation recipe ONCE, extracts the freshly
 * created NATHAN record (432 bytes) from the gameDir disk, and writes a 1-char
 * pcfile.dbs (NATHAN at slot 0) to test-fixtures/states/minimal-roster.pcfile.dbs.
 * Run ONCE to freeze a roll; thereafter the recipes boot from this committed
 * pcfile and are fully deterministic (no creation drive, no roll).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRecipe } from '../dosbox/state-catalog.js';
import { LiveSession } from '../../packages/mcp/src/live/live-session.js';
import { ALL_STRUCTS, buildStructRegistry } from '../../packages/data/src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const COMMITTED_STATES = resolve(REPO_ROOT, 'test-fixtures', 'states');
const STRUCTS = buildStructRegistry(ALL_STRUCTS);
const TMP = '/tmp/wiz6-libretro';
function hex(u: Uint8Array): string { return [...u].map((b) => b.toString(16).padStart(2, '0')).join(' '); }

async function drive(s: LiveSession, step: string) {
  for (const k of step.split(/\s+/)) { await s.key(k, 'tap'); await s.step(120); }
  await s.step(600);
}

async function main() {
  const recipe = findRecipe('minimal-roster')!;
  const s = new LiveSession(STRUCTS);
  await s.step(3000); await s.key('enter', 'tap'); await s.step(800);
  for (const step of recipe.steps) await drive(s, step);
  await s.step(40);

  // Grab the created record from the ephemeral gameDir's pcfile.dbs (slot 6).
  const dirs = readdirSync(TMP).filter((d) => d.startsWith('game-'))
    .map((d) => ({ d, t: statSync(join(TMP, d)).mtimeMs })).sort((a, b) => b.t - a.t);
  const pc = readFileSync(join(TMP, dirs[0]!.d, 'pcfile.dbs'));
  s.close();

  const srcBase = 24 + 6 * 0x1b0;
  const rec = pc.subarray(srcBase, srcBase + 0x1b0);
  const nm = [...rec.subarray(0, 8)].filter((c) => c >= 32 && c < 127).map((c) => String.fromCharCode(c)).join('');
  if (nm !== 'NATHAN') throw new Error(`expected NATHAN at slot 6, got "${nm}"`);

  // Build a fresh 16-slot pcfile with NATHAN at slot 0 only.
  const out = Buffer.alloc(24 + 16 * 0x1b0);
  out.writeUInt16LE(0x1b0, 0); // record_size
  out.writeUInt16LE(16, 2);    // slot_count
  out.writeUInt32LE(24, 4);    // header_size
  out[8] = 1;                  // slot_status[0] = available
  rec.copy(out, 24);

  const dest = join(COMMITTED_STATES, 'minimal-roster.pcfile.dbs');
  writeFileSync(dest, out);
  console.log(`wrote ${dest}`);
  console.log(`  NATHAN race=${rec[0x19d]} class=${rec[0x19f]} sex=${rec[0x1a1]} attrs=[${hex(new Uint8Array(rec.subarray(0x12c, 0x134)))}] hp=[${hex(new Uint8Array(rec.subarray(0x18, 0x1c)))}]`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
