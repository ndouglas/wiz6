# Wiz6 main menu (`wbase.ovr`) — RE notes

**Status:** State machine mapped, all 9 main-menu option handlers identified
and named, asset-loading path traced. Per-option text labels are HYPOTHESIZED
from behavior — see "Open questions" below. Sibling sub-state at 0x18
(configuration submenu) was identified but its 9 inner options weren't
fully decoded in this pass.

This continues the overlay RE pass started in:

- [`wroot-functions.md`](wroot-functions.md): wroot.exe, 75 named (boot,
  windowing, I/O, file table).
- [`wmaze-functions.md`](wmaze-functions.md): wmaze.ovr, 68 named (dungeon
  traversal).
- [`startup-sequence.md`](startup-sequence.md): winit.ovr, 16/16 named
  (title/credits, graveyard).

`wbase.ovr` is the **front-end menu hub** — entered from winit's state-2
init (`*0x363a := 4`) and re-entered after gameplay ends. It's also reached
on state 7 (post-gameplay cleanup) and state 0x18=24 (game configuration
submenu).

## Overlay header — 14 bytes (not 12)

```
file 0x00: f2 00 72 45 d2 39 ee 4f 72 00 1a 01 9f 7e
                                                ↑ entry-dispatch starts at file 0x0e
```

`wbase.ovr`'s overlay header is **14 bytes**, not 12 like `winit.ovr`. Bytes
0x0c..0x0d (`9f 7e`) do not disassemble into anything coherent — they appear
to be an extension of the relocation header. Real entry-dispatch code starts
at file offset **0x0e**.

We still name the function at 0x0c `wbase_overlay_entry` for consistency
with winit (and because Ghidra's analyzer wouldn't recognize a function
entry mid-stream at 0x0e without help).

## State machine

`wbase.ovr` handles **three** game-state values:

```
                        ┌───────────────┐
                        │ wroot         │
                        │ ovl_install   │
                        │ _table (0x132d)│
                        └───────┬───────┘
                                │
                  ┌─────────────┼─────────────┐
                  ▼             ▼             ▼
            ┌─────────┐   ┌──────────┐   ┌──────────┐
            │ state 4 │   │ state 7  │   │state 0x18│
            │  main   │   │post-game │   │ config   │
            │  menu   │   │ cleanup  │   │ submenu  │
            └────┬────┘   └────┬─────┘   └────┬─────┘
                 │             │              │
       ┌─────────┼─────────────┼───┐          │
       ▼         ▼             ▼   ▼          ▼
     state 3   state 1    state 0x10  state 0x11
     (QUIT)   (winit       (WPCMK)    (WPCVW)
              title)
```

### Entry dispatch (file 0x0e)

```asm
0x0e: cmp word [0x363a], 7    ; state 7?
0x13: jnz +3
0x15: call 0x2de1             ; → wbase_state7_post_gameplay_cleanup
0x18: cmp word [0x363a], 4    ; state 4?
0x1d: jnz +3
0x1f: call 0x2b36             ; → wbase_state4_main_menu
0x22: cmp word [0x363a], 0x18 ; state 24?
0x27: jnz +9
0x29: call 0x3151             ; → wbase_state18_config_submenu
0x2c: mov  ax, [0x4fce]       ; ← only executed if state was 7 or 4 (or no match)
0x2f: mov  [0x363a], ax       ;   copy "pending next state" into game_state
0x32: mov  ax, 0
0x35: ret
```

Two key differences from winit's dispatch:

1. **The dispatch is `cmp+jnz` cascade, not `cmp+jz`** — every state that
   matches gets called, then falls through to the next test (since the
   handler sets game_state to a non-matching value before returning).
2. **The deferred-transition mechanism via `*0x4fce`.** State 4 and state 7
   handlers don't write `*0x363a` directly; they write `*0x4fce`, and the
   entry dispatch's tail copies `*0x4fce` → `*0x363a`. State 0x18 manages
   its own `*0x363a` write (the `jnz +9` skips the copy after its call).

This means tracing main-menu state transitions requires looking at BOTH
`*0x363a` and `*0x4fce` writes.

### State 4 — main menu (`wbase_state4_main_menu` @ 0x2b36)

The MASTER OPTIONS screen. Per-frame: render decoration, run input loop,
dispatch on selection.

**Prelude (one-shot, at function entry):**

1. `load_msg_into_buf(0x3e8, buffer at 0x5066)` — load msg #1000 into a
   filename-style buffer in wroot's DGROUP. Likely a filename for
   subsequent asset loads.
2. `wbase_load_font_table_entry(8, 4)` — load font-table entry 4 of kind 8.
   This is the same `kind=8` that winit uses for `WFONT*`/`MAZEDATA`, but
   index 4 here resolves to the **MON08.PIC** menu decoration (castle
   gates + red figure art).
3. Zero `*0x5060` (animation tick), `*0x3646` (animation parity).
4. Clear windows `*0x4fba`, `*0x4fb8` (status bar / message window).
5. For each existing party member, call `FUN_1b2d(i)` — draws party-panel.
6. Re-clear `*0x4fba` / `*0x4fb8`.
7. `wbase_menu_init_decoration()` — primes the descriptor-render state for
   the animated gates+figure decoration.
8. Set initial cursor offset `uStack_c := 3` (or 0 if party_size >= 6).
9. Set `*0x363a := 0xffff` (sentinel: "still in menu loop").

**Main loop (until `*0x363a >= 0`):**

```
while (int16)*0x363a < 0:
    wbase_render_banner_label(0x3e9)           # "MASTER OPTIONS"
    ui_window_redraw_focused(*0x4fb2)
    listwin = ui_window_create(0x13, 0x28, 5, 0xf, ...)
    ui_window_clear(listwin, 0x20, 3)
    options[0..8] = 1                          # all enabled
    options[9] = 0xffff                        # terminator
    # apply enable rules — see "Option enable rules" below
    init_cursor = wbase_menu_count_enabled_options(options, uStack_c)
    selection = wbase_menu_select_loop(listwin, 0x3ea, options,
                                        x=2, y=1, dy=0x13, cols=4,
                                        highlight_attr=5, init_cursor)
    ui_window_destroy(listwin)
    dispatch via inline jump table → option handler @ {0..8}
```

The menu select loop (`wbase_menu_select_loop` @ 0x25c) is the same generic
widget that `wmaze.ovr` uses (compare to `FUN_1574` in wmaze findings).
It renders enabled options as text labels (msg ID `base + slot_index`),
runs a navigation loop on keys 1=up/2=left/3=down/4=right/5=ENTER, and
returns the original option index that was selected. Mouse click directly
on a menu item is also handled, via the `*0x4fc4` flag set by
`wbase_menu_poll_input`.

### Option enable rules

The options array is initialized all-enabled then filtered:

| Slot | Default | Disable conditions                                                                               |
| ---- | ------- | ------------------------------------------------------------------------------------------------ |
| 0    | 0       | (overridden) enabled only if scan over `*0x4fd8[..*0x4fd2]` finds a byte == 1 AND party_size < 6 |
| 1    | 1       | party_size < 1                                                                                   |
| 2    | 1       | party_size < 1                                                                                   |
| 3    | 1       | party_size < 2                                                                                   |
| 4    | 1       | party_size >= 1                                                                                  |
| 5    | 1       | (always enabled)                                                                                 |
| 6    | 1       | (always enabled)                                                                                 |
| 7    | 1       | (always enabled)                                                                                 |
| 8    | 1       | (always enabled)                                                                                 |

For a **first-launch, no-party** state with PCFILE.DBS containing unloaded
characters, slots {0, 4, 5, 6, 7, 8} = 6 options are visible — matching
the user-supplied screenshot.

### The dispatch jump table

After `wbase_menu_select_loop` returns the selected slot index, the
function does (at file 0x2dd5):

```asm
cmp ax, 9             ; option count
jae 0x2dda            ; fallthrough back to loop top
xchg bx, ax
shl bx, 1
jmp word ptr cs:[bx + 0x731f]
```

The runtime address `0x731f` is **beyond the file end** (0x3a52) — it's in
the overlay's BSS area. But the table CONTENTS are stored **inline in the
file at offset 0x2dbb**, mapped via a constant delta:

> **runtime_addr = file_offset + 0x4564** (for data references inside `wbase.ovr`)

Verified for the main-menu jump table:

| Slot | runtime word at 0x731f+slot×2 | = file offset | Handler                            |
| ---- | ----------------------------- | ------------- | ---------------------------------- |
| 0    | 0x725b                        | 0x2cf7        | `wbase_option0_add_party_member`   |
| 1    | 0x726d                        | 0x2d09        | `wbase_option1_choose_leader`      |
| 2    | 0x7291                        | 0x2d2d        | `wbase_option2_character_menu`     |
| 3    | 0x72c1                        | 0x2d5d        | `wbase_option3_unload_then_load`   |
| 4    | 0x72ee                        | 0x2d8a        | `wbase_option4_resume_saved_game`  |
| 5    | 0x72b5                        | 0x2d51        | `wbase_option5_make_character`     |
| 6    | 0x72f8                        | 0x2d94        | `wbase_option6_game_configuration` |
| 7    | 0x7303                        | 0x2d9f        | `wbase_option7_show_title_page`    |
| 8    | 0x7311                        | 0x2dad        | `wbase_option8_quit_game`          |

The same delta-0x4564 pattern applies to the state-0x18 sub-handler's
jump table at runtime `0x7667` (file ~0x3103) and another at runtime
`0x7cd1` (file ~0x376d), based on identical dispatch-prologue byte patterns.

### Per-option handler behaviors and transitions

Labels resolved verbatim from `extracted/messages/msg.json` (ids 0x3ea..0x3f2 = decimal 1002..1010). See `docs/re/findings/wbase-master-options-full.json` for the full evidence trail. Three of the original hypothesised labels were wrong (slots 1, 2, 3); slot 5 is unambiguously "CHARACTER MENU" and is NOT context-dependent.

| Slot | msg ID | Label                | Handler behavior                                                                          | State transition          |
| ---- | -----: | -------------------- | ----------------------------------------------------------------------------------------- | ------------------------- |
| 0    |  0x3ea | **ADD PARTY MEMBER** | `wbase_add_party_member_action` — picks from PCFILE.DBS, copies char data into party slot | continues loop            |
| 1    |  0x3eb | **REVIEW MEMBER**    | `pick_party_member(msg 0x4b2 "review_who}")`; if picked: state 0x11 + next-state 4        | → state 0x11 (WPCVW)      |
| 2    |  0x3ec | **DISMISS MEMBER**   | `pick_party_member(msg 0x4b3 "dismiss_who}")`; if picked: dismiss helper @ 0x25cc (marks PCFILE avail, decrements party_size, shifts tables) | continues loop |
| 3    |  0x3ed | **START NEW GAME**   | Unloads entire party (marks every slot avail in `*0x4fd8`), then `wbase_load_or_quit(0)` → scenario picker (list at DGROUP 0x502f via thunk 0xc772) | → state 6 (game) or 3 |
| 4    |  0x3ee | **RESUME SAVED GAME**| `wbase_load_or_quit(1)` — saved-game picker (lists at DGROUP 0x3540 and 0x357c)           | → state 6 (game) or 3     |
| 5    |  0x3ef | **CHARACTER MENU**   | `unload_all_party_members()`; state := 0x10. Label is the literal string at msg #1007 — NOT context-dependent. The WPCMK overlay decides internally whether to show create-new vs edit-existing. | → state 0x10 (WPCMK) |
| 6    |  0x3f0 | **GAME CONFIGURATION** | next-state 4 cached; call `wbase_state18_config_submenu` directly                       | stays in wbase            |
| 7    |  0x3f1 | **SHOW TITLE PAGE**  | `unload_all_party_members()`; `FUN_2a83()`; state := 1                                    | → state 1 (winit title)   |
| 8    |  0x3f2 | **QUIT GAME**        | `unload_all_party_members()`; `FUN_2a83()`; state := 3                                    | → state 3 (QUIT)          |

**Visible label vs. slot mapping (first launch, party_size=0):** slots 0,
4, 5, 6, 7, 8 = 6 options. Matching the user-described menu items in order:
ADD PARTY MEMBER / RESUME SAVED GAME / CHARACTER MENU / GAME CONFIGURATION /
SHOW TITLE PAGE / QUIT GAME. Slot 5's transition to state 0x10=WPCMK (make
player character) is consistent with the "CHARACTER MENU" label being the
character-creation submenu when there's no party to edit.

### Slot 0 — ADD PARTY MEMBER (deep dive)

Full byte-exact RE pass — findings at
[`docs/re/findings/wbase-add-party-member.json`](findings/wbase-add-party-member.json).

#### Dispatch shape (handlers are JMP-dispatched code blocks, not CALL'd functions)

Critical to understand: the 9 main-menu slot "handlers" are reached via
`jmp word ptr cs:[bx + 0x731f]` from the menu-loop tail, **not** via
`call`. Each "handler" runs in `wbase_state4_main_menu`'s stack frame
and ends with its own `jmp 0x2dda` back to the loop top. So:

- A slot handler can read/write the menu loop's locals (e.g. `[bp-0xa]`,
  the next-iteration cursor offset).
- A slot handler does NOT need `ret`. If it wanted to exit the loop it
  would just write `*0x363a := <non-negative state>` and jump back to the
  loop test.

This is the structural reason `wbase_option0_add_party_member` @ wbase
`0x2cf7` is a tiny stub:

```asm
0x2cf7: call 0x253a              ; wbase_add_party_member_action()
0x2cfa: cmp  word [0x43ce], 6    ; party_size == 6 (full)?
0x2cff: jnz  0x2d06
0x2d01: mov  word [bp-0xa], 3    ; reset caller's cursor offset for next render
0x2d06: jmp  0x2dda               ; back to menu loop top
```

The `[bp-0xa] := 3` write only fires when the party just filled up — it
matches the prelude's `uStack_c := 3 if party_size < 6 else 0` rule, so
the menu cursor lands on a sensible default after the party is full.

**Implication: slot 0 is single-add per click.** There is no internal
add-loop. To add a second member the user re-selects ADD PARTY MEMBER
from the redrawn menu.

#### `wbase_add_party_member_action` @ wbase 0x253a

The action helper (called from the slot-0 stub). End-to-end sequence,
all DGROUP writes documented in source order:

```c
void wbase_add_party_member_action(void) {
    char record_buf[0x1b0];                                    // [bp-0x1b2 .. bp-0x3], 432 bytes
    int picker_pos = wbase_pcfile_picker();                     // wbase 0x2143
    if (picker_pos == -1) return;                               // CANCEL = clean no-op
    int char_idx = *(int*)(picker_pos*2 + 0x515a);              // backref to PCFILE index
    roster_io_one_record(record_buf, char_idx, 0);              // wbase 0x36, mode=READ
    *(byte*)(char_idx + 0x4fd8) = 2;                            // mark in-party
    *(int*)(*0x43ce*2 + 0x43dc) = char_idx;                     // party_slot → char_idx
    int portrait_id = portrait_unique_id_alloc(*0x43ce);        // wbase 0xc2c (smallest free 0..5)
    *(int*)(*0x43ce*2 + 0x43d0) = portrait_id;                  // party_slot → portrait_id
    portrait_blit_per_slot(record_buf[0x19c], portrait_id);     // wbase 0xb0e
    memcpy(0x43e8 + *0x43ce*0x1b0, record_buf, 0x1b0);          // rep movsw 0xd8 words
    party_panel_redraw_slot(*0x43ce);                           // wbase 0x1b2d
    (*0x43ce)++;                                                 // party_size++
}
```

Verified key bytes:

- `0x2543: call 0x2143` — picker dispatch
- `0x254d: jz 0x25c6` — cancel → epilogue (no state mutation)
- `0x2566: call 0x36` — `roster_io_one_record(buf, idx, 0)` with `mode=READ`
- `0x256f: mov byte [bx+0x4fd8], 2`
- `0x2582: call 0xc2c` — `portrait_unique_id_alloc(party_size)`
- `0x2599: call 0xb0e` — `portrait_blit(record_buf[0x19c], portrait_id)`
- `0x25b5: mov cx, 0xd8 / rep movsw` — copies 0xd8 words = 0x1b0 bytes
- `0x25be: call 0x1b2d` — `party_panel_redraw_slot(party_size)`
- `0x25c2: inc word [0x43ce]` — party_size++ (AFTER panel redraw)

No sound is played. No animation. Portrait_blit + memcpy + panel redraw
are synchronous and immediate.

If `crt_open` of the portrait file fails, the engine calls
`abort_with_code(0xe)` — a hard exit, NOT a recoverable error message.
The picker has no error path either; PCFILE.DBS read failures abort the
same way.

#### `wbase_pcfile_picker` @ wbase 0x2143

The PCFILE-character picker — **self-contained in wbase**, no
cross-overlay calls during navigation. Distinct from
`wbase_pick_party_member` @ 0x26c7 (used by slots 1 and 2 for picking
party members; this one picks PCFILE characters).

**Phase 1 — scan + parallel-array build:** loops `i = 0..*0x4fd2-1` and
for each `*0x4fd8[i] == 1` (status = available, not-in-party), calls
`roster_io_one_record(tmp, i, 0)` then writes five fields to parallel
BSS arrays:

| Source                              | Parallel array (DGROUP)         | Renderer use |
|-------------------------------------|---------------------------------|--------------|
| `tmp_record[0..7]` (name, 8 bytes)  | `0x507a + count*8` (via strcpy) | row label    |
| `tmp_record[0x19e]` (race byte)     | `0x50fa + count*2` (word, zext) | + `0x8c` → race-name msg ID |
| `tmp_record[0x19d]` (class byte)    | `0x511a + count*2` (word, zext) | + `0x64` (100) → class-name msg ID |
| `tmp_record[0x19f]` (sex byte)      | `0x513a + count*2` (word, zext) | + `0x78` (120) → sex-name msg ID |
| `i` (original PCFILE index)         | `0x515a + count*2`              | backref on select |

`count == 0` → picker returns -1 immediately (no available characters).

**This pass identifies the msg-ID base offsets for the race/class/sex
enums** for the first time: race=140, class=100, sex=120. These are
fixed bases in the msg.dbs strings table; per-character bytes are added
to the base to produce the per-enum msg ID. Useful well beyond the
add-party-member screen.

**PCFILE record field correction:** `pcfile-dbs.md` marks bytes
`+0x19c..+0x1a3` as a "race/class/sex region" with low confidence on
exact byte-to-field mapping. This pass clarifies:

- `+0x19c` — face / portrait-source-row index (divides by 14 inside
  `portrait_blit_per_slot` to pick the portrait file + row).
- `+0x19d` — class
- `+0x19e` — race
- `+0x19f` — sex

The `+0x19c` byte is read by `portrait_blit_per_slot` independently
from the picker's race/class/sex reads — it's a separate field with a
distinct semantic role.

**Phase 2 — two-window UI:**

```c
outer = ui_window_create(parent=0,    x=0x13, y=0x13, w=5, h=10,  attr=0xfffc, 0, 0);
inner = ui_window_create(parent=0x14, x=0x13, y=0x14, w=5, h=0x14, attr=0xfffb, 0, 0);
ui_window_clear(outer, 0x20, 3);
ui_window_clear(inner, 0x20, 3);
load_msg_into_buf(0x4b1, &top_strip_title);          // msg 1201, top-strip centered
load_msg_into_buf(0x4b6, &outer_title);              // msg 1206, outer window header
load_msg_into_buf(0x4b7, &cancel_text);              // msg 1207, CANCEL button label
```

The picker thus uses three new msg IDs not previously documented:

| msg ID | decimal | Purpose                                                |
|-------:|--------:|--------------------------------------------------------|
| 0x4b1  |    1201 | Top-strip title (centered, drawn into `*0x3342`)       |
| 0x4b6  |    1206 | Outer-window title (drawn with width 0x12)             |
| 0x4b7  |    1207 | CANCEL button text                                     |

(The race/class/sex enum text IDs in ranges 100..119 / 120..123 /
140..159 are derived but their actual text strings still need msg.dbs
decoding — see Open Questions below.)

**Phase 3 — five mouse hotspots** registered via
`mouse_status_set_field` (thunk `0xc6b2`). Field assignments are
inferred from the (x,y) args used; live verification recommended:

| Field | Likely role |
|------:|-------------|
| 0 | List area, top half |
| 1 | List area, bottom half (?) |
| 2 | List paging arrow (?) |
| 3 | CANCEL button text-rect |
| 4 | Catch-all `(0,0)-(0xff,0)` — possibly a sentinel |

**Phase 4 — input loop** (per-iteration: redraw rows via `FUN_1f11`,
poll input via `wbase_menu_poll_input`, navigate). Key mapping:

| Key | When on list | When on CANCEL |
|----:|--------------|----------------|
| 1 (UP) | Move focus to CANCEL | — |
| 2 (LEFT) | `cursor--` (clamp ≥ 0) | Move back to list |
| 3 (DOWN) | — | Move back to list |
| 4 (RIGHT) | `cursor++` (clamp < count) | Move back to list |
| 5 (ENTER) | Return `cursor` | Return -1 (cancel) |

Mouse-click remaps the four nav fields through `*0x4fc4 == 1` →
synthetic key. Field 3 (CANCEL hotspot) sets the cancel-flag then
returns ENTER, so a mouse click on CANCEL behaves identically to a
keyboard UP+ENTER.

The cancel-flag branch in `FUN_1f11`'s row renderer
(`*0x846 == 0 && local_e == 1`) is marked **medium confidence** —
the JZ/JNZ chain at file ~0x23b6 could be misread; recommend DOSBox-X
breakpoint verification before committing the port's highlight logic.

**Row renderer (`FUN_1f11` @ wbase 0x1f11):** draws a 5-row sliding
window with the center row highlighted. Per-row layout:

```
<name padded to 10 cols> <race-text> - <class-text> <sex-text>
```

The center-row highlight uses the **negated-attr** write path (thunk
`0xdf85`, `ui_window_puts_highlight`), consistent with the wbase
highlight-attr-sign convention — so the port should use
`invertHighlight = true` for the picker's list-area window (menu-style
inverse colors, not colored-text).

#### `portrait_blit_per_slot` @ wbase 0xb0e

Signature: `portrait_blit_per_slot(record_byte, portrait_id)`.

- Picks one of four candidate portrait-set filenames at DGROUP `0x5003`
  / `0x500e` / `0x5019` / `0x5024` based on bits 0..3 of `*0x4fc6`
  (video mode flag). EGA/HRC use 32-byte rows; CGA/T16 use 16-byte
  rows.
- Sets the penultimate filename byte to `'1' + record_byte/14`, and
  stores `record_byte % 14` back into the param slot (used as the
  row-within-file index).
- `crt_open` → `lseek(remainder * row_size * 9)` → read `row_size * 9`
  bytes → `crt_close`.
- Blits via thunk `0xdcf2` (unnamed in `wroot-naming-pass`) to screen
  `(X=2, Y = portrait_id*9 + 0x48, rows=9)`.

**Y position uses portrait_id, NOT party_slot.** So a freed party slot
leaves its portrait Y-slot empty until the next add refills it (the
allocator at `0xc2c` returns the smallest free portrait_id in
`*0x43d0[0..party_size-1]`).

| portrait_id | screen Y |
|------------:|---------:|
| 0           | 0x48 (72)|
| 1           | 0x51 (81)|
| 2           | 0x5a (90)|
| 3           | 0x63 (99)|
| 4           | 0x6c (108)|
| 5           | 0x75 (117)|

#### `party_panel_redraw_slot` (`FUN_1b2d`) @ wbase 0x1b2d

Even/odd party slots draw to two different ui_window handles
(`*0x4fba` vs `*0x4fb8` — the left vs right party panel split, three
slots each). Renders: name (3-char-padded to 7), a 3-cell colored bar,
status icon (lookup at `0x526 + byte*2`), condition icons (severity
lookup at `0x532`), class symbol (from char-record `+0x4587`), and
two equipment tile slots via `FUN_1a4c`. The class/condition/status
lookups read from wbase BSS tables not in the .ovr file (likely
runtime-computed).

#### Confidence notes for porting

| Element | Confidence |
|---------|------------|
| Slot 0 → action helper dispatch, single-add semantics | HIGH — verified disasm |
| Sequence of DGROUP writes in action helper | HIGH — verified disasm |
| Picker window dims (outer 5×10, inner 5×20) at (19,19)/(19,20) | HIGH — verified disasm |
| Picker msg IDs (0x4b1 / 0x4b6 / 0x4b7) | HIGH — verified disasm |
| Race/class/sex msg-ID bases (140 / 100 / 120) | HIGH — derived from FUN_1f11 reads |
| PCFILE record byte mapping (+0x19c face, +0x19d class, +0x19e race, +0x19f sex) | HIGH — bp-relative arithmetic verified |
| Portrait Y = portrait_id × 9 + 0x48 | HIGH — verified disasm |
| Mouse hotspot field role assignments | MEDIUM — inferred from offsets, needs DOSBox-X verification |
| `FUN_1f11`'s cancel-flag branch direction | LOW — ambiguous JZ/JNZ; recommend DOSBox-X breakpoint capture |
| Race/class/sex enum text strings | LOW — outside extracted msg.hdr range; needs MSG.DBS ID-encoding decode |
| Portrait-set filenames at `0x5003`/`0x500e`/`0x5019`/`0x5024` | LOW — likely PORTRT1.* pattern but unconfirmed; DOSBox-X file-open log would resolve |

#### Open questions

1. Exact text at msg IDs 0x4b1, 0x4b6, 0x4b7 (picker title / outer
   header / CANCEL button). Needs MSG.DBS decode.
2. Race/class/sex enum strings at msg IDs 100..119, 120..123+,
   140..159+. Critical for porting the picker.
3. The four portrait-set filenames at DGROUP `0x5003`/`0x500e`/`0x5019`/`0x5024`
   — likely `PORTRT1.{EGA,CGA,T16,HRC}` per video mode but unconfirmed.
4. Whether record byte `+0x19c` is genuinely a "face index" field or a
   tag that combines with race for portrait selection. The `% 14`
   divisor in `portrait_blit_per_slot` suggests 14 portraits per file
   and a multi-file split — investigate by varying char records.
5. `FUN_1b2d`'s status / condition lookup tables at `0x526` and
   `0x532` — wbase BSS or CS-relative data?
6. `FUN_1f11` row renderer's cancel-highlight branch direction —
   verify by DOSBox-X breakpoint during a live ADD PARTY MEMBER session.

#### Picker internals (struct layout + render geometry)

Findings: [`docs/re/findings/wbase-picker-internals.json`](findings/wbase-picker-internals.json).
This section supersedes the speculative claims in the earlier "Open
questions" list around the `cells_off` discrepancy and the "x=20 stored
but renders at 22" mystery.

**Canonical `ui_window_create` signature** (wroot image 0x11a):

```c
void *ui_window_create(
  byte x, byte y, int w, int h, byte attr,
  int chrome_param, byte flags, int do_refresh
);
```

Eight args, cdecl, right-to-left push. Returns a struct pointer. Struct
layout:

|  Offset | Field                          |
|--------:|--------------------------------|
| `+0x00` | `w` (byte)                     |
| `+0x01` | `h` (byte)                     |
| `+0x02` | `x` (byte, = param x)          |
| `+0x03` | `y` (byte, = param y)          |
| `+0x04` | `attr` (byte, = param attr)    |
| `+0x05` | `flags` (byte, = param flags)  |
| `+0x06` | `cursor_chars_written` (byte)  |
| `+0x07` | `cursor_y` (byte)              |
| `+0x08..+0x0f` | 8-byte chrome-glyph header (border decoration) |
| `+0x10..`     | cells (16-bit char/attr pairs) |

Allocator size: `w * h * 2 + 0x14`. The `+0x14` looks like 20 bytes of
slack but the cell-write primitives (`de7f`, `dfb9`) compute cell
addresses as `struct + 0x10 + (y*w + x)*2` — i.e. cells **always** start
at `struct + 0x10` for normal windows. The 4-byte gap in the allocator
math (`0x14 - 0x10`) is at the END of the cell region, not the start.

**Both picker panels use `cells_off = struct + 0x10`.** The earlier
`wbase-window-struct.json` claim that the right panel uses `+0x14` was a
mis-alignment: the "padding bytes" (`20 03 45 02`) it identified are
actually `cell[0] = (space, attr 0x03)` and `cell[1] = ('E', attr 0x02 —
the top scrollbar arrow)`.

**Picker call sites:**

```c
// Left panel (the ADD WHO? / CANCEL prompt):
ui_window_create(x=0, y=19, w=19, h=5, attr=0x0a, chrome=-4, flags=0, do_refresh=0);

// Right panel (the roster list):
ui_window_create(x=20, y=19, w=20, h=5, attr=0x14, chrome=-5, flags=0, do_refresh=0);
```

**Why NATHAN highlight renders at global cell 22 (not 20).** The row
renderer `FUN_1f11` @ wbase 0x1f11 calls
`ui_window_set_cursor(handle, x=2, y=row)` before writing each row's
text — a deliberate 2-cell leftpad that reserves panel cols 0..1 for
chrome (the scrollbar arrows painted by `FUN_1e93`). NATHAN at panel
col 2 → global col 22 = struct.x(20) + render_x(2). No struct
adjustment.

**Chrome painting routines.**

- `FUN_1e93` @ wbase 0x1e93 paints the right-panel scrollbar column:
  'E' (top arrow, char 0x45) at row 0 col 1, 'G' (track, char 0x47) at
  rows 1..3 col 1, 'F' (bottom arrow, char 0x46) at row 4 col 1 — all
  via `FUN_1e6a(handle, x, y, char)` which calls thunks `bda7`
  (`ui_window_set_cursor`) + `de7f` (`ui_window_putchar` with hardcoded
  `attr=0x02`).
- The banner row chrome (cells 0x5f / 0x1d / 0x23 at y=18) lives in a
  **separate persistent window 0x732E** (the title strip — 40×1 at
  y=18, attr=0x0e), NOT in the picker. The picker only writes the
  centered "add\x5fmember" (msg 0x4b1) into this strip via
  `FUN_1e0e`. The surrounding 0x1c / 0x1d chrome cells pre-exist from
  prior overlay state.
- The "L-corner at (19, 24)" cell similarly belongs to the bottom
  status window `*0x7394` at y=24, NOT to the picker.

**Naming note.** The prior `wbase-add-party-member.json` finding
labelled the left panel as "outer" and the right panel as "inner" —
misleading. Both windows are top-level (no parent handles); they're
just two regular `ui_window_create` results. Treat them as `leftPanel`
+ `rightPanel` (which is what the port's cell-grid fixture uses).

**Open follow-up.** The 8-byte chrome header at struct+0x08..+0x0f
gets initialized by `ui_window_create` based on the `chrome_param`
sentinel value (-4 / -5 / etc.). The routine that consumes these bytes
to draw the per-window border decoration (likely invoked from
`ui_screen_refresh`) is unidentified — `FUN_1000_2f76` /
`FUN_1000_329a` in the allocator's tail are the candidates.

### State 7 — post-gameplay cleanup (`wbase_state7_post_gameplay_cleanup` @ 0x2de1)

Reached after `boot_select_disk_for_content(1, 0)` (per ovl_install_table).
Frees maze-data buffers, destroys the dungeon window, clears status/message
windows, resets party_size to 0, transitions back to the main menu.

```c
if (*0x4fa8 != 0) ui_window_free_struct(*0x4fa8);  // alt maze buffer
if (*0x4faa != 0) ui_window_free_struct(*0x4faa);  // maze data
ui_window_destroy(*0x4fb0, 0);                     // dungeon view window
ui_window_clear(*0x4fba, 0x20, 3);                 // status
ui_window_clear(*0x4fb8, 0x20);                    // message
ui_window_clear(*0x4fb6);                          // ?
*0x43ce = 0;                                       // party_size := 0
*0x363a = 4;                                       // back to main menu
```

### State 0x18 — config submenu (`wbase_state18_config_submenu` @ 0x3151)

Reached **either** by ovl_install_table (state 24, after disk prompt) **or**
directly in-process via main-menu slot 6's call. Loads msg #1000 into a
buffer, opens a 22x18 list window at (19, 40), draws options. Has its own
inline jump table at file offset ~0x3103 (runtime 0x7667). Per-option
behaviors not decoded in this pass.

## Assets used by the main menu

| Asset                                                        | Loaded by                                                                                                        | Notes                                                                                                                                              |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **dragonsc.{ega/cga/t16}** — top stripe with Wizardry logo   | NOT loaded by wbase — leftover from winit state 2                                                                | wbase doesn't clear or repaint the top stripe region; the previous overlay's draw persists.                                                        |
| **MON08.PIC** — castle gates + red figure decoration         | `wbase_load_font_table_entry(8, 4)` at prelude                                                                   | Loaded via wroot's c31e file-table thunk (kind=8 path); the pre-extracted PNGs at `extracted/pics/mon08/desc-NN.png` match the visible decoration. |
| **Per-descriptor renders** (0x7b, 0x7c, 0x7d, ...)           | `wbase_menu_init_decoration` → `wbase_menu_draw_decoration_frame` via video-driver thunk 0xf148                  | The thunk renders one PIC descriptor at a time; precise placement (col, row) not extracted.                                                        |
| **MSG.DBS text** for banner + 9 menu options + picker titles | `load_msg_into_buf` (thunk 0xc1f7 → wroot 0x75b)                                                                 | msg IDs 0x3e9 (banner), 0x3ea..0x3f2 (options), 0x4b2/0x4b3 (picker titles).                                                                       |
| **Party-member icons / portraits**                           | Drawn by `FUN_1b2d(slot)` (called once per existing member at prelude, and from `wbase_add_party_member_action`) | Per-slot panels in the right-side window.                                                                                                          |

## Key DGROUP state variables specific to wbase

|  Address | Purpose                                                               |
| -------: | --------------------------------------------------------------------- |
| `0x363a` | game_state (shared with all overlays)                                 |
| `0x4fce` | **next_state_cache** — wbase-only deferred state transition           |
| `0x43ce` | party_size (0..6) — drives nearly every option-enable rule            |
| `0x43cc` | last-picked party-slot index (output of FUN_26c7)                     |
| `0x43dc` | party-slot → PCFILE.DBS character-index map (word[6])                 |
| `0x43d0` | per-slot portrait IDs (word[6])                                       |
| `0x43e8` | full character data per slot (byte[6][0x1b0])                         |
| `0x4fd2` | scenario PCFILE character count                                       |
| `0x4fd8` | per-character availability (0=missing, 1=available, 2=in-party)       |
| `0x5060` | menu animation tick                                                   |
| `0x3646` | menu animation parity                                                 |
| `0x5062` | animation Y offset                                                    |
| `0x5064` | animation X offset                                                    |
| `0x5066` | menu filename buffer (msg #1000 loaded here at prelude)               |
| `0x4fc4` | mouse-click flag (set by `wbase_menu_poll_input`)                     |
| `0x3596` | mouse-click state (read by input poll)                                |
|  `0x846` | menu skip-redraw flag (suppresses cursor in `wbase_menu_select_loop`) |

## Correction to prior findings

The earlier `startup-sequence.json` claimed:

> states_5_6_17_wmaze: FUN_1000_36dc(0x600) — wmaze.ovr

State 17 (decimal) is **0x11** in hex, but wroot's `ovl_install_table`
maps:

- `case 0x11`: `FUN_36dc(0x624)` → **WPCVW** (view player character), not wmaze
- `case 0x17` (= 23 decimal): `FUN_36dc(0x600)` → wmaze

So wmaze states are 5, 6, 23 — not 5, 6, 17. The earlier finding confused
hex 0x17 with decimal 17. This was discovered while tracing wbase main-menu
slot 1's transition target (`*0x363a := 0x11`) which lands in WPCVW, not
wmaze.

## State table (wroot's ovl_install_table, definitive)

| state | load arg | overlay   | purpose                                                                   |
| ----: | -------- | --------- | ------------------------------------------------------------------------- |
|     0 | `0x5f4`  | WINIT.OVR | boot/init                                                                 |
|     1 | `0x5f4`  | WINIT.OVR | title page + credits                                                      |
|     2 | `0x5f4`  | WINIT.OVR | load fonts + create windows                                               |
|     3 | —        | —         | **QUIT** — `abort_cleanup_dispatch + crt_run_atexit_and_exit`             |
|     4 | `0x5fa`  | WBASE.OVR | main menu                                                                 |
|     5 | `0x600`  | WMAZE.OVR | dungeon (entry A)                                                         |
|     6 | `0x600`  | WMAZE.OVR | dungeon (entry B — load-zone)                                             |
|     7 | `0x5fa`  | WBASE.OVR | post-gameplay cleanup (after `boot_select_disk_for_content(1,0)`)         |
|     8 | `0x5f4`  | WINIT.OVR | graveyard (after `boot_select_disk_for_content(3,0)`)                     |
|    10 | `0x606`  | WMELE.OVR | melee combat                                                              |
|    11 | `0x606`  | WMELE.OVR | combat (variant)                                                          |
|    12 | `0x60c`  | WPOPS.OVR | popup / merchant (?)                                                      |
|    13 | `0x612`  | WMEXE.OVR | maze-exec (?)                                                             |
|    14 | `0x606`  | WMELE.OVR | combat (variant)                                                          |
|    15 | `0x618`  | WTREA.OVR | treasure                                                                  |
|    16 | `0x61e`  | WPCMK.OVR | **make player character (target of main-menu slot 5)**                    |
|    17 | `0x624`  | WPCVW.OVR | **view player character (target of main-menu slot 1)**                    |
|    18 | `0x62a`  | WMNPC.OVR | NPC dialogue                                                              |
|    19 | `0x630`  | WDOPT.OVR | options                                                                   |
|    20 | `0x630`  | WDOPT.OVR | options (variant)                                                         |
|    21 | `0x618`  | WTREA.OVR | treasure (variant)                                                        |
|    22 | `0x624`  | WPCVW.OVR | view player character (variant)                                           |
|    23 | `0x600`  | WMAZE.OVR | dungeon (variant)                                                         |
|    24 | `0x5fa`  | WBASE.OVR | config submenu (after `boot_select_disk_for_content(1,0)`)                |
|    25 | `0x600`  | WMAZE.OVR | load-zone-then-dungeon (after `boot_select_disk_for_content(2, *0x363c)`) |

## Confidence summary

| Element                                                          | Confidence                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| State machine (states 4, 7, 0x18 and transitions)                | HIGH — direct disasm + exhaustive state-var write scan                       |
| Entry dispatch layout at file 0x0e                               | HIGH — raw byte trace                                                        |
| Main menu loop structure                                         | HIGH — full decomp + per-instruction verification                            |
| 9-slot dispatch jump table (file 0x2dbb)                         | HIGH — every target verified as a coherent option handler                    |
| Data-segment runtime delta 0x4564                                | HIGH — verified for main-menu jump table                                     |
| Per-slot enable rules                                            | HIGH — direct disasm                                                         |
| Per-slot state transitions                                       | HIGH — direct state-var writes                                               |
| Per-slot label assignments to ADD/RESUME/etc                     | MEDIUM — inferred from behavior + screenshot 6-item match                    |
| Msg ID → text decoding for 0x3ea..0x3f2                          | LOW — IDs outside the 0..717 extracted msg.hdr range; needs further decoding |
| MON08.PIC identification via `wbase_load_font_table_entry(8, 4)` | MEDIUM — visual match + asset-table indexing pattern                         |
| dragonsc.scr top-stripe persistence from winit                   | MEDIUM — no clear/repaint in wbase for that region                           |
| Animation timing                                                 | LOW — counters identified but no wall-clock pacing reads                     |

## Open questions

~~1. **What text is at msg IDs 0x3ea..0x3f2?**~~ **Resolved** 2026-05-29 — the
   extracted `msg.json` already covers ids 1002..1010 (range index 23, bank 2).
   The "msg.hdr indexes 0..717" worry was a miscount; msg.json contains 5161
   indexed messages. Labels promoted to the per-option-handler table above.
   Evidence: `docs/re/findings/wbase-master-options-full.json` (finding
   `msg-labels-all-resolved`).

~~2. **Slot 3's purpose.**~~ **Resolved** 2026-05-29 — slot 3 is
   **START NEW GAME** (msg #1005). Handler unloads the whole party then calls
   `wbase_load_or_quit(0)` which selects the scenario-picker path (list at
   DGROUP 0x502f via cross-overlay thunk 0xc772). Mode 0 = scenario list;
   mode 1 (slot 4) = saved-games list (DGROUP 0x3540 + 0x357c). Evidence:
   `docs/re/findings/wbase-master-options-full.json` (finding
   `slot-3-is-start-new-game`).

3. **wbase config submenu (state 0x18) options.** The 9-slot dispatch at
   runtime 0x7667 / file ~0x3103 hasn't been decoded. Likely contains
   {video mode, sound, music, control config, scenario selection, ...}.

4. **MON08.PIC indexing.** `wbase_load_font_table_entry(8, 4)` — kind 8
   (font/asset table) with table index 4. A DOSBox-X file-open log during
   state-4 entry would confirm exactly which PIC is loaded.

5. **`wbase_menu_init_decoration` descriptors.** Calls video-driver thunk
   0xf148 with descriptor IDs 0x15a, 0x15d, 0x160, then `wbase_menu_draw_decoration_frame`
   renders 0x7b..0x7d. The mapping from these IDs to MON08.PIC descriptor
   numbers is the missing link to a byte-exact reimplementation.

~~6. **Slot 5 → "CHARACTER MENU" vs. "MAKE CHARACTER".**~~ **Resolved** 2026-05-29
   — the label is literally `'CHARACTER MENU'` (msg #1007) regardless of party
   state. There is no per-slot label-rewrite path in the menu render loop. The
   "duplicate CHARACTER MENU" bug the user observed was actually slot 2's TS
   label being wrong (it should be **DISMISS MEMBER**, not "CHARACTER MENU").
   Evidence: `docs/re/findings/wbase-master-options-full.json` (findings
   `slot-5-character-menu-not-context-dependent` and `msg-labels-all-resolved`).
