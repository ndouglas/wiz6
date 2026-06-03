#!/usr/bin/env python3
"""List all functions in a Ghidra binary: address, size, current name, decompiled signature.

Usage:
    python3 tools/ghidra/scripts/list_functions.py --binary wroot.exe
    python3 tools/ghidra/scripts/list_functions.py --binary wroot.exe --only-unnamed

Output is one function per line:
    0x1abc  42  FUN_1abc  void FUN_1abc(int param_1)
"""

from __future__ import annotations

import argparse
import sys

import pyghidra


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project-dir", default="tools/ghidra")
    ap.add_argument("--project-name", default="wiz6")
    ap.add_argument("--binary", required=True, help="binary name within the project, e.g. wroot.exe")
    ap.add_argument("--only-unnamed", action="store_true", help="show only auto-generated FUN_XXXX names")
    args = ap.parse_args()

    pyghidra.start()

    # pyghidra 3.x: open_program() is removed; use open_project + program_context
    # (same pattern as decompile.py). Ghidra project paths are absolute within project.
    project = pyghidra.open_project(args.project_dir, args.project_name)
    try:
        with pyghidra.program_context(project, f"/{args.binary}") as program:
            fm = program.getFunctionManager()
            for fn in fm.getFunctions(True):
                name = fn.getName()
                if args.only_unnamed and not name.startswith("FUN_"):
                    continue
                entry = fn.getEntryPoint()
                size = fn.getBody().getNumAddresses()
                sig = fn.getSignature().getPrototypeString()
                print(f"  0x{int(entry.getOffset()):x}  {size:>5}  {name:<28}  {sig}")
    finally:
        project.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
