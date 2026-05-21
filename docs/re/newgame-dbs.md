# `newgame.dbs` — Character / Class / Race / Item Database

**Status:** Structure decoded. Per-field semantics TBD.

## File layout

Exactly **779 × 64-byte fixed-size records**, no header, no footer. Total 49,856 bytes.

- 602 records are non-empty (mostly bit-packed bytes).
- 177 records are entirely zero — possibly "empty slots" reserved for game-tool editing or for future content.

Average non-empty record uses ~30 of its 64 bytes for non-zero data. Per-byte-position usage is uniform across the 64 positions (260-315 records use each), indicating the data is densely bit-packed rather than having "always present" header fields.

## Inferred content

`newgame.dbs` is referenced by **`wbase.ovr`** (the base/character-creation overlay) alongside `PCFILE.DBS` and `SAVEGAME.DBS`. So this file holds the **template data needed to create new characters**: races, classes, alignments, starting stats / spells / equipment lists, etc.

779 records is roughly consistent with the combined size of:
- ~11 races
- ~14 classes
- ~3 alignments
- ~200 spells
- ~300+ items / weapons / armor
- + miscellaneous templates

The exact record-type ↔ index mapping isn't known yet without RE'ing wbase.ovr.

## Per-field semantics

**Unknown.** The 64-byte records are densely bit-packed. Decoding would require either:

1. Tracing the routine in wbase.ovr that reads newgame.dbs and parses its fields.
2. Comparing known in-game stat values (e.g., "Fighter starts with X strength") against specific record bytes to identify field offsets and widths.

## Extracted artifact

The Stage 1i extractor writes a JSON containing all 779 records as raw `number[]` arrays of length 64, plus a flag indicating whether each is empty. The viewer shows each record in hex with non-zero bytes highlighted. Future work can decode individual fields by reading the raw bytes and comparing to in-game UI.

## Open questions

- Field schemas per record type
- Whether records are grouped by type (records 0..N = races, N+1..M = classes, ...) or interleaved
- The 177 empty records — placeholders or accidental gaps?
