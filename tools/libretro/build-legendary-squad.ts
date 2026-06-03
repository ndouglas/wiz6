/**
 * build-legendary-squad.ts — drive the wiz6 character-creation flow through the
 * dosbox-pure harness to build a 6-character "Legendary Squad", using the
 * bonus-bypass flag (*0x56ce = 1 → next bonus roll = 21) so every member
 * qualifies for an elite class. Harvests the gameDir's pcfile.dbs.
 *
 * Each character is created in ONE session (no close between chars). The
 * created record lands in the ephemeral gameDir's pcfile.dbs (savestate does
 * NOT persist host-file writes), so we copy that file out BEFORE closing.
 *
 * Usage: pnpm tsx tools/libretro/build-legendary-squad.ts [--max N] [--shots]
 */
import {
  readFileSync, writeFileSync, mkdtempSync, cpSync, mkdirSync, readdirSync, statSync,
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LiveSession } from '../../packages/mcp/src/live/live-session.js';
import { ALL_STRUCTS, buildStructRegistry, ScenarioDbSchema } from '../../packages/data/src/index.js';
import { autoEquipPcfileBuffer } from './auto-equip.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { getRaceBaseStats } from '../../packages/data/src/character-creation/race-base-stats.js';
import { getClassRequirements } from '../../packages/data/src/character-creation/class-requirements.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const PINNED = resolve(REPO_ROOT, 'test-fixtures', 'original');
const COMMITTED_STATES = resolve(REPO_ROOT, 'test-fixtures', 'states');
const OUT_DIR = resolve(REPO_ROOT, 'legendary-squad');
const TMP = '/tmp/wiz6-libretro';
const SHOTS = '/tmp/squad-shots';
const STRUCTS = buildStructRegistry(ALL_STRUCTS);

const BONUS_BYPASS_FLAG = 0x56ce; // write 1 → next bonus roll = 21
const ATTR_NAMES = ['STR', 'INT', 'PIE', 'VIT', 'DEX', 'SPD', 'PER', 'KAR'] as const;

interface SquadMember {
  name: string;   // <= 7 chars
  race: number;
  class: number;
  sex: number;    // 0 male, 1 female
  portrait: number; // rendered-portrait index, stamped into record +0x19c post-harvest
}

// portrait = the chosen rendered portrait (record +0x19c). Creation leaves the
// rendered portrait at 0 (all identical); these are the distinct picks, stamped
// onto each record after harvest. (Hand-picked in-game, captured from the edited roster.)
const SQUAD: SquadMember[] = [
  { name: 'Twink', race: 5,  class: 13, sex: 0, portrait: 15 }, // Faerie Ninja M
  { name: 'Beau',  race: 9,  class: 10, sex: 0, portrait: 21 }, // Rawulf Lord M
  { name: 'Vexa',  race: 6,  class: 8,  sex: 1, portrait: 7 },  // Lizardman Valkyrie F
  { name: 'Sable', race: 8,  class: 11, sex: 1, portrait: 20 }, // Felpurr Samurai F
  { name: 'Ember', race: 7,  class: 12, sex: 1, portrait: 8 },  // Dracon Monk F
  { name: 'Quill', race: 10, class: 9,  sex: 0, portrait: 22 }, // Mook Bishop M
];

const SHOTS_ON = process.argv.includes('--shots');
const MAX_IDX = process.argv.indexOf('--max');
const MAX = MAX_IDX >= 0 ? Number(process.argv[MAX_IDX + 1]) : SQUAD.length;

function sourceWithPcfile(fixture: string): string {
  mkdirSync(TMP, { recursive: true });
  const src = mkdtempSync(join(TMP, 'src-'));
  cpSync(PINNED, src, { recursive: true });
  writeFileSync(join(src, 'pcfile.dbs'), readFileSync(join(COMMITTED_STATES, `${fixture}.pcfile.dbs`)));
  return src;
}

async function shot(s: LiveSession, name: string): Promise<void> {
  if (!SHOTS_ON) return;
  await s.screenshot(`${TMP}/shot.rgba`);
  const rgba = new Uint8Array(readFileSync(`${TMP}/shot.rgba`));
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(`${SHOTS}/${name}.png`, encodePngRgba(320, 200, rgba));
}

/** Tap a space-separated key macro, settling between keys + after the macro. */
async function tap(s: LiveSession, keys: string, settle = 120): Promise<void> {
  for (const k of keys.split(/\s+/).filter(Boolean)) { await s.key(k, 'tap'); await s.step(settle); }
  await s.step(600);
}

/** Pin the bonus-bypass flag (re-write each step through sex-select so it's set
 *  when the sex→class transition fires the bonus roll). */
async function pinBypass(s: LiveSession): Promise<void> {
  await s.write(BONUS_BYPASS_FLAG, [1]);
}

/** Draft attributes as a plain [STR..KAR] number array. */
function draftAttrs(draft: Record<string, unknown>): number[] {
  return (draft['attributes'] as number[]).slice();
}

/**
 * Build the picker navigation to reach the target class. The class picker is a
 * column-major grid (11 rows, then wraps to a 2nd column), populated with ONLY
 * the qualifying classes in engine class-index order. We compute the eligible
 * list (deficit <= pool, female-only Valkyrie gated by sex), find the target's
 * position, and emit `right`×col + `down`×row.
 */
function classNav(m: SquadMember, pool: number): { keys: string; pos: number } {
  const base = getRaceBaseStats(m.race);
  const baseArr = [base.str, base.int, base.pie, base.vit, base.dex, base.spd, base.per];
  const eligible: number[] = [];
  for (let ci = 0; ci < 14; ci++) {
    if (ci === 8 && m.sex !== 1) continue; // Valkyrie female-only
    const r = getClassRequirements(ci);
    const req = [r.str, r.int, r.pie, r.vit, r.dex, r.spd, r.per];
    let def = 0;
    for (let a = 0; a < 7; a++) def += Math.max(0, req[a]! - baseArr[a]!);
    if (def <= pool) eligible.push(ci);
  }
  const pos = eligible.indexOf(m.class);
  if (pos < 0) throw new Error(`${m.name}: class ${m.class} not eligible (pool ${pool})`);
  const col = Math.floor(pos / 11);
  const row = pos % 11;
  const keys = [...Array(col).fill('right'), ...Array(row).fill('down')].join(' ');
  return { keys, pos };
}

/**
 * Closed-loop bonus allocator. Reads the live draft; for each gated attribute
 * raises it to the class minimum, then dumps any leftover pool into non-maxed
 * attributes (cap 18). Drives the allocator: `down`/`up` move the cursor (next/
 * prev attr), `right` = +1, `left` = -1. The cursor starts on STR (index 0).
 * Confirm (`enter`) is gated on pool==0.
 */
async function allocateBonus(s: LiveSession, m: SquadMember): Promise<void> {
  const req = getClassRequirements(m.class);
  const minReq = [req.str, req.int, req.pie, req.vit, req.dex, req.spd, req.per];

  let { draft, bonusPool } = await s.dumpDraft();
  let attrs = draftAttrs(draft);
  console.log(`    [alloc] entry pool=${bonusPool} attrs=[${attrs.slice(0, 7).join(',')}]`);

  // Plan the target per attribute: meet minimum, then spend leftover.
  const target = attrs.slice(0, 7);
  let pool = bonusPool;
  for (let a = 0; a < 7; a++) {
    const need = Math.max(0, minReq[a]! - target[a]!);
    const add = Math.min(need, pool);
    target[a]! += add;
    pool -= add;
  }
  for (let a = 0; a < 7 && pool > 0; a++) {
    const room = 18 - target[a]!;
    const add = Math.min(room, pool);
    target[a]! += add;
    pool -= add;
  }
  if (pool > 0) throw new Error(`${m.name}: cannot spend full pool (${pool} left over after cap)`);
  console.log(`    [alloc] plan target=[${target.join(',')}]`);

  // The cursor starts at attr 0 (STR). Walk attr 0..6; for each, press `right`
  // to add (target - current) points, then `down` to the next attr.
  let cursor = 0;
  for (let a = 0; a < 7; a++) {
    const add = target[a]! - attrs[a]!;
    for (let k = 0; k < add; k++) { await s.key('right', 'tap'); await s.step(60); }
    if (a < 6) { await s.key('down', 'tap'); await s.step(60); cursor = a + 1; }
  }
  await s.step(400);

  // Verify pool drained.
  ({ draft, bonusPool } = await s.dumpDraft());
  attrs = draftAttrs(draft);
  console.log(`    [alloc] post pool=${bonusPool} attrs=[${attrs.slice(0, 7).join(',')}]`);
  if (bonusPool !== 0) {
    throw new Error(`${m.name}: pool not drained (${bonusPool} left) — alloc nav off`);
  }
  void cursor;
  // Confirm → KARMA.
  await tap(s, 'enter');
}

/** Create ONE character from the CREATE PC name prompt through SAVE → YES. */
async function createOne(s: LiveSession, m: SquadMember, idx: number): Promise<void> {
  console.log(`\n=== [${idx}] ${m.name} — race ${m.race} class ${m.class} sex ${m.sex} ===`);

  // NAME: type letters + enter.
  await tap(s, m.name.toLowerCase().split('').join(' ') + ' enter');
  await shot(s, `${idx}-${m.name}-a-name`);

  // RACE: single-column list, cursor starts at index 0 (Human). down×race + enter.
  await tap(s, [...Array(m.race).fill('down'), 'enter'].join(' '));
  await shot(s, `${idx}-${m.name}-b-race`);

  // SEX: 2 options, cursor on Male(0). Pin bypass HERE so the sex→class roll = 21.
  await pinBypass(s);
  await tap(s, m.sex === 1 ? 'down enter' : 'enter');
  await pinBypass(s); // re-pin (defensive) — confirm fires the roll
  await shot(s, `${idx}-${m.name}-c-sex`);

  // After sex, the engine rolls the bonus (should be 21 via bypass) and shows CLASS.
  let { bonusPool } = await s.dumpDraft();
  console.log(`    bonusPool after sex = ${bonusPool}`);
  if (bonusPool !== 21) {
    // Bypass may need pinning right before the roll; try once more by stepping.
    console.log(`    WARNING: expected pool 21, got ${bonusPool}`);
  }

  // CLASS: navigate to the target in the qualification-gated picker.
  const { keys, pos } = classNav(m, bonusPool);
  console.log(`    classNav pos=${pos} keys="${keys}"`);
  await tap(s, (keys + ' enter').trim());
  await shot(s, `${idx}-${m.name}-d-class`);

  // Verify class was committed.
  let dump = await s.dumpDraft();
  console.log(`    after class: class=${dump.draft['class']} race=${dump.draft['race']} sex=${dump.draft['sex']} attrs=[${draftAttrs(dump.draft).slice(0, 7).join(',')}]`);
  if (dump.draft['class'] !== m.class) {
    throw new Error(`${m.name}: class mismatch — wanted ${m.class}, got ${dump.draft['class']}`);
  }

  // BONUS ALLOCATOR.
  await allocateBonus(s, m);
  await shot(s, `${idx}-${m.name}-e-karma`);

  // PERSONALITY (KARMA): accept.
  await tap(s, 'enter');
  await shot(s, `${idx}-${m.name}-f-portrait`);

  // PORTRAIT: accept default.
  await tap(s, 'enter');
  await shot(s, `${idx}-${m.name}-g-skill`);

  // SKILL-train: drain the budget into the cursor skill, then exit.
  // (Budget rng(9)+10 minus class tier2; 20 'right' empties any single-skill
  // budget; then 'enter' exits SKILLS.)
  await tap(s, Array(20).fill('right').join(' ') + ' enter');
  await shot(s, `${idx}-${m.name}-h-after-skill`);

  // SPELL-pick (casters: Bishop, plus any caster class) — handled adaptively below.
  await maybeSpellPick(s, m, idx);

  // CONFIRM: SAVE THIS CHARACTER? YES NO — YES highlighted. enter → save → CHAR MENU.
  await shot(s, `${idx}-${m.name}-i-confirm`);
  dump = await s.dumpDraft();
  console.log(`    pre-save draft: name=${dump.draft['name']} class=${dump.draft['class']} attrs=[${draftAttrs(dump.draft).slice(0, 7).join(',')}]`);
  await tap(s, 'enter');
  await shot(s, `${idx}-${m.name}-j-saved`);
  console.log(`    state after save: ${JSON.stringify(await s.state())}`);
}

const PILLARS_DGROUP = 0x5588; // MAGIC/FAITH/PHYSICAL/MENTAL per-pillar spell budgets

async function pillarSum(s: LiveSession): Promise<number> {
  const b = await s.read(PILLARS_DGROUP, 4);
  return b[0]! + b[1]! + b[2]! + b[3]!;
}

/**
 * Spell-pick screen handling (screen-14). Only casters (nonzero pillar budgets at
 * DGROUP 0x5588..0x558b) reach it after skill-train; the skill-drain `enter`
 * lands on it. The picker requires `enter` (select the highlighted level-1 spell
 * → shows COST) + `enter` (confirm → learns, decrements the spell's pillar). When
 * the current school's pillar is exhausted, `down` cycles to the next school.
 * The screen auto-advances to the SAVE confirm once every pillar hits 0.
 *
 * Strategy (verified for Bishop MAGIC=1+FAITH=1): while any pillar > 0, try
 * `enter enter` to spend from the current school; if the sum didn't drop, `down`
 * to the next school and retry. Bail after a bounded number of attempts.
 */
async function maybeSpellPick(s: LiveSession, m: SquadMember, idx: number): Promise<void> {
  let remaining = await pillarSum(s);
  if (remaining === 0) return; // non-caster — already at the SAVE confirm
  console.log(`    [spell] pillars sum=${remaining} (caster) — picking spells`);
  await shot(s, `${idx}-${m.name}-sp-0`);

  let guard = 0;
  let schoolHops = 0;
  while (remaining > 0 && guard < 20) {
    const before = remaining;
    await tap(s, 'enter enter'); // select highlighted spell + confirm cost
    remaining = await pillarSum(s);
    if (remaining < before) {
      console.log(`    [spell] picked a spell (sum ${before} -> ${remaining})`);
      await shot(s, `${idx}-${m.name}-sp-pick-${guard}`);
      schoolHops = 0;
    } else if (remaining > 0) {
      // Current school has nothing spendable for the remaining pillars; advance.
      await tap(s, 'down');
      schoolHops++;
      if (schoolHops > 6) throw new Error(`${m.name}: spell-pick stuck (pillars=${remaining})`);
    }
    guard++;
  }
  if (remaining !== 0) throw new Error(`${m.name}: spell pillars not drained (${remaining})`);
  console.log(`    [spell] all pillars drained`);
}

function harvestCreatedRecord(gameDir: string, slot: number): Buffer {
  const pc = readFileSync(join(gameDir, 'pcfile.dbs'));
  const base = 24 + slot * 0x1b0;
  return pc.subarray(base, base + 0x1b0) as Buffer;
}

function latestGameDir(): string {
  const dirs = readdirSync(TMP)
    .filter((d) => d.startsWith('game-'))
    .map((d) => ({ d, t: statSync(join(TMP, d)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!dirs.length) throw new Error('no game-* dir found in ' + TMP);
  return join(TMP, dirs[0]!.d);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const s = new LiveSession(STRUCTS, { source: sourceWithPcfile('empty-roster') });
  await s.step(3000);
  await s.key('enter', 'tap');
  await s.step(800);
  console.log('boot state:', await s.state());

  for (let i = 0; i < MAX; i++) {
    const m = SQUAD[i]!;
    // Reach CREATE PC name prompt from CHARACTER MENU.
    if (i === 0) {
      // First time: MASTER OPTIONS → CHARACTER MENU (down enter) → CREATE PC (up enter).
      await tap(s, 'down enter');
      await tap(s, 'up enter');
    } else {
      // After a save we return to the CHARACTER MENU (cursor on EXIT). With a
      // populated roster the layout changes; reach CREATE PC adaptively below.
      await reachCreatePcFromCharMenu(s);
    }
    await createOne(s, m, i);
  }

  // Harvest the gameDir pcfile BEFORE closing.
  const gameDir = latestGameDir();
  console.log(`\nharvesting from ${gameDir}`);
  const srcPc = readFileSync(join(gameDir, 'pcfile.dbs'));
  // Build a fresh 16-slot pcfile with the created members at slots 0..MAX-1.
  const out = Buffer.alloc(24 + 16 * 0x1b0);
  out.writeUInt16LE(0x1b0, 0);
  out.writeUInt16LE(16, 2);
  out.writeUInt32LE(24, 4);
  for (let i = 0; i < MAX; i++) {
    out[8 + i] = 1; // slot_status = available
    const rec = harvestCreatedRecord(gameDir, i);
    rec.copy(out, 24 + i * 0x1b0);
    out[24 + i * 0x1b0 + 0x19c] = SQUAD[i]!.portrait; // stamp the chosen rendered portrait
  }
  void srcPc;
  // The engine issues kits CARRIED, not worn. Pre-equip each member (engine equip
  // logic) so the squad ships with gear in its body slots — populating the MASTER
  // OPTIONS hand icons + the char-sheet equipped state. See auto-equip.ts.
  const scenarioDb = ScenarioDbSchema.parse(
    JSON.parse(readFileSync(resolve(REPO_ROOT, 'extracted', 'scenario', 'scenario.json'), 'utf-8')),
  );
  const { out: equipped } = autoEquipPcfileBuffer(out, scenarioDb);
  writeFileSync(join(OUT_DIR, 'pcfile.dbs'), equipped);
  console.log(`wrote ${join(OUT_DIR, 'pcfile.dbs')} (pre-equipped)`);

  s.close();
}

/** From the CHARACTER MENU over a populated roster, reach CREATE PC name prompt.
 *  Populated-roster CHARACTER MENU is column-major 6-option (CREATE PC, REVIEW,
 *  DELETE, RENAME, PORTRAIT, EXIT). cursor on EXIT (bottom-right). CREATE PC =
 *  col0,row0 → from EXIT(col2,row1): left left up. */
async function reachCreatePcFromCharMenu(s: LiveSession): Promise<void> {
  // The save flow returns us to the CHARACTER MENU directly (cursor on EXIT).
  await tap(s, 'left left up enter');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
