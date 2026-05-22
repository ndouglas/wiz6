# `mon00.pic` – `mon58.pic`, `credits.pic` — Monster Sprite / Full-Screen RLE Format

**Status: PARTIALLY DECODED — investigation notes.** The outer envelope (RLE
opcodes + record framing) is clearly identified and reproducible across all 60
known files. The interpretation of the **pixel payload bytes** (4bpp planar?
1bpp masked? interleaved with a mask plane?) and the **screen geometry** (true
sprite width/height vs. the recurring "24" constant) are not yet locked down.
This document is enough to plan a parser implementation, but a follow-up
visualization / DOSBox-X cross-check is needed before writing decoder code.

## File inventory

59 monster sprite files plus one full-screen image:

| File path             | Count | Size range       |
| --------------------- | ----- | ---------------- |
| `original/mon00.pic`  | 1     | 1 166 B          |
| `original/mon01.pic` … `mon58.pic` | 58 | 2 060 B (`mon06`) → 26 099 B (`mon50`) |
| `original/credits.pic` | 1    | 20 906 B         |

No size is a multiple of any obvious page size (no 4 KB / 8 KB / 32 KB
boundaries), so the format is **fully byte-packed RLE** with no fixed-size
header or footer. All files end on byte `0x00`.

Median monster file size ≈ 11 KB. Tiny outlier: `mon00.pic` (1 166 B) — most of
that file is composed of short header-only records (see below). Large outliers
(`mon13`, `mon32`, `mon50`, `mon54`) sit in the 22–26 KB range; these are
probably the full-screen-style cinematic monsters (e.g. dragons, bosses).

## Mapping: `combatSpriteId` → `monNN.pic`

**Not yet pinned down.** Empirically:

- The `scenario.dbs` monster table holds three sprite-related fields per
  monster: `combatSpriteId` (stat byte 98), `combatSpriteAlt` (byte 99), and
  `secondarySpriteId` (byte 100). See `packages/parser/src/formats/scenario-db.ts`
  line 365–367.
- Across 186 active monster records:
  - **62 distinct `combatSpriteId` values**, range 0..152, **not contiguous**:
    `0, 28, 32, 33, 35, 36, 37, 51, 60, 63, 67-69, 73, 75-78, 90, 91, 93, 98,
    112, 113, 115-152`.
  - **80 distinct `secondarySpriteId` values**, range 0..180, also sparse.
- On disk there are only **59 files numbered `mon00.pic` … `mon58.pic`**.

Conclusions:

1. `combatSpriteId` is **not a direct file index** — values like 98, 112-152
   exceed 58 and there is no `mon98.pic`.
2. The mapping is likely an **indirection table** baked into `wroot.exe` (or
   `winit.ovr`), similar to how `combatTraitId` indexes into a parallel table.
   The table probably has ~150 entries returning a `monNN.pic` filename (or
   inline filename byte) plus a palette/animation modifier.
3. Many monsters share `combatSpriteId = 0` (visual placeholder?). For
   instance: `BAT`, `ACID SLIME`, `ARIEL SERVANT`, `BLACK BAT`, `BLUE TAIL
   FLY`, `CHARRON`, `CHIMERA`, `BERBALANG` all have `combatSpriteId == 0`. Yet
   they clearly have distinct portraits in-game — so the actual lookup
   probably consults `secondarySpriteId` (or another byte) when
   `combatSpriteId == 0`. The `wfont*.ega` glyphs (alphabetical class icons)
   are a comparable many-to-one mapping handled via lookup tables.

**Action for follow-up:** trace a single monster (e.g. `AMAZULU`,
`combatSpriteId=118`, `secondarySpriteId=36`) into `wroot.exe` via DOSBox-X's
debugger to find the `combatSpriteId → filename` lookup. Likely sits near the
combat draw routine reached from `winit.ovr` overlay thunks. Until then, the
viewer can render each `monNN.pic` directly and we annotate it manually.

## Format hypothesis: row-record RLE

Every byte of every `.pic` file fits into the following decoder loop, which
consumes the file end-to-end:

```text
while pos < len:
    op = bytes[pos++]
    if op == 0x00:                # END (record / row terminator)
        end_of_record
    elif op < 0x80:               # LIT(op): copy `op` raw bytes
        emit bytes[pos .. pos+op-1]
        pos += op
    else:                         # SKIP(256 - op): emit `n` transparent slots
        emit n transparent
```

(`0x80` itself doesn't appear in any examined file. Treating it as
`SKIP(0)` / no-op is safest until proven otherwise.)

This decoder cleanly tokenises every byte of `mon00..mon58.pic` and
`credits.pic` with **no leftover bytes** and **no overruns past the final
0x00** — strong evidence the opcode set above is correct.

### "Rows" decode to a small set of widths

If we count the total emitted slot count between consecutive `END`s as a "row
width", the dominant decoded widths in typical monster files are:

| File          | Top decoded row widths (in slots)                |
| ------------- | ------------------------------------------------ |
| `mon00.pic`   | 24 ×16, 16 ×8, 6 ×5, 32 ×2, then chaos           |
| `mon01.pic`   | 24 ×24, plus long-tail of mixed widths           |
| `mon02.pic`   | 24 ×15, 32 ×6, 25/31 ×4, ...                     |
| `mon05.pic`   | 24 ×23, then 48, 1872, 483, 2716, 8 (one each)   |
| `mon13.pic`   | 8 ×30, 24 ×17, 9 ×15, 16 ×8, 17 ×6, 26 ×5        |
| `credits.pic` | 16 ×91, 8 ×75, 32 ×73, 9 ×37, 18 ×37, 17 ×27     |

The dominant value `24` is striking. **A 24-slot "row" appears to be a
fundamental packing unit** for monster sprites, possibly representing one
horizontal byte-stripe of the target frame buffer / sprite atlas. Most short
records have widths 8 / 16 / 24 / 32 (multiples of 8 slots). The occasional
"row" of width 1632 or 2716 slots is a record where the LIT/SKIP block does
not finish before reaching the next sprite or the file end — likely
indicating an **inner record boundary I am not yet detecting** rather than a
true geometric row.

### Sub-record header inside the LIT payload

The first LIT block of nearly every "row" begins with the same 4-byte
structure:

```text
[pos_lo] [pos_hi] [W] [H]  followed by (LIT_count - 4) pixel-payload bytes
```

Concrete examples (all from offset 0 of the respective file):

| File       | Op           | pos_lo pos_hi | W H    | Trailing pixel-payload bytes              |
| ---------- | ------------ | ------------- | ------ | ----------------------------------------- |
| `mon00.pic`| `L2 S3 L1`   | `58 02`       | (n/a)  | (no W/H; this is an outlier — see below)  |
| `mon01.pic`| `L6 S18`     | `58 02`       | `03 05`| `ff 7f`                                   |
| `mon02.pic`| `L9 S15`     | `58 02`       | `07 06`| `ff 9f ef e7 e3`                          |
| `mon03.pic`| `L6 S18`     | `58 02`       | `04 03`| `ff 0f`                                   |
| `mon04.pic`| `L5 S19`     | `58 02`       | `03 03`| `bf`                                      |
| `mon05.pic`| `L5 S19`     | `58 02`       | `02 01`| `03`                                      |
| `mon13.pic`| `L21 S3`     | `58 02`       | `0b 0c`| `00 80 03 3f f8 81 1f 7c e0 03 1f f8 c0 07 7f f0 01` |
| `mon32.pic`| `L6 S18`     | `58 02`       | `03 04`| `fb 03`                                   |
| `mon50.pic`| `L31 S5 S1 L24 ...` | `58 02`| `0d 0c`| `f7 ff df ff 7f ff 87 3f c0 01 7c c0 4f fe cf ff f9 3f f8 00` (27 bytes) |

Key observations:

- **`pos = 0x0258` is identical across all 59 files** at the very first record.
  This is a fixed initial VRAM / canvas offset. 0x0258 = 600. At a stride of
  40 bytes/scanline (typical EGA 320-pixel image) this is row 15 col 0. At a
  stride of 80 bytes/scanline (a 640-pixel-wide combat scene buffer) it is
  row 7 col 40.
- **The (W, H) pair correlates with file size** (mon05 W×H=2 → 2.2 KB;
  mon13 W×H=132 → 23 KB; mon50 W×H=156 → 26 KB), supporting their reading as
  sprite/cell dimensions.
- Subsequent "rows" in the same file have monotonically **increasing `pos`
  values** with each row, consistent with successive cells being drawn
  further down (or to the right of) the previous cell.
- `mon50.pic`'s first row contains **three back-to-back sub-records** in one
  decoded slot-line: position 0x0258, then 0x0fd8, then 0x1e58, each with
  their own W/H header inside one literal block. So a single record can hold
  *multiple* glyph placements — not just one.

### Probable shape of the format

```
file := record+
record := lit_op (header pixel_data) (skip_op | lit_op)* end_op
header := pos_word W_byte H_byte
end_op := 0x00
lit_op := 0x01..0x7f    ; followed by N literal bytes
skip_op := 0x81..0xff   ; emits (256 - op) transparent slots
```

i.e. a record is a **scanline of a virtual destination buffer**, into which one
or more small bitmaps are positioned via implicit cursor advancement. Each
sub-bitmap announces its location, dimensions and compressed payload inline.
The whole file is the program needed to paint one composite scene (a battle
sprite, or in `credits.pic`, a full screen).

If this reading is right, then **`mon00.pic` is a control / palette-test file
that has very few real bitmaps**: its first 22 records are tiny "header-only"
records of widths 6 and 24 with no real pixel data, followed by ~1000 bytes of
genuine bitmap. This matches its anomalously small size.

### Worked example — `mon01.pic`, bytes 0..0x40

Raw hex:

```
00000000: 06 58 02 03 05 ff 7f ee 00  06 38 04 03 05 ff 7f ee 00
00000012: 05 18 06 02 03 3f ed 00     05 d8 06 02 03 3f ed 00
0000002A: 05 98 07 01 02 03 ed 00     05 d8 07 01 02 03 ed 00
00000042: 06 18 08 03 05 ff 7f ee 00  ...
```

Decoded record-by-record:

| Off    | Bytes                  | Tokens             | Decoded contents                                                        |
| ------ | ---------------------- | ------------------ | ----------------------------------------------------------------------- |
| 0x0000 | `06 58 02 03 05 ff 7f` `ee 00` | LIT(6) SKIP(18) END | sub-sprite at VRAM offset `0x0258`, W=3, H=5, payload `ff 7f`; then 18 transparent slots ; END |
| 0x0009 | `06 38 04 03 05 ff 7f` `ee 00` | LIT(6) SKIP(18) END | sub-sprite at `0x0438`, W=3, H=5, payload `ff 7f` |
| 0x0012 | `05 18 06 02 03 3f`    `ed 00` | LIT(5) SKIP(19) END | sub-sprite at `0x0618`, W=2, H=3, payload `3f`     |
| 0x001A | `05 d8 06 02 03 3f`    `ed 00` | LIT(5) SKIP(19) END | sub-sprite at `0x06d8`, W=2, H=3, payload `3f`     |
| 0x0022 | `05 98 07 01 02 03`    `ed 00` | LIT(5) SKIP(19) END | sub-sprite at `0x0798`, W=1, H=2, payload `03`     |
| 0x002A | `05 d8 07 01 02 03`    `ed 00` | LIT(5) SKIP(19) END | sub-sprite at `0x07d8`, W=1, H=2, payload `03`     |
| 0x0032 | `06 18 08 03 05 ff 7f` `ee 00` | LIT(6) SKIP(18) END | sub-sprite at `0x0818`, W=3, H=5, payload `ff 7f`  |

Each record is **9 bytes** (or 8 for the smaller W×H ones), consisting of 1
length byte + 4 inline-header bytes + N payload bytes + 1 skip-opcode + 1
zero-terminator. The skip opcode plus the L-count always add up to **24**
slots — this is the strong constant.

The pixel payload bytes (`ff 7f`, `3f`, `03`) are far fewer than W × H would
suggest if stored raw (W=3 × H=5 = 15 bytes uncompressed). So they are
themselves compressed in some way — likely **(plane-mask + N pixel bytes) per
visible scanline** or **bit-packed 1bpp**. This second-level encoding is the
main open question.

### Why "24" might not be a pixel count

The recurring decoded width of 24 slots could mean several different things:

1. **24 bytes per memory-stripe** in a 192-pixel-wide combat-scene buffer
   (1bpp), with separate plane writes (this would explain why W and H seem
   independent of 24).
2. **24 = the engine's BIOS-call argument list size** when calling a video
   blit routine — i.e. the format is a serialised sequence of
   `(opcode, args, payload)` blit operations and "24" is the canonical
   packed length of one operation.
3. **24 = bytes per row of one plane of a 192-pixel sprite atlas** that all
   monsters render into. The fact that some files (`mon13`, `mon50`,
   `credits`) have a wider mix of decoded widths (8, 16, 32) is consistent
   with bigger atlases being assembled out of differently-sized stripes.

Hypothesis (1) is the one I'd start a parser with, but it absolutely needs
DOSBox-X verification.

## Test against `credits.pic`

`credits.pic` is the only known non-monster file in this set. It's 20 906 B
and decodes (using the rules above) into **609 records totalling 43 378 emitted
slots**. A 320×200 4bpp EGA image is 32 000 bytes / 64 000 pixels — so the
decoded slot count (43 378) is **larger than any plausible 320×200 image** but
smaller than 320×200 × 4 planes (256 000 px-slots if each pixel is split into
4 plane bits). The most natural reading is therefore:

- The slot stream addresses a buffer **broader than a 320-px screen**, OR
- A single decoded slot is **a NIBBLE not a byte**, in which case 43 378
  slots = 21 689 bytes = compatible with 320×200×½ + framing overhead, OR
- The stream emits **plane data interleaved per scanline**, not a continuous
  framebuffer.

The first record of `credits.pic` is `0c 58 02 22 04 ff ff 00 fc ff ff 01 ...`
— `LIT(12) [58 02 22 04 ff ff 00 fc ff ff 01] ...`. The `58 02` is the same
fixed initial position as the monster files; `22 04` (W=0x22=34, H=4) is the
first sub-sprite. So credits.pic is just **another instance of the same
format**, but with no pre-padding header records and with much larger
W values consistent with whole-screen art.

## Open questions / what still needs verifying

1. **Pixel payload encoding.** Is `ff 7f` (in a W=3 H=5 sub-sprite) interpreted
   as 1bpp packed, 4bpp planar with implicit color, 4-bit pixels packed
   little-endian, or something else entirely? Until this is settled, no
   raster output is possible. Possible approaches:
   - Render `mon01.pic` in DOSBox-X with EGA, snapshot the framebuffer, and
     work backwards to bit-mapping.
   - Find the engine's blit routine via `winit.ovr` and disassemble it.
   - Try a "mask + data" interpretation: half the payload bytes are a
     transparency mask and half are color indices.
2. **What "24" really is.** Likely the byte-width of a destination stripe.
   Compare with the known full-screen EGA buffer (40 bytes/row × 200 rows,
   plane-sequential) to see if `pos_word` + `W` + the 24-slot row maps to
   coherent stripes.
3. **The `combatSpriteId → monNN.pic` table.** Almost certainly in
   `wroot.exe` or one of its overlays, alongside the monster-name lookup
   table.
4. **What `0x80` would mean.** Not encountered, but a complete spec needs to
   define it. Reasonable defaults: it's a NOP (SKIP 0) or it triggers a
   second-level opcode read.
5. **Animation frames vs. a single composite.** All monster files have
   **monotonically increasing `pos` values** through the file, which is
   consistent with one big composite drawn top-to-bottom; multiple frames
   would more likely RESET the position partway through. So the working
   guess is **each `monNN.pic` is one static sprite/composite**, not a frame
   stream — but bosses (e.g. `mon13`, `mon50`) deserve a closer look.
6. **`mon00.pic` is anomalous.** Its first 22 records have W=3 or W=5 but the
   payload bytes don't form an obvious image; the bulk of its bytes live in
   a single ~1 000-byte literal blob near the end. May be a calibration /
   sprite-zero / boot-test file rather than a real monster. Worth opening
   in-game to see what it draws (if anything).

## Next steps for the implementer

A future "implement `.pic` decoder" task should plan as follows:

1. **Stage A — outer decoder.** Implement the LIT / SKIP / END opcode reader
   exactly as documented above. Add a CLI that dumps every file as a flat
   record list `(pos, W, H, payload_hex)` for inspection. This is a
   no-knowledge-needed mechanical pass and gives us 95% of the format
   structure for free.
2. **Stage B — payload bit-mapping.** Try the three most likely
   interpretations (4bpp packed; 1bpp + plane index from a separate field;
   4-plane planar interleaved) on `mon05` (very small) and visually compare
   the result with a DOSBox-X screenshot of a "Bushwacker" or similar simple
   monster. Pick the one that matches; document why.
3. **Stage C — composition layout.** Resolve the meaning of `pos_word` and
   the row-of-24-slots constant; produce a single composite raster per file.
4. **Stage D — `combatSpriteId` lookup.** Either disassemble `wroot.exe` to
   find the indirection table, or fall back to "render mon00..mon58 inline
   in the viewer, label by hand". The viewer task in
   `docs/superpowers/plans/2026-05-22-viewer-redesign-stage-2d.md` is
   already aware this is blocked.

For all four stages, the parser shapes to model after are:

- `packages/parser/src/formats/font-4bpp.ts` — fixed-size 4bpp planar.
- `packages/parser/src/formats/portrait.ts` — 9-tile composition layer over
  the 4bpp primitive.
- `packages/parser/src/formats/ega-screen.ts` — 4-plane interleaved screens
  with per-plane shifts. The screen-shift trick documented there might also
  apply here.

## Probes used

The following small scripts were used during this investigation; they are
**not committed** but useful to re-run if revisiting the format:

- `/tmp/pic-probe17.mjs` — outer RLE decoder + row-width histogram.
- `/tmp/pic-probe19.mjs` — fully annotated dump of `mon00.pic` rows.
- `/tmp/pic-probe22.mjs` — leading-record `(W, H, pos)` table across all
  59 files vs file sizes.
- `/tmp/pic-probe23.mjs` — first 8 records of several representative files.

Re-running these with `node /tmp/pic-probeXX.mjs` from the project root
reproduces the findings above byte-for-byte.
