#!/usr/bin/env python3
"""Linear capstone disassembly of a wmaze.ovr region (file offset == capstone offset)."""
import sys
from capstone import Cs, CS_ARCH_X86, CS_MODE_16

PATH = "/Users/nathan/Projects/ndouglas/wiz6/test-fixtures/original/wmaze.ovr"

def main():
    start = int(sys.argv[1], 16)
    length = int(sys.argv[2], 16) if len(sys.argv) > 2 else 0x100
    with open(PATH, "rb") as f:
        data = f.read()
    md = Cs(CS_ARCH_X86, CS_MODE_16)
    md.detail = False
    code = data[start:start+length]
    for insn in md.disasm(code, start):
        print(f"0x{insn.address:04x}:\t{insn.mnemonic}\t{insn.op_str}")

if __name__ == "__main__":
    main()
