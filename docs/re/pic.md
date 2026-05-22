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

## Decoder follow-up — 18-of-60 files fail "outer envelope" decode

**Status (2026-05-22):** The outer decoder described above (LIT/SKIP/END only,
`op<0x80 ⇒ LIT(op)`, `op>=0x80 ⇒ SKIP(256-op)`, `op==0x00 ⇒ END`) only succeeds
on 42 of 60 files. The original investigation note "every byte decodes
cleanly" was incorrect. The remaining 18 files produce a `truncated LIT at
byte N` error within the last ~1-2% of the file. The format must therefore be
slightly different than what is documented above; this section records what
is now known.

### Failure-offset table

For each failing file, the table lists the file size, the position where the
decoder gives up, the opcode it tried to read there, the previous 8 bytes,
and how many records it had successfully closed before the failure:

| File          | Size   | Fail at | Op    | Records before | From EOF | Prev 8 bytes              |
| ------------- | ------ | ------- | ----- | -------------- | -------- | ------------------------- |
| credits.pic   | 20 906 | 20 837  | 0x60  | 608            | 69       | `70 ff 24 04 04 84 00 20` |
| mon01.pic     |  4 469 |  4 384  | 0x78  | 84             | 85       | `07 ef df ff 98 f9 3a 38` |
| mon02.pic     |  8 973 |  8 870  | 0x6a  | 71             | 103      | `00 01 00 01 00 01 00 00` |
| mon05.pic     |  2 184 |  2 166  | 0x43  | 28             | 18       | `ff 03 07 fc 0f 09 8f ff` |
| mon12.pic     | 10 494 | 10 478  | 0x3f  | 99             | 16       | `ff 02 7f 3f fa ff 02 7f` |
| mon25.pic     | 11 047 | 11 040  | 0x7f  | 87             | 7        | `2f 1f 47 c3 f7 07 ff bf` |
| mon26.pic     | 15 374 | 15 261  | 0x7f  | 198            | 113      | `f9 ff ff 7f 6f 5f bf fd` |
| mon35.pic     | 14 877 | 14 853  | 0x7f  | 181            | 24       | `7f bf 2f 07 0f cf ff ff` |
| mon42.pic     | 11 471 | 11 429  | 0x4d  | 46             | 42       | `40 52 2d 28 20 0d 02 07` |
| mon43.pic     | 14 728 | 14 716  | 0x13  | 88             | 12       | `03 fb ff fd 03 fb ff 03` |
| mon44.pic     |  9 967 |  9 928  | 0x7f  | 183            | 39       | `fa ff 02 7f 7f fa ff 02` |
| mon45.pic     | 19 752 | 19 722  | 0x1f  | 372            | 30       | `06 ff 83 01 ff 3f 3f fd` |
| mon47.pic     | 21 350 | 21 326  | 0x7f  | 239            | 24       | `7d 7f 7f fc ff 01 00 fd` |
| mon48.pic     | 15 679 | 15 561  | 0x7f  | 594            | 118      | `0f 02 1f 1f fb 0f 02 df` |
| mon49.pic     | 11 168 | 11 128  | 0x5e  | 142            | 40       | `1c 23 00 00 f8 ff ff dd` |
| mon51.pic     |  9 841 |  9 811  | 0x1f  | 117            | 30       | `fb bf ff c3 03 1f 5f 1f` |
| mon54.pic     | 22 762 | 22 683  | 0x7f  | 484            | 79       | `fa ff 02 7f bf fc ff 04` |
| mon57.pic     |  6 472 |  6 445  | 0x3f  | 184            | 27       | `e8 f4 fa fd fe ff 7f fc` |

Key observations:

- **Failure is always in the last 0.3–2 % of the file**, never structurally
  in the middle. Distance to EOF ranges 7–118 bytes (median ~30 B).
- **The failing opcode is varied** — 0x13, 0x1f, 0x3f, 0x43, 0x4d, 0x5e,
  0x60, 0x6a, 0x78, 0x7f. It is **not** confined to a 0x60–0x7f sub-range,
  so the hypothesis "0x60–0x7f means something other than LIT" is **not**
  the cause. (Counter-example: `mon43.pic` fails with op `0x13`, well below
  any plausible "special" range.)
- The previous 8 bytes are heterogeneous; no shared sentinel like
  `00 00 ff` or a fixed magic value precedes the failure.
- All files (failing or not) end with byte `0x00` — the END marker.

### Hypotheses tested and ruled out

(Test harness: `/tmp/pic-hyp*.mjs`, `/tmp/pic-stop-at-60-7f.mjs`,
`/tmp/pic-rle-hyp.mjs`, `/tmp/pic-implicit-end.mjs` — none committed.)

| Hypothesis                                                              | Files OK / 60 | Conclusion |
| ----------------------------------------------------------------------- | ------------- | ---------- |
| (baseline) `op<0x80 ⇒ LIT(op)`                                          | 42            | reference  |
| `op<0x60 ⇒ LIT(op)`, `0x60..0x7f` is no-op                              | 51            | partial    |
| `op<0x60 ⇒ LIT(op)`, `0x60..0x7f` ends current record                   | 51            | partial    |
| `op<0x70 ⇒ LIT(op)`, `0x70..0x7f` is LIT(op-runMin+1) of next byte (RLE)| 48            | no         |
| `0x80` as stream-terminator (return cleanly)                            | 60 *          | **false**  |
| `op<0x60 ⇒ LIT(op)`, `0x60..0x7f` as stream-terminator                  | 60 *          | **false**  |
| Implicit record-end at N=24/32/48/64/128 slots                          | 42            | no         |
| `op<0x80 ⇒ LIT(op & 0x3f)` (mask off bit 6)                             | 46            | partial    |
| `op==0x80` is LIT_LONG (next byte is real length)                       | 40            | no         |
| `op<0x40 ⇒ LIT(op)`, `0x40..0x7f` various                               | 49            | no         |

(*) The "0x80 is terminator" and "0x60..0x7f is terminator" hypotheses
both reach 60/60 but only because they stop the decoder very early — often
within the first ~500 bytes of the file. The remaining tail is then ignored.
Inspection shows that tail is real RLE data (more records, ending in the
usual `XX ff 00` sentinel). So those are **false positives**, not a fix.

### What is actually going on (best current guess)

The repeat-structure inside `mon01.pic` is the clearest single clue:

```
pos 4239: SKIP(33) SKIP(73) SKIP(1) SKIP(97) LIT(7) LIT(120)   ← succeeds (4252..4371)
pos 4372: SKIP(33) SKIP(73) SKIP(1) SKIP(97) LIT(7) LIT(120)   ← op 0x78 at 4384 fails: only 85 B left
```

The first 13 bytes at offset 4239 and offset 4372 are **byte-identical**:
`df b7 ff 9f 07 ef df ff 98 f9 3a 38 78`. So the *encoder* clearly emitted
this 13-byte token-prefix twice. But the second time, the file only has
84 bytes of LIT data after it, where the first time it had 120. **The
encoder must therefore have a way to express a shorter copy** than 120 —
i.e., the byte `0x78` is **not** an unconditional "LIT 120" opcode.

Candidate refined hypotheses that this evidence is compatible with, but
which I did not have time to fully validate:

1. **Two-stream layout.** The file is `<draw-stream> <something> <draw-stream-2>`
   (e.g. image + 1bpp mask, or main figure + outline) and the second stream
   uses a different opcode dictionary (or no LIT≥0x60). The failure
   position is where the boundary actually sits, not a random byte. A way
   to test this: locate, in each failing file, a candidate "split byte"
   (e.g. `00 00`, `80 00`, or the EOF-pattern `XX ff 00`) and try decoding
   the prefix and suffix independently with the same RLE engine.
2. **LIT counts are saturated to the remainder of an implicit row /
   record budget.** I.e., LIT(120) means *up to 120 bytes, but stop at the
   row boundary*. The 13-byte op-prefix programs the row, then `0x78`
   means "fill in literally the next ≤120 bytes until row complete". This
   would make the encoder's job easier and explain why a literal repeat
   of the prefix can have two different payload sizes. Predicts there
   should be an implicit "row size" computable from the
   `SKIP+SKIP+SKIP+SKIP` slot count (33+73+1+97 = 204) or the W/H of the
   active sub-sprite header. Worth checking whether `slots_emitted_so_far
   + remaining_LIT_count` exactly hits a fixed multiple.
3. **Some opcode I have not yet identified consumes / produces extra
   bytes.** For instance, the EOF tail of many files contains `80 00` or
   `f9 ff 00` repeated — if `80` is in fact a single-byte "end of section"
   opcode (rather than `SKIP(128)`), the decoder would walk away from
   sections sooner and might never encounter the desynced LIT later.
   Counter-evidence: stopping at the first 0x80 truncates real data, so
   `0x80` is not unconditionally a section marker.

### Recommended next investigation

1. **Compare against DOSBox-X.** Run `mon05.pic` (smallest failing
   file, fail at byte 2166 of 2184 — only 18 bytes leftover) in the game
   and capture the actual rendered sprite. Then attempt each candidate
   decoder above and pick the one whose stream-end aligns with the
   pixel-count of the rendered sprite.
2. **Try hypothesis #2 (LIT-saturation).** Modify the decoder so that the
   LIT count is `min(op, remaining-slots-in-row)` where `row_capacity` is
   tracked from the leading W/H header. If `mon01.pic` decodes cleanly
   under this rule, hypothesis #2 is the answer.
3. **Examine the W6 PC-DOS engine.** The blit routine in `wroot.exe` /
   `winit.ovr` will name and dispatch on each opcode explicitly. A
   ~30-minute trace inside DOSBox-X's debugger at the call site for
   "draw monster" should reveal the opcode table directly.

### Status

**Investigation incomplete.** The format is *mostly* right (42/60 files
decode end-to-end) but the precise meaning of LIT counts in long sequences
near EOF is wrong. No clean single-rule fix has been found by black-box
fuzzing of the opcode table. The next step is either (a) a DOSBox-X
disassembly of the engine's blit routine or (b) implementing hypothesis #2
("LIT count saturated to remaining row capacity") and checking whether it
produces 60/60.

The current `pic.ts` decoder should be considered correct in the broad
strokes but **must throw or report** a `truncatedAtEof` flag for the 18
known-failing files until the format is fully nailed down. Do not silently
swallow the trailing bytes.

## Decoder follow-up — LIT-saturation hypothesis (2026-05-22)

**Status: HYPOTHESIS REFUTED for a single-record-budget rule. The cleanest
60/60 rule found is "LIT may be truncated by EOF."**

The "LIT(op) emits `min(op, remaining_row_capacity)` bytes" hypothesis was
tested against several candidate budget definitions. None of the principled
budgets (`W*H`, `W`, `H`, `W+H`, etc., or a fixed constant) gives a clean
60/60 decode that also keeps record sizes plausible.

### Pass counts by rule

All rules use the documented opcode set (`op==0 ⇒ END`, `op<0x80 ⇒ LIT(op)`,
`op>=0x80 ⇒ SKIP(256-op)`). The variation is how LIT counts are capped.

| Rule                                            | Files OK / 60 | Notes |
| ----------------------------------------------- | ------------- | ----- |
| (baseline) LIT(op) consumes exactly `op` bytes | 42            | reference; the 18 failures are documented above |
| Fixed budget = 24 (LIT+SKIP slots per record)  | 57            | partial; degenerates inside large records |
| Fixed budget = 16                              | 60 *          | **false positive** (see below) |
| Fixed budget = 8                               | 60 *          | **false positive** |
| Fixed budget = 4                               | 60 *          | **false positive** |
| Fixed budget = 17 (LIT+SKIP slots per record)  | 60 *          | **false positive** |
| Fixed budget = 32                              | 56            | partial |
| Fixed budget = 40                              | 58            | partial |
| LIT-only budget = 16                           | 60 *          | **false positive** |
| LIT-only budget = 32                           | 59            | nearly passes but desyncs |
| Budget = W·H (from first LIT's header)         | 41            | worse than baseline |
| Budget = W                                      | 48            | partial |
| Budget = H                                      | 47            | partial |
| Budget = W+H                                    | 43            | partial |
| Budget = W·H·2                                  | 42            | partial |
| LIT-only Budget = W·H                          | 41            | partial |
| LIT-only Budget = W                             | 44            | partial |
| **"LIT may be truncated by EOF" only**         | **60**        | **clean win — exactly the 18 known files have a truncated final LIT** |

### Why the "60/60" small-budget passes are false positives

When BUDGET ≤ 17, the saturation logic forces `consume = 0` for most LIT
operations once the per-record slot count exceeds the budget (e.g., after a
single SKIP). The decoder then walks the file one byte at a time, treating
LIT-payload bytes as opcodes. On `mon01.pic` with BUDGET=24, this produces
absurd record states like `slotsInRecord = 562` and "headers" with values
like `W=255 H=251` — clearly mis-decoded. The decoder reaches EOF only
because it has stopped consuming LIT bytes at all.

This is the same class of false positive as the previously-tested
"`0x80` is terminator" rule that also reached 60/60 by stopping early.

### Smoking-gun verification at `mon01.pic` byte 4384

The repeated 13-byte prefix at offsets 4239 and 4372 is not a record-level
ambiguity; tracing the baseline decoder shows the full record at 4212–EOF
is a single record (no `0x00` END between them):

```
record 84 (starts at 4212): LIT(17) [header W=24 H=28] ...
  ... long chain of SKIPs and LITs ...
  pos=4231 LIT(7)   payload 4232..4238
  pos=4239 SKIP(33) SKIP(73) SKIP(1) SKIP(97)
  pos=4243 LIT(7)   payload 4244..4250
  pos=4251 LIT(120) payload 4252..4371  ← first prefix's "120"
  pos=4372 SKIP(33) SKIP(73) SKIP(1) SKIP(97)
  pos=4376 LIT(7)   payload 4377..4383
  pos=4384 LIT(120) — only 84 bytes left in file. FAIL.
```

slotsInRecord at pos=4384 is 569. Under candidate budgets:

- BUDGET=W·H=672 → remaining=103, saturated LIT consumes 103 → still
  overflows (only 84 bytes left). **Fails.**
- BUDGET=W=24, BUDGET=H=28 → already exceeded long before 4384 (slots=27
  at 4239). **Saturates to 0 from then on; decode becomes nonsense.**
- BUDGET=24 (fixed) → identical to BUDGET=W=24 case. **Fails meaningfully.**

The only saturation rule that lets the file decode cleanly is
"truncate LIT to remaining file bytes." Under that rule, op=0x78 at 4384
consumes 84 bytes (instead of 120) and the decoder reaches EOF after
the final 0x00 at offset 4468. Verified output for `mon01.pic`:

```
$ node /tmp/pic-eof-only.mjs
Rule EOF-allow-truncate: 60/60 OK, of which 18 had truncated LIT
Truncated files: credits.pic mon01.pic mon02.pic mon05.pic mon12.pic
                 mon25.pic mon26.pic mon35.pic mon42.pic mon43.pic
                 mon44.pic mon45.pic mon47.pic mon48.pic mon49.pic
                 mon51.pic mon54.pic mon57.pic
```

The truncated set matches the 18 previously-known failing files exactly.

### Why this is still unsatisfying

Allowing arbitrary EOF truncation is a band-aid: it does not explain
*why* the encoder emits `LIT(120)` when only 84 bytes are available, and
it does not give an independent way to verify the decoder is in sync.

Across the 18 truncated files, the baseline-decoded record state at the
truncation point is wildly varied (slots-in-record ranges from 0 to 2149,
LIT-bytes ranges from 0 to 1094, "headers" frequently nonsensical with
W=255 H=255). This strongly suggests the decoder has **already lost sync
many records before EOF** in most of these files — but the desyncs do not
cause an overflow until the trailing tail because the byte stream is rich
in valid-looking SKIP opcodes that absorb the misalignment.

In other words: the 18-file failure is the *symptom* of an earlier
mis-decode, not the bug itself. Saturating LIT to W·H, W, H, or any fixed
constant does not fix the underlying desync because the desync starts in
records that the baseline decoder already accepts (it just hands back the
wrong pixel data).

### Final pseudocode for the corrected decoder

```text
decode(bytes):
  pos = 0
  records = []
  current = []
  truncatedAtEof = false
  while pos < len(bytes):
    op = bytes[pos]; pos += 1
    if op == 0x00:
      records.append(current); current = []
    elif op < 0x80:
      n = min(op, len(bytes) - pos)        # EOF saturation
      if n < op: truncatedAtEof = true
      current.append(('LIT', bytes[pos:pos+n]))
      pos += n
    else:
      current.append(('SKIP', 256 - op))
  if current: records.append(current)       # tail without END
  return { records, truncatedAtEof }
```

This passes 60/60 with a single boolean flag identifying which files have
a truncated final LIT. It is the conservative choice for Stage A.

### Recommended next step

**Continue Stage A** with the EOF-saturation rule. Mark the 18 truncated
files with a `truncatedAtEof: true` flag in the parsed output. **Do NOT**
attempt a principled per-record budget rule based on the file bytes
alone — black-box fuzzing of opcode/budget combinations has now hit a wall.

The next real progress requires one of:

1. **DOSBox-X disassembly** of the `wroot.exe` blit routine to read the
   opcode dispatcher directly. This is the highest-value follow-up.
2. **Visual comparison** of decoded output (under the EOF-truncate rule)
   against in-game sprites for `mon05` (smallest, only 18 truncation
   bytes). If the rendered image looks right, EOF-truncation may be all
   the rule we need. If it looks broken in the middle of the sprite,
   the desync hypothesis above is the real bug and we need the engine
   disassembly.

### Probes used (all in /tmp/, not committed)

- `/tmp/pic-sat-A.mjs` — fixed-budget sweep
- `/tmp/pic-sat-B.mjs` — LIT-only budget sweep
- `/tmp/pic-sat-WH.mjs` — W/H-based budget rules
- `/tmp/pic-sat-eof.mjs` — EOF saturation only
- `/tmp/pic-eof-only.mjs` — EOF saturation with truncation flag
- `/tmp/pic-eof-context.mjs` — per-failure context dump
- `/tmp/pic-mon01-trace.mjs` — mon01.pic decode trace
- `/tmp/pic-trace2.mjs`, `/tmp/pic-trace3.mjs` — baseline trace + per-record dumps
- `/tmp/pic-find-prefix.mjs` — confirms the 13-byte prefix at offsets 4239 and 4372
- `/tmp/pic-rec21.mjs` — detail of mon01.pic record 21 (96 slots = valid, refutes 24-slot universality)

## Decoder source — disassembled from the graphics drivers (2026-05-22)

**Status: SOLVED — 60/60 files decode cleanly under the corrected opcode set.**
The previous LIT/SKIP interpretation was wrong. The real format is **LIT + RUN**
(not LIT + SKIP), where the high-bit-set opcode is a byte-fill, not a
transparent skip. The 18 "failing" files were failing because the decoder
treated payload-byte `0x00` as an opcode terminator at correct boundaries
that earlier instances simply hadn't landed on — and because multi-segment
files require iterative re-invocation of the decoder.

### Where the decoder lives

The `.pic` decoder is **not in any of the overlays** (`wmele.ovr`, `wbase.ovr`,
`wmnpc.ovr`, `winit.ovr`, etc.) and **not in `wroot.exe`**. It is in the
**graphics driver files** (`ega.drv`, `cga.drv`, `herc.drv`, `tandy.drv`),
exposed as **dispatch-table entry index 9** (offset `0x27` in the driver header
of `E8 xxxx CB` thunks).

The four drivers contain byte-identical copies of the decoder. The EGA copy
is at file offset `0x1C25` (function entry) with the inner decode loop at
`0x1C6C..0x1C8B`. Equivalent offsets:

| Driver       | Function entry | Decode loop |
| ------------ | -------------- | ----------- |
| `ega.drv`    | `0x1C25`       | `0x1C6C`    |
| `cga.drv`    | (above 0x150D) | `0x151B`    |
| `herc.drv`   | (above 0x16FB) | `0x1707`    |
| `tandy.drv`  | (above 0x199F) | `0x19A1`    |

### The decoder loop — EGA disassembly

The full decoder body, EGA copy at `original/ega.drv` offset `0x1C25..0x1C93`:

```
; --- function prologue: open file, lseek, read 4 KB into source buffer ---
0x1C25  push bp
0x1C26  mov  bp, sp
0x1C28  sub  sp, 8
0x1C2B  push ds
0x1C2C  push es
0x1C2D  push si
0x1C2E  push di
0x1C2F  mov  ax, [bp+0x16]      ; arg: destination screen/buffer index
0x1C32  shl  ax, 1
0x1C34  mov  bx, 0x17A
0x1C37  add  bx, ax
0x1C39  mov  ax, [cs:bx]        ; lookup destination offset in driver table @ 0x17A
0x1C3C  mov  bx, [cs:0x169]     ; base offset/segment
0x1C41  add  bx, ax
0x1C43  mov  [bp-2], bx
0x1C46  mov  es, bx              ; ES = destination video segment
0x1C48  mov  ds, [cs:0x16D]     ; DS = source (4 KB read buffer) segment

0x1C4D  mov  ah, 0x42           ; DOS lseek
0x1C4F  mov  al, 0              ; SEEK_SET
0x1C51  mov  bx, [bp+0x0C]      ; arg: file handle
0x1C54  mov  cx, [bp+0x10]      ; arg: file offset high word
0x1C57  mov  dx, [bp+0x0E]      ; arg: file offset low word
0x1C5A  int  0x21
0x1C5C  xor  di, di             ; DI = 0 (destination cursor at start of video buffer)

; --- 4 KB refill point ---
0x1C5E  xor  dx, dx
0x1C60  mov  bx, [bp+0x0C]      ; file handle
0x1C63  mov  cx, 0x1000         ; read 4096 bytes
0x1C66  mov  ah, 0x3F
0x1C68  int  0x21
0x1C6A  xor  si, si             ; SI = 0 (re-scan from buffer start)

; --- decode loop ---
0x1C6C  cmp  si, 0xFFF          ; if SI >= 4095, refill the buffer
0x1C70  jnc  0x1C5E
0x1C72  xor  cx, cx
0x1C74  lodsb                   ; AL = next opcode byte; SI++
0x1C75  or   al, al
0x1C77  jz   0x1C8C             ; AL == 0  → END  (jump to function epilogue)
0x1C79  test al, 0x80
0x1C7B  jnz  0x1C83             ; AL >= 0x80 → RUN branch

;   --- LIT branch (AL = 0x01..0x7F): copy AL bytes from DS:SI to ES:DI ---
0x1C7D  mov  cl, al
0x1C7F  rep  movsb
0x1C81  jmp  0x1C6C

;   --- RUN branch (AL = 0x80..0xFF): emit (256 - AL) copies of next byte ---
0x1C83  neg  al                 ; AL = (256 - AL) mod 256  (for 0x80 → 0x80, for 0xFF → 0x01)
0x1C85  mov  cl, al
0x1C87  lodsb                   ; AL = fill byte
0x1C88  rep  stosb              ; emit CL copies of AL to ES:DI
0x1C8A  jmp  0x1C6C

; --- epilogue ---
0x1C8C  pop  di
0x1C8D  pop  si
0x1C8E  pop  es
0x1C8F  pop  ds
0x1C90  mov  sp, bp
0x1C92  pop  bp
0x1C93  ret                     ; (far ret — caller pushed CS:IP via E8/CB thunk)
```

### Corrected opcode table

```text
op = next_byte()
if op == 0x00:
    END    ; terminates THIS DECODE CALL; caller may invoke again for next segment
elif op < 0x80:                        ; 0x01..0x7F
    LIT(op)
    emit next op bytes verbatim from input
else:                                  ; 0x80..0xFF
    count = (256 - op) & 0xFF          ; for op=0x80, count = 0x80 = 128
                                       ; for op=0xFF, count = 0x01
    fill = next_byte()
    emit count copies of fill
```

**Key correction vs. previous notes:**

1. **`op >= 0x80` is a RUN-LENGTH FILL, not a "skip transparent slots".** The
   second byte after the opcode is the fill *color/value*; the decoder emits
   `(256 - op)` copies of it to the output. There is no concept of
   "transparency" in this format — every emitted byte is a real pixel/mask
   value.
2. **`op == 0x80`** is **not** a no-op; it is `RUN(128, next_byte)` — emit
   128 copies of the following byte. (Previously we hypothesised it might be a
   record terminator, but it never appears as an opcode in any of the 60 files,
   so its concrete behaviour was unobservable from black-box fuzzing.)
3. **`op == 0x00` terminates only one segment.** The whole file is a sequence
   of independently-decodable segments, each ending in `0x00`. The driver's
   function ends and returns to the caller after `0x00`. The caller (in
   `wmele.ovr` or wherever monsters are drawn) re-invokes the driver function
   with the next file offset to decode the next segment into the next region
   of the screen buffer.

### Segment structure

After running the corrected decoder over all 60 files:

| Segment count | Files |
| ------------- | ----- |
| 1             | 44    |
| 2             | 10    |
| 3             | 5     |
| 4             | 1     |
| **Total**     | **60** |

Multi-segment files and their segment sizes (decoded-output bytes):

```
credits.pic     5640 + 24944                    (file 20906 B)
mon08.pic       6555 + 5913                     (file 8842 B)
mon09.pic      10338 + 14804                    (file 20462 B)
mon11.pic      10194 +     1 + 14184            (file 19655 B)
mon20.pic       5731 + 17183                    (file 18147 B)
mon27.pic      11946 + 17454                    (file 19697 B)
mon28.pic      18104 +  1161 +  9749            (file 20305 B)
mon32.pic      19233 + 11858                    (file 25718 B)
mon36.pic      12037 +   296 +   128 + 12873    (file 19855 B)
mon37.pic       6166 + 10721                    (file 11561 B)
mon44.pic       5881 +  5515 +  2228            (file  9967 B)
mon45.pic       5453 + 19691                    (file 19752 B)
mon50.pic      10188 + 21641                    (file 26099 B)
mon54.pic      19851 +  7545                    (file 22762 B)
mon56.pic       5888 +     0 +   303            (file  4358 B)
mon58.pic       9981 +   188 +  7827            (file 15054 B)
```

The 0-byte and 1-byte segments in `mon11`, `mon56` are interesting — these are
likely sentinel/empty-frame separators in animated or multi-portrait monster
files. They are not errors; the decoder consumed `0x00` as the very first
byte, producing zero output.

### Calling convention

The driver function takes (from `bp+0x0C` upward, after the far call has pushed
CS:IP):

- `[bp+0x0C]` — DOS file handle (word)
- `[bp+0x0E]` — file offset, low word
- `[bp+0x10]` — file offset, high word
- `[bp+0x16]` — destination index (selects which screen buffer / video offset
  to write to, via a driver-internal table at offset `0x17A`)

The caller is therefore responsible for tracking where each segment starts in
the file and where to render it in video memory. The compressed data itself
contains no segment-size header, no W/H, no position field — those are
*driver-/caller-side* concerns.

This explains why our earlier "sub-record header" hypothesis (`[pos_lo]
[pos_hi] [W] [H]` inside the first LIT) was a coincidence: the *first few
literal bytes* of each segment happen to be a small bitmap header that the
**caller** writes into the destination buffer (where they are then interpreted
by a separate sprite-blit pass). The decoder treats them as opaque payload.

### Re-implemented decoder verification

```js
function decodePicAll(bytes) {
  const segments = [];
  let pos = 0;
  while (pos < bytes.length) {
    const segStart = pos;
    const out = [];
    while (pos < bytes.length) {
      const op = bytes[pos++];
      if (op === 0x00) break;                         // END of this segment
      if (op < 0x80) {                                // LIT(op)
        for (let i = 0; i < op; i++) out.push(bytes[pos++]);
      } else {                                        // RUN(256-op, fill)
        const count = 256 - op;
        const fill = bytes[pos++];
        for (let i = 0; i < count; i++) out.push(fill);
      }
    }
    segments.push({ start: segStart, end: pos, output: Uint8Array.from(out) });
  }
  return segments;
}
```

Result on all 60 files in `original/*.pic`:

```
$ node /tmp/pic-multi-segment.mjs
Pass: 60/60
```

Zero bytes left over. Zero overflows. Zero unterminated segments. Every byte
of every `.pic` file is consumed.

### Implications for the parser

The previously-shipped `pic.ts` decoder needs three changes:

1. **Rename `SKIP` → `RUN`** in the opcode tag.
2. **Read the next byte** after a `>= 0x80` opcode as the fill value, and emit
   that byte `(256 - op)` times. Do **not** emit "transparent" sentinel slots.
3. **Loop the decode over multiple segments**: keep going until file EOF,
   collecting one segment per `0x00`. The parser should expose `segments: [{
   offset, output }]`, not a single byte stream.

The `truncatedAtEof` band-aid added in 2026-05-22 (the previous note above)
should be **removed entirely** — no file is truncated under the corrected
rules.

The `pos_word`/`W`/`H` "sub-record header" observed in the leading LIT block
of most files is a *caller-side* concern (a sprite-placement record interpreted
by code outside the driver). It does not belong in the RLE decoder. It can,
however, be re-discovered by inspecting the **decoded output of segment 1** of
each file — the first 4 bytes are typically `pos_lo pos_hi W H` and the
remaining bytes are bitmap pixels at width/height matching `W*H` or
`ceil(W/8)*H` depending on bit-depth.

### Probe scripts used (all in /tmp/, not committed)

- `/tmp/pic-real-decoder.mjs` — single-segment verifier (44/60, identifies the
  multi-segment subset)
- `/tmp/pic-multi-segment.mjs` — multi-segment verifier (60/60)
- `/tmp/pic-trace-mon20.mjs`, `/tmp/pic-trace-full.mjs` — per-file traces
- Disassemblies in `/tmp/{wroot.exe,wmele.ovr,wbase.ovr,wdopt.ovr,wmnpc.ovr,winit.ovr,wmexe.ovr,wmaze.ovr,wpops.ovr,wtrea.ovr,wpcvw.ovr,wpcmk.ovr}.asm`
  and `/tmp/{ega,cga,herc,tandy}.drv.asm` (ndisasm output)

### Recommended next step

1. Update the parser's `pic.ts` decoder to emit `{ segments: [{ output: Uint8Array }] }`
   with the **LIT + RUN** opcode set as documented above. Remove the
   `truncatedAtEof` flag.
2. **Visualise** segment 1 of each file (interpret the first 4 bytes of the
   decoded output as `pos_lo pos_hi W H`, then render the rest as a 1bpp or
   4bpp bitmap of those dimensions) to confirm sprites look right.
3. Trace the **caller side** in `wmele.ovr` to learn how multi-segment files
   are walked — the `combatSpriteId → file + segment index` mapping likely
   lives there.

## Pixel encoding (Stage B Phase 1A — 2026-05-22)

**Status: SOLVED.** Visual cross-check confirms: rendering mon13's first
descriptor produces a recognizable Wizardry monster sprite (a robed wizard
holding a glowing wand, multiple animation frames), and `credits.pic` renders
the actual credit text ("Written and Programming by D.W. Bradley", "SIR-TECH",
"Wizardry" logo). The format was reverse-engineered from continuing the EGA
driver disassembly past the LIT/RUN/END decode loop (function `0x1C25`) into
the **renderer** function `0x1C94` and its per-sprite worker `0x210C`.

### Where the renderer lives

The EGA driver exposes **two** dispatch-table thunks for `.pic` files:

| Thunk offset | Calls function | Purpose                                       |
| ------------ | -------------- | --------------------------------------------- |
| `0x27`       | `0x1C25`       | Decode .pic segment into a destination buffer |
| `0x2B`       | `0x1C94`       | Render decoded buffer onto EGA screen         |

The caller's typical flow is:

1. Call thunk `0x27` (decode) one or more times to fill a sprite buffer with
   decoded segment bytes (segments laid out contiguously — see "Multi-segment
   composition" below).
2. Call thunk `0x2B` (render) with arguments specifying screen position, a
   script-list pointer, and flags. The renderer walks the script list,
   composites the selected sub-sprites into a 5 120-byte off-screen work
   buffer, and blits the result to the EGA frame buffer at `0xA000`.

The renderer code spans `0x1C94..0x20FF` plus the helper `0x210C..0x225E`.

### Decoded segment layout: descriptor table + cell atlas

After the decoder writes its output to the destination buffer, that buffer is
organised as:

```text
+-----------------------------+
|  Descriptor table           |   each descriptor = 24 bytes
|  [pos_lo pos_hi W H mask×20]|   first all-zero descriptor = terminator
|  ...                        |
|  [00 00 00 00 …]            |   end-of-table sentinel (24 zero bytes)
+-----------------------------+
|  Cell atlas                 |   32 bytes per 8×8-pixel cell
|  cell0 cell1 cell2 …        |   addressed by descriptor.pos (byte offset
|  ...                        |   into the SAME buffer, NOT a screen coord)
+-----------------------------+
```

Confirmed against all 60 files: in every `mon*.pic` and `credits.pic`, the
24-byte descriptor block at offset 0 of the first segment terminates in an
all-zero descriptor, and the first descriptor's `pos` field points exactly to
the first byte after that terminator (e.g., `pos=0x0258=600 = 25×24` in
mon05.pic, which has 24 real descriptors + 1 zero terminator).

### Descriptor format (24 bytes)

| Offset | Size  | Field   | Meaning                                                |
| ------ | ----- | ------- | ------------------------------------------------------ |
| 0      | u16LE | `pos`   | Byte offset into the SAME decoded buffer where this descriptor's cell run starts |
| 2      | u8    | `W`     | Width in 8-pixel cells (so sprite is `W*8` pixels wide)|
| 3      | u8    | `H`     | Height in 8-pixel cells (so sprite is `H*8` pixels tall)|
| 4..23  | 20B   | `mask`  | Up to 20 mask bytes; `W*H` bits total, LSB-first, packed across rows |

The 20-byte mask field accommodates up to `W*H = 160` cells per sprite
(actual cell count = `ceil(W*H/8)` bytes of real mask; the rest is padding).
Real sprites use `W ≤ 38, H ≤ 14`, so the mask is comfortably small for all
known files.

### The cell atlas — 4-plane EGA packed planar 8×8 tiles

Each **cell** is exactly **32 bytes** representing an 8-pixel-wide × 8-pixel-tall
tile in 4-plane EGA planar format:

```text
cell = [
  plane0_row0, plane0_row1, ..., plane0_row7,    ; bytes 0..7   (GREEN plane)
  plane1_row0, plane1_row1, ..., plane1_row7,    ; bytes 8..15  (BLUE plane)
  plane2_row0, plane2_row1, ..., plane2_row7,    ; bytes 16..23 (red plane)
  plane3_row0, plane3_row1, ..., plane3_row7,    ; bytes 24..31 (intensity plane)
]
```

> **Correction 2026-05-22:** the original Phase 1A+B notes labeled byte 0..7 as
> the **blue** plane and 8..15 as **green**. Empirical verification against the
> live game (the credits sprite, whose text is yellow in-game but rendered
> purple under the original assumption) shows the order is reversed: bytes 0..7
> are GREEN, bytes 8..15 are BLUE. The order is therefore `[G, B, R, I]`, not
> `[B, G, R, I]`. The renderer in `@wiz6/parser` and these notes have been
> corrected to match.

For row R column C (0 ≤ R,C < 8) of one cell, the 4-bit color index is:

```text
bit = 7 - C                                       ; MSB of each plane byte is the LEFTMOST pixel
b0  = (cell[0  + R] >> bit) & 1
b1  = (cell[8  + R] >> bit) & 1
b2  = (cell[16 + R] >> bit) & 1
b3  = (cell[24 + R] >> bit) & 1
color = b0 | (b1<<1) | (b2<<2) | (b3<<3)          ; standard EGA 4bpp index
```

Verified by inspecting the EGA driver's inner blit at `0x21AB..0x21FE`:

```text
0x21AB  mov bl,[si]          ; plane 0 byte for current source row
0x21AD  and bl,[si+8]        ;   AND plane 1 (transparency mask test)
0x21B0  and bl,[si+0x10]     ;   AND plane 2
0x21B3  and bl,[si+0x18]     ;   AND plane 3
0x21B6  mov bh,bl
0x21B8  not bl               ; bl = ~(all-4-planes-set)  = foreground mask
0x21BA  mov al,[si]          ; plane 0 source
0x21BC  and al,bl
0x21BE  mov ah,[es:di]       ; plane 0 dest preserved where transparent
0x21C1  and ah,bh
0x21C3  or  al,ah
0x21C5  mov [es:di],al       ; merged plane 0
; (same merge for [si+8]/[es:di+8], [si+0x10]/[es:di+0x10], [si+0x18]/[es:di+0x18])
0x21FB  inc si               ; advance 1 byte per source row
0x21FC  inc di
0x21FD  loop 0x21AB          ; 8 iterations = 8 source rows
0x21FF  pop bx
0x2200  add si,0x18          ; skip past planes 1..3 partial bytes (8 + 0x18 = 32 total)
```

### Transparency: color 15 is the "see-through" value

The driver's inner blit treats a pixel as transparent **iff all 4 planes have
a 1 bit at that position**, i.e., the pixel's 4bpp color index is `0xF` (15 =
bright white). At setup, the renderer clears the off-screen work buffer to
`0xFF` (all 4 planes set → all pixels color 15 = transparent), then composites
sub-sprites into it with this AND/OR merge. Final blit-to-screen at
`0x1F84..0x20BE` uses the **same** transparency rule when writing to EGA
video memory at `0xA000`, so existing screen content shows through every
color-15 pixel of the sprite.

**Practical implication:** when rendering for a UI canvas, treat color-15
pixels as fully transparent (alpha=0). The other 15 colors render with the
standard hardware EGA palette (no custom palette is loaded by these drivers —
no `out 0x3C0…` writes occur anywhere in `ega.drv`).

### Sub-sprite render algorithm

For a single descriptor at index `idx`, the renderer at `0x210C` does:

```text
function renderSubSprite(buffer, idx, dst_x, dst_y):
    rec      = buffer[idx*24 .. idx*24+24]
    pos      = u16LE(rec[0..2])
    W, H     = rec[2], rec[3]
    mask     = rec[4..24]
    src_off  = pos              # advance only for DRAWN cells (skipped cells consume no source)
    mask_bit = 0                # global flat bit index into mask
    for cy in 0..H-1:
        for cx in 0..W-1:
            byte_idx = mask_bit // 8
            bit_idx  = mask_bit % 8
            mask_bit += 1
            if (mask[byte_idx] >> bit_idx) & 1:
                # draw 8×8 cell from buffer[src_off..src_off+32] at (cx*8, cy*8)
                blitCell(buffer, src_off, dst_x + cx*8, dst_y + cy*8)
                src_off += 32
            # else: skip — dest cells default to color 15 (transparent)
```

The "skip cells consume no source" rule is critical and was verified from the
disassembly: at `0x21A5  jz 0x2208`, when the mask bit is 0 the renderer jumps
to `0x2208  add di, 0x20` (advance dest by 32) **without** touching `si` (the
source pointer). Only when the mask bit is 1 does the cell-blit loop run and
advance `si` by 32.

This means the cell atlas is **packed** — it stores only the cells that
actually have content (a 1 bit in the mask). For a sparse sprite (lots of
empty corners), the atlas is much smaller than `W*H*32` bytes.

Verified by hand-rendering: applying this algorithm to mon13.pic descriptor 0
(W=11, H=12, mask = 17 bytes selecting roughly half the cells) produces an
88×96-pixel image of a robed wizard. mon05.pic descriptors render as small
sword/arrow/insect sprites. credits.pic descriptors render as crisp credit
lines with the text "WRITTEN AND PROGRAMMING BY", "D.W. BRADLEY", "SIR-TECH",
the Wizardry logo, etc.

### Renderer dispatch (the script list)

Function `0x1C94` (render entry point) takes (in addition to the destination
index, position, clip rect, and flags) a pointer to a **script list** at
`[bp+0x1A]`. The script is a sequence of 1-based descriptor indices terminated
by `0x00`:

```text
0x1CEE  mov si,[bp+0x1A]      ; script pointer
0x1CF1  inc word [bp+0x1A]    ; advance
0x1CF4  mov al,[es:si]
0x1CF7  or al,al
0x1CF9  jz 0x1D00             ; 0 = end of script
0x1CFB  call 0x210C           ; render sub-sprite for this index
0x1CFE  jmp 0x1CEE
```

Each call to `0x210C` composites its sub-sprite into the work buffer **at
offset 0**. Because color 15 is transparent, multiple sub-sprites stack: later
script entries paint over the work buffer wherever they have non-transparent
pixels. Typically a monster's "render this sprite" call uses a 1-element script
`[idx, 0x00]`. The mechanism allows the engine to overlay e.g. a "stunned
star" layer on top of a base monster sprite using two script entries.

The work buffer (5 120 bytes, segment `[cs:0x16d]`, cleared to 0xFF at the
start of every `0x1C94` call) holds a single composite at native sprite
dimensions in the same 4-plane interleaved layout as the cell atlas. After all
script entries are processed, a flip/mirror pass (controlled by the `[bp+0x16]`
flags bits 0/1 for horizontal/vertical flip) and finally a plane-aware blit
to EGA memory at `0xA000`.

### Units summary

| Field                            | Unit                                      |
| -------------------------------- | ----------------------------------------- |
| Descriptor `pos`                 | Byte offset into the decoded sprite buffer |
| Descriptor `W`                   | 8-pixel cells (so sprite is `W*8` pixels wide) |
| Descriptor `H`                   | 8-pixel cells (so sprite is `H*8` pixels tall) |
| Mask bit at row `r`, col `c`     | LSB-first index `r*W + c` into the mask byte stream |
| Cell pixel data                  | 32 bytes per cell, 4 planes × 8 rows × 1 byte |
| In-byte pixel order              | MSB of each plane byte = leftmost pixel |
| Transparent color                | 0xF (15) — all 4 planes = 1               |
| Palette                          | Standard hardware EGA 16-color (no custom palette loaded by driver) |

### `renderSegment` reference pseudocode

```python
def render_pic_file(picBytes) -> list[Sprite]:
    """Decode a .pic file and produce one rendered Sprite per descriptor."""
    # Step 1: decode all segments into one contiguous buffer
    segments = decode_lit_run_end(picBytes)            # LIT/RUN/END from Stage A
    buf = b"".join(seg.output for seg in segments)

    # Step 2: read the descriptor table at the start of buf
    descriptors = []
    i = 0
    while i + 24 <= len(buf):
        rec = buf[i:i+24]
        if rec == b"\x00" * 24:
            break
        pos = rec[0] | (rec[1] << 8)
        W, H = rec[2], rec[3]
        mask = rec[4:]
        descriptors.append((pos, W, H, mask))
        i += 24

    # Step 3: render each descriptor as an (W*8) × (H*8) 4bpp image
    sprites = []
    for pos, W, H, mask in descriptors:
        sprite = render_sub_sprite(buf, pos, W, H, mask)
        sprites.append(sprite)
    return sprites

def render_sub_sprite(buf, pos, W, H, mask) -> Sprite:
    width_px  = W * 8
    height_px = H * 8
    pixels    = bytearray([15] * (width_px * height_px))  # init transparent
    src       = pos
    bit       = 0
    for cy in range(H):
        for cx in range(W):
            byte_idx, bit_idx = bit // 8, bit % 8
            bit += 1
            if not (mask[byte_idx] & (1 << bit_idx)):
                continue           # skip — leave transparent, source not consumed
            # blit one 8×8 cell from buf[src..src+32] at (cx*8, cy*8)
            for r in range(8):
                p0 = buf[src + 0  + r]
                p1 = buf[src + 8  + r]
                p2 = buf[src + 16 + r]
                p3 = buf[src + 24 + r]
                for c in range(8):
                    b = 7 - c
                    color = ((p0 >> b) & 1) | (((p1 >> b) & 1) << 1) | \
                            (((p2 >> b) & 1) << 2) | (((p3 >> b) & 1) << 3)
                    pixels[(cy*8 + r) * width_px + (cx*8 + c)] = color
            src += 32
    return Sprite(width_px, height_px, pixels)  # color 15 = transparent at view time
```

A complete reference implementation lives in `/tmp/wiz6-stageb/render_mon2.py`
and produces visually-correct sprites for all of mon05, mon11, mon13, mon32,
mon50, and credits.pic.

## Multi-segment composition (Stage B Phase 1B — 2026-05-22)

**Status: SOLVED.** Multi-segment `.pic` files are **composition**, not
animation frames or layers. The segments are decoded one after another into a
**single contiguous buffer**, in file order, with no header or alignment
between them. The descriptors in segment 0 reference cell-atlas bytes located
in the LATER segments via their `pos` field (which is a flat byte offset into
the concatenated buffer).

### Evidence

The 16 multi-segment files (10 of 2 segments, 5 of 3, 1 of 4 — see Stage A
inventory) cluster into two patterns:

- **Large monster sprites** (mon09, mon11, mon27, mon32, mon37, mon45, mon50,
  mon54, mon44, mon58…). The first segment contains the descriptor table and
  the first few hundred cells; remaining segments are pure cell-atlas
  continuation bytes. Confirmed: rendering mon32 with `buf = seg0 + seg1`
  produces a coherent multi-frame monster sprite (winged demon with red
  details). Rendering only `seg0` produces sprites whose last few cells are
  empty white blocks because their `pos` fields point past the end of
  `seg0`-only data.
- **`credits.pic`** has the same structure: 5 640-byte seg 0 (the descriptor
  table for the 13 credit lines + first cells of the credits-screen art) and a
  24 944-byte seg 1 holding the rest of the credits-screen graphics. Rendering
  the concatenation produces the recognisable Wizardry credits screen with
  the text "WRITTEN AND PROGRAMMING BY", "D.W. BRADLEY", "SIR-TECH", etc.

The 0-byte and 1-byte sub-segments seen in mon11, mon56, mon36 (Stage A's
multi-segment table) are simply **edge-case decoder outputs**: a `.pic` file
encoded by the original tool can contain a `0x00` byte at any position, which
the decoder treats as "end of current segment, start a new one." Some
files accidentally emit a `0x00` immediately after a previous `0x00` (1-byte
segment of just END) or even back-to-back `0x00 0x00` (a 0-byte segment).
These are harmless when segments are concatenated.

### Composition rule

```text
decoded_buffer = concat(segment_0, segment_1, ..., segment_N)
descriptors    = read at offset 0 of decoded_buffer, 24 bytes each, until
                 a 24-zero record (which is the end-of-descriptor sentinel)
cell_atlas     = decoded_buffer[start_of_atlas:]
```

For `credits.pic`:

```text
seg 0:  5 640 bytes  → contains [descriptor table (312 B = 13 descriptors + 1 zero terminator) | first ~5 322 B of cell atlas]
seg 1: 24 944 bytes  → continuation of cell atlas
TOTAL: 30 584 bytes
```

Descriptor 11 of `credits.pic` has `pos=0x5978=22 904`, which is comfortably
inside the concatenated buffer (30 584 bytes) but well past the end of seg 0
alone (5 640 bytes). Rendering with the concatenated buffer produces a clean
"SIR-TECH" graphic; rendering with only seg 0 produces garbage at that
descriptor.

### Destination buffer geometry

There is no fixed destination-buffer geometry imposed by the format itself —
each descriptor's `W` and `H` independently specify the sprite size in 8-pixel
cells, and each is drawn at its own caller-specified `(x, y)` on the EGA
screen via the renderer at `0x1C94`. Monster sprites are typically `W ≤ 13,
H ≤ 14` (≤ 104 × 112 px), well within the EGA 320×200 viewport. Credits-screen
descriptors are wider (up to `W=38`, 304 px) and represent horizontal credit
lines.

### Implications for the parser

The Stage A parser must change to:

1. **Concatenate** all decoded segments into one `Uint8Array` per file, in
   file order. Do not expose per-segment outputs to higher layers (the
   segment boundary is purely a streaming-decoder concern).
2. **Parse** the descriptor table at offset 0 of the concatenated buffer,
   stopping at the first all-zero 24-byte record.
3. **Expose** descriptors as a structured array
   `{ pos: number, W: number, H: number, mask: Uint8Array }[]`.
4. **Render** at view time via `renderSubSprite(buf, descriptor) →
   { width, height, pixels: Uint8ClampedArray }` using the algorithm above.

The parser's `PicSchema` should grow a `descriptors` field but should NOT
bake pixels into JSON — at typical sprite sizes (88×96 × 4-byte RGBA = 32 KB
per descriptor × ~15 descriptors per file × 60 files = ~30 MB), it would
balloon the extracted JSON unnecessarily. Rendering happens in the viewer
canvas component.

### Verification gallery

Reference renders produced from the disassembled spec:

- `mon05.pic` — 24 small weapon/glyph sprites (W,H ≤ 3,3)
- `mon11.pic` — cyclops-like swordsman, 11 animation frames
- `mon13.pic` — robed wizard with glowing wand, 13 animation frames
- `mon32.pic` — winged demon, multi-segment composition verified
- `mon50.pic` — multi-segment, 3-frame red-robed figure with flame base
- `credits.pic` — recognisable Sir-Tech Wizardry credits screen

All renders include the expected EGA colour palette (blue robes, cyan
highlights, red accents) and use color-15 transparency to overlay correctly
on a notional game background.

### Probe scripts used (all in `/tmp/wiz6-stageb/`, not committed)

- `decode.py` — LIT/RUN/END segment decoder (Stage A logic, ported to Python)
- `dump_records.py`, `count_records.py`, `verify_pos.py`, `find_boundary.py` —
  exploratory scans of decoded-segment layout
- `render_mon.py` — initial (incorrect: per-cell mask) renderer
- `render_mon2.py` — final (correct: packed-cell mask) renderer + PPM output
- `render_seg.py`, `render_credits.py` — per-segment and concatenated-buffer
  driver scripts
- `render_planar.py` — verifies that seg 1+ are NOT raw planar images (rules
  out the "first segment is descriptors, second is a planar screenshot"
  hypothesis)
- `ega.asm` — `ndisasm -b 16 -o 0x0000 original/ega.drv` output (162 KB,
  4 077 lines), spanning the decoder at `0x1C25..0x1C93` and the renderer at
  `0x1C94..0x225E`

### Open follow-ups for Stage B Phase 2

1. **Custom palette.** The hardware-default EGA palette renders monsters with
   noticeable magenta/cyan speckle in some files (e.g. mon11). This suggests
   the game may reprogram the EGA Attribute Controller palette registers at
   runtime via `out 0x3C0, …` somewhere in `wroot.exe` or its overlays (the
   driver itself does not). Worth tracing if the viewer's rendered sprites
   look "off" compared to in-game.
2. **`combatSpriteId → monNN.pic` indirection table.** Stage B Phase 1C
   investigates this separately (`docs/re/sprite-id-table.md`).
3. **Per-descriptor labelling.** Each `.pic` file's descriptors look like
   animation frames or pose variants. Higher-level metadata (which descriptor
   is the "default" pose, which are attack/cast animations) probably lives in
   `wmele.ovr` near the monster-draw routine. The viewer can punt by
   displaying all descriptors as a strip until that's resolved.
