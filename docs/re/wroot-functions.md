# wroot.exe — Named Functions

This is the human-readable index of function names applied to `wroot.exe` in the Ghidra project at `tools/ghidra/wiz6.gpr`. It is generated from the first comprehensive function-naming pass (see `docs/re/findings/wroot-naming-pass.json` for the structured source, including per-function evidence).

**Status:** 75 of 145 functions named (52% coverage). Skew toward MS-C 5.x/6.x runtime helpers (41) and the windowing UI (14). Game-logic subsystems (combat, dungeon, character, NPC) live in the `.ovr` overlays — they are not in this binary.

**Convention:** snake_case names. Prefixes group functions into subsystems:

| Prefix                            | Subsystem                                       |
| --------------------------------- | ----------------------------------------------- |
| `crt_*`                           | Microsoft C 5.x/6.x runtime library helpers     |
| `memcpy/strcpy/strlen/strcat/...` | C library primitives (unprefixed, conventional) |
| `printf_*`                        | Formatted-output machinery                      |
| `ui_window_*`                     | Text-mode windowing system                      |
| `ui_screen_*`                     | Full-screen refresh                             |
| `kbd_*`                           | Keyboard input                                  |
| `video_*`                         | Video / cursor BIOS calls                       |
| `disk_*`                          | Disk BIOS (INT 13h)                             |
| `mouse_*`                         | Mouse input                                     |
| `boot_*`                          | Game-data load + disk-swap UX                   |
| `ovl_*`                           | Overlay loader                                  |
| `file_io / load_*`                | Higher-level file readers                       |
| `huffman_*`                       | Compressed-asset decompression                  |
| `rng_*`                           | Random number generator                         |
| `abort_*`                         | Process-abort cleanup paths                     |

## Functions, sorted by address

| Address | New Name                        | Old Name      | Category | Notes (see findings JSON for full evidence)                                          |
| ------- | ------------------------------- | ------------- | -------- | ------------------------------------------------------------------------------------ |
| 0x10000 | abort_cleanup_dispatch          | FUN_1000_0000 | crt      | Switch on cleanup level; walks heap tables and closes saved handles.                 |
| 0x100d5 | abort_with_code                 | FUN_1000_00d5 | crt      | Composite: cleanup + atexit + exit.                                                  |
| 0x100ea | abort_alloc_fail                | FUN_1000_00ea | crt      | Allocation-failure panic shim.                                                       |
| 0x100fe | memcpy_thunk_5arg               | FUN_1000_00fe | crt      | 5-arg forwarder to memcpy.                                                           |
| 0x1011a | ui_window_create                | FUN_1000_011a | ui       | Allocates window struct + registers in chain.                                        |
| 0x102d2 | ui_window_destroy               | FUN_1000_02d2 | ui       | Removes from chain + frees struct + refresh.                                         |
| 0x1030b | ui_window_set_cursor            | FUN_1000_030b | ui       | Sets window-relative cursor (col,row).                                               |
| 0x105c1 | string_substitute_char          | FUN_1000_05c1 | crt      | Replaces a marker char with a string (used for `^` → drive letter).                  |
| 0x109fb | ui_window_redraw_focused        | FUN_1000_09fb | ui       | Focus + clear + blit composite.                                                      |
| 0x10bd8 | mouse_get_pos                   | FUN_1000_0bd8 | mouse    | Polls mouse via INT 33 proxy table.                                                  |
| 0x10c16 | mouse_status_set_field          | FUN_1000_0c16 | mouse    | Writes 4-byte status entry at 0x3598+i*4.                                            |
| 0x10c42 | mouse_read_state_or_zero        | FUN_1000_0c42 | mouse    | Mouse poll if installed; else 0.                                                     |
| 0x10c82 | strncpy_until_delim             | FUN_1000_0c82 | crt      | Copies src to dst until nul OR delim char.                                           |
| 0x10cd6 | boot_build_prompt_message       | FUN_1000_0cd6 | boot     | Builds 'INSERT DISK / PRESS X' prompt with disk-letter substitution.                 |
| 0x10d26 | boot_prompt_swap_disk_and_load  | FUN_1000_0d26 | boot     | The disk-swap orchestrator — references all major game-data filenames.               |
| 0x11124 | boot_select_disk_for_content    | FUN_1000_1124 | boot     | Maps scenario-layout id + content kind to target disk.                               |
| 0x1132d | ovl_install_table               | FUN_1000_132d | ovl      | Installs WINIT/WBASE/WMAZE/.../WDOPT name table.                                     |
| 0x11462 | disk_int13_reset                | FUN_1000_1462 | disk     | INT 13 AH=00 — Reset Disk System.                                                    |
| 0x11c59 | video_set_cursor_position       | FUN_1000_1c59 | video    | INT 10 AH=02.                                                                        |
| 0x12168 | crt_dos_exit_with_code          | FUN_1000_2168 | crt      | INT 21 AH=49 + AH=4C abort.                                                          |
| 0x121bb | load_font_or_portrait           | FUN_1000_21bb | file_io  | INT 21 AH=3F read; abort on error.                                                   |
| 0x123e3 | ui_window_putchar               | FUN_1000_23e3 | ui       | Writes char+attr at window cursor; advances.                                         |
| 0x1251d | ui_window_puts                  | FUN_1000_251d | ui       | Loops ui_window_putchar over string.                                                 |
| 0x125b9 | rng_advance                     | FUN_1000_25b9 | rng      | Wichmann-Hill 3-stream Lehmer LCG.                                                   |
| 0x12643 | kbd_check_with_filter           | FUN_1000_2643 | kbd      | Non-blocking INT 16/INT 21 with char filter; arrow → 0x08..0x0b mapping.             |
| 0x12724 | kbd_getkey_with_filter          | FUN_1000_2724 | kbd      | Blocking variant of kbd_check_with_filter.                                           |
| 0x1280c | kbd_flush_buffer                | FUN_1000_280c | kbd      | Drains INT 16 keystrokes.                                                            |
| 0x12985 | load_misc_table                 | FUN_1000_2985 | file_io  | INT 21 AH=3F read; abort on error.                                                   |
| 0x12a63 | ui_screen_refresh               | FUN_1000_2a63 | ui       | Iterates all 1000 cells; repaints dirty ones via driver.                             |
| 0x12b19 | ui_window_blit                  | FUN_1000_2b19 | ui       | Heaviest renderer (1082 bytes); per-cell driver dispatch.                            |
| 0x1303e | ui_window_remove_from_chain     | FUN_1000_303e | ui       | Unlinks window; clears attribute plane.                                              |
| 0x13118 | ui_window_focus                 | FUN_1000_3118 | ui       | Sets focus bit; marks cells with attr 0x80.                                          |
| 0x131d1 | ui_window_unfocus               | FUN_1000_31d1 | ui       | Clears focus bit; strips 0x80.                                                       |
| 0x13250 | ui_window_inner_bounds          | FUN_1000_3250 | ui       | Computes inner content rect (minus borders).                                         |
| 0x132be | ui_window_clear                 | FUN_1000_32be | ui       | Fills inner area with char+attr.                                                     |
| 0x133e9 | huffman_load_and_decompress     | FUN_1000_33e9 | file_io  | Loads compressed asset header + allocates output buffer.                             |
| 0x134d5 | huffman_decode_bitstream        | FUN_1000_34d5 | file_io  | Walks Huffman tree with bit-stream from 4096-byte refill buffer.                     |
| 0x13556 | crt_dos_free_env                | FUN_1000_3556 | crt      | INT 21 AH=49 — Free Memory.                                                          |
| 0x13640 | kbd_pre_input_disk_check        | FUN_1000_3640 | kbd      | Floppy-state check before each blocking key read.                                    |
| 0x136e9 | ovl_make_filename               | FUN_1000_36e9 | ovl      | Builds '<name>.ovr'.                                                                 |
| 0x137c5 | ovl_load_or_die                 | FUN_1000_37c5 | ovl      | Prints 'Error %d loading overlay: %s' and aborts.                                    |
| 0x137fa | crt_int21_wrapper               | FUN_1000_37fa | crt      | Single-call INT 21 with CF passthrough.                                              |
| 0x13817 | crt_dos_read_handle             | FUN_1000_3817 | crt      | INT 21 AH=3F generic read.                                                           |
| 0x1387a | memcpy                          | FUN_1000_387a | crt      | 16-bit word copy with 1-byte tail.                                                   |
| 0x138d7 | strcat                          | FUN_1000_38d7 | crt      | Standard strcat.                                                                     |
| 0x1390e | strcpy                          | FUN_1000_390e | crt      | Measure-then-MOVSW strcpy.                                                           |
| 0x1393a | crt_dos_alloc_block             | FUN_1000_393a | crt      | INT 21 AH=48 — Allocate Memory Block.                                                |
| 0x13970 | crt_dos_free_block              | FUN_1000_3970 | crt      | INT 21 AH=49 — Free Memory.                                                          |
| 0x13988 | crt_pack_open_flags             | FUN_1000_3988 | crt      | 4-rotation flag packer for _open mode.                                               |
| 0x13b20 | ui_window_free_struct           | FUN_1000_3b20 | ui       | Validates + adds to free-list.                                                       |
| 0x13b9f | printf_format                   | FUN_1000_3b9f | crt      | %-parser with jump-table at 0x3b5a keyed by char-position in 'LlhFNoxXudiscpneEfgG'. |
| 0x13e08 | printf_putchar                  | FUN_1000_3e08 | crt      | Raw putchar used by printf.                                                          |
| 0x13e3f | printf_parse_width_or_precision | FUN_1000_3e3f | crt      | Parses digit sequence from format string.                                            |
| 0x13e88 | crt_open                        | FUN_1000_3e88 | crt      | High-level _open with O_* flag handling.                                             |
| 0x1400f | strlen                          | FUN_1000_400f | crt      | Standard strlen.                                                                     |
| 0x1402c | crt_dos_open_or_create          | FUN_1000_402c | crt      | Dispatches AH=3D (open) or AH=3C (create).                                           |
| 0x14072 | crt_startup                     | entry         | crt      | MS-C 5.x/6.x _astart — MZ entry point.                                               |
| 0x141b6 | crt_exit_raw                    | FUN_1000_41b6 | crt      | INT 21 AH=4C.                                                                        |
| 0x141df | crt_main_set_iostate            | FUN_1000_41df | crt      | Initializes _osfile[0..2]; calls overlay setup; then atexit+exit.                    |
| 0x142ab | crt_run_atexit_and_exit         | FUN_1000_42ab | crt      | Calls atexit chain at [0x68a] then exits.                                            |
| 0x142bd | crt_cinit_stub                  | FUN_1000_42bd | crt      | Empty _cinit placeholder.                                                            |
| 0x142bf | crt_write_thunk                 | FUN_1000_42bf | crt      | Forwarder to crt_int21_with_carry.                                                   |
| 0x142d3 | crt_read_via_fd                 | FUN_1000_42d3 | crt      | TTY-aware read (dispatches via fn-table for TTY handles).                            |
| 0x142da | crt_write_via_fd                | FUN_1000_42da | crt      | Twin of crt_read_via_fd for write.                                                   |
| 0x142f7 | crt_int21_with_carry            | FUN_1000_42f7 | crt      | Single INT 21 with CF detection.                                                     |
| 0x14309 | crt_dos_close                   | FUN_1000_4309 | crt      | INT 21 AH=3E — Close handle.                                                         |
| 0x14321 | crt_dos_lseek                   | FUN_1000_4321 | crt      | INT 21 AH=42 — Seek.                                                                 |
| 0x14340 | crt_dos_unlink                  | FUN_1000_4340 | crt      | INT 21 AH=41 — Delete file.                                                          |
| 0x14358 | crt_dos_rename                  | FUN_1000_4358 | crt      | INT 21 AH=56 — Rename.                                                               |
| 0x14379 | crt_fgets_buffered              | FUN_1000_4379 | crt      | Line-buffered read into static 260-byte buffer at 0x6cc.                             |
| 0x14440 | crt_memmove                     | FUN_1000_4440 | crt      | Overlap-safe (reverse-copy when needed).                                             |
| 0x14485 | crt_dos_ioctl                   | FUN_1000_4485 | crt      | INT 21 AH=44 — IOCTL Get Device Info.                                                |
| 0x144a5 | crt_sbrk                        | FUN_1000_44a5 | crt      | Adjusts heap top; calls crt_brk.                                                     |
| 0x144d9 | crt_brk                         | FUN_1000_44d9 | crt      | INT 21 AH=4A — Resize Memory.                                                        |
| 0x14565 | crt_set_sp_min                  | FUN_1000_4565 | crt      | Sets stack-overflow guard at [0x69e].                                                |

## What was NOT renamed and why

69 functions remain as `FUN_XXXX`. They fall into three groups:

1. **Small UI helpers** (0x10100-0x10c00 range, plus 0x11c00-0x12500): tiny one-or-two-line wrappers around the driver function-table at `[0x1b8a..0x1bca]`. These are clearly part of the windowing system, but assigning specific names (e.g. `ui_window_scroll_up_one` vs `ui_window_scroll_left_one`) needs the driver-table slots to be identified first.

2. **More CRT internals**: `__init_storage`, helper math (mul64/div64), and small stack-frame helpers. Identifying them requires comparing against a reference MS-C 5.x library, which we didn't have ready.

3. **Game-logic glue**: a handful of functions called from `boot_prompt_swap_disk_and_load` and the overlays that look game-shaped but can't be confidently named without dynamic tracing or seeing where their output goes (most likely candidates: a few savegame-marshalling helpers).

**Combat, dungeon, character, NPC subsystems are NOT in wroot.exe.** They live in the corresponding overlays (`wmele.ovr`, `wmaze.ovr`, `wpcmk.ovr`, `wpcvw.ovr`, `wmnpc.ovr`). The next major naming pass should target those — particularly `wmele.ovr` (combat) and `wmaze.ovr` (dungeon stepping) since they will share much of wroot's DGROUP layout and benefit from the names already applied here.

## Operational

These names persist in the Ghidra project at `tools/ghidra/wiz6.gpr` (under user `versioned/` data). They are applied as `SourceType.USER_DEFINED`, so re-opening the project will show them.

To re-apply (or extend) the rename list, the script is at `/tmp/ghidra-scripts/wroot_rename.py`. Headless invocation pattern (use `-noanalysis` to preserve annotations):

```bash
python3 /tmp/ghidra-scripts/wroot_rename.py
```

The script uses PyGhidra directly (not `analyzeHeadless`), which is simpler and avoids the post-script reload of the analyzer.

If the project's annotations ever need to be regenerated, the source-of-truth is `docs/re/findings/wroot-naming-pass.json` — re-running the rename script with that data should produce an equivalent state.
