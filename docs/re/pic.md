# `.pic` format — Wizardry VI monster sprites + credits screen

**Status: SOLVED.** Decoder lives in `packages/parser/src/formats/pic.ts`,
validated byte-for-byte against a DOSBox-X save state of mon11 in-game via
`tools/parity/` (BYTE-PERFECT MATCH, 24376 bytes).

## File inventory

60 files: `mon00.pic`…`mon58.pic` (sprite atlases for combat monsters) plus
`credits.pic` (the full-screen Sir-Tech Wizardry credits image). Sizes range
1 166 B (mon00) to 26 099 B (mon50). All are byte-packed RLE; no fixed header
or footer; all end on `0x00`.

## Quick reference

The file is a single RLE stream. The engine reads it in 4 KB chunks; **one
byte per chunk (at file offset `4096*N + 0xFFF`) is silently dropped** during
buffer refill — see "the 4 KB byte loss" below. The 0x00 byte that ends the
RLE stream may sit anywhere in the file; the decoder runs until it sees one.

After decoding, the output is one contiguous buffer:

```
+------------------------------+
| Descriptor table             |  ≤ 25 entries × 24 bytes; first all-zero
|                              |  record terminates
+------------------------------+
| Cell atlas                   |  32 bytes per 8×8 EGA-planar cell,
|                              |  addressed by descriptor.pos
+------------------------------+
```

### Opcodes

```
op = next_byte()
op == 0x00       → END   (terminates the decode)
op  in 0x01..7F  → LIT(op)        : emit next `op` bytes verbatim
op  in 0x80..FF  → RUN(256 - op)  : emit (256 - op) copies of next byte
```

The previous "skip = transparent slots" interpretation was wrong; high-bit-set
opcodes are byte-fills, not transparency markers. See the EGA-driver
disassembly below.

### Descriptor (24 bytes)

| Offset | Size  | Field  | Meaning                                                            |
| ------ | ----- | ------ | ------------------------------------------------------------------ |
| 0      | u16LE | `pos`  | Byte offset into decoded buffer where this descriptor's cells live |
| 2      | u8    | `W`    | Width in 8-pixel cells (sprite is `W*8` pixels wide)               |
| 3      | u8    | `H`    | Height in 8-pixel cells (`H*8` pixels tall)                        |
| 4..23  | 20 B  | `mask` | `W*H` bits LSB-first; 1 = draw cell, 0 = leave transparent         |

The descriptor table holds at most 25 entries (table is exactly 600 bytes =
25 × 24). The first all-zero record is the terminator. Cell atlas starts
immediately after the terminator (at offset 600 in the buffer, i.e.
`pos = 0x258` for the first cell of the first descriptor in every file).

### Cell (32 bytes, 4 EGA planes × 8 rows)

```
bytes 0..7   = GREEN     plane rows 0..7   (MSB = leftmost pixel)
bytes 8..15  = BLUE      plane rows 0..7
bytes 16..23 = RED       plane rows 0..7
bytes 24..31 = INTENSITY plane rows 0..7
```

Color index at row `r`, column `c`:

```
b = 7 - c
color = ((G[r] >> b) & 1)
      | ((B[r] >> b) & 1) << 1
      | ((R[r] >> b) & 1) << 2
      | ((I[r] >> b) & 1) << 3
```

**Color 15 (all 4 planes set) = transparent.** The driver's blit treats `0xF`
as see-through; the renderer initialises the work buffer to `0xFF` so unused
cells default to transparent.

The renderer uses the standard hardware EGA palette. Wiz6 applies 7 empirical
overrides on top — see `packages/parser/src/formats/pic-render.ts`. (No
runtime palette reprogramming via `out 0x3C0` is performed by the driver
itself; the overrides are observational tuning to match in-game colors.)

## The 4 KB buffer-refill byte loss

The single subtle behaviour. The engine's decoder doesn't read the file
byte-by-byte; it reads in 4 KB chunks via DOS `INT 21h AH=3F` into a fixed
source buffer in DGROUP. The inner loop checks
`cmp si, 0xFFF; jnc REFILL` **before consuming** the byte at `SI=0xFFF`,
which means the byte at offset 0xFFF of each chunk is **never read** — every
refill silently drops one byte per 4 KB.

For mon11.pic this byte happens to be a `0x00` at file offset 0xFFF, which
naive whole-file decoding interprets as a segment terminator. It is not — the
real decoder skips it on refill. Mirroring this behaviour in the TS decoder
gives byte-perfect parity with the engine.

A faithful re-implementation must:

1. Read input through a 4096-byte buffer.
2. When the buffer pointer reaches `0xFFF`, refill the buffer **before**
   reading that byte (so the byte at file offset `4096*N + 0xFFF` is lost).
3. RLE-decode the resulting stream with the opcode table above.

The current `packages/parser/src/formats/pic.ts` does exactly this.

## EGA-driver disassembly

The decoder lives in the graphics drivers (`ega.drv`, `cga.drv`, `herc.drv`,
`tandy.drv` — byte-identical decoders). The EGA copy is at file offset
`0x1C25..0x1C93`. The decoder is exposed via the driver's dispatch table at
entry index `9` (offset `0x27`); the renderer is entry index `0x2B`.

```asm
; --- function prologue: open file, lseek, read 4 KB into source buffer ---
0x1C25  push bp / mov bp,sp / sub sp,8
0x1C2B  push ds / push es / push si / push di
0x1C2F  mov  ax, [bp+0x16]         ; arg: destination screen/buffer index
0x1C32  shl  ax, 1
0x1C34  mov  bx, 0x17A             ; driver-internal table base
0x1C37  add  bx, ax
0x1C39  mov  ax, [cs:bx]           ; lookup destination offset
0x1C3C  mov  bx, [cs:0x169]        ; base segment
0x1C41  add  bx, ax
0x1C46  mov  es, bx                 ; ES = destination video segment
0x1C48  mov  ds, [cs:0x16D]        ; DS = source (4 KB read buffer) segment

0x1C4D  mov  ah, 0x42 / mov al, 0  ; DOS lseek SEEK_SET
0x1C51  mov  bx, [bp+0x0C]         ; arg: file handle
0x1C54  mov  cx, [bp+0x10]         ; arg: file offset high
0x1C57  mov  dx, [bp+0x0E]         ; arg: file offset low
0x1C5A  int  0x21
0x1C5C  xor  di, di                 ; DI = 0 (destination cursor)

; --- 4 KB refill point (CRITICAL: this is where one byte is dropped) ---
0x1C5E  xor  dx, dx
0x1C60  mov  bx, [bp+0x0C]
0x1C63  mov  cx, 0x1000             ; read 4096 bytes
0x1C66  mov  ah, 0x3F / int 0x21
0x1C6A  xor  si, si                 ; SI = 0 (re-scan from buffer start)

; --- decode loop ---
0x1C6C  cmp  si, 0xFFF              ; *** byte at SI=0xFFF is never consumed
0x1C70  jnc  0x1C5E                 ; → refill before reading it
0x1C72  xor  cx, cx
0x1C74  lodsb                        ; AL = next opcode; SI++
0x1C75  or   al, al
0x1C77  jz   0x1C8C                  ; AL == 0 → END (jump to epilogue)
0x1C79  test al, 0x80
0x1C7B  jnz  0x1C83                  ; AL >= 0x80 → RUN branch

;   LIT branch (AL = 0x01..0x7F)
0x1C7D  mov  cl, al / rep movsb
0x1C81  jmp  0x1C6C

;   RUN branch (AL = 0x80..0xFF)
0x1C83  neg  al                      ; AL = (256 - AL) mod 256
0x1C85  mov  cl, al
0x1C87  lodsb                        ; AL = fill byte
0x1C88  rep  stosb                   ; emit CL copies of AL
0x1C8A  jmp  0x1C6C

; --- epilogue ---
0x1C8C  pop di / pop si / pop es / pop ds / mov sp,bp / pop bp / ret
```

### Calling convention

```
[bp+0x0C]  DOS file handle (word)
[bp+0x0E]  file offset, low word
[bp+0x10]  file offset, high word
[bp+0x16]  destination index (selects screen buffer / video offset via
           driver-internal table at 0x17A)
```

The decoder produces a single continuous output buffer — no internal segment
boundaries, no per-segment headers. The 0x00-byte terminator the function
returns on is the **final** end of the stream, not a segment break.

## Renderer

The EGA driver's renderer is at `0x1C94..0x20FF` plus the per-sprite worker at
`0x210C..0x225E`. Caller flow:

1. Call decode thunk `0x27` → fill a sprite buffer with the decoded bytes.
2. Call render thunk `0x2B` with screen position + a script list + flags.
   The renderer walks the script (1-based descriptor indices terminated by
   `0x00`), composites selected sub-sprites into a 5 120-byte off-screen work
   buffer (cleared to 0xFF = transparent), and blits to EGA video at `0xA000`.

### Sub-sprite render algorithm

For descriptor `idx` at screen `(dst_x, dst_y)`:

```text
rec      = buffer[idx*24 .. idx*24+24]
pos      = u16LE(rec[0..2])     # byte offset into the SAME buffer
W, H     = rec[2], rec[3]
mask     = rec[4..24]
src_off  = pos
mask_bit = 0
for cy in 0..H-1:
    for cx in 0..W-1:
        if (mask[mask_bit // 8] >> (mask_bit % 8)) & 1:
            blit 8×8 cell from buffer[src_off..src_off+32] at (dst_x+cx*8, dst_y+cy*8)
            src_off += 32
        # else: skip — source not consumed; cell stays transparent
        mask_bit += 1
```

**Critical:** skipped cells don't consume source bytes. The atlas is packed —
only cells with a 1-bit in the mask are stored. Verified at disassembly
`0x21A5  jz 0x2208`: when the mask bit is 0, `si` (source) is not advanced.

### Inner blit (one row of one cell)

```asm
0x21AB  mov bl,[si]              ; plane 0 byte
0x21AD  and bl,[si+8]             ;   AND plane 1
0x21B0  and bl,[si+0x10]          ;   AND plane 2
0x21B3  and bl,[si+0x18]          ;   AND plane 3
0x21B6  mov bh,bl
0x21B8  not bl                    ; bl = ~(all-4-planes-set) = foreground mask
0x21BA  mov al,[si] / and al,bl
0x21BE  mov ah,[es:di] / and ah,bh
0x21C3  or  al,ah / mov [es:di],al    ; merged plane 0
; (repeat for planes 1..3 at +8/+0x10/+0x18)
0x21FB  inc si / inc di
0x21FD  loop 0x21AB                  ; 8 source rows
0x2200  add si, 0x18                  ; advance past planes 1..3 (8 + 0x18 = 32 total)
```

The transparency rule (`pixel transparent ⇔ all 4 planes set ⇔ color 15`)
falls naturally out of this AND/OR merge.

### Renderer dispatch

```asm
0x1CEE  mov si,[bp+0x1A]         ; script pointer
0x1CF1  inc word [bp+0x1A]
0x1CF4  mov al,[es:si]
0x1CF7  or al,al
0x1CF9  jz 0x1D00                 ; 0 = end of script
0x1CFB  call 0x210C                ; render sub-sprite for this index
0x1CFE  jmp 0x1CEE
```

Each script entry composites into the work buffer at offset 0; later entries
paint over earlier ones (with color-15 transparency). Typical monster draw is
a 1-element script `[idx, 0x00]`; the mechanism supports overlay layers (e.g.
"stunned" stars on top of a base monster sprite).

## `combatSpriteId → mon??.pic` mapping

Empirically: each monster's `combatSpriteId` (stat byte 145 in the scenario
monster record, per Stage B Phase 1C work) names the `.pic` file as
`mon{id:02}.pic`. Confirmed at runtime by DOSBox-X file-open tracing — see
`docs/re/sprite-id-table.md` and the `parse-pic-opens.sh` workflow.

## Reference TS pseudocode

```js
function decodePic(bytes) {
  const BUFFER_SIZE = 0x1000;
  const BUFFER_LIMIT = 0xFFF;
  let filePos = 0;
  const refill = () => {
    const chunk = bytes.subarray(filePos, filePos + BUFFER_SIZE);
    filePos += chunk.length;
    return chunk.length < BUFFER_SIZE
      ? new Uint8Array(BUFFER_SIZE).fill(0, chunk.length).set(chunk) || chunk
      : chunk;
  };
  let buffer = refill();
  let si = 0;
  const decoded = [];
  while (true) {
    if (si >= BUFFER_LIMIT) {                          // byte at SI=0xFFF lost
      if (filePos >= bytes.length) break;
      buffer = refill();
      si = 0;
    }
    const op = buffer[si++];
    if (op === 0x00) break;
    if (op < 0x80) {
      for (let i = 0; i < op; i++) decoded.push(buffer[si++]);
    } else {
      const count = 256 - op;
      const fill = buffer[si++];
      for (let i = 0; i < count; i++) decoded.push(fill);
    }
  }
  // ... then parse descriptor table from decoded[0..600]
}
```

The full implementation in `packages/parser/src/formats/pic.ts` handles the
out-of-buffer edge cases that arise mid-instruction (a LIT or RUN that
straddles the 0xFFF refill boundary reads 0s, matching the engine's
beyond-buffer behaviour).

## Validation via the parity harness

```bash
# Smoke test: mon11 should match the engine's runtime buffer byte-for-byte
python3 tools/parity/extract.py find tools/dosbox/save/1.sav --pattern '58 02 09 0d'
# → phys=0x0005b928

python3 tools/parity/extract.py dump tools/dosbox/save/1.sav \
    --offset 0x5b928 --length 24376 --output /tmp/engine-mon11.bin

pnpm tsx tools/parity/decode-pic.ts original/mon11.pic /tmp/ours-mon11.bin

python3 tools/parity/diff.py /tmp/engine-mon11.bin /tmp/ours-mon11.bin
# → BYTE-PERFECT MATCH: 24,376 bytes identical
```

Reproducible parity for additional monsters as save states get captured for
them.

## Research history

This format took several wrong turns before settling. The investigation log
includes:

1. The original "row-record RLE" hypothesis — the recurring 24-slot widths
   were misread as row stripes; they are actually mask-bit groupings inside
   sub-sprite descriptors.
2. The "skip = transparent slots" hypothesis — `op ≥ 0x80` was interpreted as
   a transparency-skip rather than a run-length fill. Refuted by the
   `ega.drv` disassembly (`rep stosb`, not a skip-forward).
3. The LIT-budget hypothesis (LIT counts saturated to a per-row budget) —
   investigated to explain 18/60 files that failed end-of-file decode.
   Refuted by bisection; the real cause is the 4 KB buffer-refill byte loss.
4. The multi-segment composition hypothesis — the trailing `0x00` bytes
   produced by naive whole-file decoding were interpreted as segment
   terminators, and the file as concatenated independent segments. Refuted by
   DOSBox-X save-state analysis: the bytes at `4096*N + 0xFFF` are never read
   by the engine, so they are not opcodes — they're lost during buffer
   refill. The file is a single continuous RLE stream.

All four hypotheses produced *partially* correct output for the most common
files (single-segment monsters under 4 KB encoded), which made the bug hard
to catch. The fix only became obvious after byte-comparing the engine's
runtime sprite buffer to a naive whole-file decode for mon11.

The full prior prose lives in git history; `git log --oneline -- docs/re/pic.md`
shows the investigation timeline.
