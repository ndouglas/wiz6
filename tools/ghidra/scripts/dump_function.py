#!/usr/bin/env python3
"""Decompile a function (by address or name) and print its C source.

Use case: get the decompiled view of a specific function without opening the GUI.
Output goes to stdout; redirect to a file for archival.

Usage:
    python3 tools/ghidra/scripts/dump_function.py --binary wroot.exe --addr 0x1f41
    python3 tools/ghidra/scripts/dump_function.py --binary wroot.exe --name pic_loader

Addresses can be decimal or 0x-prefixed hex.
"""

from __future__ import annotations

import argparse
import sys

import pyghidra


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project-dir", default="tools/ghidra")
    ap.add_argument("--project-name", default="wiz6")
    ap.add_argument("--binary", required=True)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--addr", type=lambda s: int(s, 0))
    g.add_argument("--name", help="function name (exact match)")
    args = ap.parse_args()

    pyghidra.start()
    from ghidra.app.decompiler import DecompInterface
    from ghidra.util.task import ConsoleTaskMonitor

    # pyghidra 3.x: open_program() is removed; use open_project + program_context
    # (same pattern as list_functions.py). Ghidra project paths are absolute within project.
    project = pyghidra.open_project(args.project_dir, args.project_name)
    try:
        with pyghidra.program_context(project, f"/{args.binary}") as program:
            fm = program.getFunctionManager()

            fn = None
            if args.addr is not None:
                addr = program.getAddressFactory().getDefaultAddressSpace().getAddress(args.addr)
                fn = fm.getFunctionAt(addr) or fm.getFunctionContaining(addr)
            else:
                for candidate in fm.getFunctions(True):
                    if candidate.getName() == args.name:
                        fn = candidate
                        break

            if fn is None:
                print(f"function not found", file=sys.stderr)
                return 1

            decomp = DecompInterface()
            decomp.openProgram(program)
            try:
                result = decomp.decompileFunction(fn, 60, ConsoleTaskMonitor())
                if not result.decompileCompleted():
                    print(f"decompilation failed: {result.getErrorMessage()}", file=sys.stderr)
                    return 2
                print(result.getDecompiledFunction().getC())
            finally:
                decomp.dispose()
    finally:
        project.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
