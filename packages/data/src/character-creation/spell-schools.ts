/**
 * Spell-school assignment per class — RE findings for wpcmk.ovr.
 *
 * ## Two-layer model
 *
 * Wiz6 has TWO orthogonal layers for spell access:
 *
 * 1. **Class → Spellbook(s).** 4 spellbooks exist: Mage, Priest, Alchemist,
 *    Psionic. At character creation, the engine sets per-spellbook flag
 *    bytes at DGROUP+0x5588..0x558B (one per book). The byte value is the
 *    number of starter-spell PICKS the class gets from that book — most
 *    casters get 2 picks from one book; Bishop is the hybrid getting 1
 *    pick from each of two books. The spell picker decrements the flag
 *    after each successful pick and loops until it hits zero. Most classes
 *    set zero flags — they get NO starter spell pick at creation. Encoded
 *    in `CLASS_SPELLBOOKS` below.
 *
 * 2. **Spellbook → Schools.** Each of the 4 spellbooks contains a fixed
 *    list of spells, each spell carrying a school index 0..5 (Fire / Water
 *    / Air / Earth / Mental / Divine) and a book-membership bitmask. Three
 *    of four books actually have spells in all 6 schools — only Alchemist
 *    lacks Fire spells. Encoded in `SPELLBOOK_SCHOOLS` below.
 *
 * The per-class `CLASS_SCHOOLS` matrix at the bottom is derived: the union
 * of `SPELLBOOK_SCHOOLS` rows for whichever books the class has access to.
 *
 * ## RE evidence
 *
 * ### Class → Spellbook — CONFIRMED (static asm)
 * The dispatch table at wpcmk file 0x4a6d (= runtime CS:0x8FD1, delta 0x4564)
 * has 14 word-pointers, one per class. Each handler optionally prefixes a
 * `mov byte [DGROUP+0x558X], NN` instruction setting the spellbook flag.
 * Walked statically; runtime-verified against save 1 at phys 0x11299.
 *
 *   - Mage handler @0x492D    sets [0x5588]=2 → Mage primary
 *   - Priest handler @0x4952  sets [0x5589]=2 → Priest primary
 *   - Alchemist @0x498F       sets [0x558A]=2 → Alchemist primary
 *   - Psionic @0x49CC         sets [0x558B]=2 → Psionic primary
 *   - Bishop @0x4A03          sets [0x5588]=1 AND [0x5589]=1 → Mage+Priest both secondary
 *   - All other 9 classes     set no flags (no starter-spell pick at creation)
 *
 * ### Spellbook → Schools — DIRECTLY from the spell table
 * The 82-entry spell table at DGROUP+0xde stores per-spell `byte5` as a
 * 4-bit book-membership bitmask: bit 3 = Mage, bit 2 = Priest, bit 1 =
 * Alchemist, bit 0 = Psionic. Grouping the 82 entries by which book(s)
 * each appears in:
 *
 *   - Mage book      (mask 0x08): 33 spells, all 6 schools
 *   - Priest book    (mask 0x04): 33 spells, all 6 schools
 *   - Alchemist book (mask 0x02): 32 spells, 5 schools (NO Fire)
 *   - Psionic book   (mask 0x01): 25 spells, all 6 schools
 *
 * The earlier reading of "Mage covers Fire/Water/Air/Earth/Mental but not
 * Divine" came from cross-validating stock-character schoolMana values
 * (TREON, PENTAG). That cross-validation actually tells us what schools
 * the player CHOSE FROM during creation, not what the book offers. A
 * starter Mage gets 2 picks from a pool of 33 spells across 6 schools —
 * the resulting schoolMana distribution depends on the player's selections.
 *
 * ### See also
 * `docs/re/findings/spell-school-assignment.json` for full evidence with
 * byte-level anchors, supersedes-history, and unresolved items.
 */

/** School index → school name. Confirmed from spell table at DGROUP+0xde. */
export const SCHOOL_NAMES: readonly string[] = [
  'Fire',    // 0
  'Water',   // 1
  'Air',     // 2
  'Earth',   // 3
  'Mental',  // 4
  'Divine',  // 5
];

/** Spellbook index → spellbook name. Confirmed from per-handler MOV-byte
 *  writes to DGROUP+0x5588..0x558B (one byte per book, in this order). */
export const SPELLBOOK_NAMES: readonly string[] = [
  'Mage',       // book 0, flag byte DGROUP+0x5588
  'Priest',     // book 1, flag byte DGROUP+0x5589
  'Alchemist',  // book 2, flag byte DGROUP+0x558A
  'Psionic',    // book 3, flag byte DGROUP+0x558B
];

/** Class index → class name (matches `CLASS_REQUIREMENTS`). */
export const CLASS_INDEX_TO_NAME: readonly string[] = [
  'Fighter', 'Mage', 'Priest', 'Thief', 'Ranger', 'Alchemist', 'Bard',
  'Psionic', 'Valkyrie', 'Bishop', 'Lord', 'Samurai', 'Monk', 'Ninja',
];

/**
 * Number of starter-spell picks the class gets from a given spellbook.
 * The byte value the wpcmk handler writes to the spellbook flag IS this count:
 *   - 0 = class does not have this book
 *   - 1 = one pick from this book (Bishop's hybrid case)
 *   - 2 = two picks from this book (primary caster default)
 *
 * Confirmed by the picker loop at wpcmk 0x4ef2..0x4f16: it reads
 * `byte [bx+0x5588]`, calls the picker once if non-zero, and the picker
 * itself decrements `[bx+0x5588]` at file 0x2AF6 after each spell selection.
 * The outer loop terminates when the flag reaches zero.
 */
export type SpellbookPickCount = 0 | 1 | 2;

/**
 * `CLASS_SPELLBOOKS[classIdx]` returns a tuple of 4 `SpellbookPickCount` values
 * — one per spellbook in `SPELLBOOK_NAMES` order (Mage, Priest, Alchemist,
 * Psionic). A row of all zeros means the class is a non-caster at creation.
 *
 * Decoded from wpcmk dispatch handlers at file 0x491A..0x4A6D. The flag
 * values mirror the per-handler `mov byte [DGROUP+0x558X], NN` prefixes.
 */
export const CLASS_SPELLBOOKS: readonly (readonly [SpellbookPickCount, SpellbookPickCount, SpellbookPickCount, SpellbookPickCount])[] = [
  //  Mage Priest Alch Psi
  [ 0, 0, 0, 0 ], //  0 Fighter   — no books
  [ 2, 0, 0, 0 ], //  1 Mage      — Mage primary
  [ 0, 2, 0, 0 ], //  2 Priest    — Priest primary
  [ 0, 0, 0, 0 ], //  3 Thief     — no books (handler aliases Fighter exactly)
  [ 0, 0, 0, 0 ], //  4 Ranger    — no books (REVISED: previously claimed Earth, was wrong)
  [ 0, 0, 2, 0 ], //  5 Alchemist — Alchemist primary
  [ 0, 0, 0, 0 ], //  6 Bard      — no books (REVISED: previously claimed Water+Air, was wrong)
  [ 0, 0, 0, 2 ], //  7 Psionic   — Psionic primary
  [ 0, 0, 0, 0 ], //  8 Valkyrie  — no books (REVISED: previously claimed Divine, was wrong)
  [ 1, 1, 0, 0 ], //  9 Bishop    — Mage + Priest BOTH as secondary
  [ 0, 0, 0, 0 ], // 10 Lord      — no books (REVISED: previously claimed Mental+Divine, was wrong)
  [ 0, 0, 0, 0 ], // 11 Samurai   — no books (REVISED)
  [ 0, 0, 0, 0 ], // 12 Monk      — no books (REVISED)
  [ 0, 0, 0, 0 ], // 13 Ninja     — no books
] as const;

/**
 * `SPELLBOOK_SCHOOLS[bookIdx]` returns 6 booleans (one per school) marking
 * which schools have at least one spell available in that book.
 *
 * Derived DIRECTLY from the 82-entry spell table at DGROUP+0xde, parsed in
 * `docs/re/findings/spell-school-assignment.json`. Each spell entry has a
 * `byte5` field that is a 4-bit book-membership bitmask (bit 3 = Mage,
 * bit 2 = Priest, bit 1 = Alchemist, bit 0 = Psionic). For each book we
 * collected the schools of all spells with that book's bit set.
 *
 * Result: three of four books cover ALL six schools. Only Alchemist lacks
 * Fire entirely. Stock characters showing narrower per-school mana totals
 * (e.g., NOBAL Priest with Mental+Divine only) reflect the PLAYER'S PICKS
 * at creation, not the book's available spell pool.
 */
export const SPELLBOOK_SCHOOLS: readonly (readonly boolean[])[] = [
  //  Fire   Water  Air    Earth  Mental Divine    spells in book
  [ true,  true,  true,  true,  true,  true  ], // 0 Mage       — 33 spells
  [ true,  true,  true,  true,  true,  true  ], // 1 Priest     — 33 spells
  [ false, true,  true,  true,  true,  true  ], // 2 Alchemist  — 32 spells (no Fire)
  [ true,  true,  true,  true,  true,  true  ], // 3 Psionic    — 25 spells
];

/**
 * Per-class school access matrix, DERIVED from `CLASS_SPELLBOOKS` and
 * `SPELLBOOK_SCHOOLS`. `CLASS_SCHOOLS[classIdx][schoolIdx]` is true if the
 * class can cast spells of that school via any of its assigned spellbooks.
 *
 * This is the surface the spell-picker UI and spell-list filter consume.
 */
export const CLASS_SCHOOLS: readonly (readonly boolean[])[] = CLASS_SPELLBOOKS.map((books) => {
  const out = [false, false, false, false, false, false];
  for (let bookIdx = 0; bookIdx < 4; bookIdx++) {
    if (books[bookIdx] === 0) continue;
    const schools = SPELLBOOK_SCHOOLS[bookIdx];
    if (schools === undefined) continue;
    for (let s = 0; s < 6; s++) {
      if (schools[s]) out[s] = true;
    }
  }
  return out;
});

/** Returns true if the class casts ANY spells at creation (any book set). */
export function classIsCaster(classIdx: number): boolean {
  const row = CLASS_SPELLBOOKS[classIdx];
  if (row === undefined) return false;
  return row.some((strength) => strength > 0);
}

/** Returns the list of spellbook indices the class can cast from, in book
 *  order (Mage, Priest, Alchemist, Psionic). Empty for non-casters. */
export function classSpellbooks(classIdx: number): number[] {
  const row = CLASS_SPELLBOOKS[classIdx];
  if (row === undefined) return [];
  const out: number[] = [];
  for (let i = 0; i < row.length; i++) {
    if (row[i]! > 0) out.push(i);
  }
  return out;
}

/** Caster strength for `classIdx` in `bookIdx` (0 = none, 1 = secondary, 2 = primary). */
export function classBookStrength(classIdx: number, bookIdx: number): SpellbookPickCount {
  const row = CLASS_SPELLBOOKS[classIdx];
  if (row === undefined) return 0;
  return row[bookIdx] ?? 0;
}

/** True if the class can cast spells of the given school. */
export function classCanCastSchool(classIdx: number, schoolIdx: number): boolean {
  const row = CLASS_SCHOOLS[classIdx];
  if (row === undefined) return false;
  return row[schoolIdx] ?? false;
}

/** Sorted list of school indices accessible to the class. Empty for non-casters. */
export function classCastingSchools(classIdx: number): number[] {
  const row = CLASS_SCHOOLS[classIdx];
  if (row === undefined) return [];
  return row.reduce<number[]>((acc, canCast, schoolIdx) => {
    if (canCast) acc.push(schoolIdx);
    return acc;
  }, []);
}
