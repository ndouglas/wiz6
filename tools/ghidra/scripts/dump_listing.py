#!/usr/bin/env python3
"""Dump the Ghidra disassembly listing for an address range.

Usage:
    python3 tools/ghidra/scripts/dump_listing.py --binary wmaze.ovr --start 0x287c --end 0x29c0
"""
from __future__ import annotations
import argparse
import pyghidra


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project-dir", default="tools/ghidra")
    ap.add_argument("--project-name", default="wiz6")
    ap.add_argument("--binary", required=True)
    ap.add_argument("--start", type=lambda s: int(s, 0), required=True)
    ap.add_argument("--end", type=lambda s: int(s, 0), required=True)
    args = ap.parse_args()

    pyghidra.start()
    project = pyghidra.open_project(args.project_dir, args.project_name)
    try:
        with pyghidra.program_context(project, f"/{args.binary}") as program:
            listing = program.getListing()
            af = program.getAddressFactory().getDefaultAddressSpace()
            addr = af.getAddress(args.start)
            end = af.getAddress(args.end)
            while addr.getOffset() <= end.getOffset():
                cu = listing.getCodeUnitAt(addr)
                if cu is None:
                    addr = addr.add(1)
                    continue
                bytes_ = cu.getBytes()
                hexb = " ".join(f"{b & 0xff:02x}" for b in bytes_)
                # show references (jump table targets)
                refs = ""
                for r in cu.getReferencesFrom():
                    refs += f"  -> {r.getToAddress()} ({r.getReferenceType()})"
                print(f"{addr}  {hexb:<24}  {cu}{refs}")
                addr = addr.add(cu.getLength())
    finally:
        project.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
