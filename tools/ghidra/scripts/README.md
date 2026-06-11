# tools/ghidra/scripts/

Reusable PyGhidra scripts for the queries we keep running by hand. Each one targets the wiz6 Ghidra project (`tools/ghidra/wiz6.gpr`) by default, but accepts overrides.

## Pattern

These are **standalone Python scripts** that use PyGhidra (`pip3 install pyghidra` — already installed system-wide). They start a Ghidra process, open the project, run a query, print results, exit. No GUI, no Jython dance.

```bash
# Generic invocation
python3 tools/ghidra/scripts/<script>.py --binary <binary> [args...]
```

**Lock conflict:** Ghidra holds an exclusive lock on the project. If the GUI is open, or another script is running, queries block on the lock. Close the GUI before running, or use `--project-dir` to point at a copy.

## Scripts

### `list_functions.py` — enumerate all functions

```bash
python3 tools/ghidra/scripts/list_functions.py --binary wroot.exe
python3 tools/ghidra/scripts/list_functions.py --binary wroot.exe --only-unnamed
```

Useful for: getting a sense of binary scale, finding what's still `FUN_XXXX`, sanity-checking after a naming pass.

### `find_string_xrefs.py` — locate functions by string usage

```bash
python3 tools/ghidra/scripts/find_string_xrefs.py --binary wroot.exe --string "MON"
python3 tools/ghidra/scripts/find_string_xrefs.py --binary wroot.exe --string "Press any key"
```

Useful for: finding the subsystem responsible for known UI strings, format-string identifiers (`%02d.PIC`), or error messages.

### `dump_function.py` — print decompiled C

```bash
python3 tools/ghidra/scripts/dump_function.py --binary wroot.exe --addr 0x1f41
python3 tools/ghidra/scripts/dump_function.py --binary wroot.exe --name pic_load
```

Useful for: capturing function source for docs/re/ notes, diffing decompiled output before/after rename passes, feeding C into other tools.

### `dump_listing.py` — print the raw disassembly listing for an address range

```bash
python3 tools/ghidra/scripts/dump_listing.py --binary wmaze.ovr --start 0x29a5 --end 0x29c0
```

Prints `addr  bytes  instruction  -> ref` per code unit, including resolved references (jump-table targets). Useful when the decompiler garbles a `2E FF A7` cs-relative jump-table dispatch (it splices in unrelated code) and you need to read the real switch + its table. Note: cs-disp16 jump tables in overlays are CS-offset based; translate to file offsets with the per-overlay delta (wmaze = 0x4564).

### `apply_wroot_names.py` — replay the wroot.exe naming pass

```bash
python3 tools/ghidra/scripts/apply_wroot_names.py             # apply
python3 tools/ghidra/scripts/apply_wroot_names.py --dry-run   # preview
```

Reads `docs/re/findings/wroot-naming-pass.json` and applies every `renamed_full_list` entry to the live Ghidra project. Idempotent: functions already at the target name are skipped. Use this to re-apply names after a `setup.sh --force` rebuild, or to extend the rename list (edit the JSON, then re-run).

## Adding new scripts

Templates worth writing when the need comes up (not yet — YAGNI):

- `find_int_callers.py` — find all functions that issue `INT 21h AH=N`, by service number. Classifies file-I/O, memory-allocation, and process-control sites.
- `find_overlay_loaders.py` — find call sites that load overlays via the runtime relocation table (winit.ovr DGROUP_runtime delta).
- `xref_table.py` — for a given data address (BSS variable, palette, jump table), list all read/write sites.
- `dump_data.py` — dump a defined data region with its Ghidra-assigned type, useful for verifying struct layouts.

Drop the new script in this directory, document it in this README, and reference it from `CLAUDE.md` if it becomes part of routine workflow.

## When `pyghidra` errors out

Common gotchas:
- `JDK not found`: PyGhidra needs `JAVA_HOME` set to a JDK 17+. Ghidra ships its own; point at `/opt/homebrew/Cellar/ghidra/12.1/libexec/jdk/Contents/Home/` if not auto-detected.
- `Project locked`: close the Ghidra GUI, or wait for any background script to finish.
- `Program not found`: the `--binary` arg is the import name within the project, not a file path. Use `list_functions.py` with no binary to enumerate.
