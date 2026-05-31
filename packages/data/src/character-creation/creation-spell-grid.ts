//
// The character-creation spell picker offers only LEVEL-1 spells, filtered by
// the class's book mask, grouped into the six schools (0=Fire..5=Magic). The
// engine presents these as a 3x2 school grid; each cell drills into a per-school
// spell sub-list. See docs/re/findings/spell-picker-eligibility.json.
import { SPELL_TABLE, type SpellEntry } from './spell-table.js';
import { CLASS_SPELLBOOKS } from './spell-schools.js';

/** Engine book index -> byte5 mask: Mage=8, Priest=4, Alchemist=1, Psionic=2. */
const BOOK_MASK = [8, 4, 1, 2] as const;

export interface CreationSpell {
  entryIdx: number;
  entry: SpellEntry;
}

/**
 * Six arrays (one per school 0..5) of the level-1 spells `classIdx` may pick at
 * creation. A school with no eligible spell yields an empty array (blank cell).
 */
export function creationSpellGrid(classIdx: number): CreationSpell[][] {
  const grid: CreationSpell[][] = [[], [], [], [], [], []];
  const books = CLASS_SPELLBOOKS[classIdx];
  if (!books) return grid;
  let mask = 0;
  books.forEach((picks, bookIdx) => {
    if (picks > 0) mask |= BOOK_MASK[bookIdx]!;
  });
  if (mask === 0) return grid;
  SPELL_TABLE.forEach((entry, entryIdx) => {
    if (entry.level === 1 && entry.school < 6 && (entry.byte5 & mask) !== 0) {
      grid[entry.school]!.push({ entryIdx, entry });
    }
  });
  return grid;
}

/** Total starter-spell picks required for the class (sum of its CLASS_SPELLBOOKS row). */
export function creationPickCount(classIdx: number): number {
  return (CLASS_SPELLBOOKS[classIdx] ?? []).reduce<number>((sum, n) => sum + n, 0);
}
