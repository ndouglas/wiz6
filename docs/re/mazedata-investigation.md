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

`wmaze.ovr` (the dungeon-rendering overlay) accesses TWO loaded buffers via pointers at DGROUP:0x4faa and DGROUP:0x4fa8. These are probably the mazedata buffer and a companion buffer (possibly the per-dungeon NPC/encounter data — not yet identified). Known field offsets:

**From buffer at `*0x4faa` (mazedata):**

| Buffer offset | Purpose (inferred from code) |
|---|---|
| `+0x1e0` (= 480) | Byte array — `X coord` lookup for "things" (FUN_35b7) |
| `+0x1ec` (= 492) | Byte array — `Y coord` lookup for "things" |
| `+0x4fa` (= 1274) | Bit-packed coordinate table (5-bit-stride entries × 3-bit reads). Probably room/object X. |
| `+0x512` (= 1298) | Sister table to `+0x4fa` — Y. |
| `+0x4e08` (= 19976) | Per-maze 8×8 grid (64 bytes per maze). Walked by FUN_01d1 (set-tile-state). |

**From buffer at `*0x4fa8` (companion data):**

| Buffer offset | Purpose |
|---|---|
| `+0x360` (= 864) | Byte array, 144 entries (X coords?) |
| `+0x3f0` (= 1008) | Byte array, 144 entries (Y coords?) |
| `+0x480` (= 1152) | Byte array, 144 entries (unknown) |
| `+0x510` (= 1296) | Byte array, 144 entries (`type_id` — used for filtering in FUN_366e) |
| `+0x5a0` (= 1440) | Byte array, 144 entries (status byte?) |

This **parallel-array layout** (each "record" is one byte at the same index across multiple arrays) is a common DOS-era idiom. The 144-entry × 5-byte structure likely tracks game-world objects (NPCs, encounters, treasures, etc.).

### Key engine functions found (in wmaze.ovr, decompiled at /tmp/wmaze-decompiled.c)

- **FUN_01d1**: `set_thing(maze_id, x, y, value)` — toggles a bit in the per-maze 8×8 grid and updates the coordinate tables at 0x4fa/0x512.
- **FUN_357a / FUN_35b7**: query "what thing is at (x, y)?" — returns a thing-index 0..0xb (12 thing types max per cell).
- **FUN_366e**: lookup an NPC/encounter by (x, y, type) in the parallel arrays of `*0x4fa8`. Bounded to 144 entries.
- **FUN_36dd, FUN_3742**: directional movement helpers that call FUN_35b7 with offsets.

All bit-level access goes through wroot.exe helper thunks: `func_0xe3c1` (read 3-bit field), `func_0xe376` (write 3-bit field), `func_0xe34b` (read 4-bit?), `func_0xe31d` (write companion).

### What we have NOT yet found

- **The actual sprite-drawing routine.** Despite finding many wmaze functions that READ the mazedata, none of them obviously DRAW pixels. Drawing is probably in another overlay or in wroot.exe via thunks not yet identified.
- **Where the sprite-graphics region starts.** Probably after the second descriptor table (366 entries — count from the file header). The graphic_offset values in table 1 are byte offsets into that region.

### Overlay-thunk resolution: runtime-only

Attempted to resolve the `func_0x0000XXXX` helper-thunk addresses by disassembling wroot.exe at those CS offsets — they contain **all zeros** (BSS / uninitialized memory). This confirms that the thunks are **installed at runtime** by the MS-C overlay manager when wmaze.ovr loads. The actual helper functions live elsewhere in wroot.exe at addresses we can't determine statically.

To get the helper addresses requires one of:
- DOSBox-X integrated debugger session: set a breakpoint on a `call near 0xe3c1` in wmaze.ovr code, step into it, observe where it jumps. The destination IS the real helper function in wroot.exe.
- Find the overlay manager's INSTALLATION CODE in wroot.exe — it walks a table of `(thunk_offset, helper_address)` pairs at overlay-load time and patches the overlay's code segment.

Either path is a substantial additional investigation. Until one of them is done, we can identify what mazedata's structure IS but cannot decode the bit-packed and graphic-encoded portions without re-implementing the bit-stream helpers blind.

### Recommended next pickup

When picking this up: open mazedata.ega in `wmaze` running in DOSBox-X with the debugger, set bp on the first sprite-draw call site, step through to capture the wall-slice format directly. That'll be ~30 minutes of guided debugging and produces a verified format spec. With the format known, the renderer is straightforward.

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
