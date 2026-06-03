/**
 * auto-equip.ts — equip a pcfile roster's carried kits into their body slots,
 * replaying the engine's own equip-eligibility logic.
 *
 * The engine issues starting kits CARRIED (wpcmk_issue_class_kit), not worn, so a
 * freshly-created party shows empty hands in the MASTER OPTIONS panel and no
 * equipped armor on the char sheet. This helper walks body slots 0..7 and, for
 * each, picks the first eligible carried item via `equipCandidates` (the same
 * class/race/sex-mask + dual-wield + shield-exclusivity logic the in-game EQUIP
 * wizard uses), then commits with `applyEquipSelections` (physical inventory
 * reorder + equipment[] + equipped flag + AC recompute — RE: wpcvw-post-equip-view).
 *
 * Used to pre-equip the committed Legendary Squad (so its hand icons + char sheet
 * read as equipped) and by build-legendary-squad.ts so a rebuild reproduces it.
 *
 * Run: `pnpm tsx tools/libretro/auto-equip.ts <pcfile> [--write] [--compare <other.dbs>]`
 *   default = dry-run (print the equip plan); --write overwrites <pcfile>;
 *   --compare diffs the resulting equipment[]+inventory order vs another roster
 *   (used to validate against an in-engine-equipped reference).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePcfile } from '../../packages/parser/src/formats/pcfile.js';
import { pcfileSlotToCharacter } from '../../packages/parser/src/formats/pcfile-character-bridge.js';
import { encodeCharacterRecord } from '../../packages/parser/src/formats/encode-character-record.js';
import { equipCandidates, applyEquipSelections, ScenarioDbSchema } from '../../packages/data/src/index.js';
import type { Character, PcfileSlot, ScenarioDb } from '../../packages/data/src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DUMMY_UUID = '00000000-0000-4000-8000-000000000000';

function loadScenarioDb(): ScenarioDb {
  return ScenarioDbSchema.parse(
    JSON.parse(readFileSync(join(ROOT, 'extracted', 'scenario', 'scenario.json'), 'utf-8')),
  );
}

/** Greedily equip a Character: for each body slot 0..7 take the first eligible
 *  carried item the engine would offer, then commit. Returns the equipped clone. */
export function autoEquipCharacter(char: Character, scenarioDb: ScenarioDb): { equipped: Character; selections: (number | null)[] } {
  const selections: (number | null)[] = new Array(8).fill(null);
  for (let bodySlot = 0; bodySlot < 8; bodySlot++) {
    const cands = equipCandidates(char, bodySlot, scenarioDb, selections);
    selections[bodySlot] = cands.length ? cands[0]! : null;
  }
  return { equipped: applyEquipSelections(char, selections, scenarioDb), selections };
}

/** Rebuild a PcfileSlot from an equipped Character, preserving every unmapped raw
 *  byte (encodeCharacterRecord starts from slot.raw and rewrites only the mapped
 *  fields: inventory @0x40, equipment @0x110, bodyAc/derivedAc, AC). */
function equippedSlot(orig: PcfileSlot, equipped: Character): PcfileSlot {
  return {
    ...orig,
    inventory: equipped.inventory!.map((it) => ({
      itemId: it.itemId, weight: it.weight, pad: 0,
      equipSlot: it.equipSlot, spriteIdx: it.spriteIdx, quantity: it.quantity, flags: it.flags,
    })),
    equipment: [...equipped.equipment!],
    bodyAc: equipped.bodyAc ? [...equipped.bodyAc] : orig.bodyAc,
    derivedAc: equipped.derivedAc ?? orig.derivedAc,
  };
}

/** Equip every populated slot in a pcfile buffer; return the new buffer + a plan. */
export function autoEquipPcfileBuffer(buf: Uint8Array, scenarioDb: ScenarioDb): {
  out: Uint8Array;
  plan: { slot: number; name: string; equipment: number[]; invIds: number[] }[];
} {
  const dec = decodePcfile(buf);
  const out = new Uint8Array(buf); // copy
  const recSize = dec.header.recordSize, hdr = dec.header.headerSize;
  const plan: { slot: number; name: string; equipment: number[]; invIds: number[] }[] = [];
  for (let i = 0; i < dec.slots.length; i++) {
    const slot = dec.slots[i]!;
    if (!slot.populated || !slot.name) continue;
    const char = pcfileSlotToCharacter(slot, DUMMY_UUID);
    const { equipped } = autoEquipCharacter(char, scenarioDb);
    const record = encodeCharacterRecord(equippedSlot(slot, equipped));
    out.set(record, hdr + i * recSize);
    plan.push({
      slot: i, name: slot.name,
      equipment: [...equipped.equipment!],
      invIds: equipped.inventory!.map((it) => it.itemId),
    });
  }
  return { out, plan };
}

// ── CLI ────────────────────────────────────────────────────────────────────
function main(): void {
  const args = process.argv.slice(2);
  const pcfilePath = args.find((a) => !a.startsWith('--'));
  const write = args.includes('--write');
  const compareIdx = args.indexOf('--compare');
  const comparePath = compareIdx >= 0 ? args[compareIdx + 1] : undefined;
  if (!pcfilePath) {
    console.error('usage: auto-equip.ts <pcfile> [--write] [--compare <other.dbs>]');
    process.exit(2);
  }
  const scenarioDb = loadScenarioDb();
  const buf = new Uint8Array(readFileSync(pcfilePath));
  const { out, plan } = autoEquipPcfileBuffer(buf, scenarioDb);

  for (const p of plan) {
    const worn = p.equipment.map((e, bs) => (e === 0xff ? '·' : `b${bs}=inv${e}(${p.invIds[e]})`)).filter((s) => !s.endsWith('·')).join(' ');
    console.log(`slot${p.slot} ${p.name.padEnd(7)} equipment=[${p.equipment.join(',')}] | ${worn}`);
  }

  if (comparePath) {
    const ref = decodePcfile(new Uint8Array(readFileSync(comparePath)));
    let mismatches = 0;
    for (const p of plan) {
      const r = ref.slots[p.slot];
      if (!r) continue;
      const refEq = [...r.equipment];
      const refIds = r.inventory.map((it) => it.itemId);
      const eqMatch = JSON.stringify(refEq) === JSON.stringify(p.equipment);
      const invMatch = JSON.stringify(refIds) === JSON.stringify(p.invIds);
      if (!eqMatch || !invMatch) {
        mismatches++;
        console.log(`  DIFF ${p.name}: equipment ours=[${p.equipment}] ref=[${refEq}] eqMatch=${eqMatch} invMatch=${invMatch}`);
        if (!invMatch) console.log(`       inv ours=[${p.invIds.slice(0, 10)}] ref=[${refIds.slice(0, 10)}]`);
      }
    }
    console.log(mismatches === 0 ? '✅ MATCHES reference (engine-equipped) for all slots' : `⚠️ ${mismatches} slot(s) differ from reference`);
  }

  if (write) {
    writeFileSync(pcfilePath, out);
    console.log(`\nwrote ${out.length} bytes -> ${pcfilePath}`);
  } else {
    console.log('\n(dry-run; pass --write to overwrite)');
  }
}

// Run the CLI only when invoked directly (not when imported by build-legendary-squad).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
