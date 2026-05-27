import type { BssField, BssFieldType, BssScalarType, BssStruct, DecodedStruct } from './bss-types.js';

/**
 * Decode a BssStruct from a byte buffer at a given offset.
 *
 * Pure function; no I/O. Returns a plain typed object keyed by field name.
 * For `enum` fields, the decoded value is the named string (or the raw number
 * if no mapping matches). For `bitflags`, the decoded value is an array of
 * flag names whose bits are set, in declaration order.
 *
 * @param struct  The BssStruct describing the layout.
 * @param buffer  Byte buffer (typically a slice of engine memory).
 * @param offset  Byte offset within `buffer` where the struct starts.
 * @param registry Optional map of struct-name → BssStruct, used to resolve
 *                 `substruct` fields. Without it, substructs decode as raw
 *                 byte ranges with `_unresolved_substruct: <name>` marker.
 */
export function decodeBssStruct(
  struct: BssStruct,
  buffer: Uint8Array,
  offset = 0,
  registry?: ReadonlyMap<string, BssStruct>,
): DecodedStruct {
  if (offset + struct.bytes > buffer.length) {
    throw new RangeError(
      `decodeBssStruct(${struct.name}): need ${struct.bytes} bytes at offset 0x${offset.toString(16)}, only ${buffer.length - offset} available`,
    );
  }
  const out: DecodedStruct = {};
  for (const field of struct.fields) {
    out[field.name] = decodeField(field, buffer, offset, registry);
  }
  return out;
}

function decodeField(
  field: BssField,
  buffer: Uint8Array,
  baseOffset: number,
  registry?: ReadonlyMap<string, BssStruct>,
): unknown {
  return decodeType(field.type, buffer, baseOffset + field.offset, registry);
}

function decodeType(
  type: BssFieldType,
  buffer: Uint8Array,
  absoluteOffset: number,
  registry?: ReadonlyMap<string, BssStruct>,
): unknown {
  switch (type.kind) {
    case 'scalar':
      return readScalar(type.scalar, buffer, absoluteOffset);
    case 'string':
      return readString(buffer, absoluteOffset, type.length);
    case 'bytes':
      return Array.from(buffer.subarray(absoluteOffset, absoluteOffset + type.length));
    case 'array': {
      const elementSize = sizeOfType(type.element, registry);
      const stride = type.stride ?? elementSize;
      const out: unknown[] = [];
      for (let i = 0; i < type.length; i++) {
        out.push(decodeType(type.element, buffer, absoluteOffset + i * stride, registry));
      }
      return out;
    }
    case 'substruct': {
      const sub = registry?.get(type.structName);
      if (!sub) {
        return {
          _unresolved_substruct: type.structName,
          raw: Array.from(
            buffer.subarray(absoluteOffset, absoluteOffset + 0), // 0-length when unresolved
          ),
        };
      }
      return decodeBssStruct(sub, buffer, absoluteOffset, registry);
    }
    case 'enum': {
      const raw = readScalar(type.scalar, buffer, absoluteOffset) as number;
      return type.values[raw] ?? raw;
    }
    case 'bitflags': {
      const raw = readScalar(type.scalar, buffer, absoluteOffset) as number;
      const out: string[] = [];
      for (const key of Object.keys(type.flags)) {
        const bit = Number(key);
        if ((raw & bit) === bit) out.push(type.flags[bit]!);
      }
      return out;
    }
  }
}

function readScalar(scalar: BssScalarType, buffer: Uint8Array, offset: number): number | boolean {
  switch (scalar) {
    case 'u8':
      return buffer[offset]!;
    case 'i8': {
      const b = buffer[offset]!;
      return b < 0x80 ? b : b - 0x100;
    }
    case 'u16_le':
      return buffer[offset]! | (buffer[offset + 1]! << 8);
    case 'i16_le': {
      const u = buffer[offset]! | (buffer[offset + 1]! << 8);
      return u < 0x8000 ? u : u - 0x10000;
    }
    case 'u32_le':
      return (
        buffer[offset]! |
        (buffer[offset + 1]! << 8) |
        (buffer[offset + 2]! << 16) |
        (buffer[offset + 3]! * 0x1000000) // shift-by-24 in JS overflows 32-bit signed; multiply preserves the value
      );
    case 'i32_le': {
      // little-endian, signed 32-bit
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      return view.getInt32(offset, true);
    }
    case 'bool8':
      return buffer[offset]! !== 0;
  }
}

function readString(buffer: Uint8Array, offset: number, length: number): string {
  // ASCII; treat as C-string — stop at the first null byte. Trailing spaces
  // (the engine pads some fields with 0x20) are also trimmed from whatever
  // comes back from that scan.
  let end = offset;
  const limit = offset + length;
  while (end < limit && buffer[end] !== 0) end++;
  // Trim trailing spaces beyond the null cut.
  while (end > offset && buffer[end - 1] === 0x20) end--;
  return new TextDecoder('ascii').decode(buffer.subarray(offset, end));
}

/** Compute the size in bytes of a field type, recursively for arrays + substructs. */
export function sizeOfType(type: BssFieldType, registry?: ReadonlyMap<string, BssStruct>): number {
  switch (type.kind) {
    case 'scalar':
      switch (type.scalar) {
        case 'u8':
        case 'i8':
        case 'bool8':
          return 1;
        case 'u16_le':
        case 'i16_le':
          return 2;
        case 'u32_le':
        case 'i32_le':
          return 4;
      }
    // eslint-disable-next-line no-fallthrough
    case 'string':
      return type.length;
    case 'bytes':
      return type.length;
    case 'array': {
      const elementSize = sizeOfType(type.element, registry);
      const stride = type.stride ?? elementSize;
      return stride * type.length;
    }
    case 'substruct': {
      const sub = registry?.get(type.structName);
      return sub?.bytes ?? 0;
    }
    case 'enum':
    case 'bitflags':
      return sizeOfType({ kind: 'scalar', scalar: type.scalar }, registry);
  }
}

/** Convenience: build a name→struct registry from a list of BssStructs. */
export function buildStructRegistry(structs: readonly BssStruct[]): ReadonlyMap<string, BssStruct> {
  const map = new Map<string, BssStruct>();
  for (const s of structs) map.set(s.name, s);
  return map;
}
