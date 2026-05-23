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

| Slot | Default | Disable conditions                                              |
| ---- | ------- | --------------------------------------------------------------- |
| 0    | 0       | (overridden) enabled only if scan over `*0x4fd8[..*0x4fd2]` finds a byte == 1 AND party_size < 6 |
| 1    | 1       | party_size < 1                                                  |
| 2    | 1       | party_size < 1                                                  |
| 3    | 1       | party_size < 2                                                  |
| 4    | 1       | party_size >= 1                                                 |
| 5    | 1       | (always enabled)                                                |
| 6    | 1       | (always enabled)                                                |
| 7    | 1       | (always enabled)                                                |
| 8    | 1       | (always enabled)                                                |

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

| Slot | runtime word at 0x731f+slot×2 | = file offset | Handler                                 |
| ---- | ---------------------------- | ------------- | --------------------------------------- |
| 0    | 0x725b                       | 0x2cf7        | `wbase_option0_add_party_member`        |
| 1    | 0x726d                       | 0x2d09        | `wbase_option1_choose_leader`           |
| 2    | 0x7291                       | 0x2d2d        | `wbase_option2_character_menu`          |
| 3    | 0x72c1                       | 0x2d5d        | `wbase_option3_unload_then_load`        |
| 4    | 0x72ee                       | 0x2d8a        | `wbase_option4_resume_saved_game`       |
| 5    | 0x72b5                       | 0x2d51        | `wbase_option5_make_character`          |
| 6    | 0x72f8                       | 0x2d94        | `wbase_option6_game_configuration`      |
| 7    | 0x7303                       | 0x2d9f        | `wbase_option7_show_title_page`         |
| 8    | 0x7311                       | 0x2dad        | `wbase_option8_quit_game`               |

The same delta-0x4564 pattern applies to the state-0x18 sub-handler's
jump table at runtime `0x7667` (file ~0x3103) and another at runtime
`0x7cd1` (file ~0x376d), based on identical dispatch-prologue byte patterns.

### Per-option handler behaviors and transitions

| Slot | msg ID | Label (hypothesis)       | Handler behavior                                                                          | State transition           |
| ---- | -----: | ------------------------ | ----------------------------------------------------------------------------------------- | -------------------------- |
| 0    | 0x3ea  | **ADD PARTY MEMBER**     | `wbase_add_party_member_action` — picks from PCFILE.DBS, copies char data into party slot | continues loop             |
| 1    | 0x3eb  | (CHOOSE LEADER?)         | `pick_party_member(msg 0x4b2)`; if picked: state 0x11 + next-state 4                      | → state 0x11 (WPCVW)       |
| 2    | 0x3ec  | (CHARACTER MENU?)        | `pick_party_member(msg 0x4b3)`; if picked: `character_submenu(picked)`                    | continues loop             |
| 3    | 0x3ed  | (REMOVE/UNLOAD?)         | Mark all party char slots as "available" in `*0x4fd8`, then `load_or_quit(0)`             | depends on `load_or_quit` |
| 4    | 0x3ee  | **RESUME SAVED GAME**    | `load_or_quit(1)` — load saved game with "resume" semantics                              | → state 6 (game) or 3      |
| 5    | 0x3ef  | **CHARACTER MENU** (probably MAKE CHARACTER) | `unload_all_party_members()`; state := 0x10                                | → state 0x10 (WPCMK)       |
| 6    | 0x3f0  | **GAME CONFIGURATION**   | next-state 4 cached; call `wbase_state18_config_submenu` directly                         | stays in wbase             |
| 7    | 0x3f1  | **SHOW TITLE PAGE**      | `unload_all_party_members()`; `FUN_2a83()`; state := 1                                    | → state 1 (winit title)    |
| 8    | 0x3f2  | **QUIT GAME**            | `unload_all_party_members()`; `FUN_2a83()`; state := 3                                    | → state 3 (QUIT)           |

**Visible label vs. slot mapping (first launch, party_size=0):** slots 0,
4, 5, 6, 7, 8 = 6 options. Matching the user-described menu items in order:
ADD PARTY MEMBER / RESUME SAVED GAME / CHARACTER MENU / GAME CONFIGURATION /
SHOW TITLE PAGE / QUIT GAME. Slot 5's transition to state 0x10=WPCMK (make
player character) is consistent with the "CHARACTER MENU" label being the
character-creation submenu when there's no party to edit.

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

| Asset                                                  | Loaded by                                       | Notes |
| ------------------------------------------------------ | ----------------------------------------------- | ----- |
| **dragonsc.{ega/cga/t16}** — top stripe with Wizardry logo | NOT loaded by wbase — leftover from winit state 2 | wbase doesn't clear or repaint the top stripe region; the previous overlay's draw persists. |
| **MON08.PIC** — castle gates + red figure decoration   | `wbase_load_font_table_entry(8, 4)` at prelude | Loaded via wroot's c31e file-table thunk (kind=8 path); the pre-extracted PNGs at `extracted/pics/mon08/desc-NN.png` match the visible decoration. |
| **Per-descriptor renders** (0x7b, 0x7c, 0x7d, ...)     | `wbase_menu_init_decoration` → `wbase_menu_draw_decoration_frame` via video-driver thunk 0xf148 | The thunk renders one PIC descriptor at a time; precise placement (col, row) not extracted. |
| **MSG.DBS text** for banner + 9 menu options + picker titles | `load_msg_into_buf` (thunk 0xc1f7 → wroot 0x75b) | msg IDs 0x3e9 (banner), 0x3ea..0x3f2 (options), 0x4b2/0x4b3 (picker titles). |
| **Party-member icons / portraits**                     | Drawn by `FUN_1b2d(slot)` (called once per existing member at prelude, and from `wbase_add_party_member_action`) | Per-slot panels in the right-side window. |

## Key DGROUP state variables specific to wbase

| Address  | Purpose                                                          |
| -------: | ---------------------------------------------------------------- |
| `0x363a` | game_state (shared with all overlays)                            |
| `0x4fce` | **next_state_cache** — wbase-only deferred state transition      |
| `0x43ce` | party_size (0..6) — drives nearly every option-enable rule       |
| `0x43cc` | last-picked party-slot index (output of FUN_26c7)                |
| `0x43dc` | party-slot → PCFILE.DBS character-index map (word[6])            |
| `0x43d0` | per-slot portrait IDs (word[6])                                  |
| `0x43e8` | full character data per slot (byte[6][0x1b0])                    |
| `0x4fd2` | scenario PCFILE character count                                  |
| `0x4fd8` | per-character availability (0=missing, 1=available, 2=in-party)  |
| `0x5060` | menu animation tick                                              |
| `0x3646` | menu animation parity                                            |
| `0x5062` | animation Y offset                                               |
| `0x5064` | animation X offset                                               |
| `0x5066` | menu filename buffer (msg #1000 loaded here at prelude)          |
| `0x4fc4` | mouse-click flag (set by `wbase_menu_poll_input`)                |
| `0x3596` | mouse-click state (read by input poll)                           |
| `0x846`  | menu skip-redraw flag (suppresses cursor in `wbase_menu_select_loop`) |

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

| state | load arg | overlay     | purpose                                                          |
| ----: | -------- | ----------- | ---------------------------------------------------------------- |
|     0 | `0x5f4`  | WINIT.OVR   | boot/init                                                        |
|     1 | `0x5f4`  | WINIT.OVR   | title page + credits                                             |
|     2 | `0x5f4`  | WINIT.OVR   | load fonts + create windows                                      |
|     3 |    —     |     —       | **QUIT** — `abort_cleanup_dispatch + crt_run_atexit_and_exit`    |
|     4 | `0x5fa`  | WBASE.OVR   | main menu                                                        |
|     5 | `0x600`  | WMAZE.OVR   | dungeon (entry A)                                                |
|     6 | `0x600`  | WMAZE.OVR   | dungeon (entry B — load-zone)                                    |
|     7 | `0x5fa`  | WBASE.OVR   | post-gameplay cleanup (after `boot_select_disk_for_content(1,0)`)|
|     8 | `0x5f4`  | WINIT.OVR   | graveyard (after `boot_select_disk_for_content(3,0)`)            |
|    10 | `0x606`  | WMELE.OVR   | melee combat                                                     |
|    11 | `0x606`  | WMELE.OVR   | combat (variant)                                                 |
|    12 | `0x60c`  | WPOPS.OVR   | popup / merchant (?)                                             |
|    13 | `0x612`  | WMEXE.OVR   | maze-exec (?)                                                    |
|    14 | `0x606`  | WMELE.OVR   | combat (variant)                                                 |
|    15 | `0x618`  | WTREA.OVR   | treasure                                                         |
|    16 | `0x61e`  | WPCMK.OVR   | **make player character (target of main-menu slot 5)**           |
|    17 | `0x624`  | WPCVW.OVR   | **view player character (target of main-menu slot 1)**           |
|    18 | `0x62a`  | WMNPC.OVR   | NPC dialogue                                                     |
|    19 | `0x630`  | WDOPT.OVR   | options                                                          |
|    20 | `0x630`  | WDOPT.OVR   | options (variant)                                                |
|    21 | `0x618`  | WTREA.OVR   | treasure (variant)                                               |
|    22 | `0x624`  | WPCVW.OVR   | view player character (variant)                                  |
|    23 | `0x600`  | WMAZE.OVR   | dungeon (variant)                                                |
|    24 | `0x5fa`  | WBASE.OVR   | config submenu (after `boot_select_disk_for_content(1,0)`)       |
|    25 | `0x600`  | WMAZE.OVR   | load-zone-then-dungeon (after `boot_select_disk_for_content(2, *0x363c)`) |

## Confidence summary

| Element                                                | Confidence                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| State machine (states 4, 7, 0x18 and transitions)      | HIGH — direct disasm + exhaustive state-var write scan       |
| Entry dispatch layout at file 0x0e                     | HIGH — raw byte trace                                       |
| Main menu loop structure                               | HIGH — full decomp + per-instruction verification           |
| 9-slot dispatch jump table (file 0x2dbb)               | HIGH — every target verified as a coherent option handler   |
| Data-segment runtime delta 0x4564                      | HIGH — verified for main-menu jump table                    |
| Per-slot enable rules                                  | HIGH — direct disasm                                        |
| Per-slot state transitions                             | HIGH — direct state-var writes                              |
| Per-slot label assignments to ADD/RESUME/etc           | MEDIUM — inferred from behavior + screenshot 6-item match  |
| Msg ID → text decoding for 0x3ea..0x3f2                | LOW — IDs outside the 0..717 extracted msg.hdr range; needs further decoding |
| MON08.PIC identification via `wbase_load_font_table_entry(8, 4)` | MEDIUM — visual match + asset-table indexing pattern |
| dragonsc.scr top-stripe persistence from winit         | MEDIUM — no clear/repaint in wbase for that region          |
| Animation timing                                       | LOW — counters identified but no wall-clock pacing reads    |

## Open questions

1. **What text is at msg IDs 0x3ea..0x3f2?** The `load_msg_into_buf` thunk
   (wroot 0x75b) takes a 16-bit msg ID. Our extracted msg.hdr indexes
   0..717 don't directly cover 1002..1010. The ID-to-section/offset
   encoding inside `load_msg_into_buf` needs decoding (or a DOSBox-X trace
   of the buffer contents during state 4).

2. **Slot 3's purpose.** Conditional on party_size >= 2 (unusual), unloads
   all party members then calls `wbase_load_or_quit(0)`. Either "NEW GAME
   (restart)" or "RESUME but with party already loaded — load DIFFERENT
   save". Reading `wbase_load_or_quit`'s mode-handling would clarify.

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

6. **Slot 5 → "CHARACTER MENU" vs. "MAKE CHARACTER".** State 0x10 is
   WPCMK.OVR which is character creation. The original Wiz6 main menu has
   "CHARACTER MENU" as a label — that label may map to WPCMK only when the
   party is empty (no existing character to view/edit), with the same
   menu slot showing a different label or behavior when party is populated.
   Confirming requires reading the actual msg #1007 text in different
   game contexts.
