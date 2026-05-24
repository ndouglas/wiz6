/**
 * Declarative BSS struct schemas for Wiz6 engine memory.
 *
 * Each `BssStruct` describes the byte layout of a runtime structure the
 * engine keeps in memory (a character record, the sound table, a combat
 * slot, etc.). Schemas are pure data; the decoder in `decoder.ts`
 * translates a byte buffer + a `BssStruct` into a typed object.
 *
 * Consumers:
 * - The eventual DOSBox-X MCP server's `read_struct` tool (#017).
 * - A future save-state introspection viewer.
 * - The TS port's own runtime state validation.
 * - Auto-generated docs (e.g. field tables on `/explore/overlays`).
 *
 * Add a new struct: drop a new file with one exported `BssStruct`,
 * append it to `ALL_STRUCTS` below.
 */

export type { BssField, BssFieldType, BssScalarType, BssStruct, DecodedStruct } from './bss-types.js';
export { decodeBssStruct, sizeOfType, buildStructRegistry } from './decoder.js';

import type { BssStruct } from './bss-types.js';
import { CHARACTER_RECORD } from './character-record.js';
import { COMBAT_SLOT } from './combat-slot.js';
import { MONSTER_PREJUDICE } from './monster-prejudice.js';
import { POSITION_STATE } from './position-state.js';
import { SOUND_TABLE_ENTRY } from './sound-table-entry.js';

export { CHARACTER_RECORD, COMBAT_SLOT, MONSTER_PREJUDICE, POSITION_STATE, SOUND_TABLE_ENTRY };

/** All currently-defined BSS structs. Useful for building a registry. */
export const ALL_STRUCTS: readonly BssStruct[] = [
  CHARACTER_RECORD,
  COMBAT_SLOT,
  MONSTER_PREJUDICE,
  POSITION_STATE,
  SOUND_TABLE_ENTRY,
];
