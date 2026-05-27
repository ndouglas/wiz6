/**
 * Declarative descriptions of Wiz6 engine BSS structures.
 *
 * BssStruct values describe the binary layout of structs the engine keeps
 * in memory — character records, combat slots, the sound table, etc. Each
 * one is the source of truth for typed reads against engine memory
 * (whether that memory came from a DOSBox-X save-state snapshot, from
 * the live MCP-driven engine, or from an export of the TS port's own
 * runtime state).
 *
 * The schemas live in this package because they're pure data — no
 * decoder logic, no I/O, just declarative records.
 */

/** Scalar field types decodable from a byte buffer. */
export type BssScalarType =
  | 'u8'
  | 'u16_le'
  | 'u32_le'
  | 'i8'
  | 'i16_le'
  | 'i32_le'
  | 'bool8'; // byte; 0 → false, non-zero → true

/** A field's declared type. Discriminated by `kind`. */
export type BssFieldType =
  | { kind: 'scalar'; scalar: BssScalarType }
  | { kind: 'string'; length: number; encoding?: 'ascii' }
  | { kind: 'bytes'; length: number }
  | { kind: 'array'; length: number; element: BssFieldType; stride?: number }
  | { kind: 'substruct'; structName: string }
  | { kind: 'enum'; scalar: BssScalarType; values: Readonly<Record<number, string>> }
  | { kind: 'bitflags'; scalar: BssScalarType; flags: Readonly<Record<number, string>> };

export interface BssField {
  /** Field name as documented in the corresponding RE doc. */
  readonly name: string;
  /** Byte offset within the parent struct. */
  readonly offset: number;
  /** Declared type — drives the decoder. */
  readonly type: BssFieldType;
  /** Optional one-line description for tooltips / docs. */
  readonly description?: string;
}

export interface BssStruct {
  /** Stable identifier (e.g. "character_record", "sound_table_entry"). */
  readonly name: string;
  /** Size of one record in bytes. Used for arrays + sub-struct stride. */
  readonly bytes: number;
  /** Field list. Order doesn't matter; offset is authoritative. */
  readonly fields: readonly BssField[];
  /** Optional one-line description. */
  readonly description?: string;
  /** Provenance: which RE finding(s) document this layout. */
  readonly source?: string;
}

/** Result of decoding a BssStruct from a buffer — a typed plain object. */
export type DecodedStruct = Record<string, unknown>;
