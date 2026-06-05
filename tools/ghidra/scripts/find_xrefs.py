#!/usr/bin/env python3
"""Find references TO an address (callers/xrefs) using open_project/program_context (pyghidra 3.x).

Usage:
    GHIDRA_INSTALL_DIR=/opt/homebrew/Cellar/ghidra/12.1/libexec \
      python3 tools/ghidra/scripts/find_xrefs.py --binary wroot.exe --addr 0x133e9
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
    args = ap.parse_args()

    pyghidra.start()
    project = pyghidra.open_project(args.project_dir, args.project_name)
    try:
        with pyghidra.program_context(project, f"/{args.binary}") as program:
            af = program.getAddressFactory().getDefaultAddressSpace()
            target = af.getAddress(args.addr)
            rm = program.getReferenceManager()
            fm = program.getFunctionManager()
            for r in rm.getReferencesTo(target):
                frm = r.getFromAddress()
                fn = fm.getFunctionContaining(frm)
                fnn = fn.getName() if fn else "?"
                fne = ("0x%x" % fn.getEntryPoint().getOffset()) if fn else "?"
                print(f"{r.getReferenceType()} from {frm} in {fnn} (entry {fne})")
    finally:
        project.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
