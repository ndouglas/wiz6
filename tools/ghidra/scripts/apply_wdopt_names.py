#!/usr/bin/env python3
"""Apply the curated wdopt.ovr function-naming pass.

Loads names from docs/re/findings/wdopt-naming-pass.json and applies them to
the Ghidra project. Each function gets:
  - name set to `new` field
  - SourceType.USER_DEFINED so the rename survives re-opens

Re-runnable: rewriting the JSON and re-running this script will reconverge the
project's annotations to whatever the JSON says. Functions already at the
target name are no-ops.

Usage:
    python3 tools/ghidra/scripts/apply_wdopt_names.py
    python3 tools/ghidra/scripts/apply_wdopt_names.py --dry-run

NOTE: Do NOT run this with the Ghidra GUI open on the project — it holds an
exclusive lock. Close the GUI first.

Overlay-specific notes for wdopt.ovr:
- BinaryLoader-loaded raw overlay (no MZ header), so file offset == Ghidra
  address. We do NOT add 0x10000.
- wdopt uses the CANONICAL state-machine layout (like wpops):
    * 14-byte header at 0x00..0x0d
    * 0x0e: dispatch entry — 18-byte init prologue (zeroes
      *0x502a/0x502c/0x502e), then cmp [0x363a],0x13 -> call 0x39cc,
      cmp [0x363a],0x14 -> call 0x32fc, finally mov [0x363a],5; ret.
    * 0x39cc: state-0x13 handler (dungeon cast spell)
    * 0x32fc: state-0x14 handler (dungeon use item)
- Ghidra did NOT auto-detect 0x0e — this script creates it.

wdopt = DUNGEON OPTIONS PICKER = the out-of-combat cast-spell / use-item
handler. It owns states 0x13 (cast spell) and 0x14 (use item), invoked from
wmaze.ovr's main dungeon loop. Both handlers transition back to wmaze (state
0x05) after their work is done. NOT a save/load menu, NOT an audio/video
config — just the dungeon-mode spell+item picker.
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
    ap.add_argument("--binary", default="wdopt.ovr")
    ap.add_argument(
        "--findings",
        default="docs/re/findings/wdopt-naming-pass.json",
        help="path to the naming-pass JSON (default: docs/re/findings/wdopt-naming-pass.json)",
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

    # Resolve project_dir through the wiz6.gpr symlink (worktrees symlink the
    # .gpr / .rep into a local tools/ghidra/, but the underlying GhidraProject
    # path validator rejects paths containing '.' segments — like '.config' in
    # worktree paths. Following the symlink target gives us the canonical
    # ~/Projects/ndouglas/wiz6/tools/ghidra path, which is safe.).
    project_dir_path = (repo_root / args.project_dir).resolve()
    gpr_link = project_dir_path / f"{args.project_name}.gpr"
    if gpr_link.is_symlink():
        project_dir_path = Path(os.readlink(gpr_link)).parent.resolve()
    project_dir = str(project_dir_path)
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
        tx_id = program.startTransaction("apply_wdopt_names")
    tx_committed = False
    try:
        for r in rename_list:
            off_str = r["addr"]
            new_name = r["new"]
            off = int(off_str, 0) if isinstance(off_str, str) else off_str
            # wdopt.ovr is BinaryLoader (no MZ header); file_off == Ghidra addr.
            # Unlike wroot.exe, do NOT add 0x10000.
            addr = space.getAddress(off)
            f = listing.getFunctionAt(addr)
            if f is None:
                f = listing.getFunctionContaining(addr)
                if f is None or f.getEntryPoint().getOffset() != off:
                    # Try to CREATE the function if Ghidra missed it.
                    # For wdopt, 0x000e (dispatch entry) is NOT auto-detected.
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
                            DisassembleCommand(addr, None, True).applyTo(
                                program, monitor
                            )
                            inst = listing2.getInstructionAt(addr)
                        # Step 2: create function with single-byte body
                        body = AddressSet(addr, addr)
                        new_fn = fm.createFunction(
                            new_name, addr, body, SourceType.USER_DEFINED
                        )
                        if new_fn is None:
                            errors.append(
                                (off, new_name, "createFunction returned None")
                            )
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
