import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assayItem } from '../../src/equipment/assay-logic.js';
import { ScenarioDbSchema, type ScenarioDb, type Character } from '../../src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..'); // repo root
let _db: ScenarioDb | null = null;
function realScenarioDb(): ScenarioDb {
  if (!_db)
    _db = ScenarioDbSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'scenario', 'scenario.json'), 'utf-8')),
    );
  return _db;
}

/** A fighter (class 0), human (race 0), male (sex 0) — like THESUS. */
const fighter: Pick<Character, 'class' | 'race' | 'sex'> = { class: 0, race: 0, sex: 0 };

describe('assayItem — LONGSWORD (scenario item 8) inspected by a fighter', () => {
  const d = () => assayItem(8, fighter, realScenarioDb());

  it('name is LONGSWORD (name1, the canonical/identified name)', () => {
    expect(d().name).toBe('LONGSWORD');
  });

  it('categoryLabel is WEAPON (S) (record byte 0x3c → category 0)', () => {
    expect(d().categoryLabel).toBe('WEAPON (S)');
    expect(d().categoryLabel).toContain('WEAPON');
  });

  it('usableBy is true (fighter passes the class/race/sex eligibility test)', () => {
    expect(d().usableBy).toBe(true);
  });

  it('weaponType is SWORD (record byte 0x3d → weapon-skill table 0x157c+1)', () => {
    expect(d().weaponType).toBe('SWORD');
  });

  it('attackModes includes SWING and THRUST', () => {
    const modes = d().attackModes ?? [];
    expect(modes).toContain('SWING');
    expect(modes).toContain('THRUST');
  });

  it('equipSlotLabel is 1HAND (equipSlot 0, not two-handed)', () => {
    expect(d().equipSlotLabel).toBe('1HAND');
  });

  it('weight is 5.0 (record byte 0x1e = 50 tenths of a pound)', () => {
    expect(d().weight).toBe(5.0);
  });

  it('ac equals scenario byte 0x46', () => {
    expect(d().ac).toBe(realScenarioDb().items[8]!.bytes[0x46]);
  });

  it('resistanceHeaders are the two packed engine header strings', () => {
    expect(d().resistanceHeaders).toEqual(['HEDGHFLDFRM MF', 'FMPTRABPVBLSMN']);
  });

  it('no curse line for LONGSWORD (curse byte clear)', () => {
    expect(d().curse).toBe(false);
  });
});

describe('assayItem — eligibility reflects the member', () => {
  it('a faerie/wrong-class member that fails the eligibility test reports usableBy false', () => {
    // LONGSWORD class mask byte 54 = 0x01 (class 0 only). A mage (class 1) is excluded.
    const mage: Pick<Character, 'class' | 'race' | 'sex'> = { class: 1, race: 0, sex: 0 };
    expect(assayItem(8, mage, realScenarioDb()).usableBy).toBe(false);
  });
});

describe('assayItem — armor category surfaces AC, not weapon fields', () => {
  it('LEATHER CUIRASS (item 135) is BODY ARMOR with an equip slot, no weaponType', () => {
    const desc = assayItem(135, fighter, realScenarioDb());
    expect(desc.categoryLabel).toBe('BODY ARMOR');
    expect(desc.weaponType).toBeUndefined();
    expect(desc.attackModes).toBeUndefined();
    expect(desc.ac).toBe(realScenarioDb().items[135]!.bytes[0x46]);
  });
});
