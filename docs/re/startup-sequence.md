# Wiz6 startup sequence — RE notes

**Status:** state machine mapped + cross-verified against working TS
reimplementation (`packages/parser/src/sim/intro-sequence.ts`). State
transitions, table layout, token mapping, scroll math, wall-clock pacing
all confirmed. DOSBox-X dynamic confirmation still pending for (a) the
comparator direction at `winit.ovr 0xCFB`, (b) sound-slot 13's alias_id
resolution, and (c) what `audio_play_sound(0xE)` actually produces given
the PIC-scratch overlap documented below. The state-1 deep-dive pass
(2026-05-23) is in [`findings/winit-state1-deep-dive.json`](findings/winit-state1-deep-dive.json)
and supersedes the earlier [`findings/winit-state1-audio.json`](findings/winit-state1-audio.json).

The startup → title → credits → main-menu flow lives in `winit.ovr`. It is
driven by a global state variable at wroot DGROUP **`0x363a`** (`game_state`)
which the outer dispatch loop in wroot.exe (`ovl_install_table` @ wroot
`0x132d`) consults each iteration to decide which `.ovr` to (re-)load. winit
itself handles four of these states: **0, 1, 2, 8**.

## Corrections from implementation cross-check (2026-05-22)

Building the TS port (`packages/parser/src/sim/intro-sequence.ts` +
`packages/viewer/src/pages/game/GameTitle.tsx`) and validating against the
user's lived recollection of the original game pulled several corrections
out of the first-pass RE. These are documented inline in the relevant
sections below; in summary:

- **Tokens in the scroll table are 1-indexed** into the loaded `credits.pic`
  descriptors. Token `N` renders descriptor `N-1`. Visual verification: `token=7`
  rendered descriptor 6 = Wizardry logo top.
- **Clamp condition was inverted.** Correct: clamp applies to `i < 3 || i == 8`
  (entries 0, 1, 2, 8 — persistent header + finale). Original agent reading
  said `i >= 3 && i != 8`, which would have credit panels stack at cap instead
  of sliding through.
- **Cull comparator was reversed.** Correct: skip when `y < cap` (entry has
  slid above its rest position). Original pseudocode said `y > cap`. The agent
  flagged the comparator at `winit.ovr 0xCFB` with `???`; the inverse reading
  is what produces actual observed behavior.
- **Coordinates are absolute screen pixels**, not window-relative to the
  UI window opened in step 9.
- **Wall-clock pacing**: 126 scroll frames × engine's calibrated busy-wait
  ≈ 6 sec on a 486DX/33. The port's 3:1 RAF:sim ratio lands at ~6.3 sec —
  accidental parity. See "Wall-clock pacing" section below.

## Lessons for future overlay RE

1. **Comparator direction is a common bug.** When disasm can't distinguish
   `JL` vs `JG` / `JLE` vs `JGE`, mark `confidence: low` and verify behavior
   in DOSBox-X before publishing pseudocode that downstream code will copy.
2. **Off-by-one in index-shaped fields.** Engine "tokens" / "IDs" that look
   like descriptor indices may be 1-indexed with 0 as a sentinel. Visual
   cross-check is fast confirmation.
3. **Wall-clock parity ≠ byte parity.** Engine frame *counts* translate
   cleanly to the port; frame *durations* don't, because they're calibrated
   to original-CPU speed via busy-wait loops at boot.
4. **The thunk-delta law (`thunk_addr = wroot_file_offset + 0xBA9C`)**
   discovered during this pass applies to all overlays. See findings JSON.

## State machine

```
                          ┌──────────────────────────────────────┐
                          │                                      │
                          ▼                                      │
   ┌────────────┐   1   ┌─────────────┐   2   ┌──────────────┐   │   4
   │  state 0   │──────▶│  state 1    │──────▶│  state 2     │───┼──▶ (wbase.ovr)
   │ load disk  │       │ title +     │       │ load fonts + │   │     main menu
   │ headers    │       │ credits     │       │ create UI    │   │
   └────────────┘       └─────────────┘       │ windows      │   │
                                              └──────────────┘   │
                                                                 │
                                                              2  │
                                              ┌──────────────┐   │
                                              │  state 8     │───┘
                                              │  graveyard   │
                                              │  (TPK)       │
                                              └──────────────┘
                                                     ▲
                                                     │ 8 (from wmaze.ovr)
```

After state 2 hands off, wroot loads `wbase.ovr` (state 4 = main menu) and
ultimately `wmaze.ovr` (states 5/6/17 = in-dungeon gameplay). Total-party-kill
in `wmaze.ovr` writes `*0x363a = 8`, which causes wroot to re-load winit for
the graveyard sequence.

## Overlay entry point

`winit.ovr` begins with a 12-byte header (file offsets `0..0x0B`) — most likely
an MS overlay-link relocation header. The actual entry code is at file offset
**`0x0C`**:

```asm
0x0c: pop  bp                  ; clean up far-call frame
0x0d: push di
0x0e: mov  ax, [0x363a]        ; game_state
0x11: jmp  short 0x27          ; skip past the jump table
; --- 4 dispatch arms ---
0x13: call 0x525   ; → state 0 handler
0x16: jmp  short 0x3b
0x18: call 0x9f3   ; → state 1 handler
0x1b: jmp  short 0x3b
0x1d: call 0xdf6   ; → state 8 handler
0x20: jmp  short 0x3b
0x22: call 0xf43   ; → state 2 handler
0x25: jmp  short 0x3b
; --- comparison cascade ---
0x27: cmp  ax, 0  /  jz 0x13   ; state 0
      cmp  ax, 1  /  jz 0x18   ; state 1
      cmp  ax, 2  /  jz 0x22   ; state 2
      cmp  ax, 8  /  jz 0x1d   ; state 8
0x3b: mov  ax, 0
0x3e: ret
```

States other than 0/1/2/8 fall through, return 0, and the outer wroot loop
re-dispatches based on (possibly-updated) `*0x363a`.

## State 0 — `winit_state0_load_master_hdr` (file 0x525)

Opens MASTER.HDR / DISK.HDR (filename pointer at runtime address `0x501c`),
reads 0x19E bytes into the buffer at `0x33F8`, then dispatches via
`repne scasw` over an 11-entry table at runtime address `0x4B3A` keyed by the
byte at `0x3595`. Each entry has a code pointer at `[match + 0x12]`.

The 11 key values are stored as a static byte sequence at file offset
`0x5D6..0x5EB`: `00 00 01 00 02 00 03 00 04 00 05 00 06 00 07 00 08 00 FF 00 FA 00`.
The corresponding code pointers begin at file offset `0x5EC` (still to be
mapped).

**Transition:** writes `*0x363a := 1` at file offset `0x8ED`, then returns.

## State 1 — `winit_state1_title_and_credits` (file 0x9f3)

The big one — the title page and scrolling credits.

1. `kbd_flush_buffer` (thunk `0xe2a8` → wroot `0x280c`).
2. `winit_load_pic_by_index(0x27)` (PIC index 39 — almost certainly **CREDITS.PIC**, the credit-scroll glyphs, not TITLEPAG). The huffman-decompress call inside this routine is invoked with `slot=0xE`, writing the decoded byte stream to `*(0x3579+14*4) = *(0x35B1)` AND writing the 12-byte kind=9 master-archive record to DGROUP `0x33EC`. Both addresses overlap the sound system's slot-14 storage — see § "The slot-14 PIC-scratch overlap" below.
3. Open `SOUND00.SND` via filename pointer at `0x513A`; read into buffer `0x51AA`; close. (This is a one-off pre-load distinct from the slot-table preload that ran in state 0.)
4. Video-mode dispatch on flag word `*0x4FC6`:
   - bit 0 → render PIC `TITLEPAG.EGA` at winit DGROUP `0x5146`
   - bit 1 → `TITLEPAG.CGA` at `0x5153`
   - bit 2 → `TITLEPAG.T16` at `0x5160`
   - bit 3 → `TITLEPAG.HRC` at `0x516D`
   - else `abort(0xC)`
5. Initialize local skip-flag (`[BP-0x72]` = 0).
6. `audio_play_sound(4)` at file `0xac2` — fires as Sir-Tech splash becomes visible.
7. `if (!skip) skip += winit_wait_ticks_or_enter(2)`: short wait.
8. `audio_play_sound(0xD)` at file `0xadb` — fires before "D.W. Bradley" credit renders.
9. Open the title-screen UI window (`*0x4FBE`), draw two text tokens (positions hard-coded), refresh.
10. `if (!skip) skip += winit_wait_ticks_or_enter(0x48)`: long wait (~720 delay units). Title page holds visible.
11. Page clear: `f118(-1)` clears window, `f13c` refreshes (screen blanks). `audio_play_sound(0xE)` at file `0xb43`.
12. `wait(10)`.
13. `audio_play_sound(6)` at file `0xb5c`.
14. Render the "Wizardry VI" / "Bane of the Cosmic Forge" header tokens.
15. Refresh.
16. `audio_play_sound(7)` at file `0xb90`.
17. `wait(10)`.
18. Initialize the credit-scroll entry array (9 entries × 5 fields each, stored on stack).
19. Enter scroll loop (file `0xC9D..0xD6D`) — see below.
20. After scroll: draw the "PRESS ANY KEY" / final text tokens, destroy the overlay window.
21. **Transition:** writes `*0x363a := 2` at file offset `0xDC4`.
22. Post-scroll wait with **inverted semantics**: if the user skipped earlier, do a brief timed wait (~28 delay units) absorbing any buffered input; if the user watched to completion, poll mouse+keyboard *indefinitely* until any input. UX-correct — a skipper has signaled "advance now" and shouldn't be made to wait; a watcher gets to admire the final scroll-page state for as long as they like.
23. `kbd_flush_buffer` and return.

### Audio mapping — RE-pass call sites vs what actually plays

Two reverse-engineering passes converged on the five `audio_play_sound` call sites and their N arguments (file offsets + byte patterns verified across both). What's audibly produced for three of those calls turned out to *not* be the SOUND&lt;NN&gt;.SND file that matches N — see [`findings/winit-state1-deep-dive.json`](findings/winit-state1-deep-dive.json):

| Step | File offset | N      | Nominal file | What actually plays                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ----------- | ------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6    | `0xac2`     | `0x04` | SOUND04.SND  | SOUND04.SND ✓ (slot 4 preloaded; user-confirmed "door click")                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 8    | `0xadb`     | `0x0D` | SOUND13.SND  | Almost certainly **aliased**. Slot 13 is preloaded, but the user reports SOUND13 is wrong — most likely master.hdr record 13 has `buf_lo == buf_hi == 0` triggering the `alias_id` redirect to a different slot. Hypothesis: aliases to slot 5 → **SOUND05.SND** ("pow"). Dynamic verification pending.                                                                                                                                                                                                               |
| 11   | `0xb43`     | `0x0E` | SOUND14.SND  | **NOT SOUND14.SND** — settled. Slot 14's descriptor at DGROUP `0x33EC` is the same memory as the PIC-loader scratch buffer (step 2 above). At the moment this call fires, slot 14's "descriptor" is PIC #0x27's master-archive record, and the sample-buffer pointer points to decoded CREDITS.PIC bytes. Audio engine plays garbage PCM-from-PIC, or hits the "rate_or_vol == 0" silence path. User-reported it sounds like a "whoosh" — could be PIC bytes interpreted as audio, or an inadvertent alias to slot 6. |
| 13   | `0xb5c`     | `0x06` | SOUND06.SND  | SOUND06.SND (likely direct, slot 6 preloaded; user-confirmed "whoosh")                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 16   | `0xb90`     | `0x07` | SOUND07.SND  | SOUND07.SND (likely direct, slot 7 preloaded; user-confirmed "clang" landing with logo)                                                                                                                                                                                                                                                                                                                                                                                                                               |

`winit_preload_sounds(14)` at winit `0x291` was confirmed to use a `JGE` comparator at `0x381` (loop bound `i < 14`, exclusive). Slots 0..13 are preloaded; slot 14 is intentionally outside the loop. The original engine designers either treated slot 14 as scratch space (which the PIC loader then reused) or this was an unintentional collision that just-happened-to-work because the resulting playback is short and inoffensive. Either way it's been like this since 1990.

### The slot-14 PIC-scratch overlap

`docs/re/findings/winit-state1-deep-dive.json#slot-14-pic-scratch-aliasing` (confidence: high).

The sound table at DGROUP `0x3344` is exactly 14 slots × 12 bytes = 168 bytes, ending at `0x33EC`. The PIC-loader scratch buffer starts at `0x33EC`. There is no defensive bound in `audio_play_sound` (wroot image `0x10AAA`) that detects this — when called with N=0xE it reads the 12 bytes at `0x33EC` as a sound descriptor and follows the buffer pointer at `0x3579+14*4` into whatever PIC bytes are currently decoded there. This is not designed aliasing through the `alias_id` field; it's a hard memory collision that produces undefined audio output.

The user reports the audible result sounds like a "whoosh" between the page-clear and the SOUND06 "whoosh" they identified as the next beat — possibly the same sound aliased twice, possibly different garbage that's incidentally similar. Without dynamic verification it's impossible to say from static analysis alone.

### Port wiring (`packages/viewer/src/pages/game/GameTitle.tsx`)

After the deep-dive findings, the viewer was rewired to match user-by-ear playback rather than the original RE-pass mapping:

- `pause-pre-sirtech → sirtech-splash` plays **SOUND04** (door click). ✓ matches engine.
- `pause-between → bradley-splash` is **unwired** — no confirmed sound for this transition. Engine fires `audio_play_sound(0xD)` which likely aliases; once dynamic verification settles what it plays we'll wire that.
- `pause-pre-scroll → title-hold` plays **SOUND05 → SOUND06 → SOUND07** in rapid succession (180 ms intervals via `setTimeout`), so the clang lands approximately as the Wizardry wordmark visually appears. This is the three-beat reveal sequence the user identified by ear; it corresponds to engine calls N=0xE, N=6, N=7 fired close together in the page-clear → header-reveal → scroll-start window.

The audible result matches the user's recollection of the original DOS game. The byte-faithful path (firing exactly what `audio_play_sound(0xE)` produces from PIC-scratch garbage) was rejected as cosmetic-fidelity-not-mechanical-fidelity.

### The credit scroll

The "scroll" is not a VGA register hack — it is a **per-frame redraw** with
each entry positioned at a Y-coordinate that decreases over time. The scroll
counter (`[BP-0x2]`) increments by 2 per frame.

Each of 9 entries has 5 fields:

| Field |       Offset | Description                                                                                         |
| ----: | -----------: | --------------------------------------------------------------------------------------------------- |
|    F1 | `BP-0x1c-2i` | **1-indexed** descriptor number into the loaded `credits.pic` (values: 7, 8, 0xc, 1, 2, 3, 4, 5, 6) |
|    F2 | `BP-0x30-2i` | column position (absolute screen X, not window-relative)                                            |
|    F3 | `BP-0x44-2i` | `appear_tick` (scroll-position at which entry becomes visible)                                      |
|    F4 | `BP-0x58-2i` | `field_b` (initial Y when entry first appears)                                                      |
|    F5 | `BP-0x6c-2i` | `cap` (target/minimum Y where entry rests)                                                          |

Initial values (entries 0..8):

|    i | F1 (token) | desc # | content                          | F2 (col) | F3 (appear) | F4 (field_b) | F5 (cap) |
| ---: | ---------: | -----: | -------------------------------- | -------: | ----------: | -----------: | -------: |
|    0 |          7 |      6 | Wizardry logo (top)              |     0x4c |           0 |         0x43 |        3 |
|    1 |          8 |      7 | Wizardry logo (bottom)           |     0x4c |           0 |         0x63 |     0x23 |
|    2 |       0x0C |     11 | header decoration (cave/scenery) |     0x08 |           0 |         0x0D |     0x0D |
|    3 |          1 |      0 | "Written and Programmed by …"    |     0x14 |           4 |         0x90 |     0x0D |
|    4 |          2 |      1 | "Computer Graphics …"            |     0x14 |     0x24=36 |         0x90 |     0x0D |
|    5 |          3 |      2 | "Suzanne Snelling …"             |     0x14 |     0x3c=60 |         0x90 |     0x0D |
|    6 |          4 |      3 | "PlayMaster's Guide …"           |     0x14 |     0x58=88 |         0x90 |     0x0D |
|    7 |          5 |      4 | "Digitized Sound Programming …"  |     0x14 |    0x78=120 |         0x90 |     0x0D |
|    8 |          6 |      5 | "Copyright 1990 by Sir-Tech"     |     0x0E |    0x98=152 |         0x50 |     0x50 |

The token values in F1 are **1-indexed** into the loaded `credits.pic` descriptor
list — verified by direct visual cross-check during port implementation. Token
`N` renders descriptor `N-1`. (Sentinel value 0 likely means "no token / end of
list"; no entry uses it.)

Per-frame render formula (**corrected** — the agent's first-pass pseudocode
inverted the clamp set and the cull comparator; this version produces the
actual user-observed behavior):
```
for i = 8 down to 0:
    if (entry[i].appear > scroll_pos) continue          # not yet visible
    y = entry[i].field_b - (scroll_pos - entry[i].appear)
    if (i < 3 || i == 8):                               # CLAMPED set
        if (y < entry[i].cap) y = entry[i].cap          # clamp to rest position
    else:
        if (y < entry[i].cap) continue                  # past rest, hide
    render_descriptor(entry[i].token - 1, entry[i].col, y)
scroll_pos += 2
```

The clamp set is `{0, 1, 2, 8}` — the persistent header pieces (Wizardry logo
top + bottom, header decoration) plus the copyright "finale" that locks at
`y=cap` for the end of the scroll. Entries 3..7 are the credit panels that
slide from `fieldB` up through `cap` and disappear.

The original agent pseudocode said clamp applies to `i >= 3 && i != 8` and
cull on `y > cap`; the comparator at `winit.ovr 0xCFB` was marked uncertain
(`???`). The corrected interpretation above is the inverse — likely a single
`JL` ↔ `JG` confusion in the disasm read. **This is the kind of low-confidence
RE finding that's worth re-verifying via DOSBox-X breakpoint trace.**

The scroll terminates when `entry[7].appear + entry[7].field_b - entry[7].cap > scroll_pos`
becomes false — i.e., `scroll_pos >= 0x78 + 0x90 - 0x0D = 0xFB = 251`.
With `scroll_pos += 2` per frame, the scroll runs for **126 frames** maximum.

Input handling inside the scroll loop:
- mouse poll (`mouse_read_state_or_zero` thunk `0xc6de` → wroot `0xc42`): non-zero → set continue_flag = 0
- kbd_check (`kbd_check_with_filter` thunk `0xe0df` → wroot `0x2643`): if hit, also consumes one key via `kbd_getkey_with_filter` and sets continue_flag = 0

Either input source ends the scroll early.

### Coordinate convention

The `col` and `y` fields in the scroll table are **absolute screen coordinates**
in engine pixels (320×200), not relative to the title-screen UI window opened
in step 9 (handle `*0x4FBE`). The window opens but the renderer's text-driver
takes absolute screen offsets. Caution: this pattern may not hold for other
overlays — combat-window draws etc. may be window-relative.

### Wall-clock pacing

The engine paces the scroll via `delay_one_unit` (wroot `0x2858`), a busy-wait
loop calibrated by CRT startup against the target CPU. On a 486DX/33 the
effective frame rate was probably ~20 Hz (not 60 Hz). So:

- Engine: 126 frames × ~50 ms/frame ≈ **6 seconds** wall-clock on original
  hardware.
- Modern port: 126 frames × 3 RAFs/frame ÷ 60 RAFs/sec = **6.3 seconds**.

The port's slowdown ratio of 3 (`SCROLL_RAF_STEP_RATIO` in
`packages/parser/src/sim/intro-constants.ts`) was tuned by feel — but it lands
remarkably close to the engine's wall-clock pace on its target CPU. **Lesson
for future RE: engine "tick" counts translate to wall-clock cleanly only
after accounting for busy-wait calibration. The bytes are exact; the seconds
depend on hardware.**

### Port-side deviations from the engine

The TS reimplementation in `packages/parser/src/sim/intro-sequence.ts`
diverges from the engine table in one place, deliberately:

- **Entry 8's `fieldB` is overridden from `0x50` (80) to `0x90` (144)** so
  the copyright "Copyright 1990 by Sir-Tech" slides in from below like the
  other credit panels before clamping at `cap=80`. The engine table's
  `fieldB == cap == 80` would render the copyright instantly at its rest
  position with no slide-in. The user's lived recollection of the original
  game has it sliding in — possibly an illusion-of-motion effect from the
  surrounding panels, possibly a subtle engine behavior we haven't captured
  here. Either way, the deviation is documented in `intro-constants.ts`.

## State 2 — `winit_state2_init_fonts_windows` (file 0xf43)

The init driver. Roughly:

1. Zero 10 bytes at `0x432C` and `0x4322` (per-party-slot state).
2. Call `winit_load_font_table_entry` 7 times with args `(3,0), (1,1), (2,2), (7,3), (4,7), (5,8), (6,9)` — these load WFONT0..WFONT4, MAZEDATA, and one more entry (likely the portrait table) via the per-font table at `0x36DE` (entries are `0x13A` bytes each).
3. Video-mode dispatch on `*0x4FC6` → call `winit_show_pic_in_window` with one of `0x51AE, 0x51BB, 0x51C8, 0x51D5` (the TITLEPAG.{EGA|CGA|T16|HRC} filenames per video mode).
4. Create 6 UI windows via `ui_window_create` (thunk `0xbbb6` → wroot `0x11a`), storing handles in `0x4FB6, 0x4FBA, 0x4FB8, 0x3342, 0x4FB2, 0x4FBC, 0x4FAC`. These are the status bar, party panels, message window, and screen-overlay window.
5. Init the encounter table (zero `0x303E`, `0x43CE`, `0x43DC..0x43E8`, `0x4330..0x4333`, `0x4326..0x4329`).
6. Set `*0x363A := 4` (transition to wbase.ovr / main menu).

## State 8 — `winit_state8_graveyard` (file 0xdf6)

Party-dead recovery:

1. Free `*0x4FA8` and `*0x4FAA` (maze-data buffers) via `ui_window_free_struct` thunk `0xf5bc` → wroot `0x3b20`.
2. Zero `*0x43CE` (party_size).
3. Destroy 8 UI windows (the handles created in state 2).
4. `winit_load_pic_by_index(0x22)` — file index `0x22` = `34` = **GRAVEYRD.PIC** (per the string order in winit.ovr's data section).
5. Video-mode dispatch on `*0x4FC6` → call `winit_show_pic_in_window` with one of `0x517A, 0x5187, 0x5194, 0x51A1` (GRAVEYRD.{EGA|CGA|T16|HRC}).
6. `call 0xc546(0xe)` — blit/refresh.
7. Wait loop: poll `mouse_read_state_or_zero` + `kbd_check_with_filter` until either non-zero.
8. Set `*0x363A := 2` (transition back to init).

## Timing primitives

### `winit_wait_ticks_or_enter` (FUN_0000_09ae, file 0x9AE)

```c
int winit_wait_ticks_or_enter(int n) {
    n *= 10;                              // multiplier
    while (n > 0) {
        if (kbd_check_with_filter(1) != 0 && kbd_getkey_with_filter(1) == '\r')
            return 1;                     // ENTER pressed → "skip"
        delay_one_unit();                 // wroot 0x2858
        n--;
    }
    return 0;                             // timed out
}
```

### `delay_one_unit` (wroot FUN_1000_2858)

CPU-speed-calibrated busy wait. Inner loop runs `*(CS:0x1FE2)` decrements
comparing against `*(0x206B)` (typically 0). Outer loop runs `*(CS:0x1FE4)`
passes, each subsequent inner pass taking a full 0x10000 iterations.

```asm
MOV CX, [CS:0x1fe2]
MOV DX, [CS:0x1fe4]
.inner:
    SUB CX, 1
    JNZ .nop
    NOP
.nop:
    CMP CX, [BX]           ; BX = 0x206B
    JNZ .inner
    CMP DX, [BX]
    JZ .done
    DEC DX
    JMP .inner
.done:
    RET
```

The constants `*(0x1FE2)` and `*(0x1FE4)` are calibrated at startup by the C
runtime (Microsoft's standard 80x86 delay calibration). On a 286 / 386SX they
should give one full call ≈ 1/100 sec; faster CPUs scale proportionally. To
get exact values, capture a DOSBox-X memory snapshot post-startup.

## Cross-overlay function thunks

Every cross-overlay call in winit (and by extension all the other `.ovr`
overlays) goes through a fixed-address thunk in the overlay segment. The
overlay loader patches these thunks with JMP/CALL stubs pointing to the
corresponding wroot function. The mapping rule discovered during this
investigation:

> **thunk_address = wroot_file_offset + 0xBA9C**

That is, a winit instruction `CALL 0xBBB6` resolves at runtime to wroot's
function at file offset `0xBBB6 - 0xBA9C = 0x011A` = `ui_window_create`.

Selected verified mappings (sorted by thunk address):

| Thunk  | Wroot file | Wroot name                                      |
| ------ | ---------: | ----------------------------------------------- |
| 0xBB71 |     0x00D5 | `abort_with_code`                               |
| 0xBBB6 |     0x011A | `ui_window_create`                              |
| 0xBD6E |     0x02D2 | `ui_window_destroy`                             |
| 0xC31E |     0x0882 | (file table lookup by kind+idx)                 |
| 0xC43F |     0x09A3 | (alt. wait-ticks-or-enter)                      |
| 0xC497 |     0x09FB | `ui_window_redraw_focused`                      |
| 0xC546 |     0x0AAA | (UI animation helper)                           |
| 0xC6DE |     0x0C42 | `mouse_read_state_or_zero`                      |
| 0xC71E |     0x0C82 | `strncpy_until_delim`                           |
| 0xC772 |     0x0CD6 | `boot_build_prompt_message` (filename resolver) |
| 0xC7C2 |     0x0D26 | `boot_prompt_swap_disk_and_load`                |
| 0xDC57 |     0x21BB | `load_font_or_portrait`                         |
| 0xE0DF |     0x2643 | `kbd_check_with_filter`                         |
| 0xE1C0 |     0x2724 | `kbd_getkey_with_filter`                        |
| 0xE2A8 |     0x280C | `kbd_flush_buffer`                              |
| 0xE2F4 |     0x2858 | `delay_one_unit` (timing primitive)             |
| 0xE421 |     0x2985 | `load_misc_table`                               |
| 0xED5A |     0x32BE | `ui_window_clear`                               |
| 0xEE85 |     0x33E9 | `huffman_load_and_decompress`                   |
| 0xF0DC |     0x3640 | `kbd_pre_input_disk_check`                      |
| 0xF100 |     0x3664 | video-driver thunk (call *0x1BAE)               |
| 0xF118 |     0x367C | video-driver thunk (call *0x1BB6)               |
| 0xF124 |     0x3688 | video-driver thunk (call *0x1BBA)               |
| 0xF130 |     0x3694 | video-driver thunk (call *0x1BBE)               |
| 0xF13C |     0x36A0 | video-driver thunk (call *0x1BC2)               |
| 0xF3AA |     0x390E | `strcpy`                                        |
| 0xF5BC |     0x3B20 | `ui_window_free_struct`                         |
| 0xF924 |     0x3E88 | `crt_open`                                      |
| 0xFD6F |     0x42D3 | `crt_read_via_fd`                               |
| 0xFDA5 |     0x4309 | `crt_dos_close`                                 |

The 5 video-driver thunks at `0xF100..0xF13C` all dispatch via function
pointers in wroot's CS at fixed slots `0x1BAE..0x1BC2`. The `ega.drv` /
`cga.drv` / etc. driver-load process must populate these — they correspond to
the driver's exported dispatch table.

## Key DGROUP state variables

|               Address | Purpose                                                             |
| --------------------: | ------------------------------------------------------------------- |
|                0x363A | `game_state` (master state machine)                                 |
|                0x363C | current zone id (per wmaze findings)                                |
|                0x3592 | boot disk kind/letter byte                                          |
|                0x3594 | boot config flag byte                                               |
|                0x3595 | boot dispatch key (read by state 0)                                 |
|                0x33EC | pic filename buffer (output of file-resolver)                       |
|             0x33F0/F2 | pic file offset (lo/hi)                                             |
|                0x33F8 | master.hdr read buffer (0x19E bytes)                                |
|                0x4336 | last-loaded PIC file index                                          |
|                0x43CE | party_size (0..6)                                                   |
|             0x4FA8/AA | maze-data buffer pointers (freed in graveyard)                      |
|                0x4FBE | win_handle_titlescreen (overlay window for title/credits/graveyard) |
| 0x4FB0/AC/B6/BA/B8/BC | other window handles created in state 2                             |
|                0x4FC6 | video_mode_flags (bits 0=EGA, 1=CGA, 2=T16, 3=Hercules)             |

## Confidence summary

| Element                                                            | Confidence                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| State machine (0/1/2/8 and transitions)                            | HIGH — direct disasm + state-var writes                                   |
| Overlay entry dispatch table at 0x0C                               | HIGH — raw byte trace                                                     |
| Credits scroll mechanism                                           | HIGH — full per-frame loop traced                                         |
| `winit_wait_ticks_or_enter` semantics                              | HIGH — small function, clearly decompiled                                 |
| Wall-clock timing of one `delay_one_unit` call                     | MEDIUM — busy-wait calibration constants unknown; needs DOSBox-X snapshot |
| Specific file index → filename for state-1 PIC load (0x27)         | MEDIUM — mechanism clear; dynamic trace needed for exact filename         |
| Specific file index for state-8 (0x22 = GRAVEYRD)                  | HIGH — string-order matches                                               |
| Token semantics (0x97c's first arg: msg-ID, glyph-ID, or tile-ID?) | LOW — mechanism clear, semantic unconfirmed                               |
| Thunk-delta law (BA9C offset)                                      | HIGH — multiple verified mappings                                         |
