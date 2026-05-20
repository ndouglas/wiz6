# `mazedata.ega` — Investigation Memo (INCOMPLETE)

**Status:** Partial structural understanding. The file is NOT a simple tile sheet — it's a combined database holding **dungeon-grid definitions, bit-packed object coordinate tables, AND graphic-slice data** for the dungeon view. Full decoding requires tracing wroot.exe's bit-stream helpers, which we didn't pursue further in Stage 1h.

## Files

- `original/mazedata.ega` — 102,303 bytes. The EGA-mode version.
- `original/mazedata.cga` — 52,451 bytes. CGA variant (smaller because of fewer bit-planes for the graphic portion).
- `original/mazedata.t16` — 102,303 bytes. Tandy 16-color variant. Same size as EGA — likely the same format with different graphic encoding.

## Confirmed structural facts

### File header (bytes 0..7)

```
99 00 6e 01 00 00 00 0e
```

As 16-bit LE words: `0x0099` (= 153), `0x016e` (= 366), `0x0000`, `0x0e00` (= 3584).

The values `153` and `366` are clearly entry counts — `153` matches the size of the next table exactly.

### Table 1 (bytes 8..772) — 153 × 5-byte descriptor records

Each 5-byte record decodes as:
- `BYTE id` — id byte that PARTIALLY follows a 4-element cycle (`0x57 0x33 0x1b 0x70`) for the first ~11 entries, then varies more widely. Probably a tile or sprite-type code.
- `WORD value` — monotonically increasing in the range 304..6223 (with one decrease). Looks like a byte offset relative to a data region OR an index into a sprite pool.
- `BYTE flags1` — clusters at 0, 4, 8, 12 (multiples of 4). **EGA-vs-CGA comparison** (see below) shows this halves between EGA and CGA versions, so it encodes sprite *width*.
- `BYTE flags2` — small values 1..14. Same value in both EGA and CGA, so it likely encodes sprite *height*.

### EGA ↔ CGA comparison

`mazedata.cga` (52,451 bytes) is exactly half the size of `mazedata.ega` (102,303 bytes) modulo the descriptor-table difference. The first 9 bytes are identical (file header), then they diverge at byte 9 in the record-1 descriptor:

```
EGA: 57 30 01 08 08 33 96 01 ...   (flags1 = 0x08)
CGA: 57 98 00 04 08 33 cb 00 ...   (flags1 = 0x04, value = 0x0098 vs 0x0130)
```

- `flags2` matches (`0x08`) → height is the same in both versions.
- `flags1` halves from 8 to 4 → width scales with bit-depth (EGA 4bpp uses 2× the bytes of CGA 2bpp).
- `value` shrinks proportionally (`0x130 → 0x98`) → confirms `value` is a byte offset into the graphics blob, and the graphics blob is roughly half the size in CGA.

So **`value` is a byte offset into the file's graphics region**, and the EGA file has graphics encoded at roughly twice the byte-cost of the CGA file. Each entry in table 1 describes ONE sprite of dimensions inferred from flags1 + flags2, with its graphic bytes at offset `value` into the post-header data region.

The descriptor structure now reads as:

```
struct SpriteDescriptor {
    uint8  type_id;         // sprite category / kind
    uint16 graphic_offset;  // byte offset into the file's graphics region
    uint8  width_class;     // related to width — exact units TBD
    uint8  height_class;    // related to height — exact units TBD
};
```

### What this overlay does with it (from `wmaze.ovr` decompilation)

`wmaze.ovr` (the dungeon-rendering overlay) accesses the loaded mazedata buffer via a pointer at DGROUP:0x4faa with several known field offsets:

| Buffer offset | Purpose (inferred from code) |
|---|---|
| `+0x4fa` (= 1274) | Bit-packed coordinate table (5-bit-stride entries × 3-bit reads). Probably X-coordinates of objects per dungeon room. |
| `+0x512` (= 1298) | Sister table to `+0x4fa`. Probably Y-coordinates. |
| `+0x4e08` (= 19976) | Per-maze 8×8 grid (64 bytes per maze). Tile / wall / floor state per cell. |

These offsets are deep inside the file, well past table 1 — confirming that the file has MULTIPLE TABLES beyond the first 153-entry descriptor table.

All bit-level access goes through wroot.exe helper thunks: `func_0xe3c1` (read 3-bit field at bit offset), `func_0xe34b` (read another bit field, signature unclear), `func_0xe376` (write bit field), `func_0xe31d` (write companion).

### What the file ALMOST CERTAINLY contains

1. **Per-dungeon grids** (8×8 cells × N dungeons). Each cell encodes wall directions / floor type / contents.
2. **Object position tables** (bit-packed X/Y coordinates per dungeon room).
3. **Sprite/tile graphics** for the dungeon view — likely the variable-size perspective wall slices we see scattered through the file's post-header data, accessed via the 153-entry descriptor table.
4. **Possibly more**: NPC dialog triggers, item placements, message indices.

### What we didn't crack

- The actual table 2 (after the 153×5 descriptors at byte 773). Unknown record size or count, though `0x16e = 366` from the file header is a strong candidate.
- The sprite/tile graphic encoding. Likely variable-size 4bpp planar slices addressed by the table-1 descriptor's `value` field, but we didn't verify by rendering.
- The exact layout of the per-maze grid at offset 0x4e08.
- How the 5-bit-stride bit-packed coordinate tables actually layout into game logic.

## To pick this back up

The biggest unknown is whether to crack the **graphics** portion or the **dungeon definition** portion first. Both are valuable:

- **Graphics first**: identify the sprite-decode routine in wmaze.ovr that walks table 1 and reads variable-size slices. Visual reward; gets dungeon-view rendering started.
- **Definitions first**: trace the bit-stream helper `func_0xe3c1` in wroot.exe to understand the bit-packing scheme, then reverse-engineer the dungeon grid format. Reveals the game world structure.

Either path needs a significant Ghidra session (probably 1-2 hours).

## Working assumption for future passes

The file is structured roughly as:

```
0..7        File header (4 WORDs)
8..772      Table 1: 153 × 5-byte sprite/tile descriptors
773..?      Table 2: probably 366 entries (size unknown)
?..0x4FA    Padding or other tables
0x4FA..     Bit-packed object coordinate tables
0x4E08..    Per-maze 8×8 grids (64 B each)
            ... and ...
?..end      Sprite/tile graphic blobs (variable size, addressed by table 1)
```

The boundaries between sections are unverified.
