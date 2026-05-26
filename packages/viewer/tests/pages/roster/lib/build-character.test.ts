import { describe, expect, it } from 'vitest';
import { buildCharacter } from '../../../../src/pages/roster/lib/build-character.js';
import { createEmptyDraft } from '../../../../src/pages/roster/lib/draft.js';

function fullDraft() {
  return {
    ...createEmptyDraft(),
    name: 'TESTGUY',
    raceIdx: 0,
    classIdx: 0,
    bonusPool: 6,
    attributes: { str: 9, iq: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 },
    bonusDistribution: { str: 1, iq: 1, pie: 1, vit: 1, dex: 1, spd: 1, per: 0, kar: 0 },
    skillPoints: { 0: 10 },
    karma: 7,
    karmaRolled: true,
  };
}

describe('buildCharacter', () => {
  it('builds a Character with the draft values + derived fields', () => {
    const c = buildCharacter(fullDraft());
    expect(c.name).toBe('TESTGUY');
    expect(c.race).toBe(0);
    expect(c.class).toBe(0);
    expect(c.level).toBe(1);
    expect(c.attributes.str).toBe(10); // base 9 + bonus 1
    expect(c.attributes.kar).toBe(7);  // from karma roll
    expect(c.portraitIndex).toBe(10);  // SPD (9) + 1 = 10
    expect(c.dead).toBe(false);
    expect(c.conditions.length).toBe(10);
    expect(c.skills.length).toBe(30);
    expect(c.skills[0]).toBe(10); // skill slot 0 received 10 points
  });

  it('id is a valid UUID', () => {
    const c = buildCharacter(fullDraft());
    expect(c.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
