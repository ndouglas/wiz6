/**
 * Roundtrip test: pcfile.dbs → PcfileSlot → Character → PcfileSlot → encoded record
 *
 * This test proves the full export path (Character→pcfile) carries inventory +
 * equipment rather than defaulting them. It also documents the residual diff in
 * raw-only regions that `characterToPcfileSlot` cannot reconstruct (zeroed raw).
 *
 * Step 1 asserts the BUG (equipment/inventory dropped) — should FAIL before fix.
 * Step 2 asserts the RESIDUAL (raw-only bytes) — acceptable after fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePcfile } from '../../src/formats/pcfile.js';
import { pcfileSlotToCharacter, characterToPcfileSlot } from '../../src/formats/pcfile-character-bridge.js';
import { encodeCharacterRecord } from '../../src/formats/encode-character-record.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PCFILE = join(HERE, '..', '..', '..', '..', 'test-fixtures', 'original', 'pcfile.dbs');
const HEADER_SIZE = 24;
const RECORD_STRIDE = 0x1b0; // 432

const UUID_BASE = '00000000-0000-4000-8000-0000000000';

/**
 * Collect differing byte offsets between two Uint8Array-shaped values.
 * Returns an array of { offset, a, b } for each mismatch.
 */
function diffBytes(
  a: Uint8Array | number[],
  b: Uint8Array | number[],
  length = RECORD_STRIDE,
): Array<{ offset: number; a: number; b: number }> {
  const diffs: Array<{ offset: number; a: number; b: number }> = [];
  for (let i = 0; i < length; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) {
      diffs.push({ offset: i, a: a[i] ?? 0, b: b[i] ?? 0 });
    }
  }
  return diffs;
}

/**
 * Known-acceptable residual ranges after fixing inventory/equipment.
 * These bytes live only in `raw`; `characterToPcfileSlot` builds a zeroed raw,
 * so they become 0 in the roundtripped record.
 *
 * Ranges (inclusive):
 *   +0x118..+0x121  10 bytes  unknown_0x118 (class-dependent school capacity flags;
 *                             NOBAL/TREON/PENTAG have non-zero values 0x01–0x03 here)
 *   +0x1a0          1 byte    high_water_level (all 0 in stock chars → no diff)
 *   +0x1a2..+0x1a5  4 bytes   unknown_0x1a2 (all 0 in stock chars → no diff)
 *   +0x1a6          1 byte    unknown_0x1a6 (always 1 in stock chars → diff: 1→0)
 *   +0x1a7          1 byte    unknown_0x1a7 (always 10 in stock chars → diff: 10→0)
 *   +0x1a8          1 byte    spells_to_learn (all 0 in stock chars → no diff)
 *   +0x1a9          1 byte    unknown_0x1a9 (always 1 in stock chars → diff: 1→0)
 *   +0x1aa          1 byte    unknown_0x1aa (always 1 in stock chars → diff: 1→0)
 *   +0x1ae          1 byte    unknown_0x1ae (always 100 in stock chars → diff: 100→0)
 */
const RESIDUAL_RANGES: Array<[number, number]> = [
  [0x0f0, 0x10f], // gap between inventory end (0xef) and equipment start (0x110):
                  // 32 bytes = 4 potential extra inventory slots (22-25); non-zero values seen
                  // (e.g. THESUS +0xf0: 2,0,2,2,0…,32; same pattern in all stock chars).
                  // Not decoded by pcfile.ts or encoded by encodeCharacterRecord. Raw-only.
                  // Possibly more inventory slots, or unknown engine state. Low gameplay risk
                  // since all stock chars have the same pattern — looks like engine-written state.
  [0x118, 0x121], // unknown_0x118 (class-dependent school capacity flags;
                  // NOBAL/TREON/PENTAG have non-zero values 0x01–0x03 here)
  [0x1ab, 0x1ab], // portraitIndex creation default (+0x1ab, 0..13).
                  // Distinct from Character.portraitIndex which maps raw[+0x19c] (the RENDERED
                  // portrait 0..41 the engine actually draws). The Character schema only models
                  // the rendered portrait; the +0x1ab creation default is PcfileSlot-only.
                  // Not gameplay-critical (engine draws the +0x19c value), but a follow-up
                  // could add a 'creationPortraitIndex' field to carry it through for
                  // byte-exact roundtrip.
  [0x1a0, 0x1a0], // high_water_level (0 for all stock chars — no actual diff)
  [0x1a2, 0x1a5], // unknown_0x1a2 (0 for all stock chars — no actual diff)
  [0x1a6, 0x1a6], // unknown_0x1a6 (1 in stock chars → 0 after roundtrip)
  [0x1a7, 0x1a7], // unknown_0x1a7 (10 in stock chars → 0 after roundtrip)
  [0x1a8, 0x1a8], // spells_to_learn (0 for all stock chars — no actual diff)
  [0x1a9, 0x1a9], // unknown_0x1a9 (1 in stock chars → 0 after roundtrip)
  [0x1aa, 0x1aa], // unknown_0x1aa (1 in stock chars → 0 after roundtrip)
  [0x1ae, 0x1ae], // unknown_0x1ae (100 in stock chars → 0 after roundtrip)
];

function isResidualOffset(offset: number): boolean {
  return RESIDUAL_RANGES.some(([lo, hi]) => offset >= lo && offset <= hi);
}

describe('pcfile full roundtrip (pcfileSlotToCharacter → characterToPcfileSlot → encodeCharacterRecord)', () => {
  const pcfileBytes = new Uint8Array(readFileSync(PCFILE));
  const { slots } = decodePcfile(pcfileBytes);
  const populated = slots.filter((s) => s.populated);

  it('all 6 stock chars: equipment region (+0x110..+0x117) is byte-exact after roundtrip', () => {
    for (const slot of populated) {
      const uuid = `${UUID_BASE}${String(slot.slot + 1).padStart(2, '0')}`;
      const char = pcfileSlotToCharacter(slot, uuid);
      const slot2 = characterToPcfileSlot(char, slot.slot);
      const encoded = encodeCharacterRecord(slot2);

      const recStart = HEADER_SIZE + slot.slot * RECORD_STRIDE;
      const original = pcfileBytes.subarray(recStart, recStart + RECORD_STRIDE);

      const equipDiffs = diffBytes(encoded, original).filter(
        (d) => d.offset >= 0x110 && d.offset <= 0x117,
      );
      expect(equipDiffs, `${slot.name} equipment diff`).toEqual([]);
    }
  });

  it('all 6 stock chars: inventory region (+0x40..+0xef, 22 slots × 8 bytes) is byte-exact after roundtrip', () => {
    // Inventory: 22 slots × 8 bytes = 176 bytes, starting at +0x40, ending at +0xef.
    // The gap +0xf0..+0x10f (32 bytes = 4 potential extra slots) is raw-only and documented below.
    for (const slot of populated) {
      const uuid = `${UUID_BASE}${String(slot.slot + 1).padStart(2, '0')}`;
      const char = pcfileSlotToCharacter(slot, uuid);
      const slot2 = characterToPcfileSlot(char, slot.slot);
      const encoded = encodeCharacterRecord(slot2);

      const recStart = HEADER_SIZE + slot.slot * RECORD_STRIDE;
      const original = pcfileBytes.subarray(recStart, recStart + RECORD_STRIDE);

      const invDiffs = diffBytes(encoded, original).filter(
        (d) => d.offset >= 0x40 && d.offset <= 0xef,
      );
      expect(invDiffs, `${slot.name} inventory diff`).toEqual([]);
    }
  });

  it('all 6 stock chars: inventoryCount (+0x1ac) + inventoryCountPage2 (+0x1ad) are byte-exact after roundtrip', () => {
    for (const slot of populated) {
      const uuid = `${UUID_BASE}${String(slot.slot + 1).padStart(2, '0')}`;
      const char = pcfileSlotToCharacter(slot, uuid);
      const slot2 = characterToPcfileSlot(char, slot.slot);
      const encoded = encodeCharacterRecord(slot2);

      const recStart = HEADER_SIZE + slot.slot * RECORD_STRIDE;
      const original = pcfileBytes.subarray(recStart, recStart + RECORD_STRIDE);

      const countDiffs = diffBytes(encoded, original).filter(
        (d) => d.offset === 0x1ac || d.offset === 0x1ad,
      );
      expect(countDiffs, `${slot.name} inventoryCount diff`).toEqual([]);
    }
  });

  it('all 6 stock chars: spellSlotsKnown region (+0x188..+0x19b) is byte-exact after roundtrip', () => {
    for (const slot of populated) {
      const uuid = `${UUID_BASE}${String(slot.slot + 1).padStart(2, '0')}`;
      const char = pcfileSlotToCharacter(slot, uuid);
      const slot2 = characterToPcfileSlot(char, slot.slot);
      const encoded = encodeCharacterRecord(slot2);

      const recStart = HEADER_SIZE + slot.slot * RECORD_STRIDE;
      const original = pcfileBytes.subarray(recStart, recStart + RECORD_STRIDE);

      const spellDiffs = diffBytes(encoded, original).filter(
        (d) => d.offset >= 0x188 && d.offset <= 0x19b,
      );
      expect(spellDiffs, `${slot.name} spellSlotsKnown diff`).toEqual([]);
    }
  });

  it('all 6 stock chars: full record diff shows ONLY residual raw-only bytes (documents acceptable gaps)', () => {
    /**
     * After the fix, the ONLY diffs should be in the known residual ranges.
     * This test documents them per slot. Non-residual diffs = a regression.
     *
     * Residual ranges that ACTUALLY differ (non-zero in stock records):
     *   +0x0f0..+0x10f  gap bytes (32 bytes between inventory and equipment;
     *                   pattern [2,0,2,2,…,32] consistent across all 6 stock chars)
     *   +0x118..+0x121  unknown_0x118  (class flags; NOBAL/TREON/PENTAG have non-zero values)
     *   +0x1ab          portraitIndex creation default (character-specific 0..13 values → 0)
     *   +0x1a6          unknown_0x1a6  (always 1 → 0)
     *   +0x1a7          unknown_0x1a7  (always 10 → 0)
     *   +0x1a9          unknown_0x1a9  (always 1 → 0)
     *   +0x1aa          unknown_0x1aa  (always 1 → 0)
     *   +0x1ae          unknown_0x1ae  (always 100 → 0)
     *
     * Gameplay relevance assessment:
     *   +0x0f0..+0x10f — POSSIBLY RELEVANT: consistent pattern suggests engine-written state.
     *                    Could be extra inventory slots 22-25 (game has 22-slot UI but
     *                    struct may have 26). Follow-up needed.
     *   +0x118..+0x121 — POSSIBLY RELEVANT: non-zero for casters (values 0x01–0x03 per school);
     *                    likely school capacity flags. Could affect levelling or spell slots if
     *                    the engine reads them. Follow-up: retain original raw on Character
     *                    (or add schoolCapacityFlags field) to achieve byte-exact roundtrip.
     *   +0x1ab          — PROBABLY NOT RELEVANT for rendering (engine draws raw[+0x19c], not
     *                    this field), but is character-specific data. A 'creationPortraitIndex'
     *                    field on Character could achieve byte-exact roundtrip here.
     *   +0x1a6/+0x1a7/+0x1a9/+0x1aa  — PROBABLY NOT RELEVANT: constant across all 6 chars
     *                                   (not character-specific data). Engine may not read
     *                                   these after initial load.
     *   +0x1ae          — PROBABLY NOT RELEVANT: always 100 (likely max-reaction sentinel).
     */
    for (const slot of populated) {
      const uuid = `${UUID_BASE}${String(slot.slot + 1).padStart(2, '0')}`;
      const char = pcfileSlotToCharacter(slot, uuid);
      const slot2 = characterToPcfileSlot(char, slot.slot);
      const encoded = encodeCharacterRecord(slot2);

      const recStart = HEADER_SIZE + slot.slot * RECORD_STRIDE;
      const original = pcfileBytes.subarray(recStart, recStart + RECORD_STRIDE);

      const allDiffs = diffBytes(encoded, original);
      const unexpectedDiffs = allDiffs.filter((d) => !isResidualOffset(d.offset));

      if (unexpectedDiffs.length > 0) {
        const summary = unexpectedDiffs
          .slice(0, 10)
          .map((d) => `+0x${d.offset.toString(16).padStart(3, '0')}: orig=0x${d.b.toString(16).padStart(2, '0')} encoded=0x${d.a.toString(16).padStart(2, '0')}`)
          .join('\n  ');
        throw new Error(
          `${slot.name}: unexpected non-residual diffs (${unexpectedDiffs.length}):\n  ${summary}`,
        );
      }
    }
  });
});
