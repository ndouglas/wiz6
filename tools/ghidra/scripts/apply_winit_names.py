#!/usr/bin/env python3
"""Apply the curated winit.ovr function-naming pass.

Loads names from docs/re/findings/startup-sequence.json and applies them to
the Ghidra project. Each function gets:
  - name set to `new` field
  - SourceType.USER_DEFINED so the rename survives re-opens

Additionally creates 3 functions at addresses that are reached only via the
overlay's runtime dispatch (no direct CALL/JMP for auto-analysis to follow):
  - 0x0c (winit_overlay_entry)
  - 0x9f3 (winit_state1_title_and_credits)
  - 0xdf6 (winit_state8_graveyard)

Re-runnable: rewriting the JSON and re-running this script will reconverge the
project's annotations to whatever the JSON says. Functions already at the
target name are no-ops.

Usage:
    python3 tools/ghidra/scripts/apply_winit_names.py
    python3 tools/ghidra/scripts/apply_winit_names.py --dry-run

NOTE: Do NOT run this with the Ghidra GUI open on the project — it holds an
exclusive lock. Close the GUI first.

Overlay-specific: winit.ovr is a BinaryLoader-loaded raw overlay (no MZ
header), so file offset == Ghidra address. We do NOT add 0x10000 to the
address like the wroot.exe script does.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--project-dir", default="tools/ghidra")
    ap.add_argument("--project-name", default="wiz6")
    ap.add_argument("--binary", default="winit.ovr")
    ap.add_argument(
        "--findings",
        default="docs/re/findings/startup-sequence.json",
        help="path to the naming-pass JSON (default: docs/re/findings/startup-sequence.json)",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="show what would change without modifying the project",
    )
    args = ap.parse_args()

    repo_root = Path(__file__).resolve().parents[3]
    findings_path = (repo_root / args.findings).resolve()
    if not findings_path.exists():
        print(f"findings file not found: {findings_path}", file=sys.stderr)
        return 1

    with findings_path.open() as fh:
        data = json.load(fh)

    rename_list = data.get("renamed_full_list") or []
    create_list = data.get("new_functions_to_create") or []

    if not rename_list and not create_list:
        print("findings file has no renamed_full_list or new_functions_to_create", file=sys.stderr)
        return 1

    os.environ.setdefault(
        "GHIDRA_INSTALL_DIR", "/opt/homebrew/Cellar/ghidra/12.1/libexec"
    )

    import pyghidra  # noqa: E402 — needs env first

    pyghidra.start()

    from ghidra.base.project import GhidraProject  # noqa: E402
    from ghidra.program.model.symbol import SourceType  # noqa: E402

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
        tx_id = program.startTransaction("apply_winit_names")
    tx_committed = False
    try:
        # First, create any missing functions (dispatch-reached entries).
        for r in create_list:
            off_str = r["addr"]
            new_name = r["new"]
            off = int(off_str, 0) if isinstance(off_str, str) else off_str
            # winit.ovr is BinaryLoader (no MZ header); file_off == Ghidra addr.
            addr = space.getAddress(off)
            f = fm.getFunctionAt(addr)
            if f is not None:
                cur = f.getName()
                if cur == new_name:
                    already += 1
                else:
                    if args.dry_run:
                        print(f"  WOULD RENAME (existing) 0x{off:08x}  {cur:30s} -> {new_name}")
                        applied += 1
                    else:
                        try:
                            f.setName(new_name, SourceType.USER_DEFINED)
                            applied += 1
                        except Exception as e:  # noqa: BLE001
                            errors.append((off, new_name, str(e)))
                continue
            # No function yet — create one.
            if args.dry_run:
                print(f"  WOULD CREATE 0x{off:08x}  -> {new_name}")
                created += 1
                continue
            try:
                from ghidra.app.cmd.function import CreateFunctionCmd  # noqa: E402
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
            except Exception as e:  # noqa: BLE001
                errors.append((off, new_name, f"create+rename: {e}"))

        # Then, rename existing functions.
        for r in rename_list:
            off_str = r["addr"]
            new_name = r["new"]
            off = int(off_str, 0) if isinstance(off_str, str) else off_str
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
                print(f"  WOULD RENAME 0x{off:08x}  {cur:30s} -> {new_name}")
                applied += 1
            else:
                try:
                    f.setName(new_name, SourceType.USER_DEFINED)
                    applied += 1
                except Exception as e:  # noqa: BLE001
                    errors.append((off, new_name, str(e)))

        if tx_id is not None:
            program.endTransaction(tx_id, True)
            tx_committed = True
    finally:
        if tx_id is not None and not tx_committed:
            program.endTransaction(tx_id, False)

    if not args.dry_run and (applied > 0 or created > 0):
        project.save(program)

    project.close()  # GhidraProject.close releases its own program references

    print(f"applied={applied} created={created} already_named={already} errors={len(errors)}")
    for off, name, reason in errors:
        print(f"  ERROR 0x{off:x} {name}: {reason}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
