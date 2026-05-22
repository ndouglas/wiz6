# `.pic` loader — caller-side reference

**Status: SOLVED** (jointly with `pic.md`). This doc covers the *caller side*
of the .pic load path: which overlay functions invoke the EGA driver's
decoder, with what arguments, and what we know about the runtime wiring.

The decoder itself (ega.drv at file offset `0x1C25`, dispatch entry index 9)
is fully documented in [`pic.md`](pic.md). The "multi-segment" puzzle that
earlier versions of this doc tried to crack turned out not to exist: what
looked like multi-segment composition was a phantom produced by the engine's
4 KB buffer-refill byte-loss. See `pic.md` for the actual mechanism.

## Per-overlay call sites

Every `.pic` load in the engine routes through a near call to
**`wroot.exe:0xEE85`** (the cross-overlay decoder wrapper):

| Overlay     | Function entry | Call site | Purpose                                                |
| ----------- | -------------- | --------- | ------------------------------------------------------ |
| `wmele.ovr` | `0x0042`       | `0x014C`  | Combat sprite load (arg = `combatSpriteId`)            |
| `wmnpc.ovr` | `0x093A`       | `0x094A`  | NPC encounter sprite load                              |
| `wdopt.ovr` | `0x00F7`       | `0x0107`  | Options/menu sprite load                               |
| `winit.ovr` | `0x033A`       | `0x035F`  | Startup pre-load loop (mon00..monNN into N slots)      |
| `winit.ovr` | `0x0432`       | `0x0449`  | `credits.pic` load                                     |

All five sites use **identical arguments at the decoder boundary**:

```
push 0xE                ; dst_idx = 0xE (destination buffer slot)
push word [0x33f2]      ; file_offset_hi  (usually 0)
push word [0x33f0]      ; file_offset_lo  (usually 0)
push 0                  ; unused
push 0                  ; unused
push handle             ; DOS file handle
call 0xEE85             ; → wraps ega.drv dispatch entry 9 → 0x1C25
add sp, 0xC
```

Decompiled pseudocode (from `wmele.ovr`'s combat loader at `0x42`):

```c
void load_combat_sprite(int combat_sprite_id) {
    char fname[] = "MON00.PIC";
    fname[3] = '0' + (combat_sprite_id / 10);
    fname[4] = '0' + (combat_sprite_id % 10);
    int handle = open(fname);
    if (handle == -1) error(0xF);

    int rc = decode_pic(handle, 0, 0, /*offset=*/0, /*offset_hi=*/0,
                        /*dst_idx=*/0xE);
    if (rc != 0) error(0x10);

    close(handle);
}
```

Each loader makes **exactly one call** to the decoder per file. The decoder
runs end-to-end on the file (with internal 4 KB refills) and returns when it
hits the first `0x00` opcode. There is no per-segment loop; the file is one
continuous RLE stream.

## Calling convention

After the standard `push bp; mov bp, sp` prologue inside the decoder:

```
[bp+0x0C]   DOS file handle (word)
[bp+0x0E]   file offset, low word
[bp+0x10]   file offset, high word
[bp+0x12]   unused (caller pushes 0)
[bp+0x14]   unused (caller pushes 0)
[bp+0x16]   destination index (selects ES via driver-internal table)
```

`dst_idx = 0xE` is used for every `.pic` load. The driver's segment-lookup
table at `cs:0x17A + 2*dst_idx` resolves to the same destination buffer for
all sprite loads — a single shared sprite slot that the renderer (`0x1C94`)
then composites from.

## The 49-byte runtime patch

When `wroot.exe` loads the EGA driver into memory, it copies 49 bytes from
`wroot.exe:0x1B56..0x1B86` into the driver's runtime segment at
`driver_seg:[cs:0x1BCE]`. That block is small executable code (interleaved
`in`/`out` instructions, retf bytes) — a runtime stub that the loader
installs to compute the segment values used by the decoder
(`[cs:0x169]`, `[cs:0x17A]…`).

These segment values are therefore **runtime-determined** and not readable
from the static binary alone. To recover them, single-step the driver-load
sequence in DOSBox-X.

## The `combatSpriteId → mon??.pic` mapping

Confirmed at runtime via DOSBox-X file-open tracing (`tools/dosbox/wiz6.conf`
with `int21 = debug` + `tools/dosbox/parse-pic-opens.sh`):

```
combat_sprite_id N  →  mon{N:02}.pic
```

The mapping is computed inline at the call site as
`fname[3] = '0' + (N / 10); fname[4] = '0' + (N % 10);` — no lookup table.

See [`sprite-id-table.md`](sprite-id-table.md) for the field-by-field origin
of `combatSpriteId` in the scenario monster record.

## Notes for future work

Future RE on the loaders is mostly about the overlays, not `wroot.exe`. The
naming-pass output for `wroot.exe`
([`docs/re/findings/wroot-naming-pass.json`](findings/wroot-naming-pass.json))
covers the runtime / boot / windowing / file-I/O wrappers around these calls,
but the per-overlay loaders themselves still have generic `FUN_XXXX` names.

Worth-doing next:

- Apply a similar naming pass to each gameplay overlay (`wmele.ovr`,
  `wmexe.ovr`, `wmnpc.ovr`, `wmaze.ovr`, `wpcmk.ovr`, `wpcvw.ovr`), targeting
  combat/dungeon/character/NPC subsystems specifically.
- Trace the renderer's `script list` pointer (`[bp+0x1A]` to `0x1C94`) to see
  whether monster-frame selection uses fixed or RNG-driven indices.
