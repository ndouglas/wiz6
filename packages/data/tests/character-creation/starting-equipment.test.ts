import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  STARTING_KITS,
  buildStartingInventory,
  startingEncumbrance,
} from '../../src/character-creation/starting-equipment.js';
import { ScenarioDbSchema, type ScenarioDb } from '../../src/index.js';

let _db: ScenarioDb | null = null;
function realScenarioDb(): ScenarioDb {
  if (!_db) {
    _db = ScenarioDbSchema.parse(
      JSON.parse(readFileSync(join(__dirname, '../../../../extracted/scenario/scenario.json'), 'utf-8')),
    );
  }
  return _db;
}

describe('STARTING_KITS', () => {
  it('has 14 classes × 5 items each', () => {
    expect(STARTING_KITS).toHaveLength(14);
    for (const kit of STARTING_KITS) expect(kit).toHaveLength(5);
  });
  it('Fighter kit matches the stock THESUS inventory (RE ground truth)', () => {
    expect(STARTING_KITS[0]).toEqual([8, 135, 132, 130, 141]);
  });
});

describe('buildStartingInventory', () => {
  it('builds a 22-slot inventory; Fighter kit packed in slots 0..4, rest empty', () => {
    const inv = buildStartingInventory(0, realScenarioDb());
    expect(inv).toHaveLength(22);
    expect(inv.slice(0, 5).map((s) => s.itemId)).toEqual([8, 135, 132, 130, 141]);
    expect(inv.slice(5).every((s) => s.itemId === 0)).toBe(true);
  });

  it('resolves weight + equipSlot from scenario.dbs (matches THESUS)', () => {
    const inv = buildStartingInventory(0, realScenarioDb());
    // LONGSWORD weight 50 / equipSlot 0; LEATHER CUIRASS 140/7; SHIELD 40/11.
    expect(inv[0]).toMatchObject({ itemId: 8, weight: 50, equipSlot: 0 });
    expect(inv[1]).toMatchObject({ itemId: 135, weight: 140, equipSlot: 7 });
    expect(inv[4]).toMatchObject({ itemId: 141, weight: 40, equipSlot: 11 });
  });

  it('carries items only — no equipped flag (bit0) set', () => {
    const inv = buildStartingInventory(0, realScenarioDb());
    expect(inv.slice(0, 5).every((s) => (s.flags & 0x01) === 0)).toBe(true);
  });

  it('unknown class → empty inventory (no kit)', () => {
    const inv = buildStartingInventory(99, realScenarioDb());
    expect(inv.every((s) => s.itemId === 0)).toBe(true);
  });
});

describe('startingEncumbrance', () => {
  it('Fighter kit weighs 295 (50+140+50+15+40) — matches THESUS encumbranceCurrent', () => {
    const inv = buildStartingInventory(0, realScenarioDb());
    expect(startingEncumbrance(inv)).toBe(295);
  });
});
