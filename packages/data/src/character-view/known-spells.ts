/**
 * Decode a character's LEARNED/KNOWN spells from the record's known-spell bitset.
 *
 * The bitset lives at record +0x188 (surfaced as `Character.spellSlotsKnown`, a
 * 20-byte array; only the first 11 bytes are meaningful — ceil(82/8)). Spell-table
 * index `i` (0..81, the same table the creation picker uses) is KNOWN iff bit
 * `i & 7` of byte `i >> 3` is set. This is the per-character spellbook the camp
 * SPELL viewer (and the dungeon cast screen) enumerate — distinct from the
 * creation "available-at-creation" book mask (`SpellEntry.byte5`).
 *
 * RE: docs/re/findings/wpcvw-known-spells.json (renderer wpcvw 0x32a6 → per-school
 * list builder 0x318a → bit-test thunk wroot 0x2aaf against record+0x4570; cost =
 * spell-table byte +0x2 = `SpellEntry.b2`). Verified vs the pinned roster:
 * TREON {0,48}=Fire/Mental-L1, PENTAG {9,37}=Water/Earth-L1, NOBAL {50,64}=Mental/
 * Divine-L1; fighters/thief empty.
 */
import { SPELL_TABLE } from '../character-creation/spell-table.js';
import type { Character } from '../schemas/character.js';

export interface KnownSpell {
  /** Spell-table index 0..81 (also the name-message offset base via id+0xfa0). */
  index: number;
  /** 0=Fire, 1=Water, 2=Air, 3=Earth, 4=Mental, 5=Divine. */
  school: number;
  level: number;
  /** SP cost shown in the sublist (spell-table byte +0x2). */
  cost: number;
}

/** Is spell-table index `i` set in the known-spell bitset? */
export function isSpellKnown(bitset: ReadonlyArray<number>, i: number): boolean {
  return ((bitset[i >> 3] ?? 0) >> (i & 7) & 1) === 1;
}

/** All spells a character has learned, in spell-table order. */
export function knownSpells(character: Character): KnownSpell[] {
  const bitset = character.spellSlotsKnown ?? [];
  const out: KnownSpell[] = [];
  for (let i = 0; i < SPELL_TABLE.length; i++) {
    if (!isSpellKnown(bitset, i)) continue;
    const e = SPELL_TABLE[i]!;
    out.push({ index: i, school: e.school, level: e.level, cost: e.b2 });
  }
  return out;
}

/** Known spells grouped into the 6-school grid (FIRE/WATER/AIR/EARTH/MENTAL/DIVINE)
 *  the spellbook viewer navigates. Index = school 0..5. */
export function knownSpellsBySchool(character: Character): KnownSpell[][] {
  const grid: KnownSpell[][] = [[], [], [], [], [], []];
  for (const s of knownSpells(character)) {
    if (s.school >= 0 && s.school < grid.length) grid[s.school]!.push(s);
  }
  return grid;
}
