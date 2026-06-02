/**
 * probe-draft.ts — locate + decode the in-creation DRAFT character in live memory.
 *
 * Stage 4a RE proof. Drives a fresh creation through the committed
 * `creation-class-select` and `creation-portrait-select` recipes (via the
 * libretro harness), finds the draft buffer by its NATHAN name, decodes it with
 * the `character_record` BssStruct, and cross-checks the eligible class list
 * (classOffered) against the decoded attrs/bonus/sex.
 *
 * KEY FINDING (confirmed by this probe + wpcmk-screen-flow.json):
 *   - Draft buffer base = DGROUP 0x5470 (the creation staging buffer wpcmk
 *     memsets + writes; on commit it's roster_io_one_record'd into pcfile.dbs).
 *   - It uses the IDENTICAL 432-byte character_record field layout: name@0x00,
 *     age@0x08, attrs@0x12c, portrait@0x19c, race@0x19d, sex@0x19e,
 *     class@0x19f — so DGROUP 0x5470+field matches every cited absolute.
 *   - bonus_points_remaining is NOT in the record. It lives at DGROUP 0x56ac
 *     (= 0x5470 + 0x23c, OUTSIDE the 432-byte record), a separate u16 creation
 *     variable. The probe reads it directly.
 *
 * Usage: pnpm tsx tools/libretro/probe-draft.ts
 * (Not run in CI — committed staged so the parent can re-run the live decode.)
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import {
  ALL_STRUCTS,
  buildStructRegistry,
  decodeBssStruct,
  classOffered,
  type AttributeSet,
  type BssStruct,
} from '../../packages/data/src/index.js';

const REGISTRY = buildStructRegistry(ALL_STRUCTS);
const CHARACTER_RECORD = REGISTRY.get('character_record') as BssStruct;
import { findRecipe } from '../dosbox/state-catalog.js';

const DRAFT_BASE_DGROUP = 0x5470;          // hypothesis under test
const BONUS_POOL_DGROUP = 0x56ac;          // separate creation var (u16)
const NATHAN_HEX = '4e 41 54 48 41 4e';    // "NATHAN" ASCII

const CLASS_NAMES = [
  'Fighter', 'Mage', 'Priest', 'Thief', 'Ranger', 'Alchemist', 'Bard',
  'Psionic', 'Valkyrie', 'Bishop', 'Lord', 'Samurai', 'Monk', 'Ninja',
];

// Drive a recipe's steps with the same settle cadence build-state.ts uses.
async function driveRecipe(h: HostClient, steps: readonly string[], settleMs = 0): Promise<void> {
  await h.step(3000);            // boot → title
  await h.key('enter', 'tap');   // dismiss title → MASTER OPTIONS
  await h.step(800);
  for (const step of steps) {
    for (const k of step.split(/\s+/)) { await h.key(k, 'tap'); await h.step(120); }
    await h.step(600);
  }
  if (settleMs) await h.step(Math.round((settleMs / 1000) * 70));
}

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);

async function dumpDraft(label: string, h: HostClient): Promise<void> {
  const base = await h.anchor();
  console.log(`\n=== ${label} ===`);
  console.log(`DGROUP base (anchor) = 0x${base.toString(16)}`);

  // 1) Find NATHAN in guest memory → confirm the draft base.
  const phys = await h.find(NATHAN_HEX);
  if (phys < 0) { console.log('  NATHAN not found in memory!'); return; }
  const dgroupOffsetOfName = phys - base;
  console.log(`  NATHAN found at phys 0x${phys.toString(16)} → DGROUP +0x${dgroupOffsetOfName.toString(16)}`);
  console.log(`  expected draft base 0x${DRAFT_BASE_DGROUP.toString(16)}: ${dgroupOffsetOfName === DRAFT_BASE_DGROUP ? 'MATCH' : 'MISMATCH'}`);

  // 2) Decode the 432-byte record at the DRAFT base with the character_record struct.
  const recBytes = await h.read(base + DRAFT_BASE_DGROUP, CHARACTER_RECORD.bytes);
  const draft = decodeBssStruct(CHARACTER_RECORD, recBytes, 0, REGISTRY) as Record<string, unknown>;

  // 3) Read the separate bonus-pool var.
  const bonusBytes = await h.read(base + BONUS_POOL_DGROUP, 2);
  const bonusPool = u16(bonusBytes, 0);

  const attrs = draft.attributes as number[];
  console.log(`  name      = ${JSON.stringify(draft.name)}`);
  console.log(`  race      = ${draft.race}   sex = ${draft.sex} (+0x19e)`);
  console.log(`  class     = ${draft.class}`);
  console.log(`  portrait(+0x19c) = ${draft.rendered_portrait_index}`);
  console.log(`  age(days) = ${draft.age_counter}`);
  console.log(`  attrs[STR,INT,PIE,VIT,DEX,SPD,PER,KAR] = [${attrs.join(',')}]`);
  console.log(`  bonusPool (DGROUP 0x56ac) = ${bonusPool} (0x${bonusPool.toString(16)})`);

  // 4) Validate classOffered against the decoded draft.
  const attrSet: AttributeSet = {
    str: attrs[0]!, int: attrs[1]!, pie: attrs[2]!, vit: attrs[3]!,
    dex: attrs[4]!, spd: attrs[5]!, per: attrs[6]!, kar: attrs[7]!,
  };
  const offered = CLASS_NAMES.filter((_, i) =>
    classOffered(attrSet, bonusPool, draft.sex as number, i),
  );
  console.log(`  classOffered eligible: ${offered.join(', ')}`);
}

async function main() {
  // Waypoint 1: class-select (name typed, race/sex/attrs/bonus set, class not yet).
  {
    const recipe = findRecipe('creation-class-select')!;
    const h = new HostClient();
    await driveRecipe(h, recipe.steps, recipe.settleMs);
    await dumpDraft('WAYPOINT 1: creation-class-select', h);
    h.close();
  }

  // Waypoint 2: portrait-select (SAMURAI chosen, bonus drained to 0, on portrait picker).
  {
    const recipe = findRecipe('creation-portrait-select')!;
    const h = new HostClient();
    await driveRecipe(h, recipe.steps, recipe.settleMs);
    await dumpDraft('WAYPOINT 2: creation-portrait-select', h);
    h.close();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
