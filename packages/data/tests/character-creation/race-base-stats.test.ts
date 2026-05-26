import { describe, expect, it } from 'vitest';
import {
  RACE_BASE_STATS,
  getRaceBaseStats,
} from '../../src/character-creation/race-base-stats.js';

describe('RACE_BASE_STATS', () => {
  it('has exactly 11 races', () => {
    expect(RACE_BASE_STATS).toHaveLength(11);
  });

  it('indices are sequential 0..10', () => {
    for (let i = 0; i < 11; i++) {
      expect(RACE_BASE_STATS[i]!.index).toBe(i);
    }
  });

  it('all KAR racial floors are 0 (karma has no race-derived minimum; rolled per-character at creation)', () => {
    for (const r of RACE_BASE_STATS) {
      expect(r.kar).toBe(0);
    }
  });

  it('all stat minimums are in plausible 3..18 range (KAR allowed to be 0)', () => {
    for (const r of RACE_BASE_STATS) {
      for (const stat of [r.str, r.int, r.pie, r.vit, r.dex, r.spd, r.per]) {
        expect(stat).toBeGreaterThanOrEqual(3);
        expect(stat).toBeLessThanOrEqual(18);
      }
      expect(r.kar).toBeGreaterThanOrEqual(0);
    }
  });

  it('Human (index 0) has the canonical balanced minimums STR=9 INT=8 PIE=8 VIT=9 DEX=9 SPD=8 PER=8', () => {
    const h = RACE_BASE_STATS[0]!;
    expect(h.name).toBe('Human');
    expect([h.str, h.int, h.pie, h.vit, h.dex, h.spd, h.per]).toEqual([9, 8, 8, 9, 9, 8, 8]);
  });

  it('Faerie (index 5) has the highest SPD (14) and lowest STR (5)', () => {
    const f = RACE_BASE_STATS[5]!;
    expect(f.name).toBe('Faerie');
    expect(f.spd).toBe(14);
    expect(f.str).toBe(5);
    // Highest SPD in the table:
    for (const r of RACE_BASE_STATS) {
      expect(r.spd).toBeLessThanOrEqual(f.spd);
    }
  });

  it('Lizardman (index 6) has the highest VIT (14) and lowest PER (3)', () => {
    const l = RACE_BASE_STATS[6]!;
    expect(l.name).toBe('Lizardman');
    expect(l.vit).toBe(14);
    expect(l.per).toBe(3);
  });
});

describe('getRaceBaseStats', () => {
  it('returns the matching row by index', () => {
    expect(getRaceBaseStats(0).name).toBe('Human');
    expect(getRaceBaseStats(10).name).toBe('Mook');
  });

  it('throws on out-of-range index', () => {
    expect(() => getRaceBaseStats(-1)).toThrow();
    expect(() => getRaceBaseStats(11)).toThrow();
  });
});

describe('cross-validation against pcfile stock characters', () => {
  // The 6 stock characters in pcfile.dbs were created by wpcmk at some
  // point during development. Their decoded attributes = race base + bonus
  // points spent during character creation. So character_attr >= race_min
  // for every attribute. (KAR is the exception — it can be set by the user
  // during creation independent of race floor.)
  //
  // The stock-character values used here match the gallery JSON post-RE.
  const STOCK = [
    { name: 'THESUS',  race: 0,  attrs: { str: 18, int: 8,  pie: 8,  vit: 12, dex: 10, spd: 9,  per: 8,  kar: 14 } },
    { name: 'TEMPEST', race: 10, attrs: { str: 13, int: 10, pie: 6,  vit: 14, dex: 7,  spd: 7,  per: 10, kar: 16 } },
    { name: 'LYSANDR', race: 8,  attrs: { str: 7,  int: 10, pie: 7,  vit: 11, dex: 14, spd: 12, per: 10, kar: 15 } },
    { name: 'NOBAL',   race: 1,  attrs: { str: 7,  int: 10, pie: 13, vit: 9,  dex: 9,  spd: 9,  per: 8,  kar: 4  } },
    { name: 'TREON',   race: 7,  attrs: { str: 10, int: 12, pie: 6,  vit: 12, dex: 10, spd: 8,  per: 6,  kar: 3  } },
    { name: 'PENTAG',  race: 3,  attrs: { str: 10, int: 12, pie: 13, vit: 10, dex: 8,  spd: 6,  per: 6,  kar: 9  } },
  ];

  for (const c of STOCK) {
    it(`${c.name} (race ${c.race}) meets or exceeds race attribute floors`, () => {
      const base = getRaceBaseStats(c.race);
      expect(c.attrs.str).toBeGreaterThanOrEqual(base.str);
      expect(c.attrs.int).toBeGreaterThanOrEqual(base.int);
      expect(c.attrs.pie).toBeGreaterThanOrEqual(base.pie);
      expect(c.attrs.vit).toBeGreaterThanOrEqual(base.vit);
      expect(c.attrs.dex).toBeGreaterThanOrEqual(base.dex);
      expect(c.attrs.spd).toBeGreaterThanOrEqual(base.spd);
      expect(c.attrs.per).toBeGreaterThanOrEqual(base.per);
      // KAR floor is 0 for every race; allows any KAR value.
      expect(c.attrs.kar).toBeGreaterThanOrEqual(base.kar);
    });
  }
});
