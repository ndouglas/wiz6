# `.pic` loader — caller-side investigation (Phase 1C, 2026-05-22)

**Status: PARTIALLY SOLVED.** The .pic decoder in `ega.drv` (function at file
offset `0x1C25`, dispatch entry index 9 / table offset `0x27`) is well
understood (see `pic.md`). This document focuses on the **caller side** in
`wroot.exe` and the overlays. We located the per-pic loader functions, their
calling convention, and a key data-layout discovery — but we were **not** able
to pin down the exact mechanism by which multi-segment `.pic` files have their
2nd, 3rd, and 4th segments placed into the destination memory buffer.

## Key finding — the descriptor table is fixed-size, not zero-terminated

After re-counting descriptors across every multi-segment file, the descriptor
table at the start of the concatenated decoded buffer is **always exactly
25 entries × 24 bytes = 600 bytes**, padded with all-zero "empty" entries
where the file uses fewer than 25 sprites. The "first all-zero record =
sentinel" rule documented in `pic.md` is **coincidentally correct** because
unused trailing descriptors are zero — but the actual format has a
**fixed 600-byte descriptor block**, no explicit terminator.

This is confirmed by:

- Every single `.pic` file has `descriptor[0].pos == 0x0258 == 600`. The cell
  atlas starts at byte 600 = 25 × 24 = the first byte after a 25-entry table.
- Multi-segment files (mon32, mon20, mon11, credits, …) all have the same
  layout: `descriptor[0..N-1]` populated, `descriptor[N..24]` all zero, then
  cell atlas begins at offset 600.

The existing parser in `packages/parser/src/formats/pic.ts` (`decodePic`) already
stops at the first zero descriptor, so it produces the right `descriptors` list
in practice. But the *understanding* in `pic.md` was incorrect — there is no
zero-terminator opcode; it's a fixed-size table.

## Decoder API recap (`ega.drv` offset 0x1C25)

```c
// File offset 0x1C25, dispatch index 9 (driver thunk at file offset 0x27)
// Called via near-call wrapper at wroot.exe:0xEE85 from each overlay.
int decode_pic_segment(
    uint16_t file_handle,    // [bp+0x0C]
    uint16_t unused1,        // [bp+0x0E]  always 0 at every observed call site
    uint16_t unused2,        // [bp+0x10]  always 0 at every observed call site
    uint32_t file_offset,    // [bp+0x0E] low, [bp+0x10] high  *** NOTE: same slots as above
    uint16_t dst_idx         // [bp+0x16]
);
```

Wait — the call sites push 6 words and `add sp, 0xC`. The args are
(top of stack at entry, before `push bp`): handle, 0, 0, offset_lo, offset_hi,
dst_idx. After the standard `push bp; mov bp,sp`, the decoder reads
`[bp+0x0C]=handle, [bp+0x0E]=offset_lo, [bp+0x10]=offset_hi, [bp+0x16]=dst_idx`.
So the two "0"s passed by the caller correspond to bp+0x12 and bp+0x14, which
the decoder does not read. The 4-byte `file_offset` is at bp+0x0E and bp+0x10.

Behavior:
1. `lseek(handle, file_offset, SEEK_SET)`.
2. Set `DS = cs:[0x16D]` (4 KB read-buffer segment), `ES = cs:[0x169] + cs:[0x17A + 2*dst_idx]` (destination segment).
3. `DI = 0` (destination cursor starts at offset 0 of destination segment).
4. Read 4096 bytes from file into source buffer; loop reading LIT/RUN opcodes,
   writing decoded bytes to `ES:DI`, refilling the source buffer as needed.
5. Stop at first `op == 0x00` (END), return.

Critically: **DI starts at 0 every call**. The decoder always writes from
offset 0 of the destination segment. The caller's DI is not modified (decoder
saves/restores it).

## Per-`.pic` loader call sites

Every `.pic` load in the engine routes through a near call to
**`wroot.exe:0xEE85`** (the cross-overlay decoder wrapper). Sites:

| Overlay     | Function entry | Decoder call | Comments                                                  |
| ----------- | -------------- | ------------ | --------------------------------------------------------- |
| `wmele.ovr` | `0x0042`       | `0x014C`     | Combat sprite load (called with arg = monster sprite ID)  |
| `wmnpc.ovr` | `0x093A`       | `0x094A`     | NPC encounter sprite load (same pattern)                  |
| `wdopt.ovr` | `0x00F7`       | `0x0107`     | Options/menu sprite load (same pattern)                   |
| `winit.ovr` | `0x033A`       | `0x035F`     | **Startup pre-load** — loops mon00..monNN into N slots    |
| `winit.ovr` | `0x0432`       | `0x0449`     | CREDITS.PIC load                                          |

All five call sites use **identical arguments at the decoder boundary**:

```
push 0xE                  ; dst_idx = 0xE (selects same destination slot)
push word [0x33f2]        ; file_offset_hi (usually 0 — except winit's loop)
push word [0x33f0]        ; file_offset_lo (usually 0 — except winit's loop)
push 0                    ; (unused — bp+0x12)
push 0                    ; (unused — bp+0x14)
push handle               ; file handle
call 0xEE85               ; → ega.drv:0x1C25
add sp, 0xC
```

Decompiled pseudocode of the `wmele.ovr` combat loader (function at 0x42):

```c
void load_combat_sprite(int monster_sprite_id) {
    char fname[0x14] = "MON00.PIC";
    int tens = monster_sprite_id / 10;
    int ones = monster_sprite_id % 10;
    fname[3] = '0' + tens;
    fname[4] = '0' + ones;
    int handle = open(fname);
    if (handle == -1) error(0xF);

    // *** Only ONE call to the decoder. NO LOOP. ***
    int rc = decode_pic_segment(handle,
        0, 0,                            // unused slots
        global_file_offset_lo,           // [0x33F0]: usually 0
        global_file_offset_hi,           // [0x33F2]: usually 0
        /*dst_idx=*/ 0xE);
    if (rc != 0) error(0x10);

    close(handle);
}
```

## The puzzle — multi-segment .pic files

**Multi-segment `.pic` files exist** (16 of 60: mon08, mon09, mon11, mon20,
mon27, mon28, mon32, mon36, mon37, mon44, mon45, mon50, mon54, mon56, mon58,
credits). Per the disassembled decoder, each call decodes **exactly one
segment** (stops at the first 0x00 END byte) and writes to `dest_seg:0`.

But every loader call site we located makes **only ONE call to the decoder**.
There is no visible loop that re-invokes the decoder for additional segments,
no per-segment file-offset table, no advancement of `dst_idx`, and no
modification of `[cs:0x17A]` between calls.

Possible explanations we could **not** confirm or rule out within the time
budget:

### Hypothesis A — the 0xEE85 wrapper itself iterates

`call 0xEE85` is a near call from each overlay. Despite the address being
"near," at runtime overlays are loaded into wroot's combined segment, and
0xEE85 lands inside wroot.exe (which we couldn't easily inspect because
Ghidra's auto-analysis didn't resolve the overlay-imported addresses).

If the function at wroot.exe `0xEE85` (in its loaded/relocated address space)
contains its own loop that:

1. Calls the EGA driver's decoder (dispatch index 9) once.
2. After return, checks if file position is still less than file size.
3. If yes, modifies `[cs:0x17A + 0x1C]` (the destination-offset entry for
   `dst_idx=0xE`) to advance past the bytes just written, then calls the
   decoder again with the same dst_idx and a new file offset.

…then multi-segment composition is handled entirely inside the wrapper,
invisibly to the per-overlay caller. This is the most plausible hypothesis
given the call-site structure.

We did not crack open wroot.exe `0xEE85` because its actual runtime address is
relocation-dependent and Ghidra's analysis of the wroot.exe binary did **not**
identify a function there — the bytes at file offset 0xEE85 in wroot.exe are
data (zeros), suggesting the near-call target is at a different virtual
address in the loaded program. Specifically, when overlays are loaded, they
typically occupy a segment AFTER wroot's static code+data, and "near calls
from overlay to wroot" use a base-offset-fixup that we didn't decode here.

**Recommended next step:** trace wroot.exe `0xEE85` in DOSBox-X by setting a
breakpoint on the EGA driver's `0x1C25` entry, then walking up the call stack
to see what the real wrapper looks like.

### Hypothesis B — destination buffer is pre-zeroed; the renderer tolerates "missing" cells

If the destination buffer for `dst_idx=0xE` is allocated as 64 KB of memory
and zeroed by `winit.ovr` before each `.pic` load, then writing only seg 0
would leave bytes past `seg0_size` as zero. The renderer would then read
cells as `00 00 00 00 ...` for descriptors whose `pos` falls past seg 0 — those
cells render as solid color 0 (black) or as the "all-planes-zero" sentinel,
which is **not** the documented transparent color 15.

This would produce **black blocks** where multi-segment cells should be —
plausibly the "corruption" reported for mon32/D7..D10, mon11/D5..D10, etc.
The bug would NOT be in segment composition; it would be that **only the
first segment is loaded, and later descriptors' cells aren't loaded at all**.

This hypothesis is the simplest one consistent with all the evidence we
collected: **the engine doesn't render the later segments of multi-segment
.pic files in normal play, OR it never tries to access them.**

### Hypothesis C — the "extra bytes" between segments correspond to a paragraph alignment

For each multi-segment file, the trailing-byte count between
`last_used_cell_offset` and `concatenated_buffer_size` is non-zero (e.g.
mon32: +59, mon20: +74, mon11: +3, credits: +1504). These "extra" bytes are
**not** consistently a multiple of any obvious alignment (16, 32, 64), so
paragraph-alignment between segments is **not** the explanation either.

(Tested in `/tmp/test_paragraph_align.py` — doesn't change descriptor.pos
matching.)

## Decoded segment sizes vs descriptor expectations (re-confirmed)

| File          | Segment sizes              | Sum (bytes) | Last cell ends at | Trailing unused |
| ------------- | -------------------------- | ----------- | ----------------- | --------------- |
| mon11.pic     | [10194, 1, 14184]          | 24379       | 24376             | 3               |
| mon20.pic     | [5731, 17183]              | 22914       | 22840             | 74              |
| mon27.pic     | [11946, 17454]             | 29400       | 29400             | 0               |
| mon32.pic     | [19233, 11858]             | 31091       | 31032             | 59              |
| mon36.pic     | [12037, 296, 128, 12873]   | 25334       | (varies)          | —               |
| mon44.pic     | [5881, 5515, 2228]         | 13624       | 13624             | 0               |
| mon45.pic     | [5453, 19691]              | 25144       | 25144             | 0               |
| mon50.pic     | [10188, 21641]             | 31829       | 31672             | 157             |
| credits.pic   | [5640, 24944]              | 30584       | 29080             | 1504            |

For mon27, mon44, mon45: the concatenated buffer **exactly equals** the
last-cell-end — naive concatenation is bit-perfect.

For mon32, mon20, mon11, mon50, credits: a few-byte trailing gap suggests
**the encoder may write a small fence/padding** at the end of seg 1 (or
between segs), but the descriptor `pos` values DO consistently point into
the naive-concat buffer.

## What we found in the EGA driver beyond `pic.md`'s spec

The decoder writes to ES:0 where:

```
ES = cs:[0x169] + cs:[0x17A + 2*dst_idx]
```

`cs:[0x169]` and `cs:[0x17A + 2k]` are **segment values** (paragraph
addresses). They are runtime-patched by `wroot.exe` at driver-load time:

- The driver-load code at `wroot.exe:0x2141` reads `egamem.drv` into
  `driver_seg:0x100` (i.e. the file's first byte ends up 256 bytes into the
  driver's runtime segment).
- After loading, the code at `wroot.exe:0x2195..0x21A4` **copies 49 bytes**
  from `wroot.exe:0x1B56..0x1B86` into `driver_seg:[cs:0x1BCE]`.

That 49-byte block contains executable code (lots of `out dx, al`,
`in al, dx`, `cf` retf bytes, etc.) — it appears to be a small **stub** that
the loader patches into the driver, probably to provide segment values for
the driver to use, or to install a video-mode-aware sub-routine.

The **actual segment values** used by the decoder (`[cs:0x169]`,
`[cs:0x17A]…`) are computed dynamically by this stub and are not directly
readable from the static binary. To recover them, you'd need to single-step
the driver load in DOSBox-X.

## What still needs to be answered

The **specific destination-address rule** for segment 1+ of a multi-segment
.pic file is still unknown. Three concrete experiments would close this gap:

1. **DOSBox-X memory dump after mon32 loads.** Set a breakpoint on
   `ega.drv:0x1C25` (after wroot.exe loads the driver, this is a runtime
   address you derive from the load-time `driver_seg`). When the breakpoint
   hits with file mon32.pic, log the value of `ES` at entry. Then continue.
   If the SAME `ES` value appears on the next breakpoint hit (with a non-zero
   file offset), that confirms multi-segment writes go to the same
   destination segment. The **second** hit's incoming file offset will tell
   you whether the wrapper computed `seg0_size` or whether some other rule
   is in play.

2. **DOSBox-X memory dump of the destination buffer.** After mon32 finishes
   loading, dump 64 KB of memory from `(ES from step 1):0` to disk and
   compare with the naive-concatenation prediction. If they match byte-for-
   byte, **naive concatenation IS correct** and the renderer bug is
   elsewhere. If they differ, the diff will reveal the actual layout.

3. **In-game capture of a known multi-segment monster.** mon32 is "winged
   demon"; mon11 is the cyclops swordsman; mon54 is a dragon. Trigger
   combat with one of these in DOSBox-X, screenshot the sprite, then compare
   pixel-for-pixel with the viewer's render. If the in-game sprite shows
   D7+ cells with VALID art (not black blocks), the multi-segment data IS
   reaching memory correctly. If the in-game sprite shows black/garbage in
   the same regions that the viewer corrupts, the engine *also* doesn't
   render the late descriptors — and we can ignore them.

## Recommended TypeScript-side action

**Until we have a DOSBox-X capture confirming the layout**, the safest parser
change is:

1. **Document** the fixed 25-entry descriptor table in `pic.ts` — replace the
   "stop at first all-zero record" comment with "always exactly 25 entries,
   later entries are zero-padded if unused." Behavior is unchanged.

2. **For multi-segment files**, mark the descriptors whose `pos + cells*32`
   exceeds `segment[0].length` with a `multiSegment: true` flag, so the
   viewer can warn ("this sprite requires verification against in-game
   reference").

3. **Defer**: do NOT change the concat strategy. Naive concatenation is the
   closest match to the EGA driver's documented behavior — adding padding,
   stripping bytes, or skipping phantom segments has no support from the
   disassembly and is more likely to introduce new bugs than fix existing
   ones.

4. **Hide multi-segment descriptors past seg 0** behind a feature flag in
   the viewer, e.g. `experimental_render_multi_segment_late_descriptors`,
   until the layout is confirmed.

## Confirmed in this investigation

- The descriptor table is exactly 25 entries × 24 bytes = 600 bytes, padded
  with zero entries. Cell atlas begins at offset 0x0258 = 600 in every file.
- Every per-overlay `.pic` loader calls the EGA driver decoder **exactly
  once** per file, with `dst_idx = 0xE` and `file_offset = 0`. None of them
  loop for multi-segment files at the overlay level.
- The 0xEE85 wrapper in wroot.exe sits between the overlay and the driver
  and is the most likely site of any multi-segment iteration. Its exact
  contents could not be recovered from static analysis within the time budget.

## Open: where to look next

- **wroot.exe 0xEE85 in DOSBox-X.** Load the game, set breakpoint at
  ega.drv:0x1C25, examine SS:[BP+2] (return address) when hit. That return
  address points into the 0xEE85 wrapper. Single-step out and dump the full
  wrapper function.
- **The 49-byte driver patch (`wroot:0x1B56..0x1B86`).** This installs code
  into the driver that probably computes `[cs:0x169]` and `[cs:0x17A]…`.
  Decoding it would reveal the slot-allocation strategy.

## Probe scripts (all in /tmp, not committed)

- `/tmp/find_overlap.py` — checks seg0 tail / seg1 head overlap (credits.pic
  has 16-byte overlap; others have none).
- `/tmp/inspect_boundaries.py` — dumps seg0 tail and seg1 head bytes for
  every multi-segment file.
- `/tmp/recount_descriptors.py` — counts descriptors with fixed-25-entry
  rule; computes per-descriptor cell-atlas extent.
- `/tmp/test_paragraph_align.py` — verifies paragraph-alignment hypothesis
  doesn't change layout (it doesn't).
- `/tmp/check_terminator.py` — confirms descriptor[0].pos == 600 in all
  files (i.e. table is always exactly 25 entries).
- `/tmp/ghidra-scripts/{Explore,FindRefs,DumpFns}.java` — Ghidra helper
  scripts (used to confirm wmele.ovr has no relocated MON00.PIC string
  references — overlay imports aren't resolved by Ghidra's default loader).
