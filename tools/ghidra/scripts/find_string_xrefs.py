#!/usr/bin/env python3
"""Find functions that reference a given string literal in a Ghidra binary.

Use case: locate the subsystem responsible for a known UI/log message,
e.g. find which function emits "Press any key to continue" or references "MON%02d.PIC".

Usage:
    python3 tools/ghidra/scripts/find_string_xrefs.py --binary wroot.exe --string "MON"

Output: one line per referring function with the call site address.
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
    ap.add_argument("--string", required=True, help="exact ASCII substring to search for in defined strings")
    args = ap.parse_args()

    pyghidra.start()

    program_path = f"/{args.binary}"
    with pyghidra.open_program(f"{args.project_dir}/{args.project_name}.gpr", program_path) as flat:
        program = flat.getCurrentProgram()
        listing = program.getListing()
        ref_mgr = program.getReferenceManager()
        fm = program.getFunctionManager()

        for data in listing.getDefinedData(True):
            value = data.getValue()
            if value is None:
                continue
            text = str(value)
            if args.string not in text:
                continue
            addr = data.getAddress()
            print(f"\nstring @ 0x{int(addr.getOffset()):x}: {text!r}")
            for ref in ref_mgr.getReferencesTo(addr):
                src = ref.getFromAddress()
                fn = fm.getFunctionContaining(src)
                fn_name = fn.getName() if fn else "(none)"
                fn_entry = f"0x{int(fn.getEntryPoint().getOffset()):x}" if fn else "?"
                print(f"  ref from 0x{int(src.getOffset()):x}  in {fn_name} ({fn_entry})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
