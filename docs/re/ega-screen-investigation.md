# 32 KB EGA "Screen" Files — Investigation Memo

**Status (2026-05-20):** **FORMAT CRACKED.** Standard EGA 4bpp plane-sequential
B,G,R,I layout. 32000-byte 320×200 image + 256-byte custom palette/LUT trailer
(at file offset 0x7D00) + 512 bytes zero padding. The earlier "ghosting" was
a palette interpretation problem, not a layout problem.

See "Update 2026-05-20 part 2: format cracked" section at the bottom for the
working decoder. The remainder of this memo is preserved chronologically for
context on the investigation path.

## Files involved

| File                    | Size        | Likely content                                                              |
| ----------------------- | ----------- | --------------------------------------------------------------------------- |
| `original/titlepag.ega` | 32768 bytes | Title screen ("BANE OF THE COSMIC FORGE")                                   |
| `original/graveyrd.ega` | 32768 bytes | Graveyard cinematic scene                                                   |
| `original/dragonsc.ega` | 32768 bytes | In-game header strip (Wizardry logo + dragon + status icons across the top) |

Companion `.cga` (16384 bytes, 2bpp) and `.t16` (32768 bytes, Tandy) variants exist for each. String table in `winit.ovr` at file offset 0x138F enumerates all three filenames × three modes:

```
0x138F: TITLEPAG.EGA  0x139C: TITLEPAG.CGA  0x13A9: TITLEPAG.CGA  0x13B6: TITLEPAG.T16
0x13C3: GRAVEYRD.EGA  0x13D0: GRAVEYRD.CGA  0x13DD: GRAVEYRD.CGA  0x13EA: GRAVEYRD.T16
0x13F7: DRAGONSC.EGA  0x1404: DRAGONSC.CGA  0x1411: DRAGONSC.CGA  0x141E: DRAGONSC.T16
```

(Note: each CGA filename appears twice — likely indexed by two different CGA modes such as 4-color vs monochrome.)

## What we tried and what failed

All decode attempts assumed the data is a single 320×200 4bpp planar EGA image (32000 bytes) with various preamble/header arrangements totaling 768 bytes of "extra" content (32768 − 32000 = 768).

| Hypothesis                                          | Result                                                                                                                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plane-sequential, no prefix                         | "BANE" text on the **left**, heavy speckling; appears as ghost-images shifted vertically                                                                                   |
| Plane-sequential, 256-byte prefix                   | "BANE" text on the **right**, clear horizontal/vertical channel ghosting                                                                                                   |
| Per-plane 64-byte header (4 × `[hdr64 + data8000]`) | Cleanest of the bunch — "BANE" + wizard + warriors visible — **but** still has a vertical seam at ~83% of width and a black-and-white "channel split" on the right portion |
| Row-interleaved (4 planes per scanline)             | Highly garbled — rows visibly separated by black bars                                                                                                                      |
| Chunky 4bpp (2 pixels per byte)                     | Tiled-repeating pattern; wrong format                                                                                                                                      |
| Two side-by-side half-images (160×200 each)         | Garbled                                                                                                                                                                    |
| Two top/bottom half-images (320×100 each)           | Each half shows **its own copy of "BANE" text in different colors** — strong hint at layered/composite storage                                                             |

The top/bottom-halves render is the most informative failure: the title text appears in both halves with different palettes. This suggests the storage involves some kind of layered or compositional encoding that's resolved at draw time — not a single flat planar image.

The user confirmed by play that the actual in-game title screen has "BANE OF THE COSMIC FORGE" on the **left** side with art on the right. Our renderings show variously: BANE on the wrong side, or BANE in the right place but with persistent channel ghosting.

## Disassembly leads (started, not finished)

We installed `ndisasm` (NASM) and traced some 8086 16-bit assembly in `wroot.exe`:

- **AdLib music false-positive at 0x1A92.** We initially thought `MOV AX, 0xA000` sites in `wroot.exe` at offsets 0x1999 and 0x19E7 were EGA video memory loads. They are not. The helper they call at 0x1A92 is `OUT 0x388, AL` — the **AdLib FM Synth address-register write**. The "0xA000" value is being passed *as the data* for the AdLib write (selecting AdLib register 0xA0, the channel frequency low byte). This subroutine is the audio setup, not video.

- **No `MOV AX, 0xA000` sites elsewhere.** Searched all overlays (`winit`, `wpops`, `wmaze`, `wmexe`, `wbase`, `wdopt`) and `wroot.exe` for the pattern `B8 00 A0`. No other matches. The game must be setting up EGA video access via a different mechanism — possibly through a stored constant, segment register manipulation we missed, or BIOS INT 10h calls.

- **No `OUT 0x3CE/0x3CF` sites either.** Searched all binaries for `BA CE 03` (MOV DX, 0x3CE, the EGA Graphics Controller index port) and got zero hits. So the game isn't programming the EGA GC registers directly — either using BIOS, using a memory-mapped abstraction we didn't recognize, or doing per-pixel writes via INT 10h AH=0x0C.

- **INT 10h sites in wroot.exe (9 of them):** 0x1E77, 0x1E84, 0x1F58, 0x1FEC, 0x1FF4, 0x2092, 0x209E, 0x20FB, 0x2108. Of these, **0x209B** and **0x2105** are confirmed as `AX=1002h` palette-block writes (the work product of Stage 1d). The others have not been disassembled — they might include video mode set, set/get cursor, write pixel, etc.

- **50 INT 21h sites in wroot.exe** (DOS API). Several have the pattern `B4 3F CD 21` (DOS read-file, AH=0x3F). Reading from one of these into a video segment would be the smoking gun for the screen-drawing routine.

## Hypotheses for a future Ghidra session

In rough order of plausibility:

1. **The format is RLE-compressed at the file level.** `dragonsc.ega` has only ~26 KB of "active" data (non-zero bytes before the trailing zeros), whereas `titlepag.ega` and `graveyrd.ega` have ~32 KB. If all three held the same "raw planar 320×200 4bpp" format, all three would have the same active size. The variation strongly suggests a compressed payload whose expanded form is the full image. Custom byte-level RLE, marker-byte runs, or even LZW-style would all explain this.

2. **The 768 leftover bytes encode auxiliary data needed at draw time.** Maybe a CHR or mask table, run-length headers, or pre-computed per-plane offsets/dimensions. Their precise structure would only fall out of looking at the draw routine.

3. **The format is a custom layered/composited encoding.** The top/bottom-halves render suggested two "passes" of the same content. Maybe the engine renders a base layer first and overlays sprites/text on top.

4. **The 4 "planes" map to something other than B/G/R/I.** Less likely given our success with the same primitive in `wfont1-4` and `wport1-3`.

## Concrete next steps

A future session with proper RE tooling (Ghidra, IDA Free, or radare2 with full setup) should:

1. **Load `wroot.exe` into Ghidra.** Identify the MZ header (header size = 0x20 paragraphs = 0x200 bytes; code starts at file offset 0x200).
2. **Trace from a DOS `read-file` site (`B4 3F CD 21`) backwards** to find where the destination buffer is loaded into ES:BX. That tells you where the file content ends up in memory.
3. **From the buffer location, find the consumer code.** That's the decoder/draw routine. It likely loops over bytes and writes to EGA video memory (or calls a helper that does).
4. **If the consumer code reads bytes sequentially and updates dest+source pointers**, that's RLE / decompression. Look for repeat-count handling, escape bytes, and byte-emit logic.
5. **Document the format here**, then write a real Stage 1f plan against the now-understood spec.

Likely the answer lives in `winit.ovr` (which holds the string table for these files) once it's loaded as an overlay, or in a routine in `wroot.exe` that the overlay calls into.

## What's preserved in the repo

- This memo (`docs/re/ega-screen-investigation.md`).
- All Stage 1d palette infrastructure works correctly and is unaffected.
- All Stage 1c font and Stage 1e portrait code works correctly and is unaffected.
- No Stage 1f code is committed (it was reverted at commit `555598b`, end of Stage 1e).

**End-of-investigation tests:** 31 (data) + 21 (parser) + 35 (viewer) = **87 passing**.

---

## Update 2026-05-20: Ghidra-driven RE session

Installed Ghidra 12.1, DOSBox-X, and Capstone. Imported both `wroot.exe` (MZ
loader, x86 16-bit real mode) and `winit.ovr` (raw binary loader, base 0x0000)
into separate Ghidra projects. Decompiled key functions via PyGhidra 3.1.0.
Full decompiler output preserved at `/tmp/wroot-loaders.c` and
`/tmp/winit-decompiled.c` during the session (regeneratable).

### File loaders in wroot.exe (identified by error messages)

Each loader writes its target buffer segment into a CS-relative slot:

| Function   | CS offset | Purpose                       | Distinguishing trait                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | --------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FUN_21bb` | 0x21bb    | font/portrait loader          | error: "I/O error reading font."; reads 0x400 / 0x800 / 0x1000 bytes into one of 5 buffers (cs:[0x1b64/68/6c/70/74]) based on `asset_type` (0..4) and the EGA/CGA/Tandy mode flags at cs:[0x1b4e/0x1b50]                                                                                                                                                                                                                                                                         |
| `FUN_2985` | 0x2985    | misc-table loader             | error: "I/O error loading Misc. table."; reads exactly 0x400 bytes into cs:[0x1b80]                                                                                                                                                                                                                                                                                                                                                                                              |
| `FUN_33e9` | 0x33e9    | **Huffman-tree decompressor** | reads 2-byte header; if 0 → uncompressed (`alloc(file_size-2); read into buffer`); if non-zero → that value is tree-size, deserializes binary tree at ds:0..tree_size, then bit-stream-decodes into a DOS-allocated buffer of size `*(word*)(stream+0)`. Tree node: 4 bytes `{left, right}`; high bit (0x8000) of pointer → internal-node link (negate, then ×4 for byte offset); cleared → leaf value (low byte is output byte). Bit stream buffered in 4KB chunks at ds:0x400. |
| `FUN_3817` | 0x3817    | generic `read()` wrapper      | low-level: `read(handle, dx, cx)`, error stored at cs:[0x660]                                                                                                                                                                                                                                                                                                                                                                                                                    |

### winit.ovr structure

- Total size 0x1435 bytes
- Header: 12 bytes (offsets 0x00..0x0B) — unknown fields, possibly `{magic, code_size, data_size, header_size, reserved}`
- Dispatch: at offset 0x0C, decodes function index in AX and calls one of:
  - AX=0 → FUN_0525 (preliminary setup; reads 0x19e bytes from a 414-byte file)
  - AX=1 → **FUN_09f3 (title-screen dispatcher)**
  - AX=2 → FUN_0f43
  - AX=8 → FUN_0df6 (cleanup)
- String table at file offset 0x1236..0x142A (filenames for all assets loaded via this overlay)
- **Relocation delta = 0x3DB7**: file-offset string → runtime DGROUP address. Confirmed by: 0x5146 (TITLEPAG.EGA used by FUN_09f3) − 0x138F (file offset of TITLEPAG.EGA) = 0x3DB7. 0x5153 → 0x139C (TITLEPAG.CGA), 0x516D → 0x13B6 (TITLEPAG.T16), etc.

### Title screen entry point

```c
// FUN_09f3 (winit.ovr export #1) — title screen dispatcher
void title_screen(void) {
    open_setup_file();          // SCENARIO.HDR or similar (filename at DGROUP:0x513a)
    // ...
    if      (*0x4fc6 & 1) FUN_08f7(0x5146);  // EGA mode → TITLEPAG.EGA
    else if (*0x4fc6 & 2) FUN_08f7(0x5153);  // CGA-1   → TITLEPAG.CGA
    else if (*0x4fc6 & 4) FUN_08f7(0x5160);  // CGA-2   → TITLEPAG.CGA (mono)
    else if (*0x4fc6 & 8) FUN_08f7(0x516D);  // Tandy16 → TITLEPAG.T16
    // ... (followed by font drawing, scrolling credits, GRAVEYRD load, etc)
}

void FUN_08f7(char *filename) {
    func_0xbbb6(0, 0, 0x28, 0x19, 1, 0xffff, 2, 0);   // video setup (40 cols × 25 rows)
    handle = func_0xf924(filename);                    // _open()
    if (handle == -1) abort();
    func_0xf130();   // THUNK 0xf130: presumably load-screen / draw-screen
    func_0xf118();   // THUNK 0xf118: another video op
    func_0xfda5();   // close
    func_0xf13c();
}
```

The thunks at `func_0x0000f000+` are runtime-generated by the MS-C overlay
manager — they don't exist in the static `winit.ovr`. Each thunk jumps to a
fixed function in `wroot.exe`. To resolve them, we'd need to find the overlay
thunk table in wroot.exe (or run in DOSBox-X with a breakpoint).

### Confirmed titlepag.ega file structure

| Range          | Size | Density      | Content                                                                                                                                       |
| -------------- | ---- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 0x0000..0x1F40 | 8000 | 72%          | Bitmap chunk 0 — when rendered as 1bpp, **clearly shows full title** "BANE OF THE COSMIC FORGE" on left, wizards on right, dungeon background |
| 0x1F40..0x3E80 | 8000 | 14%          | Bitmap chunk 1 — sparse, shows wizard figures centered-right                                                                                  |
| 0x3E80..0x5DC0 | 8000 | 21%          | Bitmap chunk 2 — sparse, shows wizard figures centered-left                                                                                   |
| 0x5DC0..0x7D00 | 8000 | 83%          | Bitmap chunk 3 — dense, shows scene with text appearing on RIGHT (mirrored layout)                                                            |
| 0x7D00..0x7E00 | 256  | high-entropy | Non-palette data (131 unique byte values, no repetition)                                                                                      |
| 0x7E00..0x8000 | 512  | zeros        | Padding                                                                                                                                       |

### Working hypothesis for the chunk layout

The 4 chunks are **NOT** the 4 EGA bitplanes of a single 16-color image. Standard
B-G-R-I plane-sequential decode (and all 24 plane permutations) produce
recognizable but ghosted images. The chunks contain **different bitmap content**
that don't simply XOR together.

**Strongest current hypothesis: the chunks are 4 frames of the slide-in
animation**, each a 1bpp monochrome bitmap. The animation:

- Plane 3 (heaviest, 83%): frame 0 — image at starting position (text-right)
- Plane 2: frame 1
- Plane 1: frame 2 (sparsest, 14%)
- Plane 0 (clearest scene): frame 3 — final position (text-left, wizards-right)

The final still-frame visible to the user is plane 0 rendered as 1bpp through
an EGA palette register mapping where the foreground color is set to a specific
color index (probably yellow/light-yellow for the title text).

The 256-byte trailer would then be the **slide-animation script** — frame
timing, X-offsets, palette transitions. (High entropy fits a tightly-packed
script with mixed offset/timing/control bytes.)

**Test for this hypothesis (future session):** look at the visible image when
rendered as 1bpp from plane 0 ONLY, with foreground color = yellow (palette
index 14 from wiz6-main). If that matches the reference screenshot, the
hypothesis is confirmed.

### Concrete next steps

1. **Resolve the overlay thunk table.** Find the MS-C overlay manager table in
   `wroot.exe` that maps winit.ovr thunk offsets (0xf118, 0xf130, 0xf13c, etc)
   to wroot.exe function entry points. Then decompile those functions to see
   the actual screen-decoder.
2. **DOSBox-X live trace.** Run Wizardry VI in DOSBox-X with the debugger,
   set breakpoints on EGA video-memory writes (segment 0xA000), capture the
   sequence of register writes during the title-screen slide animation.
3. **Test the slide-animation hypothesis.** Render plane 0 alone with a Wiz6
   yellow foreground, compare to reference image.
4. **Asset-record table.** FUN_038a uses an asset record at DGROUP:0x33ec
   (record size 0xc bytes) indexed by asset class 9. Decode that table to
   understand the asset-management system.

### Tools installed / configured

- Ghidra 12.1 via `brew install ghidra`. Launches GUI via `ghidraRun` or
  headless via `/opt/homebrew/Cellar/ghidra/12.1/libexec/support/analyzeHeadless`.
- DOSBox-X via Homebrew (for live execution / debugging).
- Capstone 5.0.7 via `pip3 install --user --break-system-packages capstone`.
- PyGhidra 3.1.0 via `pip3 install --user --break-system-packages pyghidra`.
- Ghidra projects in use this session:
  - `/tmp/ghidra-wiz6/wiz6.rep` — wroot.exe (with auto-created functions at
    every DOS read site)
  - `/tmp/ghidra-winit/winit.rep` — winit.ovr (raw binary, with functions at
    all 4 dispatch entry points and their direct callees)

---

## Update 2026-05-20 part 2: FORMAT CRACKED

### The format

Each of `titlepag.ega`, `graveyrd.ega`, `dragonsc.ega` is a 32 KB file:

| Offset | Size | Content                                                |
| ------ | ---- | ------------------------------------------------------ |
| 0x0000 | 8000 | EGA plane 0 (B) — 320×200, 40 bytes/row × 200 rows     |
| 0x1F40 | 8000 | EGA plane 1 (G)                                        |
| 0x3E80 | 8000 | EGA plane 2 (R)                                        |
| 0x5DC0 | 8000 | EGA plane 3 (I)                                        |
| 0x7D00 | 256  | per-screen palette / palette LUT (see "Trailer" below) |
| 0x7E00 | 512  | zero padding                                           |

Standard EGA plane order. To decode:

```c
for byte_idx in 0..8000:
    b0 = plane0[byte_idx];  b1 = plane1[byte_idx];
    b2 = plane2[byte_idx];  b3 = plane3[byte_idx];
    row     = byte_idx / 40;
    col_byte = byte_idx % 40;
    for bit in 0..8:
        mask = 0x80 >> bit;
        color =   (b0 & mask ? 1 : 0)
                | (b1 & mask ? 2 : 0)
                | (b2 & mask ? 4 : 0)
                | (b3 & mask ? 8 : 0);
        pixel[row * 320 + col_byte * 8 + bit] = color;
```

### Why all earlier decodes "looked wrong"

The data was right; the **palette was wrong**. Wizardry VI authors the title
screen with this color usage:

- color 0 (no planes set, 32% of pixels): solid black background
- color 1 (plane 0 only, 17%): **yellow** — the title text "BANE OF THE COSMIC
  FORGE" plus brightest accents
- color 8 (plane 3 only, 27%): **brown/stone** — the dungeon wall texture
  (this plane is the *densest* at 83% non-zero because the textured background
  fills most of the screen)
- color 9 (planes 0+3, 13%): **tan/lit-stone** — highlighted background
- colors 2/4/12 (plane 1 / 2 / 2+3, ~2.5% each): sprite accent colors

The default EGA palette puts color 1 = blue (sparse blue everywhere — wrong),
color 8 = dark gray, and color 9 = light blue — so the title text came out
blue, the background came out gray. Our Stage 1d `wiz6-main` palette has
similar choices, just slightly different. **The title screen needs its own
palette**, runtime-loaded from the 256-byte trailer or from a wroot.exe constant.

### Trailer (256 bytes at 0x7D00)

High entropy (131 unique byte values out of 256). Not a simple 16-entry × 16-byte
palette. Most likely interpretations:

1. **Per-screen palette as packed EGA register data** — 16 colors × encoded
   register bytes + animation/timing info. The wroot.exe palette-setup helper
   we identified in Stage 1d (`INT 10h AX=1002h`) loads a 17-byte block (16
   palette registers + overscan). 16 × 16 = 256 bytes could be a *16-frame
   animation* of palette states (think of color-cycling for the slide-in).
2. **Slide-animation script** — opcodes for the slide-in animation
   (X-offset per frame, palette transitions, frame delays).
3. **Custom Look-Up Table** — maps the 16 file-encoded color indices to
   actual EGA palette register values (so the engine can do bespoke remapping
   per-screen).

Resolving which one requires either DOSBox-X live tracing of the slide-in or
finding the wroot.exe function that the winit.ovr title-screen routine
(FUN_09f3 → FUN_08f7 → thunk 0xf130 or 0xf118) calls into.

### Reference image

`/tmp/titlepag-custom.png` — decoded with a hand-crafted palette where color 1
= yellow and color 8 = brown. Clearly shows "BANE OF THE COSMIC FORGE" in
yellow on the left, dungeon stone-wall background, wizard figures with sword,
staff, and other regalia on the right. Matches the actual game's title page.

### Status

- ✅ titlepag.ega format identified — standard EGA 4bpp planar, 32000-byte
  payload + 256-byte trailer + 512-byte padding
- ⏳ Trailer interpretation pending — needs DOSBox-X trace or overlay-thunk
  resolution to confirm
- ⏳ graveyrd.ega and dragonsc.ega not yet visually verified, but expected to
  share the format
- ⏳ Stage 1f formal implementation plan still needs to be written (current
  memo is investigative, not implementation-grade)
