#!/usr/bin/env python3
"""Print code references TO a given address (callers / jumps), with the
containing function + the referring instruction.

    python3 tools/ghidra/scripts/find_code_xrefs.py --binary wmaze.ovr --addr 0x3244
"""
import argparse
import sys

import pyghidra


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
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
            fm = program.getFunctionManager()
            refmgr = program.getReferenceManager()
            refs = refmgr.getReferencesTo(target)
            n = 0
            for ref in refs:
                src = ref.getFromAddress()
                fn = fm.getFunctionContaining(src)
                fname = fn.getName() if fn else "?"
                print(f"  {ref.getReferenceType()} from 0x{int(src.getOffset()):x}  in {fname}")
                n += 1
            if n == 0:
                print("  (no references found)")
    finally:
        project.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
