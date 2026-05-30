import type { Character, DecodedPcfile } from '@wiz6/data';
import { encodeCharacterRecord } from './encode-character-record.js';
import { characterToPcfileSlot } from './pcfile-character-bridge.js';

const HEADER_SIZE = 24;
const RECORD_SIZE = 0x1b0; // 432
const SLOT_COUNT = 16;

/**
 * Encode a DecodedPcfile back to the 6936-byte on-disk PCFILE.DBS format:
 * 24-byte header (record_size, slot_count, header_size, status[16]) + 16×432
 * records. Each record is produced by encodeCharacterRecord (which seeds from
 * the slot's `raw`, so decode→encode is byte-exact for unmodified data).
 */
export function encodePcfile(decoded: DecodedPcfile): Uint8Array {
  const total = HEADER_SIZE + SLOT_COUNT * RECORD_SIZE;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  view.setUint16(0x00, decoded.header.recordSize, true);
  view.setUint16(0x02, decoded.header.slotCount, true);
  view.setUint32(0x04, decoded.header.headerSize, true);
  for (let i = 0; i < 16; i++) out[0x08 + i] = decoded.header.status[i]!;

  for (let i = 0; i < SLOT_COUNT; i++) {
    const record = encodeCharacterRecord(decoded.slots[i]!);
    out.set(record, HEADER_SIZE + i * RECORD_SIZE);
  }
  return out;
}

/** Build a DecodedPcfile from up to 16 Characters (for export). Extra empty slots
 *  are zeroed records with status 0; populated slots get status 1. */
export function charactersToDecodedPcfile(characters: ReadonlyArray<Character>): DecodedPcfile {
  if (characters.length > 16) throw new Error(`too many characters: ${characters.length} (max 16)`);
  const status = new Array<number>(16).fill(0);
  const slots = [];
  for (let i = 0; i < 16; i++) {
    const c = characters[i];
    if (c) {
      status[i] = 1;
      slots.push(characterToPcfileSlot(c, i));
    } else {
      slots.push(emptySlot(i));
    }
  }
  return { header: { recordSize: 0x1b0, slotCount: 16, headerSize: 24, status }, slots };
}

function emptySlot(i: number) {
  return characterToPcfileSlot(
    {
      id: '', name: '', race: 0, class: 0, level: 0, savedOldLevel: 0, xp: 0, gold: 0,
      conditions: new Array(10).fill(0), dead: false, paralyzed: false,
      attributes: { str: 0, int: 0, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0 },
      schoolMana: new Array(6).fill(0), schoolManaMax: new Array(6).fill(0),
      skills: new Array(30).fill(0), reaction: 0, sex: 0, portraitIndex: 0,
    } as Character,
    i,
  );
}
