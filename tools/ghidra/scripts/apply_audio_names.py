#!/usr/bin/env python3
"""Apply audio-path function names to wroot.exe in the Ghidra project.

Audio path discovered during the .SND format investigation (2026-05-22). The
prior naming pass mis-identified the audio engine entry at 0x11462 as
`disk_int13_reset` (it has an INT 13h branch only for fatal aborts; the main
body is PIT/PIC/PC-speaker/AdLib hardware programming). This script:

1. Renames the misnamed `disk_int13_reset` (0x11462) and `kbd_pre_input_disk_check`
   (0x13640) to their accurate audio-engine names.
2. Creates and names the IRQ0 ISR variants (no auto-created functions for them
   because they're installed via IVT writes, not called directly).
3. Names the AdLib OPL helpers and other audio subsystem functions.

Re-runnable: functions already at the target name are no-ops.

Usage:
    python3 tools/ghidra/scripts/apply_audio_names.py
    python3 tools/ghidra/scripts/apply_audio_names.py --dry-run

NOTE: Close the Ghidra GUI before running (project lock).
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


# Existing functions to rename (the audio engine, dispatchers, helpers)
RENAMES = [
    # The audio play dispatch entry (called from overlays via thunk 0xC546)
    ("0x10aaa", "audio_play_sound"),
    ("0x10a8f", "audio_volume_range_check"),
    # The audio play-by-id wrapper that looks up the buffer pointer
    ("0x135fd", "audio_play_by_id"),
    # The main audio engine — installs IRQ0 ISR, programs PIT, gates speaker.
    # Was wrongly named `disk_int13_reset` (INT 13h is only in the fatal-abort
    # branch when param_7 == 0xff).
    ("0x11462", "audio_engine_play"),
    # Was wrongly named `kbd_pre_input_disk_check` — actually waits for any
    # currently-playing sound to finish (calls audio_engine_play(0,0,0,0,0,0,0)
    # which spins on DAT_1764 busy-flag and returns DAT_1760 flags). Called
    # before kbd polls to avoid IRQ contention.
    ("0x13640", "audio_wait_for_idle"),
]


# Functions reached only via IVT write (uRam00000020 := <addr>), internal calls
# Ghidra didn't follow, or sub-functions not auto-discovered. Create functions
# at these addresses and name them.
CREATES = [
    # IRQ0 ISR variants installed via IVT writes in audio_engine_play.
    ("0x118c3", "audio_isr_adlib_slow"),       # *0x1756 != 0..1, slow path
    ("0x11901", "audio_isr_adlib_fast"),       # *0x1756 == 1, simple AdLib write
    ("0x11919", "audio_isr_var_slow"),         # *0x1756 != 0..1, slow path (uses port [cs:0x175B])
    ("0x11947", "audio_isr_var_fast"),         # *0x1756 != 0..1, fast (uses port [cs:0x175B])
    ("0x1196a", "audio_isr_pc_speaker_fast"),  # *0x1756 == 0, PIT mode 0 reload
    ("0x119d4", "audio_isr_pc_speaker_slow"),  # *0x1756 == 0, slow PIT mode 0 reload
    ("0x11a08", "audio_isr_pc_speaker_alt"),   # alt PC speaker variant
    # AdLib (OPL2) hardware helpers — internal calls from audio_engine_play
    # and audio_adlib_init_voice.
    ("0x11a92", "audio_opl_write"),
    ("0x11aa3", "audio_opl_status_wait_long"),
    ("0x11ab3", "audio_opl_status_wait_short"),
    ("0x11962", "audio_adlib_init_voice"),
    # Default tick handler (just increments tick counter + EOI; installed when
    # no sound is playing).
    ("0x11a88", "audio_isr_tick_no_sound"),
]


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--project-dir", default="tools/ghidra")
    ap.add_argument("--project-name", default="wiz6")
    ap.add_argument("--binary", default="wroot.exe")
    ap.add_argument("--dry-run", action="store_true",
                    help="show what would change without modifying the project")
    args = ap.parse_args()

    repo_root = Path(__file__).resolve().parents[3]

    os.environ.setdefault(
        "GHIDRA_INSTALL_DIR", "/opt/homebrew/Cellar/ghidra/12.1/libexec"
    )

    import pyghidra
    pyghidra.start()

    from ghidra.base.project import GhidraProject
    from ghidra.program.model.symbol import SourceType

    project_dir = str((repo_root / args.project_dir).resolve())
    project = GhidraProject.openProject(project_dir, args.project_name, False)
    program = project.openProgram("/", args.binary, args.dry_run)
    listing = program.getListing()
    fm = program.getFunctionManager()
    af = program.getAddressFactory()
    space = af.getDefaultAddressSpace()

    applied = 0
    already = 0
    created = 0
    errors = []

    tx_id = None
    if not args.dry_run:
        tx_id = program.startTransaction("apply_audio_names")
    tx_committed = False
    try:
        # Create any missing functions (IRQ0 ISRs).
        for off_str, new_name in CREATES:
            off = int(off_str, 0)
            addr = space.getAddress(off)
            f = fm.getFunctionAt(addr)
            if f is not None:
                cur = f.getName()
                if cur == new_name:
                    already += 1
                else:
                    if args.dry_run:
                        print(f"  WOULD RENAME (existing) {off_str}  {cur:30s} -> {new_name}")
                        applied += 1
                    else:
                        try:
                            f.setName(new_name, SourceType.USER_DEFINED)
                            applied += 1
                        except Exception as e:
                            errors.append((off, new_name, str(e)))
                continue
            # No function yet — create one.
            if args.dry_run:
                print(f"  WOULD CREATE {off_str}  -> {new_name}")
                created += 1
                continue
            try:
                from ghidra.app.cmd.function import CreateFunctionCmd
                cmd = CreateFunctionCmd(addr)
                ok = cmd.applyTo(program)
                if not ok:
                    errors.append((off, new_name, f"CreateFunctionCmd failed: {cmd.getStatusMsg()}"))
                    continue
                f = fm.getFunctionAt(addr)
                if f is None:
                    errors.append((off, new_name, "function still missing after create"))
                    continue
                f.setName(new_name, SourceType.USER_DEFINED)
                created += 1
            except Exception as e:
                errors.append((off, new_name, f"create+rename: {e}"))

        # Rename existing functions.
        for off_str, new_name in RENAMES:
            off = int(off_str, 0)
            addr = space.getAddress(off)
            f = listing.getFunctionAt(addr)
            if f is None:
                f = listing.getFunctionContaining(addr)
                if f is None or f.getEntryPoint().getOffset() != off:
                    errors.append((off, new_name, "no function at addr"))
                    continue
            cur = f.getName()
            if cur == new_name:
                already += 1
                continue
            if args.dry_run:
                print(f"  WOULD RENAME {off_str}  {cur:30s} -> {new_name}")
                applied += 1
            else:
                try:
                    f.setName(new_name, SourceType.USER_DEFINED)
                    applied += 1
                except Exception as e:
                    errors.append((off, new_name, str(e)))

        if tx_id is not None:
            program.endTransaction(tx_id, True)
            tx_committed = True
    finally:
        if tx_id is not None and not tx_committed:
            program.endTransaction(tx_id, False)

    if not args.dry_run and (applied > 0 or created > 0):
        project.save(program)

    project.close()

    print(f"applied={applied} created={created} already_named={already} errors={len(errors)}")
    for off, name, reason in errors:
        print(f"  ERROR 0x{off:x} {name}: {reason}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
