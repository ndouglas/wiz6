# wmaze.ovr — Named Functions

This is the human-readable index of function names applied to `wmaze.ovr` in the Ghidra project at `tools/ghidra/wiz6.gpr`. It is generated from the comprehensive function-naming pass on the dungeon-traversal overlay (see `docs/re/findings/wmaze-naming-pass.json` for the structured source, including per-function evidence).

**Status:** 68 of 118 functions named (58% coverage). Skew toward the dungeon-traversal core (maze state, view rendering, party panel) and in-dungeon UI (message windows, menu selector). Render sub-helpers tied to the 3D-corridor frame (per-depth piece drawing) remain unnamed and are best resolved with dynamic traces.

## Subsystem prefixes

| Prefix              | Subsystem                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `maze_*`            | Position state, wall checks, rotation, cell resolution (12 facings, 8×8 cell grid per level, up to 12 levels per zone) |
| `view_*`            | 3D-corridor view rendering — composes the in-game first-person frame                                                   |
| `dungeon_*`         | Main game-loop state machine and zone load/camp menu                                                                   |
| `party_*`           | Party-member roster, status, panel rendering, damage, slot management                                                  |
| `automap_*`         | Discovered-cells flood reveal                                                                                          |
| `msg_*`             | Message windows, dialog rendering, text wrapping                                                                       |
| `menu_*`            | Generic grid selector, item paint, keypress wait                                                                       |
| `encounter_*`       | Random/triggered encounter rolls, face-match checks                                                                    |
| `special_*`         | Special-square handlers: chutes, teleporters, scripted events                                                          |
| `save_*` / `rest_*` | Save/load to SAVEGAME.DBS and the camp-rest sessions                                                                   |

## Key BSS globals discovered

- `0x4f9a` — facing (0..3 for player; 0..11 for cell-coordinate calculations via per-zone dx/dy tables)
- `0x4f9c` / `0x4f9e` / `0x4fa0` — z (level), y (row), x (col) within zone
- `0x4fa2` / `0x4fa4` — cached global (y, x)
- `0x4f8c`–`0x4f98` — saved-position slot (face, level, y, x, gy, gx, saved-zone)
- `0x4faa` — base pointer to the per-zone maze data table (see field list below)
- `0x4ee8` — last-known cell index
- `0x363a` — game state machine (5=normal, 6=zone-change, 7=error, 8=party-dead, 10=transition, 15=combat)
- `0x363c` — current zone id
- `0x43ce` — party size (0..6)
- `DAT_0000_43e8` — party member array base, 0x1b0 bytes per slot, up to 6 slots

## `*0x4faa` per-zone maze data table layout

| Offset         | Field                                                  |
| -------------- | ------------------------------------------------------ |
| +0x60          | North-wall bits (12 levels × 8 rows × 8 cols × 2 bits) |
| +0x120         | West-wall bits (same shape)                            |
| +0x1e0         | Facing-to-dy lookup (12 bytes, one per facing)         |
| +0x1ec         | Facing-to-dx lookup (12 bytes)                         |
| +0x1f8         | Per-cell special-square index                          |
| +0x240         | Per-cell event table entry (2 bytes/cell)              |
| +0x378         | Per-cell door state                                    |
| +0x43a         | Per-cell pit/chute flag                                |
| +0x4fa, +0x512 | Automap discovery history (5 entries × 12 levels)      |

## Functions, sorted by address

| Address | New Name                        | Old Name      | Category       | Notes                                                                                                                                     |
| ------- | ------------------------------- | ------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 0x42    | view_load_floor_ceiling_tiles   | FUN_0000_0042 | maze_view      | Lazy-loads tile bitmap at `[0x363c*4+0x7d2]`; selects per-zone palette.                                                                   |
| 0xf1    | anim_tick_render_idle           | FUN_0000_00f1 | maze_view      | Per-tick idle animation dispatch.                                                                                                         |
| 0x117   | view_pick_rng_variant_byte      | FUN_0000_0117 | maze_view      | `rng(100)%4`-indexed lookup into per-zone variant table.                                                                                  |
| 0x184   | view_write_rng_variant_byte     | FUN_0000_0184 | maze_view      | Companion writer for the variant table.                                                                                                   |
| 0x1d1   | automap_reveal_flood            | FUN_0000_01d1 | automap        | Recursive flood-fill over reachable cells starting from (x,y); reads wall bits at +0x60/+0x120.                                           |
| 0x3d3   | dungeon_load_zone               | FUN_0000_03d3 | dungeon_loop   | Sets 0x363c=zone; calls wroot's zone loader; reveals all stored automap entries via `automap_reveal_flood`.                               |
| 0x563   | ui_panel_draw_glyph_row         | FUN_0000_0563 | party_panel    | Draws a horizontal glyph row in a panel; called from `party_panel_draw_member`.                                                           |
| 0x644   | party_panel_draw_member         | FUN_0000_0644 | party_panel    | Renders status box for one slot: name, HP, SP, status flags, alternating display window by parity.                                        |
| 0x925   | party_panel_redraw_all          | FUN_0000_0925 | party_panel    | Iterates 0..party_size; calls `party_panel_draw_member` for each.                                                                         |
| 0x983   | party_panel_redraw_name         | FUN_0000_0983 | party_panel    | Single-member name redraw helper.                                                                                                         |
| 0xdd7   | delay_with_keypress_poll        | FUN_0000_0dd7 | ui_helper      | 5n-tick spin loop with `kbd_check_with_filter`; aborts on Enter.                                                                          |
| 0xe54   | msg_draw_to_main_window         | FUN_0000_0e54 | message_window | Draws a string to the main window via wroot text APIs.                                                                                    |
| 0xe81   | msg_load_and_draw_string        | FUN_0000_0e81 | message_window | Loads message by id and draws it.                                                                                                         |
| 0xea0   | msg_show_with_pause             | FUN_0000_0ea0 | message_window | Composite: load + draw + delay.                                                                                                           |
| 0xf2a   | maze_check_wall_in_direction    | FUN_0000_0f2a | maze_state     | Dispatcher: dir 0/2 → north walls at +0x60; dir 1/3 → west walls at +0x120; backward variants call `maze_check_wall_*_step`.              |
| 0xfd0   | menu_wait_for_key_or_repaint    | FUN_0000_0fd0 | menu_selector  | Idle/redraw poll loop used by `menu_grid_select` and the main loop.                                                                       |
| 0x1053  | status_effects_decay_timers     | FUN_0000_1053 | maze_state     | Decrements 6 status-effect timers at +0x4ec8; clears slot id when timer reaches 0.                                                        |
| 0x108b  | maze_step_global_xy             | FUN_0000_108b | maze_state     | `switch(direction){0:y+=n; 1:x+=n; 2:y-=n; 3:x-=n;}` — global-coordinate update.                                                          |
| 0x10ed  | maze_save_position              | FUN_0000_10ed | maze_state     | Saves face/level/y/x/gy/gx into the `0x4f8c..0x4f98` slot.                                                                                |
| 0x1118  | msg_show_in_main_window         | FUN_0000_1118 | message_window | Composite show-message helper used by event triggers.                                                                                     |
| 0x1145  | maze_restore_position           | FUN_0000_1145 | maze_state     | Inverse of `maze_save_position`; resolves new cell via `maze_resolve_xy_to_facing`.                                                       |
| 0x1190  | msg_show_centered_with_choice   | FUN_0000_1190 | message_window | Modal dialog with centered text.                                                                                                          |
| 0x1539  | menu_redraw_item                | FUN_0000_1539 | menu_selector  | Repaints one cell at `(idx/cols, idx%cols)`; helper for `menu_grid_select`.                                                               |
| 0x1574  | menu_grid_select                | FUN_0000_1574 | menu_selector  | Generic up/down/left/right grid menu selector with mask table; returns selected idx or -1.                                                |
| 0x1b0b  | party_remove_member_and_compact | FUN_0000_1b0b | party_panel    | Removes one party slot, shifts remaining slots, decrements `0x43ce`.                                                                      |
| 0x2086  | party_check_member_alive        | FUN_0000_2086 | party_panel    | Returns true if status<dead and not death/petrified.                                                                                      |
| 0x20cd  | save_load_error_cleanup         | FUN_0000_20cd | save_load      | Error path closing the save-window and replaying message.                                                                                 |
| 0x20eb  | save_write_party_and_state      | FUN_0000_20eb | save_load      | Writes all party-member structs (0x1b0 each) + maze position state to `SAVEGAME.DBS`.                                                     |
| 0x2794  | dungeon_in_camp_menu            | FUN_0000_2794 | dungeon_loop   | In-dungeon camp/options menu (presents `menu_grid_select` with rest/save/load/quit).                                                      |
| 0x2abc  | dungeon_main_loop               | FUN_0000_2abc | dungeon_loop   | The dungeon-traversal state machine. Idle timer, encounter dispatch, party panel refresh, movement input.                                 |
| 0x3073  | maze_set_global_xy_and_resolve  | FUN_0000_3073 | maze_state     | Sets (gx,gy) and calls `maze_resolve_xy_to_facing`.                                                                                       |
| 0x309d  | maze_can_pass_doors_and_walls   | FUN_0000_309d | maze_state     | Combined door+wall pass check including special handling for zones 0/4/5 and door types.                                                  |
| 0x3244  | maze_can_step_in_facing         | FUN_0000_3244 | maze_state     | Returns 0=open, 1=blocked. Calls `maze_check_wall_in_direction` + `maze_can_pass_doors_and_walls`.                                        |
| 0x3286  | maze_animate_temp_step          | FUN_0000_3286 | maze_state     | Saves position, swaps in save slot, renders frame, restores. Used for stair-preview/teleport-preview.                                     |
| 0x32f5  | maze_clear_and_load_msg         | FUN_0000_32f5 | message_window | Clears screen then loads message.                                                                                                         |
| 0x3304  | maze_rotate_party               | FUN_0000_3304 | maze_state     | Increments `0x4f9a` facing by 1 each iteration mod 4, calls `view_render_and_present` + `delay_with_keypress_poll` per step.              |
| 0x357a  | maze_facing_covers_xy           | FUN_0000_357a | maze_state     | Returns facing if (gx,gy) falls within its 8×8 range; -1 otherwise.                                                                       |
| 0x35b7  | maze_resolve_xy_to_facing       | FUN_0000_35b7 | maze_state     | Tries 12 facings, returns 0 + writes back (zone-local x,y) on match; 1 if no facing covers (gx,gy).                                       |
| 0x36dd  | maze_check_wall_north_step      | FUN_0000_36dd | maze_state     | Wall-check 1 cell north of (x,y); special handling for zones 10/12.                                                                       |
| 0x3742  | maze_check_wall_west_step       | FUN_0000_3742 | maze_state     | Wall-check 1 cell west of (x,y); same special handling.                                                                                   |
| 0x37a7  | view_step_forward_by_facing     | FUN_0000_37a7 | maze_view      | Transforms (delta-forward, delta-side) by facing 0..3 (cardinal).                                                                         |
| 0x3828  | view_draw_corridor_sides        | FUN_0000_3828 | maze_view      | Per-depth render of left/right corridor walls + doors.                                                                                    |
| 0x3c11  | view_draw_corridor_corners      | FUN_0000_3c11 | maze_view      | Per-depth render of corner pieces / portal markers.                                                                                       |
| 0x3dce  | view_draw_corridor_overlay      | FUN_0000_3dce | maze_view      | Per-depth render of overlay pieces (decals, doors).                                                                                       |
| 0x406c  | view_draw_sprite_at_depth       | FUN_0000_406c | maze_view      | Generic sprite blit at a given depth slot with palette and clip rect.                                                                     |
| 0x4ad7  | view_render_corridor_frame      | FUN_0000_4ad7 | maze_view      | The 3D-corridor renderer: iterates 4 depths, dispatches into the per-piece draw functions above. Heaviest function in wmaze (2192 bytes). |
| 0x5367  | view_render_and_present         | FUN_0000_5367 | maze_view      | Calls `view_render_corridor_frame` then flips the back buffer to screen via wroot.                                                        |
| 0x554a  | ui_draw_progress_bar            | FUN_0000_554a | ui_helper      | Generic progress-bar (e.g., for door-bash, rest progress, save-progress).                                                                 |
| 0x577a  | msg_window_close_or_continue    | FUN_0000_577a | message_window | After-message scroll/clear/wait-key.                                                                                                      |
| 0x57a8  | msg_window_draw_text_wrapped    | FUN_0000_57a8 | message_window | Word-wrapped text drawer with `$` (newline) and `^` (anchored-x) format codes.                                                            |
| 0x58ed  | msg_show_short_in_window        | FUN_0000_58ed | message_window | Opens a small window, draws message, waits, closes.                                                                                       |
| 0x5a28  | special_chute_fall_sequence     | FUN_0000_5a28 | special_square | Animates a multi-step fall: rotates facing each tick and advances one cell. Triggered on entering a pit cell.                             |
| 0x5c58  | special_mark_visited_bits       | FUN_0000_5c58 | special_square | Sets bit in per-level visited bitmap at `+0x4eec`.                                                                                        |
| 0x5cc8  | special_teleport_party          | FUN_0000_5cc8 | special_square | Reads (x,y,z,zone) from event entry at +0x240; cross-zone calls `dungeon_load_zone`.                                                      |
| 0x5e22  | encounter_check_trigger         | FUN_0000_5e22 | encounter      | Reads event flags at +0x240 bit 0xe; on match sets game-state to 0x15 (combat).                                                           |
| 0x5ebd  | msg_show_event_dialog           | FUN_0000_5ebd | message_window | Shows long-form event message window with party member name interpolation.                                                                |
| 0x5f91  | encounter_roll_random_member    | FUN_0000_5f91 | encounter      | Rolls per-zone encounter threshold and picks an eligible (alive, not paralyzed) member.                                                   |
| 0x612a  | getbits_2_thunk                 | FUN_0000_612a | ui_helper      | Inline wrapper around wroot's getbits-N (width=2).                                                                                        |
| 0x6144  | special_execute_event           | FUN_0000_6144 | special_square | Multi-step event executor: opens walls along a vector, plays animation, displays message.                                                 |
| 0x64ec  | msg_show_for_party_member       | FUN_0000_64ec | message_window | Message window with party-member-name prefix.                                                                                             |
| 0x6608  | party_apply_status_effect       | FUN_0000_6608 | party_panel    | Raises status level at +0x4589; if >=3 also zeros HP/SP and applies death icon.                                                           |
| 0x66bc  | party_damage_member             | FUN_0000_66bc | party_panel    | Subtracts HP at +0x4400; if HP<=0 calls `party_apply_status_effect` for death.                                                            |
| 0x894e  | ui_window_putchar_at            | FUN_0000_894e | ui_helper      | Writes one cell to window struct at `(x,y)`. Used heavily by `rest_save_session`/`rest_load_session` for frame drawing.                   |
| 0x8974  | rest_save_session               | FUN_0000_8974 | rest_camp      | Camp UI variant: draws a progress frame, ticks HP/SP/turns, then writes save via `save_write_party_and_state`.                            |
| 0x8e4f  | rest_load_session               | FUN_0000_8e4f | rest_camp      | Companion to `rest_save_session`; loads save state and unwinds the camp frame.                                                            |
| 0x9345  | save_load_menu                  | FUN_0000_9345 | save_load      | Top-level save-slot picker; dispatches to `rest_save_session`/`rest_load_session` after the user picks a slot.                            |
| 0x9532  | encounter_check_face_match      | FUN_0000_9532 | encounter      | Checks whether the event at `+0x240[i]` requires the party to face a specific direction.                                                  |
| 0x96aa  | compare_word_strings            | FUN_0000_96aa | ui_helper      | Lexicographic word-pair comparison. Used for the save-slot name sort.                                                                     |
