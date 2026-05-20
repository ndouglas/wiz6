# 32 KB EGA "Screen" Files — Investigation Memo (Stage 1f, INCOMPLETE)

**Status:** **Format not yet cracked.** Stage 1f was attempted and reverted. This memo captures what we learned so a future Ghidra-driven session can pick up where we stopped.

## Files involved

| File | Size | Likely content |
| ---- | ---- | -------------- |
| `original/titlepag.ega` | 32768 bytes | Title screen ("BANE OF THE COSMIC FORGE") |
| `original/graveyrd.ega` | 32768 bytes | Graveyard cinematic scene |
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

| Hypothesis | Result |
|---|---|
| Plane-sequential, no prefix | "BANE" text on the **left**, heavy speckling; appears as ghost-images shifted vertically |
| Plane-sequential, 256-byte prefix | "BANE" text on the **right**, clear horizontal/vertical channel ghosting |
| Per-plane 64-byte header (4 × `[hdr64 + data8000]`) | Cleanest of the bunch — "BANE" + wizard + warriors visible — **but** still has a vertical seam at ~83% of width and a black-and-white "channel split" on the right portion |
| Row-interleaved (4 planes per scanline) | Highly garbled — rows visibly separated by black bars |
| Chunky 4bpp (2 pixels per byte) | Tiled-repeating pattern; wrong format |
| Two side-by-side half-images (160×200 each) | Garbled |
| Two top/bottom half-images (320×100 each) | Each half shows **its own copy of "BANE" text in different colors** — strong hint at layered/composite storage |

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
