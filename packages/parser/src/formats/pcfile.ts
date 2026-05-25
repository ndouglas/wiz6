import {
  DecodedPcfileSchema,
  type DecodedPcfile,
  type PcfileSlot,
} from '@wiz6/data';

/**
 * Decode `pcfile.dbs` bytes into a typed structure. Pure — no I/O.
 *
 * The on-disk record layout matches the in-memory `0x43e8` stride-`0x1B0`
 * BSS char slot exactly (verified by tracing the engine's load routine —
 * `wbase.ovr` does a 432-byte `rep movsw` straight from file buffer to
 * BSS). See `docs/re/pcfile-dbs.md` for the field-offset map.
 *
 * v1 decodes a small set of high-confidence fields. The full 432-byte
 * record is preserved per slot as `raw` so future RE refinements can
 * extract additional fields without re-running this decoder.
 *
 * Validates the decoded structure against `DecodedPcfileSchema`.
 */
export function decodePcfile(bytes: Uint8Array): DecodedPcfile {
  if (bytes.length < 24) {
    throw new Error(`pcfile too short: ${bytes.length} bytes (need at least 24 for header)`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const recordSize = view.getUint16(0x00, true);
  const slotCount = view.getUint16(0x02, true);
  const headerSize = view.getUint32(0x04, true);

  if (recordSize !== 0x1B0) {
    throw new Error(`unexpected pcfile record_size: 0x${recordSize.toString(16)} (expected 0x1B0)`);
  }
  if (slotCount !== 16) {
    throw new Error(`unexpected pcfile slot_count: ${slotCount} (expected 16)`);
  }
  if (headerSize !== 24) {
    throw new Error(`unexpected pcfile header_size: ${headerSize} (expected 24)`);
  }
  const expected = headerSize + slotCount * recordSize;
  if (bytes.length !== expected) {
    throw new Error(`pcfile size mismatch: got ${bytes.length} bytes, expected ${expected}`);
  }

  const status: number[] = [];
  for (let i = 0; i < 16; i++) status.push(bytes[8 + i]!);

  const decoder = new TextDecoder('ascii');
  const slots: PcfileSlot[] = [];
  for (let i = 0; i < 16; i++) {
    const recStart = headerSize + i * recordSize;
    const rec = bytes.subarray(recStart, recStart + recordSize);
    const populated = status[i] === 1;

    let name: string | null = null;
    if (populated) {
      let nameEnd = 0;
      while (nameEnd < 8 && rec[nameEnd] !== 0) nameEnd++;
      name = decoder.decode(rec.subarray(0, nameEnd));
    }

    slots.push({
      slot: i,
      populated,
      name,
      xp: view.getUint32(recStart + 0x08, true),
      hpCurrent: view.getUint16(recStart + 0x18, true),
      hpMax: view.getUint16(recStart + 0x1A, true),
      spCurrent: view.getUint16(recStart + 0x1C, true),
      spMax: view.getUint16(recStart + 0x1E, true),
      gold: view.getUint16(recStart + 0x22, true),
      level: view.getUint16(recStart + 0x24, true),
      levelSecondary: view.getUint16(recStart + 0x26, true),
      raw: Array.from(rec),
    });
  }

  return DecodedPcfileSchema.parse({
    header: { recordSize, slotCount, headerSize, status },
    slots,
  });
}
