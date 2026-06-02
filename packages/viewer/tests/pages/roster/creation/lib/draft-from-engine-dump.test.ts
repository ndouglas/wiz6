import { describe, it, expect } from 'vitest';
import {
  draftFromEngineDump,
  type EngineDraftDump,
} from '../../../../../src/pages/roster/creation/lib/draft-from-engine-dump.js';

const SAMPLE: EngineDraftDump = {
  bonusPool: 5,
  draft: {
    name: 'NATHAN',
    race: 0,
    sex: 0,
    class: 0,
    attributes: [14, 11, 8, 9, 12, 14, 8, 3],
    rendered_portrait_index: 9,
    age_counter: 20 * 365 + 100,
    hp_cur: 7,
    hp_max: 7,
    sp_cur: 96,
    sp_max: 96,
    level: 1,
    level_secondary: 1,
    skills: new Array(30).fill(0).map((_, i) => (i === 1 ? 9 : 0)),
    xp: 0,
    encumbrance_max: 1800,
  },
};

describe('draftFromEngineDump', () => {
  it('maps the engine record into a DraftState', () => {
    const d = draftFromEngineDump(SAMPLE);
    expect(d.name).toBe('NATHAN');
    expect(d.race).toBe(0);
    expect(d.sex).toBe(0);
    expect(d.class).toBe(0);
    expect(d.attributes).toEqual({
      str: 14, int: 11, pie: 8, vit: 9, dex: 12, spd: 14, per: 8, kar: 3,
    });
    expect(d.portrait).toBe(9);
    expect(d.skills[1]).toBe(9);
  });

  it('keeps the LIVE bonus pool (does NOT hide the BONUS row)', () => {
    expect(draftFromEngineDump(SAMPLE).bonusPool).toBe(5);
  });

  it('maps the engine BONUS-hidden sentinel (0xffff) to -1', () => {
    // Read-only char-sheet views (REVIEW PC) write *0x56ac = 0xffff to suppress
    // the BONUS row. dumpDraft reads that u16 verbatim, so the sidecar carries
    // 0xffff; the renderer hides BONUS only on a NEGATIVE pool, so map it to -1.
    const review: EngineDraftDump = { ...SAMPLE, bonusPool: 0xffff };
    expect(draftFromEngineDump(review).bonusPool).toBe(-1);
  });

  it('maps derived stats from the record', () => {
    const d = draftFromEngineDump(SAMPLE);
    expect(d.derived.age).toBe(20 * 365 + 100);
    expect(d.derived.hpInitial).toBe(7);
    expect(d.derived.stamina).toBe(96);
    expect(d.derived.level).toBe(1);
    expect(d.derived.xp).toBe(0);
    expect(d.derived.carryCapacityMax).toBe(1800);
    expect(d.derived.secondAge).toBe(1);
  });
});
