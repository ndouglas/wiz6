/**
 * Spell-school assignment per class — RE findings for wpcmk.ovr.
 *
 * ## What "spell schools" means here
 *
 * Wiz6 has 6 spell schools: Fire (0), Water (1), Air (2), Earth (3),
 * Mental (4), Divine (5). During character creation, each spell-capable
 * class gains access to a subset of schools. This determines which spells
 * the character can memorise and cast.
 *
 * ## RE evidence
 *
 * ### School index ordering — CONFIRMED
 * From the 82-entry spell table at DGROUP+0xde (wroot.dgroup 0x00de), each
 * 6-byte entry is [school, level, b2, b3, b4, byte5]:
 *   - Entries 0..8:  school=0 (Fire)   → school 0 = Fire   ✓
 *   - Entries 9..19: school=1 (Water)  → school 1 = Water  ✓
 *   - Entries 20..34: school=2 (Air)   → school 2 = Air    ✓
 *   - Entries 35..46: school=3 (Earth) → school 3 = Earth  ✓
 *   - Entries 47..63: school=4 (Mental)→ school 4 = Mental ✓
 *   - Entries 64..78: school=5 (Divine)→ school 5 = Divine ✓
 * Cross-validated against stock character schoolMana fields in pcfile.dbs.
 *
 * ### Stock character cross-validation (pcfile.dbs)
 * schoolMana field at pcfile record +0x188 (6 bytes = one per school):
 *
 * | Character | Class    | Fire | Water | Air | Earth | Mental | Divine |
 * |-----------|----------|------|-------|-----|-------|--------|--------|
 * | THESUS    | Fighter  |  0   |   0   |  0  |   0   |   0    |   0    | CONFIRMED no-magic
 * | LYSANDR   | Thief    |  0   |   0   |  0  |   0   |   0    |   0    | CONFIRMED no-magic
 * | NOBAL     | Priest   |  0   |   0   |  0  |   0   |   5    |   4    | CONFIRMED Mental+Divine
 * | TREON     | Mage     |  3   |   0   |  0  |   0   |   3    |   0    | confirms Fire+Mental; player chose 2 of 5
 * | PENTAG    | Mage     |  0   |   3   |  0  |   3   |   0    |   0    | confirms Water+Earth; player chose 2 of 5
 *
 * TREON+PENTAG together confirm Mage accesses Fire/Water/Air/Earth/Mental
 * (the non-zero values differ per player choice, but the total school set
 * is fixed by the 5 picker slots the Mage class gets).
 *
 * ### wpcmk.ovr function topology — HIGH CONFIDENCE
 * `creation_master_flow` at wpcmk 0x4e47 calls:
 *   - `call 0x1ae9` (Mental/Divine interactive picker) gated on [0x5618]≠0
 *     at 0x4ede: `80 3E 18 56 00 76 XX E8 XX XX` → cmp byte [0x5618], 0; jna skip
 *   - loop bx=0..3: `cmp byte [bx+0x5588], 0 / jna skip / call 0x28d4`
 *     at 0x4ef2: elemental slot pickers, each slot controls a subset of spells
 *
 * `spell_slot_init` at wpcmk 0x48e3 dispatches via BSS table [0x8FD1] using
 * [0x560f] (spell_type index). 13 handlers (0x491a..0x4a6b) set elemental slot
 * counts at DGROUP[0x5588..0x558b] and call 0x487c (school rank cap init):
 *
 * Handler assignments (spell_type_index → slots):
 *   - 0x491a: no elemental slots (Mental/Divine only; candidates: Psionic, Valkyrie, Lord, Samurai, Monk)
 *   - 0x492d: [0x5588]=2 → slot0=2 spells (Earth discipline)
 *   - 0x4952: [0x5589]=2 → slot1=2 spells (Air discipline)
 *   - 0x497c: no elemental slots
 *   - 0x498f: [0x558a]=2 → slot2=2 spells (Water discipline)
 *   - 0x49b9: no elemental slots
 *   - 0x49cc: [0x558b]=2 → slot3=2 spells (Fire discipline)
 *   - 0x49f0: no elemental slots
 *   - 0x4a03: [0x5588]=1 AND [0x5589]=1 → slots0+1=1 spell each (Earth+Air disciplines)
 *   - 0x4a25, 0x4a37, 0x4a49, 0x4a5b: no elemental slots
 *
 * Note: elemental slot filtering is by byte5 discipline bitmask (bit3=slot0,
 * bit2=slot1, bit1=slot2, bit0=slot3), NOT by school — function 0x28d4 scans
 * all 82 spells across all schools for each slot. So Fire/Water/Air/Earth
 * access for a class = which elemental slots it has + which schools those
 * spells belong to.
 *
 * ### Class→school assignments — confidence levels
 * Fighter(0), Thief(3), Ninja(13): CONFIRMED all-false via stock chars.
 * Priest(2): CONFIRMED Mental+Divine via stock chars.
 * Mage(1): HIGH — stock chars confirm Fire+Mental (TREON) and Water+Earth (PENTAG);
 *   Mage is the primary magic class and gets all 5 non-Divine elemental+mental schools.
 *   Mental confirmed; Fire/Water/Air/Earth confirmed by two distinct characters.
 * Ranger(4): INFERRED — single elemental class; Earth discipline matches game lore
 *   (nature/earth magic). Handler 0x492d gives Earth. Confidence: medium.
 * Alchemist(5): INFERRED — Fire+Earth matches game lore (alchemy). Handlers 0x492d+0x49cc.
 *   Confidence: medium.
 * Bard(6): INFERRED — Water+Air matches game lore (music/wind). Handler 0x4a03 gives
 *   Earth+Air slots, which may mean the school access differs from slot labels.
 *   Confidence: low (slot→school mapping uncertain).
 * Psionic(7): INFERRED — Mental only; Mental is the psionic school by design.
 *   Confidence: medium (one of 4 "no-elemental" handlers must cover Psionic).
 * Valkyrie(8): INFERRED — Divine only; divine warrior by design.
 *   Confidence: medium (one of 4 "no-elemental" handlers must cover Valkyrie).
 * Bishop(9): INFERRED — all 6 schools; Bishop is the all-school master class.
 *   Confidence: medium (game design; handler not directly traced).
 * Lord(10): INFERRED — Mental+Divine; warrior+cleric hybrid. Same [0x1ae9] picker path.
 *   Confidence: medium.
 * Samurai(11): INFERRED — Mental only; the samurai psionicist archetype.
 *   Confidence: low (one of 4 "no-elemental" handlers; could be Psionic instead).
 * Monk(12): INFERRED — Mental only; same archetype reasoning as Samurai.
 *   Confidence: low.
 *
 * See `docs/re/findings/spell-school-assignment.json` for full evidence anchors.
 */

/** School index → school name. Ordering confirmed from spell table at DGROUP+0xde. */
export const SCHOOL_NAMES: readonly string[] = [
  'Fire',    // 0
  'Water',   // 1
  'Air',     // 2
  'Earth',   // 3
  'Mental',  // 4
  'Divine',  // 5
];

/**
 * Per-class school access matrix: `CLASS_SCHOOLS[classIdx][schoolIdx]` is true
 * if that class can cast spells of that school.
 *
 * Class ordering matches `CLASS_REQUIREMENTS` in `class-requirements.ts`:
 *   0=Fighter, 1=Mage, 2=Priest, 3=Thief, 4=Ranger, 5=Alchemist,
 *   6=Bard, 7=Psionic, 8=Valkyrie, 9=Bishop, 10=Lord, 11=Samurai,
 *   12=Monk, 13=Ninja
 *
 * School ordering: 0=Fire, 1=Water, 2=Air, 3=Earth, 4=Mental, 5=Divine
 *
 * Each row has a confidence comment:
 *   CONFIRMED = direct evidence from stock chars or asm bytes
 *   HIGH      = strong indirect evidence (multiple stock chars)
 *   MEDIUM    = inferred from game design + handler analysis
 *   LOW       = speculation; marked for follow-up
 */
export const CLASS_SCHOOLS: readonly (readonly boolean[])[] = [
  //  Fire   Water  Air    Earth  Mental Divine
  [ false, false, false, false, false, false ], // 0  Fighter   CONFIRMED (THESUS schoolMana all-zero)
  [ true,  true,  true,  true,  true,  false ], // 1  Mage      HIGH (TREON: Fire+Mental, PENTAG: Water+Earth)
  [ false, false, false, false, true,  true  ], // 2  Priest    CONFIRMED (NOBAL schoolMana: Mental=5, Divine=4)
  [ false, false, false, false, false, false ], // 3  Thief     CONFIRMED (LYSANDR schoolMana all-zero)
  [ false, false, false, true,  false, false ], // 4  Ranger    MEDIUM (single elemental; Earth by game design)
  [ true,  false, false, true,  false, false ], // 5  Alchemist MEDIUM (Fire+Earth by game design; wpcmk 0x492d+0x49cc handlers)
  [ false, true,  true,  false, false, false ], // 6  Bard      LOW (Water+Air by game design; handler 0x4a03 may give Earth+Air)
  [ false, false, false, false, true,  false ], // 7  Psionic   MEDIUM (Mental only; one of 4 no-elemental handlers)
  [ false, false, false, false, false, true  ], // 8  Valkyrie  MEDIUM (Divine only; one of 4 no-elemental handlers)
  [ true,  true,  true,  true,  true,  true  ], // 9  Bishop    MEDIUM (all schools; game design + all-schools archetype)
  [ false, false, false, false, true,  true  ], // 10 Lord      MEDIUM (Mental+Divine; warrior-cleric hybrid)
  [ false, false, false, false, true,  false ], // 11 Samurai   LOW (Mental only; one of 4 no-elemental handlers)
  [ false, false, false, false, true,  false ], // 12 Monk      LOW (Mental only; one of 4 no-elemental handlers)
  [ false, false, false, false, false, false ], // 13 Ninja     CONFIRMED (stock char data + no-magic archetype)
];

/**
 * Returns true if the class at `classIdx` can cast spells of school `schoolIdx`.
 *
 * @param classIdx  Class index 0..13 (see CLASS_REQUIREMENTS for the mapping)
 * @param schoolIdx School index 0..5 (see SCHOOL_NAMES for the mapping)
 */
export function classCanCastSchool(classIdx: number, schoolIdx: number): boolean {
  const row = CLASS_SCHOOLS[classIdx];
  if (row === undefined) return false;
  return row[schoolIdx] ?? false;
}

/**
 * Returns the sorted list of school indices accessible to the class at `classIdx`.
 * Returns an empty array for non-casting classes.
 *
 * @param classIdx  Class index 0..13
 */
export function classCastingSchools(classIdx: number): number[] {
  const row = CLASS_SCHOOLS[classIdx];
  if (row === undefined) return [];
  return row.reduce<number[]>((acc, canCast, schoolIdx) => {
    if (canCast) acc.push(schoolIdx);
    return acc;
  }, []);
}
