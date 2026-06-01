/**
 * WPCVW camp SKILL action — read-only skill-level viewer logic (pure, no I/O).
 * RE: docs/re/findings/wpcvw-skill-action.json + wpcvw-skill-names.json.
 *
 * The engine viewer (wpcvw_render_skill_category @ 0x9dfb) shows one of four
 * skill categories at a time; per slot in the category's range it renders a row
 * IFF the row is "enabled". Enabled = the class can train the skill OR the
 * character already has a level > 0 (engine availability builder @ 0x982f).
 * Skill name = msg(0x157c + slot); level = record +0x451c+slot (our skills[]).
 * Read-only: no mutation, no RNG, no skill check.
 */
import type { Character } from '../schemas/character.js';
import { CLASS_SKILL_AVAILABILITY, SKILL_SLOT_NAMES } from '../character-creation/class-skill-availability.js';

/** A skill category tab. `start`/`end` are inclusive skill-slot bounds. */
export interface SkillCategory {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

/**
 * The four skill categories + their slot ranges, matching the engine's
 * 4-way branch (and the `[10,7,5,8]` availability bit-groups). EXIT (the 5th
 * picker tab) is not a category and is handled by the reducer.
 */
export const SKILL_CATEGORIES: readonly SkillCategory[] = [
  { name: 'WEAPONRY', start: 0, end: 9 },
  { name: 'PHYSICAL', start: 10, end: 16 },
  { name: 'PERSONAL', start: 17, end: 21 },
  { name: 'ACADEMIA', start: 22, end: 29 },
];

/** One rendered skill row: slot index, engine name, and current level (0..50). */
export interface SkillRow {
  readonly slot: number;
  readonly name: string;
  readonly level: number;
}

type SkillMember = Pick<Character, 'class' | 'skills'>;

/** True if `classIndex` may train `slot` per the static availability bitmap. */
function classCanTrain(classIndex: number, slot: number): boolean {
  return CLASS_SKILL_AVAILABILITY[classIndex]?.[slot] ?? false;
}

/**
 * A skill row is visible in the viewer IFF the character's class can train it
 * OR the character already has a nonzero level (engine `0x982f` rule).
 */
export function skillRowVisible(member: SkillMember, slot: number): boolean {
  const level = member.skills[slot] ?? 0;
  return classCanTrain(member.class, slot) || level > 0;
}

/**
 * Visible skill rows for `categoryIndex` (0..3), in slot order. Out-of-range
 * category → empty. Each row carries the engine name + the character's level.
 */
export function skillViewerRows(member: SkillMember, categoryIndex: number): SkillRow[] {
  const cat = SKILL_CATEGORIES[categoryIndex];
  if (!cat) return [];
  const out: SkillRow[] = [];
  for (let slot = cat.start; slot <= cat.end; slot++) {
    if (!skillRowVisible(member, slot)) continue;
    out.push({ slot, name: SKILL_SLOT_NAMES[slot] ?? `SKILL ${slot}`, level: member.skills[slot] ?? 0 });
  }
  return out;
}
