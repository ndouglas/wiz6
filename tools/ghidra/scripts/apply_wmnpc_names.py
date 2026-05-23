#!/usr/bin/env python3
"""Apply the curated wmnpc.ovr function-naming pass.

Loads names from docs/re/findings/wmnpc-naming-pass.json and applies them to
the Ghidra project. Each function gets:
  - name set to `new` field
  - SourceType.USER_DEFINED so the rename survives re-opens

Re-runnable: rewriting the JSON and re-running this script will reconverge the
project's annotations to whatever the JSON says. Functions already at the
target name are no-ops.

Usage:
    python3 tools/ghidra/scripts/apply_wmnpc_names.py
    python3 tools/ghidra/scripts/apply_wmnpc_names.py --dry-run

NOTE: Do NOT run this with the Ghidra GUI open on the project — it holds an
exclusive lock. Close the GUI first.

Overlay-specific: wmnpc.ovr is a BinaryLoader-loaded raw overlay (no MZ
header), so file offset == Ghidra address. We do NOT add 0x10000 to the
address like the wroot.exe script does.

Special case: wmnpc's dispatch entry at file 0x0e is not automatically
detected by Ghidra. This script creates a function there before renaming if
the JSON includes an entry at 0x0e. Unlike wpcvw, wmnpc.ovr's 0x0e is NOT a
state-machine handler — it is `monster_per_frame_update`, a callable helper
that wmaze invokes once per visible monster sprite per frame.
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
    ap.add_argument("--binary", default="wmnpc.ovr")
    ap.add_argument(
        "--findings",
        default="docs/re/findings/wmnpc-naming-pass.json",
        help="path to the naming-pass JSON (default: docs/re/findings/wmnpc-naming-pass.json)",
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
    if not rename_list:
        print("findings file has no renamed_full_list", file=sys.stderr)
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
        tx_id = program.startTransaction("apply_wmnpc_names")
    tx_committed = False
    try:
        for r in rename_list:
            off_str = r["addr"]
            new_name = r["new"]
            off = int(off_str, 0) if isinstance(off_str, str) else off_str
            # wmnpc.ovr is BinaryLoader (no MZ header); file_off == Ghidra addr.
            # Unlike wroot.exe, do NOT add 0x10000.
            addr = space.getAddress(off)
            f = listing.getFunctionAt(addr)
            if f is None:
                f = listing.getFunctionContaining(addr)
                if f is None or f.getEntryPoint().getOffset() != off:
                    # Try to CREATE the function if Ghidra missed it (e.g. dispatch entry at 0x0e)
                    if args.dry_run:
                        print(f"  WOULD CREATE 0x{off:08x}  ->  {new_name}")
                        created += 1
                        applied += 1
                        continue
                    try:
                        from ghidra.util.task import ConsoleTaskMonitor  # noqa: E402
                        from ghidra.app.cmd.disassemble import DisassembleCommand  # noqa: E402
                        from ghidra.app.cmd.function import CreateFunctionCmd  # noqa: E402
                        from ghidra.program.model.address import AddressSet  # noqa: E402
                        monitor = ConsoleTaskMonitor()
                        # Step 1: ensure disassembly (Ghidra may not have decoded yet)
                        listing2 = program.getListing()
                        inst = listing2.getInstructionAt(addr)
                        if inst is None:
                            DisassembleCommand(addr, None, True).applyTo(program, monitor)
                            inst = listing2.getInstructionAt(addr)
                        # Step 2: create function with single-byte body (Ghidra rejects None body
                        # on overlays where it can't auto-compute body).
                        body = AddressSet(addr, addr)
                        new_fn = fm.createFunction(
                            new_name, addr, body, SourceType.USER_DEFINED
                        )
                        if new_fn is None:
                            errors.append((off, new_name, "createFunction returned None"))
                            continue
                        # Step 3: re-flow body to cover full function extent
                        try:
                            CreateFunctionCmd(addr).applyTo(program, monitor)
                        except Exception:  # noqa: BLE001
                            pass  # leave with single-byte body if reflow fails
                        created += 1
                        applied += 1
                        continue
                    except Exception as e:  # noqa: BLE001
                        errors.append((off, new_name, f"create failed: {e}"))
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

    if not args.dry_run and applied > 0:
        project.save(program)

    project.close()  # GhidraProject.close releases its own program references

    print(
        f"applied={applied} (created={created}) already_named={already} errors={len(errors)}"
    )
    for off, name, reason in errors:
        print(f"  ERROR 0x{off:x} {name}: {reason}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
