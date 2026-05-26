// packages/viewer/src/pages/roster/lib/draft.ts
import {
  RACE_BASE_STATS,
  CLASS_REQUIREMENTS,
  CLASS_SPELLBOOKS,
  meetsClassRequirements,
} from '@wiz6/data';

/**
 * Maximum bonus points the engine can roll. The "elite tier" needed for
 * Samurai/Monk/Ninja/Lord/Bishop. Actual byte value from the wpcmk roll
 * formula is not yet decoded; 28 is the commonly-cited elite minimum.
 * TODO: decode actual max from wpcmk bonus-roll formula (#TBD)
 */
export const MAX_BONUS_POINTS = 28;

/**
 * Per-character starting skill points pool. Engine value not byte-decoded
 * yet; 10 is a reasonable placeholder for v1.
 * TODO: decode actual starter skill-point count (#TBD)
 */
export const STARTER_SKILL_POINTS = 10;

export interface DraftAttributes {
  str: number;
  iq: number;
  pie: number;
  vit: number;
  dex: number;
  spd: number;
  per: number;
  kar: number;
}

export interface CharacterDraft {
  name: string;
  raceIdx: number | null;
  classIdx: number | null;
  bonusPool: number;
  /** Race-derived base attributes (set when race is chosen). */
  attributes: DraftAttributes;
  /** Player's bonus distribution across STR/IQ/PIE/VIT/DEX/SPD (PER/KAR untouched). */
  bonusDistribution: DraftAttributes;
  /** skillSlotIdx -> points spent. */
  skillPoints: Record<number, number>;
  /** Starter spell picks for caster classes. */
  starterSpells: Array<{ bookIdx: number; entryIdx: number }>;
  karma: number;
}

export function createEmptyDraft(): CharacterDraft {
  const zero: DraftAttributes = { str: 0, iq: 0, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0 };
  return {
    name: '',
    raceIdx: null,
    classIdx: null,
    bonusPool: 0,
    attributes: { ...zero },
    bonusDistribution: { ...zero },
    skillPoints: {},
    starterSpells: [],
    karma: 0,
  };
}

/** Sum of all DraftAttributes values (excluding PER/KAR which are race-fixed). */
function sumBonus(d: DraftAttributes): number {
  return d.str + d.iq + d.pie + d.vit + d.dex + d.spd;
}

/** Compute final attributes = race base + bonus distribution. */
export function computeTotalAttributes(draft: CharacterDraft): DraftAttributes | null {
  if (draft.raceIdx === null) return null;
  const base = RACE_BASE_STATS[draft.raceIdx];
  if (!base) return null;
  return {
    str: base.str + draft.bonusDistribution.str,
    iq: base.int + draft.bonusDistribution.iq,
    pie: base.pie + draft.bonusDistribution.pie,
    vit: base.vit + draft.bonusDistribution.vit,
    dex: base.dex + draft.bonusDistribution.dex,
    spd: base.spd + draft.bonusDistribution.spd,
    per: base.per,
    kar: base.kar,
  };
}

export function isNameValid(name: string): boolean {
  if (name.length < 1 || name.length > 7) return false;
  // ASCII printable
  return /^[\x20-\x7E]+$/.test(name);
}

export function isRaceValid(d: CharacterDraft): boolean {
  return d.raceIdx !== null && d.raceIdx >= 0 && d.raceIdx < RACE_BASE_STATS.length;
}

export function isBonusRollValid(d: CharacterDraft): boolean {
  return d.bonusPool > 0;
}

export function isClassValid(d: CharacterDraft): boolean {
  if (d.classIdx === null) return false;
  if (d.classIdx < 0 || d.classIdx >= CLASS_REQUIREMENTS.length) return false;
  // Use stored attributes (set at race-selection time) + bonus distribution.
  // Adapt iq -> int to satisfy meetsClassRequirements(AttributeSet, ...).
  const total = {
    str: d.attributes.str + d.bonusDistribution.str,
    int: d.attributes.iq + d.bonusDistribution.iq,
    pie: d.attributes.pie + d.bonusDistribution.pie,
    vit: d.attributes.vit + d.bonusDistribution.vit,
    dex: d.attributes.dex + d.bonusDistribution.dex,
    spd: d.attributes.spd + d.bonusDistribution.spd,
    per: d.attributes.per + d.bonusDistribution.per,
    kar: d.attributes.kar + d.bonusDistribution.kar,
  };
  return meetsClassRequirements(total, d.classIdx);
}

export function isAttributesValid(d: CharacterDraft): boolean {
  return sumBonus(d.bonusDistribution) === d.bonusPool;
}

export function isSkillsValid(d: CharacterDraft): boolean {
  const total = Object.values(d.skillPoints).reduce((a, b) => a + b, 0);
  return total === STARTER_SKILL_POINTS;
}

export function expectedSpellPickCount(classIdx: number | null): number {
  if (classIdx === null) return 0;
  const row = CLASS_SPELLBOOKS[classIdx];
  if (!row) return 0;
  return (row as readonly number[]).reduce((a, b) => a + b, 0);
}

export function isSpellsValid(d: CharacterDraft): boolean {
  return d.starterSpells.length === expectedSpellPickCount(d.classIdx);
}

export function isKarmaValid(d: CharacterDraft): boolean {
  return d.karma > 0;
}
