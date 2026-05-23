# wmele.ovr — Named Functions (Combat Overlay)

This is the human-readable index of function names applied to `wmele.ovr` in the Ghidra project at `tools/ghidra/wiz6.gpr`. Generated from the comprehensive naming pass on the melee-combat overlay; the structured source with per-function evidence is `docs/re/findings/wmele-naming-pass.json`.

**Status:** 47 of 58 functions named (81% coverage). Coverage spans the full combat lifecycle — state-machine dispatch, encounter setup, monster-group spawn, per-round resolution, attack/animation queue, the 3D combat-scene viewport renderer, and the depth-sorted message window. Remaining 11 functions are mostly per-depth render flag-clearers (mirror wmaze's also-unnamed render helpers) and a jump-table fragment Ghidra couldn't fully analyze.

## State machine integration

wmele.ovr is dispatched by wroot's `ovl_install_table` for three `*0x363a` game-state values:

| State | Decimal | Handler                          | Purpose                                   |
| ----- | ------- | -------------------------------- | ----------------------------------------- |
| 0x0a  | 10      | `wmele_state_0a_init_combat` (0x2d6d) | Allocate buffers, create combat windows, spawn monster groups, load party into combat slots, then transition to 0x0b |
| 0x0b  | 11      | `wmele_state_0b_run_round` (0x2b6a)   | Per-round redraw + monster attacks; transitions to 0x0c (or stays in 0x0b)             |
| 0x0e  | 14      | `wmele_state_0e_end_round` (0x2ceb)   | End-of-round cleanup; transitions to 0x0b (continue) or `*0x4fce` (escape)             |

Header size is 14 bytes (matches wbase.ovr; differs from winit's 12). Dispatch entry at file offset `0x0e`.

## Subsystem prefixes

| Prefix | Subsystem |
| ------ | --------- |
| `wmele_state_*`        | The three state-handler entry points listed above |
| `encounter_*`          | One-time encounter setup: zone selection, leader-monster scripting, party→combat-slot copy |
| `monster_*`            | Recursive monster-group spawn, monster-type data load, per-slot HP/SP/status rolls |
| `combat_resolve_*`     | End-of-round damage resolution, bubble-sort by status level, XP/treasure award |
| `combat_try_*`         | Flee attempts (msg IDs 0xdb6/0xdb7/0xdb8) |
| `combat_attack_*`      | Depth-sorted attack animation queue, target picker, dice rolling |
| `combat_view_*`        | 3D combat-scene viewport renderer (reuses maze position state) |
| `combat_msg_*`         | Combat-message window dispatch (status-level sorted) |
| `slot_tick_*`          | Per-combat-slot HP/SP/status decay tick |
| `dice_roll_*`          | Classic XdY+Z dice rolling utility (used everywhere) |

## Key BSS globals

- `0x4354` — leader monster flag (set when leader's type matches scripted IDs 0x80/0x97/0x99)
- `0x4358` — animation tick counter (-2 initial value, increments per frame)
- `0x4360` — group count (incremented per spawn call)
- `0x4362` — rank matrix, 0x14 bytes; cleared at encounter init
- `0x43b6` — per-slot monster-type-buffer pointers (7 slots × 0xde bytes)
- `0x43c6` / `0x43c8` — encounter flags
- `0x51a8` — 11-byte monster-placement records used by `combat_view_render_scene`
- `0x4fce` — escape target for end-of-round transition

## Cross-overlay (thunk) call graph

wmele.ovr calls into wroot.exe through 44 distinct BSS function-pointer thunks at 122 call sites. The thunk-delta law (`thunk_address = wroot_file_offset + 0xBA9C`) resolves each thunk to a wroot file offset:

- **26 of 44 thunks** resolve to wroot functions already named in `docs/re/findings/wroot-naming-pass.json` (e.g. `ui_window_create`, `kbd_check_with_filter`, `huffman_load_and_decompress`).
- **18 of 44 thunks** resolve to functions still named `FUN_xxxx` in wroot. Of those, 14 have informal names from prior wmaze/wbase passes that should be promoted in a future wroot follow-up (notably `rng_next` 0x9e2, `load_msg_into_buf` 0x75b, `play_sound_entry` 0xaaa, `getbit_test` 0x28af, `getbits_n` 0x2925, `video_descriptor_render` 0x36ac).

Full per-thunk listing with call-site counts is in `findings/wmele-naming-pass.json` → `thunk_usage`.

## Combat-slot layout

Each combat slot is 0x2c bytes; 13 slots per group; up to 7 groups. Field layout extracted from the round-resolver and slot-tick functions:

- `+0x00..0x03` — HP current / HP max (word each)
- `+0x04..0x07` — SP current / SP max (word each)
- `+0x08` — status_level (sorted by this in `combat_resolve_round_for_party`)
- `+0x0a..` — status flags, action queue, attack/defense stats (see findings JSON for full byte map)

Combat-slot read/write helpers are named `slot_*`.

## Notable reuses

- **Maze helpers** at 0x2f8b / 0x2fc8 / 0x30ee / 0x3153 / 0x31b8 reuse the wall-check logic from wmaze.ovr — the combat view renders dungeon walls behind monster sprites by re-running the same coordinate math.
- **The 3D combat-scene viewport renderer** at `combat_view_render_scene` (0x44e8, 2192 bytes) is structurally similar to wmaze's `maze_view_render` — same iterate-by-depth pattern, similar per-segment sprite drawing routines.

## Remaining unnamed functions

11 of 58 still labeled `FUN_xxxx`. They cluster around:

- Per-depth render flag-clearers (4–5 functions). Mirror wmaze's still-unnamed view helpers; best resolved with a dynamic DOSBox-X trace.
- One jump-table fragment at 0x4426 that Ghidra couldn't fully analyze. Manual disassembly may resolve.
- A handful of small helpers (≤30 bytes each) that would benefit from observing a real combat encounter to disambiguate.

See `unresolved` + `next_steps` sections of `docs/re/findings/wmele-naming-pass.json`.

## See also

- [`docs/re/findings/wmele-naming-pass.json`](findings/wmele-naming-pass.json) — structured source with per-function evidence.
- [`docs/re/wmaze-functions.md`](wmaze-functions.md) — sister overlay (dungeon traversal); shares position-state globals and render conventions.
- [`docs/re/wbase-main-menu.md`](wbase-main-menu.md) — sister overlay (main menu); shares the 14-byte header style and `*0x4fce` next-state cache mechanism.
- [`tools/ghidra/scripts/apply_wmele_names.py`](../../tools/ghidra/scripts/apply_wmele_names.py) — idempotent replay script for the rename pass.
