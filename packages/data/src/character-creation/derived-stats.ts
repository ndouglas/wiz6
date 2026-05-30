/**
 * Derived stats computed at character creation by `age_encumbrance_and_hp_roll`
 * (wpcmk.ovr file 0x4589) and written to the character staging buffer at
 * DGROUP 0x5470..0x5499.
 *
 * ## Buffer writes (verified against stock pcfile.dbs all 6 chars)
 *
 * | Staging offset | DGROUP    | Formula                     | pcfile field  |
 * |---------------|-----------|-----------------------------|---------------|
 * | +0x008        | 0x5478    | rng(1000) + 6570            | age (u32)     |
 * | +0x018        | 0x5488    | encumbranceBase + VIT adj   | encumbranceMin=hpInitial|
 * | +0x01a        | 0x548a    | same as +0x18               | encumbranceMax=hpInitial|
 * | +0x01c        | 0x548c    | (VIT*2+STR)*3 + VIT bonus   | weightMin=stamina       |
 * | +0x01e        | 0x548e    | same as +0x1c               | weightMax=stamina       |
 * | +0x020        | 0x5490    | 0 (constant)                | —             |
 * | +0x022        | 0x5492    | (STR*2+VIT)*3*15 (+STR≥16/18); ×2/3 Faerie | carryCapacityMax (record +0x22) |
 * | +0x024        | 0x5494    | 1 (constant)                | level         |
 * | +0x026        | 0x5496    | 1 (constant)                | xp            |
 *
 * ## Age constant
 * The engine adds `0x19aa = 6570` to the rng result. Confirmed at wpcmk 0x45A1:
 * `add ax, 0x19aa`.  Range: 6570..7569 (all 6 stock chars fall in this range).
 *
 * ## Encumbrance base: class-dispatched + VIT adjustments
 * The engine dispatches on `[DGROUP 0x560F]` (class index) via a jump table at
 * CS:0x8D1A to set `[bp-2]` (local encumbranceBase). Each class handler calls
 * `rng(N)+K` for its range; see `CLASS_ENCUMBRANCE_FORMULAS`.
 *
 * VIT adjustments at wpcmk 0x4801..0x4827:
 *   if VIT < 8:  encumbrance -= 1
 *   if VIT >= 16: encumbrance += 1
 *   if VIT >= 18: encumbrance += 1 (additional)
 *
 * ## Stamina formula: (VIT*2+STR)*3 + VIT bonuses
 * Built from VIT threshold checks (wpcmk 0x47DF..0x4827). Written to staging+0x01c/0x01e
 * (pcfile+0x1c/0x1e = sp_cur/sp_max). On-screen label: STM.
 *   base = (VIT*2+STR)*3
 *   if VIT >= 16: base += VIT
 *   if VIT >= 18: base += VIT (additional)
 *
 * Perfectly matches all 6 stock chars (pcfile sp_cur values):
 * THESUS(VIT=12,STR=18)=126, TEMPEST(VIT=14,STR=13)=123, LYSANDR(VIT=11,STR=7)=87,
 * NOBAL(VIT=9,STR=7)=75, TREON(VIT=12,STR=10)=102, PENTAG(VIT=10,STR=10)=90.
 * Also matches NUG (Ninja, VIT=12, STR=12): (24+12)*3 = 108 = on-screen STM.
 *
 * ## HP formula: class-dispatch roll (same as encumbranceBase)
 * Written to staging+0x018/0x01a (pcfile+0x18/0x1a = hp_cur/hp_max). On-screen label: HP.
 * The engine writes the same class-dispatch roll to BOTH the encumbrance and HP fields.
 * Formula: rng(range)+offset per class (see CLASS_ENCUMBRANCE_FORMULAS), then VIT adj.
 *
 * Verified: NUG (Ninja class=13, VIT=12): HP=6 ∈ [4..8] (Ninja: rng(5)+4).
 * Stock char hp_cur values: THESUS=8∈[6..10], TEMPEST=9∈[6..10], LYSANDR=5∈[3..6],
 *   NOBAL=4∈[4..7], TREON=4∈[2..4], PENTAG=2∈[2..4].
 *
 * ## Carrying-capacity formula (record +0x22): (STR*2+VIT)*3*15, ×2/3 for Faerie
 * Symmetric to the HP formula but uses STR as the primary stat (wpcmk 0x47F0..0x4878):
 *   base = (STR*2+VIT)*3
 *   if STR >= 16: base += STR
 *   if STR >= 18: base += STR (additional)
 *   cap = base * 15          (non-Faerie)
 *   cap = base * 15 * 2 / 3  (Faerie, race index 5: engine shl ax,1 then idiv cx=3)
 *
 * NOTE: this was previously mislabeled "Gold formula"/`goldInitial`. It is the
 * MAX CARRYING CAPACITY (record +0x22), not gold. (Real starting gold is a
 * different field and is 0 for a freshly-created character.) The Faerie factor
 * was also wrong here (÷3); the engine doubles then divides → ×2/3.
 *
 * Matches all 6 stock chars at pcfile+0x022 (non-Faerie) and the live records
 * NATHAN=2130, NUG2=945, NUG3=1440, NUG4(Faerie)=360, NUG5=1350, NUG6=945 —
 * see docs/re/findings/carry-capacity-formula.json.
 */

export interface DerivedStats {
  /** Age in years. rng(1000) + 6570. Stored as u32 at staging+0x008. */
  age: number;
  /**
   * Encumbrance capacity minimum. Class-based + VIT adjustments.
   * Stored at staging+0x018 (same value as encumbranceMax at creation).
   * Equals hpInitial at creation — both are written from the same class-dispatch roll.
   */
  encumbranceMin: number;
  /**
   * Encumbrance capacity maximum. Same as encumbranceMin at creation.
   * Stored at staging+0x01a.
   */
  encumbranceMax: number;
  /**
   * Weight capacity minimum. (VIT*2+STR)*3 + VIT bonuses.
   * Stored at staging+0x01c. Equals stamina at creation.
   */
  weightMin: number;
  /**
   * Weight capacity maximum. Same as weightMin at creation.
   * Stored at staging+0x01e.
   */
  weightMax: number;
  /**
   * Stamina (Spirit Points). (VIT*2+STR)*3 + VIT bonuses.
   * Same value as weightMin/Max at creation. Written to pcfile+0x1c/0x1e (sp_cur/sp_max).
   *
   * On-screen label in-game is STM (Stamina). Verified against NUG (VIT12/STR12 = 108)
   * and all 6 stock chars in pcfile.dbs (sp_cur field).
   *
   * Previously misnamed `hpInitial` in Stage A — corrected by ground-truth validation
   * against NUG's DOSBox save showing STM=108/HP=6 as separate values.
   */
  stamina: number;
  /**
   * Initial HP (Hit Points). Class-dispatch formula — same formula as encumbranceBase.
   * Written to pcfile+0x18/0x1a (hp_cur/hp_max). Equals encumbranceMin at creation.
   *
   * Formula: class_dispatch_roll (rng(range)+offset, with VIT adjustments).
   * Same roll as the encumbrance base. See CLASS_ENCUMBRANCE_FORMULAS for per-class ranges.
   *
   * Verified: NUG (Ninja, VIT12) HP=6 ∈ Ninja range [4..8]; all 6 stock chars' hp_cur
   * values also consistent with their class formula ranges.
   *
   * [wpcmk 0x47DF: [bp-0x2] written to staging+0x18 and +0x1a]
   */
  hpInitial: number;
  /**
   * Maximum carrying capacity (character record +0x22, in tenths of a pound).
   * `base = (STR*2+VIT)*3; +STR if STR>=16; +STR if STR>=18; cap = base*15`;
   * Faerie (race 5) → `cap*2/3`. Verified 6/6 against engine save records
   * (NATHAN 2130, NUG2 945, NUG3 1440, NUG4 360, NUG5 1350, NUG6 945) — see
   * docs/re/findings/carry-capacity-formula.json.
   *
   * NOTE: this was previously (mis)named `goldInitial`. It is NOT gold — the
   * record's gold field is a different offset and is 0 for a freshly-created
   * character. The old name caused the carry-capacity value to be rendered in
   * the GP slot of the character sheet.
   */
  carryCapacityMax: number;
  /** Character level at creation: always 1. Written to staging+0x024. */
  level: 1;
  /**
   * Experience points at creation: 0. Verified vs DOSBox save 2's
   * 32-bit field at DGROUP 0x547c. (An earlier comment in this file
   * claimed xp=1 — that was a misread; the engine memory is 0.)
   */
  xp: 0;
}

/**
 * Minimal RNG interface required by computeDerivedStats.
 * Compatible with WichmannHill and deterministic test stubs.
 */
export interface Rng {
  uniform(n: number): number;
}

/**
 * Per-class encumbrance base roll formula: { range, offset } where
 * base = rng(range) + offset.
 *
 * Decoded from wpcmk.ovr class dispatch table at runtime CS:0x8D1A
 * (save-state physical 0x10FE2) and the 14 class handlers at
 * wpcmk file 0x45C4..0x47B4.
 *
 * Classes with TWO rng calls (index 4=Ranger, 11=Samurai) use
 * `rng(range1) + rng(range2) + offset`; these are represented as
 * `{ range: range1, range2: range2, offset }`.
 *
 * | idx | Class     | Formula                    |
 * |-----|-----------|----------------------------|
 * |  0  | Fighter   | rng(5)+6                   |
 * |  1  | Mage      | rng(3)+2                   |
 * |  2  | Priest    | rng(4)+4                   |
 * |  3  | Thief     | rng(4)+3                   |
 * |  4  | Ranger    | rng(4)+rng(4)+6            |
 * |  5  | Alchemist | rng(4)+3                   |
 * |  6  | Bard      | rng(4)+2                   |
 * |  7  | Psionic   | rng(3)+3                   |
 * |  8  | Valkyrie  | rng(5)+5                   |
 * |  9  | Bishop    | rng(4)+3                   |
 * | 10  | Lord      | rng(7)+8                   |
 * | 11  | Samurai   | rng(4)+rng(4)+6            |
 * | 12  | Monk      | rng(4)+4                   |
 * | 13  | Ninja     | rng(5)+4                   |
 */
export const CLASS_ENCUMBRANCE_FORMULAS: ReadonlyArray<
  { range: number; range2?: number; offset: number }
> = [
  { range: 5, offset: 6 },          // 0 Fighter
  { range: 3, offset: 2 },          // 1 Mage
  { range: 4, offset: 4 },          // 2 Priest
  { range: 4, offset: 3 },          // 3 Thief
  { range: 4, range2: 4, offset: 6 }, // 4 Ranger
  { range: 4, offset: 3 },          // 5 Alchemist
  { range: 4, offset: 2 },          // 6 Bard
  { range: 3, offset: 3 },          // 7 Psionic
  { range: 5, offset: 5 },          // 8 Valkyrie
  { range: 4, offset: 3 },          // 9 Bishop
  { range: 7, offset: 8 },          // 10 Lord
  { range: 4, range2: 4, offset: 6 }, // 11 Samurai
  { range: 4, offset: 4 },          // 12 Monk
  { range: 5, offset: 4 },          // 13 Ninja
];

/** Race index for Faerie in the Wiz6 engine (verified against wpcmk ASM 0x4866). */
export const DERIVED_STATS_FAERIE_RACE = 5;

/** Age offset added to rng(1000). Verified at wpcmk 0x45A1: `add ax, 0x19aa`. */
export const AGE_RNG_OFFSET = 0x19aa; // 6570

/**
 * Max carrying capacity (character record +0x22, tenths of a pound) from STR,
 * VIT, and race. Deterministic (no RNG), so renderers can derive it for
 * characters created before `encumbranceMax` was persisted.
 *
 *   base = (STR*2 + VIT)*3;  +STR if STR>=16;  +STR if STR>=18
 *   cap  = base * 15;  Faerie (race 5): cap = cap*2/3
 *
 * Verified 6/6 against engine save records (NATHAN 2130, NUG2 945, NUG3 1440,
 * NUG4 360, NUG5 1350, NUG6 945) — docs/re/findings/carry-capacity-formula.json.
 * [wpcmk 0x47F0..0x4878; Faerie ×2/3 at 0x4866: shl ax,1 then idiv cx=3]
 */
export function computeCarryCapacityMax(str: number, vit: number, raceIdx: number): number {
  let base = (str * 2 + vit) * 3;
  if (str >= 16) base += str;
  if (str >= 18) base += str;
  let cap = base * 15;
  if (raceIdx === DERIVED_STATS_FAERIE_RACE) {
    cap = Math.floor((cap * 2) / 3);
  }
  return cap;
}

/**
 * Resolve a character's effective max carry capacity, honoring the
 * `recomputeCarryCapacity` house rule.
 *
 * Call this at EVERY site that needs the cap — it is deliberately recomputed on
 * each call, never cached. When `recompute` is true the cap is derived from the
 * character's CURRENT STR/VIT/race, so it tracks attribute gains. When false it
 * returns the value frozen at creation (faithful to the original-game bug where
 * the cap never updates), falling back to a fresh derivation only when nothing
 * was persisted (e.g. characters created before the field was stored).
 */
export function resolveCarryCapacityMax(
  c: { attributes: { str: number; vit: number }; race: number; encumbranceMax?: number | undefined },
  recompute: boolean,
): number {
  const derived = computeCarryCapacityMax(c.attributes.str, c.attributes.vit, c.race);
  if (recompute) return derived;
  return c.encumbranceMax ?? derived;
}

/**
 * Compute derived stats for a character at creation.
 *
 * Mirrors `age_encumbrance_and_hp_roll` (wpcmk.ovr file 0x4589) and
 * the creation_init_derived_stats caller (0x4ddd).
 *
 * @param rng       The WichmannHill RNG (or a deterministic stub for tests).
 * @param classIdx  Character class index (0..13).
 * @param raceIdx   Character race index (0..10); only Faerie (5) is special-cased.
 * @param attrs     The 8 primary attributes after bonus allocation.
 */
export function computeDerivedStats(
  rng: Rng,
  classIdx: number,
  raceIdx: number,
  attrs: { str: number; int: number; pie: number; vit: number; dex: number; spd: number; per: number; kar: number },
): DerivedStats {
  const { str, vit } = attrs;

  // -------------------------------------------------------------------------
  // Age: rng(1000) + 0x19aa   [wpcmk 0x4599..0x45A4]
  // -------------------------------------------------------------------------
  const age = rng.uniform(1000) + AGE_RNG_OFFSET;

  // -------------------------------------------------------------------------
  // Encumbrance base: class-dispatched   [wpcmk 0x45C4..0x47B4]
  // -------------------------------------------------------------------------
  const formula = CLASS_ENCUMBRANCE_FORMULAS[classIdx];
  if (!formula) {
    throw new Error(`classIdx ${classIdx} out of range (valid 0..13)`);
  }

  let encumbranceBase = rng.uniform(formula.range) + formula.offset;
  if (formula.range2 !== undefined) {
    encumbranceBase += rng.uniform(formula.range2);
  }

  // VIT adjustments to encumbranceBase   [wpcmk 0x4801..0x4827]
  if (vit < 8) encumbranceBase -= 1;
  if (vit >= 16) encumbranceBase += 1;
  if (vit >= 18) encumbranceBase += 1;

  // -------------------------------------------------------------------------
  // Stamina / weight: (VIT*2+STR)*3 + VIT bonuses   [wpcmk 0x47DF..0x4828]
  // Written to staging+0x01c/0x01e (pcfile+0x1c/0x1e = sp_cur/sp_max). On-screen: STM.
  // -------------------------------------------------------------------------
  let staminaBase = (vit * 2 + str) * 3;
  if (vit >= 16) staminaBase += vit;
  if (vit >= 18) staminaBase += vit;

  // Max carrying capacity (record +0x22). Pure fn so renderers can derive it
  // for characters created before it was persisted (see computeCarryCapacityMax).
  const carryCapacityMax = computeCarryCapacityMax(str, vit, raceIdx);

  // -------------------------------------------------------------------------
  // Level and XP are always 1 at creation   [wpcmk 0x4ddd: 0x5494=1, 0x5496=1]
  // -------------------------------------------------------------------------
  return {
    age,
    encumbranceMin: encumbranceBase,
    encumbranceMax: encumbranceBase,
    weightMin: staminaBase,
    weightMax: staminaBase,
    stamina: staminaBase,
    hpInitial: encumbranceBase,  // HP = same class-dispatch roll as encumbranceBase
    carryCapacityMax,
    level: 1,
    xp: 0,
  };
}
