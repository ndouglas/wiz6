import { describe, expect, it } from 'vitest';
import {
  SKILL_CATEGORIES,
  skillRowVisible,
  skillViewerRows,
} from '../../src/character-view/skill-viewer.js';

/** Minimal member: only `class` + `skills` matter to the viewer logic. */
function member(classIndex: number, skills: Partial<Record<number, number>> = {}) {
  const arr = Array<number>(30).fill(0);
  for (const [k, v] of Object.entries(skills)) arr[Number(k)] = v!;
  return { class: classIndex, skills: arr };
}

describe('SKILL_CATEGORIES', () => {
  it('covers all 30 slots contiguously in the engine ranges', () => {
    expect(SKILL_CATEGORIES.map((c) => [c.start, c.end])).toEqual([
      [0, 9],
      [10, 16],
      [17, 21],
      [22, 29],
    ]);
  });
});

describe('skillRowVisible', () => {
  it('shows a slot the class can train even at level 0', () => {
    // Fighter (0) can train slot 1 (SWORD) per CLASS_SKILL_AVAILABILITY.
    expect(skillRowVisible(member(0), 1)).toBe(true);
  });

  it('hides a slot the class cannot train and has no level in', () => {
    // Fighter cannot train slot 28 (THAUMATURGY) and has 0 → hidden.
    expect(skillRowVisible(member(0), 28)).toBe(false);
  });

  it('shows a slot the class cannot train but the character HAS a level in', () => {
    // Class-change leftovers: a Fighter carrying THAUMATURGY=5 still sees it.
    expect(skillRowVisible(member(0, { 28: 5 }), 28)).toBe(true);
  });
});

describe('skillViewerRows', () => {
  it('returns rows in slot order with engine names + levels', () => {
    // THESUS-like Fighter with SWORD(slot 1)=10.
    const rows = skillViewerRows(member(0, { 1: 10 }), 0); // WEAPONRY
    const sword = rows.find((r) => r.slot === 1);
    expect(sword).toEqual({ slot: 1, name: 'SWORD', level: 10 });
    // Rows are sorted ascending by slot.
    expect(rows.map((r) => r.slot)).toEqual([...rows.map((r) => r.slot)].sort((a, b) => a - b));
  });

  it('PERSONAL category surfaces the real DEFENSE..POWER skills (formerly "holes")', () => {
    // A Thief (3) with a couple of personal skills invested.
    const rows = skillViewerRows(member(3, { 17: 3, 21: 7 }), 2); // PERSONAL (17..21)
    const names = rows.map((r) => r.name);
    expect(rows.some((r) => r.slot === 17 && r.name === 'DEFENSE' && r.level === 3)).toBe(true);
    expect(rows.some((r) => r.slot === 21 && r.name === 'POWER' && r.level === 7)).toBe(true);
    expect(names.every((n) => n.length > 0)).toBe(true);
  });

  it('clamps category to slot range (no rows outside start..end)', () => {
    const rows = skillViewerRows(member(0, { 1: 10 }), 0); // WEAPONRY 0..9
    expect(rows.every((r) => r.slot >= 0 && r.slot <= 9)).toBe(true);
  });

  it('returns [] for an out-of-range category index (e.g. EXIT tab = 4)', () => {
    expect(skillViewerRows(member(0), 4)).toEqual([]);
  });
});
