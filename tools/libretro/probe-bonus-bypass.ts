/**
 * probe-bonus-bypass.ts — empirically confirm the *0x56ce bonus-bypass mechanism
 * and its TIMING through the real dosbox-pure engine.
 *
 * Three runs from a fresh boot each:
 *   A. control       — never set the flag → pool is a random 5..26 roll
 *   B. set-at-sex     — write 0x56ce=1 while on the SEX screen → pool forced to 21
 *   C. set-too-early  — write 0x56ce=1 at the NAME screen, then proceed → does it survive?
 *
 * At each step we read back 0x56ce (flag) and 0x56ac (pool) so we can SEE where
 * the value lives, whether the write lands, and when the engine clears it.
 *
 * Usage: pnpm tsx tools/libretro/probe-bonus-bypass.ts
 */
import { readFileSync, writeFileSync, mkdtempSync, cpSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LiveSession } from '../../packages/mcp/src/live/live-session.js';
import { ALL_STRUCTS, buildStructRegistry } from '../../packages/data/src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const PINNED = resolve(REPO_ROOT, 'test-fixtures', 'original');
const COMMITTED_STATES = resolve(REPO_ROOT, 'test-fixtures', 'states');
const TMP = '/tmp/wiz6-probe';
const STRUCTS = buildStructRegistry(ALL_STRUCTS);

const FLAG = 0x56ce; // debug bonus-bypass flag (cmp word [0x56ce],1)
const POOL = 0x56ac; // bonus_points_remaining

function sourceWithEmptyRoster(): string {
  mkdirSync(TMP, { recursive: true });
  const src = mkdtempSync(join(TMP, 'src-'));
  cpSync(PINNED, src, { recursive: true });
  writeFileSync(join(src, 'pcfile.dbs'), readFileSync(join(COMMITTED_STATES, 'empty-roster.pcfile.dbs')));
  return src;
}

async function tap(s: LiveSession, keys: string, settle = 120): Promise<void> {
  for (const k of keys.split(/\s+/).filter(Boolean)) { await s.key(k, 'tap'); await s.step(settle); }
  await s.step(600);
}

/** Read flag (word) + pool (word) and label the moment. */
async function snap(s: LiveSession, label: string): Promise<void> {
  const f = await s.read(FLAG, 2);
  const p = await s.read(POOL, 2);
  const fw = f[0]! | (f[1]! << 8);
  const pw = p[0]! | (p[1]! << 8);
  console.log(`    [${label}] *0x56ce=${fw} (bytes ${f[0]},${f[1]})   *0x56ac=${pw} (bytes ${p[0]},${p[1]})`);
}

/** Boot, reach the SEX screen of a fresh character. Returns at sex-select. */
async function bootToSex(s: LiveSession): Promise<void> {
  await s.step(3000);
  await s.key('enter', 'tap');
  await s.step(800);
  await tap(s, 'down enter'); // MASTER OPTIONS -> CHARACTER MENU
  await tap(s, 'up enter');   // -> CREATE PC (name prompt)
  await snap(s, 'name prompt');
  await tap(s, 'p r o b e enter'); // NAME
  await snap(s, 'after name');
  await tap(s, 'enter');           // RACE: Human (index 0)
  await snap(s, 'at SEX screen (pre-confirm)');
}

async function runControl(): Promise<number> {
  console.log('\n=== RUN A: control (never set flag) ===');
  const s = new LiveSession(STRUCTS, { source: sourceWithEmptyRoster() });
  await bootToSex(s);
  await tap(s, 'enter'); // confirm Male -> fires the roll
  await snap(s, 'after sex confirm (roll fired)');
  const { bonusPool } = await s.dumpDraft();
  console.log(`  >> RESULT pool = ${bonusPool}`);
  s.close();
  return bonusPool as number;
}

async function runSetAtSex(): Promise<number> {
  console.log('\n=== RUN B: set flag at SEX screen (correct timing) ===');
  const s = new LiveSession(STRUCTS, { source: sourceWithEmptyRoster() });
  await bootToSex(s);
  await s.write(FLAG, [1]);
  await snap(s, 'after write 0x56ce=1');
  await tap(s, 'enter'); // confirm Male -> fires the roll
  await snap(s, 'after sex confirm (roll fired)');
  const { bonusPool } = await s.dumpDraft();
  console.log(`  >> RESULT pool = ${bonusPool}`);
  s.close();
  return bonusPool as number;
}

async function runSetTooEarly(): Promise<number> {
  console.log('\n=== RUN C: set flag at NAME screen (too early?) ===');
  const s = new LiveSession(STRUCTS, { source: sourceWithEmptyRoster() });
  await s.step(3000);
  await s.key('enter', 'tap');
  await s.step(800);
  await tap(s, 'down enter');
  await tap(s, 'up enter');
  await s.write(FLAG, [1]);
  await snap(s, 'after write at name prompt');
  await tap(s, 'p r o b e enter');
  await snap(s, 'after name');
  await tap(s, 'enter'); // race
  await snap(s, 'at SEX (pre-confirm) — did flag survive?');
  await tap(s, 'enter'); // confirm sex -> roll
  await snap(s, 'after sex confirm (roll fired)');
  const { bonusPool } = await s.dumpDraft();
  console.log(`  >> RESULT pool = ${bonusPool}`);
  s.close();
  return bonusPool as number;
}

async function main() {
  const a = await runControl();
  const b = await runSetAtSex();
  const c = await runSetTooEarly();
  console.log('\n================ SUMMARY ================');
  console.log(`  A control (no flag)      : pool = ${a}  ${a >= 5 && a <= 26 ? '(random roll ✓)' : '(?!)'}`);
  console.log(`  B flag set at SEX        : pool = ${b}  ${b === 21 ? '(forced 21 ✓)' : '(NOT forced ✗)'}`);
  console.log(`  C flag set at NAME       : pool = ${c}  ${c === 21 ? '(survived → 21)' : '(did NOT survive → random)'}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
