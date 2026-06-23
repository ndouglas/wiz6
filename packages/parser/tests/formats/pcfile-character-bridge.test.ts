import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePcfile } from '../../src/formats/pcfile.js';
import { pcfileSlotToCharacter, characterToPcfileSlot } from '../../src/formats/pcfile-character-bridge.js';
import { encodeCharacterRecord } from '../../src/formats/encode-character-record.js';
import { CharacterSchema } from '@wiz6/data';

// Match the existing parser tests' fixture-path pattern (ESM — no __dirname).
const HERE = dirname(fileURLToPath(import.meta.url));
const PCFILE = join(HERE, '..', '..', '..', '..', 'test-fixtures', 'original', 'pcfile.dbs');

// Stable test UUIDs — satisfy z.string().uuid() without relying on crypto at import time.
const UUID1 = '00000000-0000-4000-8000-000000000001';
const UUID2 = '00000000-0000-4000-8000-000000000002';

describe('pcfileSlotToCharacter', () => {
  const decoded = decodePcfile(new Uint8Array(readFileSync(PCFILE)));
  const thesus = decoded.slots[0]; // first stock char

  it('maps engine fields onto a schema-valid Character', () => {
    const c = pcfileSlotToCharacter(thesus, UUID1);
    expect(() => CharacterSchema.parse(c)).not.toThrow();
    expect(c.id).toBe(UUID1);
    expect(c.name).toBe(thesus.name);
    expect(c.race).toBe(thesus.race);
    expect(c.class).toBe(thesus.class);
    expect(c.attributes.str).toBe(thesus.str);
    expect(c.attributes.kar).toBe(thesus.kar);
    expect(c.staminaCurrent).toBe(thesus.spCurrent);
    expect(c.staminaMax).toBe(thesus.spMax);
    expect(c.age).toBe(thesus.ageCounter);
    expect(c.encumbranceMax).toBe(thesus.encumbranceMax);
  });

  it('carries the slot inventory + equipment onto the Character (regression: were dropped)', () => {
    // Was the bug behind "my squad has no equipment": the bridge built the
    // Character without inventory/equipment, so any pcfile-imported roster showed
    // an empty pack in the review screen + equip menu. THESUS (Fighter) carries the
    // stock Fighter kit: LONGSWORD, LEATHER CUIRASS, FUR LEGGING, SANDALS, BUCKLER SHIELD.
    const c = pcfileSlotToCharacter(thesus, UUID1);
    expect(c.inventory).toBeDefined();
    expect(c.inventory!.map((i) => i.itemId).filter((id) => id > 0)).toEqual([8, 135, 132, 130, 141]);
    expect(c.equipment).toHaveLength(8);
  });

  it('reads the RENDERED portrait from raw[0x19c], not slot.portraitIndex (0x1ab)', () => {
    const c = pcfileSlotToCharacter(thesus, UUID2);
    expect(c.portraitIndex).toBe(thesus.raw[0x19c]);
  });

  it('reads sex from raw[0x19e] and derives dead/paralyzed from conditions', () => {
    const c = pcfileSlotToCharacter(thesus, UUID2);
    expect(c.sex).toBe(thesus.raw[0x19e]);
    expect(c.dead).toBe(thesus.conditions[2] !== 0);
    expect(c.paralyzed).toBe(thesus.conditions[3] !== 0);
  });

  it('decodes maze-affliction fields from raw (+0x1A1..+0x1A5, +0x11C)', () => {
    // Clone a real slot (keeps the PcfileSlot shape) and stamp the affliction bytes.
    const raw = [...thesus.raw];
    raw[0x1a1] = 2; // statusLevel
    raw[0x1a2] = 5; // vitRegen[0]
    raw[0x1a3] = 1; // vitRegen[1]
    raw[0x1a4] = 0; // vitRegen[2]
    raw[0x1a5] = 3; // poisonAmount
    raw[0x11c] = 4; // schoolSkill[0]
    const c = pcfileSlotToCharacter({ ...thesus, raw }, UUID1);
    expect(c.statusLevel).toBe(2);
    expect(c.poisonAmount).toBe(3);
    expect(c.vitRegen).toEqual([5, 1, 0]);
    expect(c.schoolSkill![0]).toBe(4);
  });

  it('yields all-zero affliction fields when those raw bytes are 0', () => {
    const raw = [...thesus.raw];
    for (const off of [0x1a1, 0x1a2, 0x1a3, 0x1a4, 0x1a5, 0x11c, 0x11d, 0x11e, 0x11f, 0x120, 0x121]) {
      raw[off] = 0;
    }
    const c = pcfileSlotToCharacter({ ...thesus, raw }, UUID1);
    expect(c.statusLevel).toBe(0);
    expect(c.poisonAmount).toBe(0);
    expect(c.vitRegen).toEqual([0, 0, 0]);
    expect(c.schoolSkill).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('decodes TEMPEST (pinned roster slot 1) as female (sex=1)', () => {
    // Engine ground truth: the ADD PARTY picker renders TEMPEST's sex glyph as
    // 'F'; all five other pinned chars render 'M'. +0x19e is the only byte that
    // is 1 for TEMPEST and 0 for everyone else — confirming sex lives there.
    const tempest = decoded.slots[1];
    expect(tempest.name).toBe('TEMPEST');
    expect(pcfileSlotToCharacter(tempest, UUID1).sex).toBe(1);
    // THESUS (slot 0) is male.
    expect(pcfileSlotToCharacter(thesus, UUID2).sex).toBe(0);
  });
});

describe('characterToPcfileSlot', () => {
  const decoded = decodePcfile(new Uint8Array(readFileSync(PCFILE)));
  const thesus = decoded.slots[0]; // first stock char

  it('round-trips a decoded stock char field-equal (slot→char→slot→record→decode)', () => {
    const c = pcfileSlotToCharacter(thesus, UUID2);
    const slot = characterToPcfileSlot(c, 7); // slot index 7
    const record = encodeCharacterRecord(slot);
    // Assert the round-tripped Character instead of re-decoding a full file:
    const back = pcfileSlotToCharacter({ ...slot, raw: Array.from(record) }, UUID2);
    expect(back.name).toBe(c.name);
    expect(back.attributes).toEqual(c.attributes);
    expect(back.portraitIndex).toBe(c.portraitIndex); // survived via raw[0x19c]
    expect(back.sex).toBe(c.sex);                     // survived via raw[0x19e]
    expect(back.staminaMax).toBe(c.staminaMax);
    expect(back.encumbranceMax).toBe(c.encumbranceMax);
  });

  it('writes rendered portrait to raw[0x19c] and sex to raw[0x19e]', () => {
    const c = pcfileSlotToCharacter(thesus, UUID2);
    const slot = characterToPcfileSlot(c, 0);
    expect(slot.raw[0x19c]).toBe(c.portraitIndex);
    expect(slot.raw[0x19e]).toBe(c.sex);
    expect(slot.populated).toBe(true);
    expect(slot.raw).toHaveLength(432);
  });
});
