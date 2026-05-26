import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePcfile } from '../../src/formats/pcfile.js';
import { encodeCharacterRecord } from '../../src/formats/encode-character-record.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PCFILE = readFileSync(join(HERE, '..', '..', '..', '..', 'original', 'pcfile.dbs'));

/**
 * pcfile.dbs layout constants (verified by decodePcfile):
 *   headerSize = 24 bytes
 *   recordStride = 0x1b0 = 432 bytes per slot
 */
const HEADER_SIZE = 24;
const RECORD_STRIDE = 0x1b0;

describe('encodeCharacterRecord', () => {
  it('round-trips all 6 stock characters byte-for-byte', () => {
    const pcfileBytes = new Uint8Array(PCFILE);
    const { slots } = decodePcfile(pcfileBytes);
    const populated = slots.filter((s) => s.populated);

    expect(populated.length).toBe(6);

    for (const slot of populated) {
      const encoded = encodeCharacterRecord(slot);

      // Must produce exactly 432 bytes
      expect(encoded.length).toBe(RECORD_STRIDE);

      // Extract the original raw bytes for this slot from the file
      const recStart = HEADER_SIZE + slot.slot * RECORD_STRIDE;
      const original = pcfileBytes.subarray(recStart, recStart + RECORD_STRIDE);

      // Full byte-for-byte equality
      for (let b = 0; b < RECORD_STRIDE; b++) {
        if (encoded[b] !== original[b]) {
          throw new Error(
            `${slot.name} byte mismatch at offset 0x${b.toString(16).padStart(3, '0')}: ` +
            `encoded=0x${encoded[b]!.toString(16).padStart(2, '0')} ` +
            `original=0x${original[b]!.toString(16).padStart(2, '0')}`
          );
        }
      }

      expect(Array.from(encoded)).toEqual(Array.from(original));
    }
  });

  it('encodes THESUS name field as 8 bytes: "THESUS\\0\\0"', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    const encoded = encodeCharacterRecord(thesus);

    // Name at +0x00: ASCII null-terminated, 8 bytes
    expect(encoded[0]).toBe(0x54); // T
    expect(encoded[1]).toBe(0x48); // H
    expect(encoded[2]).toBe(0x45); // E
    expect(encoded[3]).toBe(0x53); // S
    expect(encoded[4]).toBe(0x55); // U
    expect(encoded[5]).toBe(0x53); // S
    expect(encoded[6]).toBe(0x00); // null terminator
    expect(encoded[7]).toBe(0x00); // null pad
  });

  it('encodes THESUS ageCounter at +0x08 and xp at +0x0c', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    const encoded = encodeCharacterRecord(thesus);

    const view = new DataView(encoded.buffer, encoded.byteOffset);
    expect(view.getUint32(0x08, true)).toBe(6590); // ageCounter
    expect(view.getUint32(0x0c, true)).toBe(0);    // xp
  });

  it('encodes THESUS hp/sp/encumbrance fields correctly', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    const encoded = encodeCharacterRecord(thesus);

    const view = new DataView(encoded.buffer, encoded.byteOffset);
    expect(view.getUint16(0x18, true)).toBe(8);    // hpCurrent
    expect(view.getUint16(0x1a, true)).toBe(8);    // hpMax
    expect(view.getUint16(0x1c, true)).toBe(126);  // spCurrent
    expect(view.getUint16(0x1e, true)).toBe(126);  // spMax
    expect(view.getUint16(0x20, true)).toBe(295);  // encumbranceCurrent
    expect(view.getUint16(0x22, true)).toBe(2700); // encumbranceMax
  });

  it('encodes TREON school mana (interleaved cur/max pairs)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const treon = slots.find((s) => s.name === 'TREON')!;
    const encoded = encodeCharacterRecord(treon);

    const view = new DataView(encoded.buffer, encoded.byteOffset);
    // School 0 (Fire): cur@0x28, max@0x2a
    expect(view.getUint16(0x28, true)).toBe(3); // Fire cur
    expect(view.getUint16(0x2a, true)).toBe(3); // Fire max
    // School 4 (Mental): cur@0x38, max@0x3a
    expect(view.getUint16(0x38, true)).toBe(3); // Mental cur
    expect(view.getUint16(0x3a, true)).toBe(3); // Mental max
    // School 1 (Water): cur@0x2c, max@0x2e -> both 0
    expect(view.getUint16(0x2c, true)).toBe(0);
    expect(view.getUint16(0x2e, true)).toBe(0);
  });

  it('encodes THESUS attributes at +0x12c', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    const encoded = encodeCharacterRecord(thesus);

    expect(encoded[0x12c]).toBe(18); // STR
    expect(encoded[0x12d]).toBe(8);  // INT
    expect(encoded[0x12e]).toBe(8);  // PIE
    expect(encoded[0x12f]).toBe(12); // VIT
    expect(encoded[0x130]).toBe(10); // DEX
    expect(encoded[0x131]).toBe(9);  // SPD
  });

  it('encodes LYSANDR skills[15]=10 (Skulduggery)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const lysandr = slots.find((s) => s.name === 'LYSANDR')!;
    const encoded = encodeCharacterRecord(lysandr);

    // skills at +0x134, skill[15] at +0x143
    expect(encoded[0x134 + 15]).toBe(10);
  });

  it('encodes THESUS inventory slot 0 (LONGSWORD) at +0x40', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    const encoded = encodeCharacterRecord(thesus);

    const view = new DataView(encoded.buffer, encoded.byteOffset);
    // Slot 0: itemId=8 at +0x40 (u16 LE), weight=50 at +0x42
    expect(view.getUint16(0x40, true)).toBe(8);  // itemId
    expect(encoded[0x42]).toBe(50);              // weight
    expect(encoded[0x43]).toBe(0);               // pad
    expect(encoded[0x44]).toBe(0);               // equipSlot
    expect(encoded[0x45]).toBe(1);               // spriteIdx
    expect(encoded[0x46]).toBe(0);               // quantity
    expect(encoded[0x47]).toBe(0);               // flags
  });

  it('encodes THESUS equipment at +0x110 (all 0xFF)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    const encoded = encodeCharacterRecord(thesus);

    for (let i = 0; i < 8; i++) {
      expect(encoded[0x110 + i]).toBe(0xff);
    }
  });

  it('encodes THESUS race=0, alignment=0, class=0 at +0x19d..+0x19f', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    const encoded = encodeCharacterRecord(thesus);

    expect(encoded[0x19d]).toBe(0);  // race: Human
    expect(encoded[0x19e]).toBe(0);  // alignment: Good
    expect(encoded[0x19f]).toBe(0);  // class: Fighter
  });
});
