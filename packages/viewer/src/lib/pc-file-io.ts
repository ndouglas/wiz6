// packages/viewer/src/lib/pc-file-io.ts
import {
  PcFileJsonSchema, type Character,
} from '@wiz6/data';
import {
  decodePcfile, encodePcfile, charactersToDecodedPcfile, pcfileSlotToCharacter,
} from '@wiz6/parser';

function freshId(i: number): string {
  // crypto.randomUUID is available in the browser + jsdom test env.
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `imported-${Date.now()}-${i}`;
}

/** Lossless native JSON blob for download (whole PC File or a single character). */
export function charactersToJsonBlob(characters: ReadonlyArray<Character>): Blob {
  const json = { format: 'wiz6-pcfile', version: 1, characters: characters.slice(0, 16) };
  return new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
}

/** Engine-faithful PCFILE.DBS bytes for download. */
export function charactersToDbsBytes(characters: ReadonlyArray<Character>): Uint8Array {
  return encodePcfile(charactersToDecodedPcfile(characters));
}

/** Parse an imported file (by extension) into Characters with FRESH UUIDs.
 *  Throws (with no partial result) on malformed input. */
export function parseImport(filename: string, bytes: Uint8Array): Character[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.dbs')) {
    const decoded = decodePcfile(bytes);
    return decoded.slots.filter((s) => s.populated).map((s, i) => pcfileSlotToCharacter(s, freshId(i)));
  }
  // default: JSON
  // Mint fresh UUIDs before schema validation so CharacterSchema.uuid() passes
  // regardless of whatever id the exported file contained.
  const text = new TextDecoder().decode(bytes);
  const raw = JSON.parse(text) as unknown;
  const withFreshIds =
    raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>)['characters'])
      ? {
          ...(raw as Record<string, unknown>),
          characters: ((raw as Record<string, unknown[]>)['characters'] as unknown[]).map(
            (c, i) =>
              c && typeof c === 'object' ? { ...(c as Record<string, unknown>), id: freshId(i) } : c,
          ),
        }
      : raw;
  const parsed = PcFileJsonSchema.parse(withFreshIds);
  return parsed.characters;
}
