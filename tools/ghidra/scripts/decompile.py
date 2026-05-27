#!/usr/bin/env python3
"""Decompile a function (by address) using open_project/program_context (pyghidra 3.x).

Usage:
    GHIDRA_INSTALL_DIR=/opt/homebrew/Cellar/ghidra/12.1/libexec \
      python3 tools/ghidra/scripts/decompile.py --binary wpcmk.ovr --addr 0x0df7
"""
from __future__ import annotations
import argparse
import sys
import pyghidra


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project-dir", default="tools/ghidra")
    ap.add_argument("--project-name", default="wiz6")
    ap.add_argument("--binary", required=True)
    ap.add_argument("--addr", type=lambda s: int(s, 0), required=True)
    ap.add_argument("--raw", action="store_true", help="also dump raw disassembly")
    args = ap.parse_args()

    pyghidra.start()
    from ghidra.app.decompiler import DecompInterface
    from ghidra.util.task import ConsoleTaskMonitor

    project = pyghidra.open_project(args.project_dir, args.project_name)
    try:
        with pyghidra.program_context(project, f"/{args.binary}") as program:
            fm = program.getFunctionManager()
            addr = program.getAddressFactory().getDefaultAddressSpace().getAddress(args.addr)
            fn = fm.getFunctionAt(addr) or fm.getFunctionContaining(addr)
            if fn is None:
                print(f"no function at {hex(args.addr)}", file=sys.stderr)
                return 1
            print(f"// function {fn.getName()} @ {fn.getEntryPoint()}")

            decomp = DecompInterface()
            decomp.openProgram(program)
            result = decomp.decompileFunction(fn, 90, ConsoleTaskMonitor())
            if not result.decompileCompleted():
                print(f"decompile failed: {result.getErrorMessage()}", file=sys.stderr)
                return 1
            print(result.getDecompiledFunction().getC())

            if args.raw:
                from ghidra.program.model.listing import CodeUnit
                listing = program.getListing()
                ci = listing.getCodeUnits(fn.getBody(), True)
                print("\n// ---- raw disassembly ----")
                for cu in ci:
                    print(f"{cu.getAddress()}: {cu}")
    finally:
        project.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
