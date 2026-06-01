import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ScenarioDbSchema, type ScenarioDb } from '@wiz6/data';
import { buildCharacterFromDraft } from '../../../../src/pages/roster/creation/lib/build.js';
import { blankDraft, type DraftState } from '../../../../src/pages/roster/creation/state.js';

// __dirname = packages/viewer/tests/pages/roster/creation → 6 up to repo root.
function scenarioDb(): ScenarioDb {
  return ScenarioDbSchema.parse(
    JSON.parse(readFileSync(join(__dirname, '../../../../../../extracted/scenario/scenario.json'), 'utf-8')),
  );
}

function fighterDraft(): DraftState {
  const d = blankDraft();
  d.name = 'TESTER';
  d.race = 0;
  d.class = 0; // Fighter
  d.attributes = { str: 18, int: 8, pie: 8, vit: 12, dex: 10, spd: 9, per: 8, kar: 14 };
  d.derived = { level: 1, xp: 0, hpInitial: 8, stamina: 126, age: 6570, carryCapacityMax: 2700 };
  return d;
}

describe('buildCharacterFromDraft — starting inventory (#034-adjacent: creation kit)', () => {
  it('with scenarioDb: issues the Fighter class kit (5 carried items, weight 295)', () => {
    const c = buildCharacterFromDraft(fighterDraft(), scenarioDb());
    expect(c.inventory).toHaveLength(22);
    expect(c.inventory!.slice(0, 5).map((s) => s.itemId)).toEqual([8, 135, 132, 130, 141]);
    expect(c.inventory!.slice(5).every((s) => s.itemId === 0)).toBe(true);
    expect(c.encumbranceCurrent).toBe(295);
  });

  it('starting items are CARRIED, not equipped (no flags bit0; no equipment set)', () => {
    const c = buildCharacterFromDraft(fighterDraft(), scenarioDb());
    expect(c.inventory!.slice(0, 5).every((s) => (s.flags & 0x01) === 0)).toBe(true);
    // build.ts never populates equipment → absent (the engine leaves it 0xff×8).
    expect(c.equipment).toBeUndefined();
  });

  it('without scenarioDb: inventory absent + encumbranceCurrent 0 (back-compat)', () => {
    const c = buildCharacterFromDraft(fighterDraft());
    expect(c.inventory).toBeUndefined();
    expect(c.encumbranceCurrent).toBe(0);
  });
});
