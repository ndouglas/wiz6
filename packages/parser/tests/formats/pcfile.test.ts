import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePcfile } from '../../src/formats/pcfile.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PCFILE = readFileSync(join(HERE, '..', '..', '..', '..', 'original', 'pcfile.dbs'));

describe('decodePcfile', () => {
  it('decodes the header from the real file', () => {
    const { header } = decodePcfile(new Uint8Array(PCFILE));
    expect(header.recordSize).toBe(0x1B0);
    expect(header.slotCount).toBe(16);
    expect(header.headerSize).toBe(24);
    expect(header.status.slice(0, 6)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(header.status.slice(6)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('decodes the 6 populated slots with their canonical names', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const populated = slots.filter((s) => s.populated);
    expect(populated.length).toBe(6);
    expect(populated.map((s) => s.name)).toEqual([
      'THESUS', 'TEMPEST', 'LYSANDR', 'NOBAL', 'TREON', 'PENTAG',
    ]);
  });

  it('decodes THESUS xp = 0, ageCounter = 6590, level = 1, hpCurrent = 8, spCurrent = 126', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    // XP is at record +0x0c (abs BSS 0x43f4/0x43f6). All stock chars start at 0 XP.
    // The prior value 6590 was ageCounter at +0x08 (BSS 0x43f0/0x43f2) — a game-day
    // age counter. 6590 days ≈ 18 years (÷365). See docs/re/findings/character-xp-field.json.
    expect(thesus.xp).toBe(0);
    expect(thesus.ageCounter).toBe(6590);
    // Level is at record +0x24 (abs BSS 0x440c). All stock chars start at level 1.
    expect(thesus.level).toBe(1);
    expect(thesus.hpCurrent).toBe(8);
    expect(thesus.hpMax).toBe(8);
    expect(thesus.spCurrent).toBe(126);
    expect(thesus.spMax).toBe(126);
  });

  it('empty slots have populated=false, name=null, and an all-zero raw', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const empty = slots.filter((s) => !s.populated);
    expect(empty.length).toBe(10);
    for (const s of empty) {
      expect(s.name).toBeNull();
      expect(s.raw.every((b) => b === 0)).toBe(true);
    }
  });

  it('throws on truncated input', () => {
    expect(() => decodePcfile(new Uint8Array([0xb0, 0x01]))).toThrow();
  });

  it('throws on wrong record_size in header', () => {
    const bytes = new Uint8Array(PCFILE);
    bytes[0] = 0xFF; // corrupt record_size
    expect(() => decodePcfile(bytes)).toThrow();
  });
});
