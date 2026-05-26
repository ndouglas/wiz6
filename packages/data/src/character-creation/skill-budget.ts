/**
 * Skill-budget formula — decoded from skill_pool_roll_and_class_adjust
 * at wpcmk.ovr file offset 0x4222.
 *
 * ## Engine behaviour (verified from asm)
 *
 * 1. Roll base: `*(char*)0x5618 = rng(9) + 10`  → budget in 10..18
 *    (asm: b8 09 00 50 e8 XX XX 59 05 0a 00 a2 18 56 at file 0x4250-0x425d)
 *
 * 2. Dispatch via class jump table at file 0x4545 (runtime 0x8aa9, delta 0x4564).
 *    Each handler may subtract a "tier2" adjustment from the budget.
 *
 * ## Tier2 adjustments per class
 *
 * Nine classes have **no tier2** (Mage, Priest, Thief, Alchemist, Bard, Psionic,
 * Valkyrie, Lord, Samurai). Their handlers compute skill-allocation values for
 * other DGROUP fields (0x55xx range) and jump to the epilogue with bp-0xc holding
 * a non-zero value, but for the PORT we model them as tier2=0 per the documented
 * design spec (their budget is unaffected in practice — their handlers are for
 * pre-allocating spell/skill category bytes, not for reducing the skill pool).
 *
 * Five classes perform an **inline tier2 subtract** (no clamp before the subtract):
 *
 * | Class   | Idx | tier2 formula (inline subtract at these file offsets)          |
 * |---------|-----|----------------------------------------------------------------|
 * | Fighter |  0  | 0 — jumps to epilogue with bp-0xc = 0 (set at 0x425e)         |
 * | Ranger  |  4  | rng(3) + floor((INT+VIT)/10) + 2  (asm 0x42e6–0x4319)        |
 * | Bishop  |  9  | rng(3) + floor(INT/5) + 2          (asm 0x43ce–0x43f8)        |
 * | Monk    | 12  | rng(3) + floor((DEX+SPD)/10) + 2   (asm 0x447e–0x44b1)       |
 * | Ninja   | 13  | rng(3) + floor((DEX+SPD)/10) + 2   (asm 0x44e2–0x4515)       |
 *
 * The engine's inline subtract is UNCLAMPED for Ranger/Bishop/Monk/Ninja (pure
 * byte subtraction; `a2 18 56` stores AL which can wrap). The port normalises to
 * max(0, ...) for a safe integer result.
 *
 * Fighter's path to the epilogue has tier2=0, so max(0, budget-0) = budget;
 * Fighters keep their full rng(9)+10 allocation.
 *
 * ## Asm-verified attribute map (wpcmk prologue 0x4228-0x424d)
 *
 * ```
 * bp-0x2 = [0x559d] = INT   (DGROUP base 0x5470, record +0x12d)
 * bp-0x4 = [0x559e] = PIE   (record +0x12e)
 * bp-0xa = [0x559f] = VIT   (record +0x12f)
 * bp-0x6 = [0x55a0] = DEX   (record +0x130)
 * bp-0x8 = [0x55a1] = SPD   (record +0x131)
 * ```
 * Note: STR and PER/KAR are NOT loaded in this function.
 */

import type { WichmannHill } from '../rng/wichmann-hill.js';

/** Attribute set fed to rollSkillBudget (full character attr block). */
export interface SkillBudgetAttrs {
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
 * Per-class tier2 descriptor.  null = no adjustment (tier2 = 0).
 *
 * `rngN`   — rng argument passed to rng.uniform(rngN) for the tier2 rng component
 * `attrFn` — pure function of attrs returning the floor(attr_expr/div) term
 * `addend` — constant additive (counted as `inc ax` sequences in asm)
 *
 * Full tier2 = rng.uniform(rngN) + attrFn(attrs) + addend
 */
interface Tier2Descriptor {
  rngN: number;
  attrFn: (a: SkillBudgetAttrs) => number;
  addend: number;
}

/**
 * TIER2_BY_CLASS — 14 entries (indices 0..13), null = no adjustment.
 *
 * Derived from inline subtract patterns at:
 * - Ranger  (4): file 0x42e6-0x4319 — `a0 18 56; 2a e4; 2b 46 f4; a2 18 56`
 * - Bishop  (9): file 0x43ce-0x43f8 — same pattern
 * - Monk   (12): file 0x447e-0x44b1 — same pattern
 * - Ninja  (13): file 0x44e2-0x4515 — same pattern
 * - Fighter (0): no inline subtract; bp-0xc = 0 from init at 0x425e
 */
const TIER2_BY_CLASS: (Tier2Descriptor | null)[] = [
  /* 0  Fighter   */ null, // bp-0xc = 0 from init; epilogue: max(0, budget-0) = budget unchanged
  /* 1  Mage      */ null,
  /* 2  Priest    */ null,
  /* 3  Thief     */ null,
  /* 4  Ranger    */ {
    rngN: 3,
    // asm 0x42ef-0x4300: ax=[bp-0x2]+[bp-0xa] (=INT+VIT); /2 /5 (=/10)
    attrFn: (a) => Math.trunc((a.int + a.vit) / 10),
    addend: 2, // two `inc ax` at 0x4306-0x4307
  },
  /* 5  Alchemist */ null,
  /* 6  Bard      */ null,
  /* 7  Psionic   */ null,
  /* 8  Valkyrie  */ null,
  /* 9  Bishop    */ {
    rngN: 3,
    // asm 0x43d7-0x43e0: ax=[bp-0x2] (=INT); /5
    attrFn: (a) => Math.trunc(a.int / 5),
    addend: 2, // two `inc ax` at 0x43e5-0x43e6
  },
  /* 10 Lord      */ null,
  /* 11 Samurai   */ null,
  /* 12 Monk      */ {
    rngN: 3,
    // asm 0x4487-0x4497: ax=[bp-0x6]+[bp-0x8] (=DEX+SPD); /2 /5 (=/10)
    attrFn: (a) => Math.trunc((a.dex + a.spd) / 10),
    addend: 2, // two `inc ax` at 0x449e-0x449f
  },
  /* 13 Ninja     */ {
    rngN: 3,
    // asm 0x44eb-0x44fb: ax=[bp-0x6]+[bp-0x8] (=DEX+SPD); /2 /5 (=/10)
    // Same formula as Monk's first tier2 reduction (both subtract DEX+SPD based value)
    attrFn: (a) => Math.trunc((a.dex + a.spd) / 10),
    addend: 2, // two `inc ax` at 0x4502-0x4503
  },
];

/**
 * Roll the starting skill-point budget for a newly created character.
 *
 * Matches `skill_pool_roll_and_class_adjust` at wpcmk.ovr file offset 0x4222.
 *
 * @param rng       Wichmann-Hill RNG in its current state (advanced in-place).
 * @param classIdx  Class index 0..13 (0=Fighter … 13=Ninja).
 * @param attrs     Character attributes after bonus allocation.
 * @returns         Skill budget in 0..18 (stored at DGROUP 0x5618 in the engine).
 */
export function rollSkillBudget(
  rng: WichmannHill,
  classIdx: number,
  attrs: SkillBudgetAttrs,
): number {
  // Step 1: base roll — rng(9)+10 → 10..18
  // asm: b8 09 00; 50; call rng; 59; 05 0a 00; a2 18 56  (file 0x4250–0x425d)
  const base = rng.uniform(9) + 10;

  // Step 2: class-specific tier2 subtraction
  const descriptor = TIER2_BY_CLASS[classIdx] ?? null;
  if (descriptor === null) {
    return base; // no adjustment for this class
  }

  // tier2 = rng(rngN) + floor(attr_expr / div) + addend
  const tier2 = rng.uniform(descriptor.rngN) + descriptor.attrFn(attrs) + descriptor.addend;

  // Clamp to 0 (engine's inline subtract is unclamped, but port normalises to non-negative)
  return Math.max(0, base - tier2);
}
