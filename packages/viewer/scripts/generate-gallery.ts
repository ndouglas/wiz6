#!/usr/bin/env tsx
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePcfile } from '@wiz6/parser';
import { RosterSchema, type Character, type Roster } from '@wiz6/data';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const PCFILE = join(REPO, 'original', 'pcfile.dbs');
const OUT = join(HERE, '..', 'public', 'gallery', 'characters.json');

function slotUuid(n: number): string {
  // Deterministic UUID v4-shaped (4xxx + 8/9/a/bxxx) from slot index, so
  // re-running the generator produces the same ids. zod's `.uuid()`
  // accepts this format.
  const hex = n.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

const bytes = new Uint8Array(readFileSync(PCFILE));
const decoded = decodePcfile(bytes);

const characters: Character[] = decoded.slots
  .filter((s) => s.populated && s.name !== null)
  .map((s, i) => ({
    id: slotUuid(i),
    name: s.name!,
    // All fields below decoded from pcfile.dbs (field offsets confirmed by
    // wpcvw.ovr ASM traces; see docs/re/findings/character-record-extended-map.json).
    level: s.level,
    xp: s.xp,
    // mks (Monster Kill Statistic) at +0x10 (abs 0x43f8). Manual p. 23. Stock chars all 0.
    mks: s.mks,
    // Race at +0x19d (abs 0x4585): stats panel mov al,[bx+0x4585]; add ax,0x64 -> msg lookup.
    race: s.race,
    // Class at +0x19f (abs 0x4587): stats panel mov al,[bx+0x4587]; add ax,0x78 -> msg lookup.
    class: s.class,
    // savedOldLevel at +0x1af (abs 0x4597): class_change_apply writes old level here.
    // 0 for all stock chars (never changed class). HIGH confidence.
    savedOldLevel: s.savedOldLevel,
    // Gold at +0x14 (abs 0x43fc/0x43fe): 32-bit field, 0 for all stock chars.
    gold: s.gold,
    // encumbranceCurrent at +0x20: current load in tenths of a pound. martydill cross-ref.
    encumbranceCurrent: s.encumbranceCurrent,
    // encumbranceMax at +0x22: max carry capacity in tenths of a pound. martydill cross-ref.
    encumbranceMax: s.encumbranceMax,
    // conditions[10] at +0x122 (abs 0x450a). conditions[2]=dead, [3]=paralyzed.
    // All stock chars healthy → all zeros. HIGH confidence.
    conditions: s.conditions,
    dead: s.conditions[2] !== 0,
    paralyzed: s.conditions[3] !== 0,
    // Attributes at +0x12c..+0x133 (abs 0x4514..0x451b).
    // Stats panel loop: [bx+0x4514+i] for i=0..7, msgs 0xcc..0xd3 = STR/INT/PIE/VIT/DEX/SPD/PER/KAR.
    // PER=Personality, KAR=Karma — confirmed distinct named stats per manual p. 11.
    attributes: {
      str: s.str,
      int: s.int,
      pie: s.pie,
      vit: s.vit,
      dex: s.dex,
      spd: s.spd,
      per: s.per,
      kar: s.kar,
    },
    // School mana: 6 schools (Fire/Water/Air/Earth/Mental/Divine).
    // Interleaved (cur u16, max u16) pairs at +0x28+i*4 and +0x2a+i*4.
    // Stats panel loop (file+0x0e55+0x4c): for i=0..5; [bx+0x4410] cur; [bx+0x4412] max.
    schoolMana: s.schoolManaCur,
    schoolManaMax: s.schoolManaMax,
    // skills[30] at +0x134..+0x151 (abs 0x451c). Cap = 50 (0x32). HIGH confidence.
    // EXTENDED from 14 to 30 bytes. Index map: 0=Sword,1=Axe,...15=Skulduggery,...28=Thaumaturgy.
    skills: s.skills,
    // bodyAc[7] at +0x161..+0x167. Manual p. 25: AC sub-components. Stock=[0,0,10,10,10,10,10].
    bodyAc: s.bodyAc,
    // reaction at +0x168 (abs 0x4550). Range 0..100. HIGH confidence.
    // Stock chars: THESUS=20, TEMPEST=12, LYSANDR=16, NOBAL=20, TREON=16, PENTAG=40.
    reaction: s.reaction,
    // npcRaceReaction: 31 bytes at +0x169 (abs 0x4551). HIGH confidence.
    // Per-NPC-race reaction scores; initialized to base reaction.
    npcRaceReaction: s.npcRaceReaction,
    // spellSlotsKnown: 20 bytes at +0x188. LOW confidence. Casters only.
    spellSlotsKnown: s.spellSlotsKnown,
    // portraitIndex at +0x1ab (abs 0x4593). MEDIUM confidence.
    portraitIndex: s.portraitIndex,
    // derivedAc at +0x160 (abs 0x4548). HIGH confidence.
    derivedAc: s.derivedAc,
    // schoolRankThresholds at +0x152 (abs 0x453a). MEDIUM confidence.
    schoolRankThresholds: s.schoolRankThresholds,
    // inventory: 22 slots x 8 bytes at +0x40 (abs 0x4428). HIGH confidence.
    // item_id=0 means empty slot. Stock chars have 5 items each (slots 5..21 zero).
    inventory: s.inventory.map(({ itemId, weight, equipSlot, spriteIdx, quantity, flags }) => ({
      itemId,
      weight,
      equipSlot,
      spriteIdx,
      quantity,
      flags,
    })),
    // equipment: 8-byte body-slot array at +0x110 (abs 0x44f8).
    // Each byte = inventory index (0..21) or 255=empty. Stock chars all 255.
    equipment: s.equipment,
  }));

const roster: Roster = { schemaVersion: 1, characters };
RosterSchema.parse(roster); // validate before writing

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(roster, null, 2) + '\n');
console.log(`wrote ${OUT} with ${characters.length} characters`);
