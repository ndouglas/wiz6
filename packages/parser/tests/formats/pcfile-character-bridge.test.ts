import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePcfile } from '../../src/formats/pcfile.js';
import { pcfileSlotToCharacter } from '../../src/formats/pcfile-character-bridge.js';
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

  it('reads the RENDERED portrait from raw[0x19c], not slot.portraitIndex (0x1ab)', () => {
    const c = pcfileSlotToCharacter(thesus, UUID2);
    expect(c.portraitIndex).toBe(thesus.raw[0x19c]);
  });

  it('reads sex from raw[0x1a1] and derives dead/paralyzed from conditions', () => {
    const c = pcfileSlotToCharacter(thesus, UUID2);
    expect(c.sex).toBe(thesus.raw[0x1a1]);
    expect(c.dead).toBe(thesus.conditions[2] !== 0);
    expect(c.paralyzed).toBe(thesus.conditions[3] !== 0);
  });
});
