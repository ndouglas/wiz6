/**
 * Class attribute requirements — minimum attribute values required to
 * qualify for each class.
 *
 * Static data baked into wpcmk.ovr at file offset 0x5e98. 14 classes × 9
 * bytes each: 8 ASCII-encoded attribute minimums + 1 null terminator.
 * Decoder formula `byte - 0x41` recovers the integer minimum (same
 * encoding as race base stats).
 *
 * Decoded directly from `original/wpcmk.ovr` bytes. See
 * `docs/re/wpcmk-character-creation-trace.md` and
 * `docs/re/findings/wpcmk-state-machine-trace.json` for the asm trace.
 *
 * Class index 0..13 matches the engine's class index used by the
 * in-memory character record's `class` field at +0x19F.
 */
export interface ClassRequirements {
  /** Class index 0..13 matching engine ordering. */
  index: number;
  /** Class display name. */
  name: string;
  /** Minimum STR (0 = no minimum). */
  str: number;
  /** Minimum INT. */
  int: number;
  /** Minimum PIE. */
  pie: number;
  /** Minimum VIT. */
  vit: number;
  /** Minimum DEX. */
  dex: number;
  /** Minimum SPD. */
  spd: number;
  /** Minimum PER. */
  per: number;
  /** Minimum KAR (always 0 — KAR is rolled per-character, never gates class eligibility). */
  kar: number;
}

export const CLASS_REQUIREMENTS: readonly ClassRequirements[] = [
  // Base classes (4): single high-attribute gate.
  { index: 0,  name: 'Fighter',   str: 12, int: 0,  pie: 0,  vit: 0,  dex: 0,  spd: 0,  per: 0,  kar: 0 },
  { index: 1,  name: 'Mage',      str: 0,  int: 12, pie: 0,  vit: 0,  dex: 0,  spd: 0,  per: 0,  kar: 0 },
  { index: 2,  name: 'Priest',    str: 0,  int: 0,  pie: 12, vit: 0,  dex: 0,  spd: 0,  per: 8,  kar: 0 },
  { index: 3,  name: 'Thief',     str: 0,  int: 0,  pie: 0,  vit: 0,  dex: 12, spd: 8,  per: 0,  kar: 0 },
  // Hybrids (4): multiple moderate gates.
  { index: 4,  name: 'Ranger',    str: 10, int: 8,  pie: 8,  vit: 11, dex: 10, spd: 8,  per: 8,  kar: 0 },
  { index: 5,  name: 'Alchemist', str: 0,  int: 13, pie: 0,  vit: 0,  dex: 13, spd: 0,  per: 0,  kar: 0 },
  { index: 6,  name: 'Bard',      str: 0,  int: 10, pie: 0,  vit: 0,  dex: 12, spd: 8,  per: 12, kar: 0 },
  { index: 7,  name: 'Psionic',   str: 10, int: 14, pie: 0,  vit: 14, dex: 0,  spd: 0,  per: 10, kar: 0 },
  // Elite classes (6): the famously-difficult-to-roll classes.
  { index: 8,  name: 'Valkyrie',  str: 10, int: 0,  pie: 11, vit: 11, dex: 10, spd: 11, per: 8,  kar: 0 },
  { index: 9,  name: 'Bishop',    str: 0,  int: 15, pie: 15, vit: 0,  dex: 0,  spd: 0,  per: 8,  kar: 0 },
  { index: 10, name: 'Lord',      str: 12, int: 9,  pie: 12, vit: 12, dex: 9,  spd: 9,  per: 14, kar: 0 },
  { index: 11, name: 'Samurai',   str: 12, int: 11, pie: 0,  vit: 9,  dex: 12, spd: 14, per: 8,  kar: 0 },
  { index: 12, name: 'Monk',      str: 13, int: 8,  pie: 13, vit: 0,  dex: 10, spd: 13, per: 8,  kar: 0 },
  { index: 13, name: 'Ninja',     str: 12, int: 10, pie: 10, vit: 12, dex: 12, spd: 12, per: 0,  kar: 0 },
];

/** Look up class requirements by index. Throws on out-of-range. */
export function getClassRequirements(classIndex: number): ClassRequirements {
  const c = CLASS_REQUIREMENTS[classIndex];
  if (!c) {
    throw new Error(`class index ${classIndex} out of range (valid 0..${CLASS_REQUIREMENTS.length - 1})`);
  }
  return c;
}

export interface AttributeSet {
  str: number;
  int: number;
  pie: number;
  vit: number;
  dex: number;
  spd: number;
  per: number;
  kar: number;
}

/**
 * Returns true if the given attribute set meets the class requirements.
 * KAR has no class minimums (always 0 in the table) so KAR is unchecked.
 */
export function meetsClassRequirements(attrs: AttributeSet, classIndex: number): boolean {
  const req = getClassRequirements(classIndex);
  return (
    attrs.str >= req.str &&
    attrs.int >= req.int &&
    attrs.pie >= req.pie &&
    attrs.vit >= req.vit &&
    attrs.dex >= req.dex &&
    attrs.spd >= req.spd &&
    attrs.per >= req.per
  );
}

/** Returns every class index this attribute set is eligible for. */
export function eligibleClasses(attrs: AttributeSet): number[] {
  const out: number[] = [];
  for (let i = 0; i < CLASS_REQUIREMENTS.length; i++) {
    if (meetsClassRequirements(attrs, i)) out.push(i);
  }
  return out;
}

/**
 * Total bonus points needed to raise `attrs` up to class `classIndex`'s
 * minimums: Σ over attributes of max(0, requirement − current). 0 means the
 * class already qualifies outright.
 */
export function classBonusDeficit(attrs: AttributeSet, classIndex: number): number {
  const r = getClassRequirements(classIndex);
  return (
    Math.max(0, r.str - attrs.str) +
    Math.max(0, r.int - attrs.int) +
    Math.max(0, r.pie - attrs.pie) +
    Math.max(0, r.vit - attrs.vit) +
    Math.max(0, r.dex - attrs.dex) +
    Math.max(0, r.spd - attrs.spd) +
    Math.max(0, r.per - attrs.per)
  );
}

/**
 * Class-selection-screen eligibility: a class is offered iff its total
 * attribute deficit can be covered by the available bonus pool — i.e. the
 * player could distribute `pool` points to meet every minimum. This is the
 * engine's rule at screen-05 (`wpcmk_pick_class_menu` fills
 * `class_qualification_flags[14]` @ DGROUP 0x56ae), where the class is chosen
 * BEFORE the bonus is allocated. Verified against the class-select save
 * (Human base + pool 6 → exactly Fighter/Mage/Priest/Thief/Ranger).
 */
export function classReachableWithPool(
  attrs: AttributeSet,
  bonusPool: number,
  classIndex: number,
): boolean {
  return classBonusDeficit(attrs, classIndex) <= bonusPool;
}

/**
 * Class indices restricted to a single sex. Valkyrie (8) is female-only; every
 * other class is open to both. The restriction is enforced in the engine's
 * per-class qualification routine (the 0x73ae jump table), NOT the 0x5e98
 * attribute table — so it can't be read off the requirements data.
 *
 * Empirically pinned: the profession-screen capture for a MALE Human at bonus
 * pool 18 offers every class EXCEPT Valkyrie, even though Valkyrie's attribute
 * deficit (10) otherwise qualifies — Bishop has the identical deficit and IS
 * offered. Matches universal Wizardry-VI lore (Valkyrie = female only). Sex is
 * the only identity gate — Wiz6 has no race-class restrictions (confirmed by
 * Nate).
 */
export const FEMALE_ONLY_CLASSES: readonly number[] = [8]; // Valkyrie

/** Sex codes: 0 = Male, 1 = Female (matches the record's +0x1a1 sex field). */
export function classAllowedForSex(classIndex: number, sex: number): boolean {
  if (FEMALE_ONLY_CLASSES.includes(classIndex)) return sex === 1;
  return true;
}

/**
 * Full profession-screen eligibility: a class is offered iff the bonus pool can
 * cover its attribute deficit AND it isn't sex-restricted away from `sex`.
 */
export function classOffered(
  attrs: AttributeSet,
  bonusPool: number,
  sex: number,
  classIndex: number,
): boolean {
  return (
    classReachableWithPool(attrs, bonusPool, classIndex) &&
    classAllowedForSex(classIndex, sex)
  );
}
