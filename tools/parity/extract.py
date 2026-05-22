#!/usr/bin/env python3
"""Extract and search the Memory blob inside a DOSBox-X save state.

DOSBox-X save states are ZIPs. The `Memory` entry is the raw emulated
physical RAM at the time of save (a few KB of metadata header, then the
full memsize blob). Byte offsets into the extracted file therefore equal
physical-memory offsets — `findmem`-style addressing.

Subcommands:
  info <save>                          list ZIP members + sizes
  find <save> --pattern '55 8B EC ...' locate hex pattern in memory
  dump <save> --offset <o> --length <n> [--output <file>]
                                       dump a byte range

Pattern hex can be space- or comma-separated; mixed case OK. Wildcards
not supported (yet — add `?` if a pattern needs it later).
"""

from __future__ import annotations

import argparse
import re
import sys
import zipfile
from pathlib import Path


def extract_memory(savestate_path: Path) -> bytes:
    with zipfile.ZipFile(savestate_path) as z:
        with z.open("Memory") as f:
            return f.read()


def parse_pattern(pattern: str) -> bytes:
    cleaned = re.sub(r"[\s,]", "", pattern)
    if len(cleaned) % 2:
        raise SystemExit(f"odd-length hex pattern: {pattern!r}")
    return bytes.fromhex(cleaned)


def find_all(haystack: bytes, needle: bytes) -> list[int]:
    offsets: list[int] = []
    start = 0
    while True:
        i = haystack.find(needle, start)
        if i < 0:
            return offsets
        offsets.append(i)
        start = i + 1


def cmd_info(args: argparse.Namespace) -> int:
    with zipfile.ZipFile(args.savestate) as z:
        for name in z.namelist():
            info = z.getinfo(name)
            print(f"  {name:24s} {info.file_size:>12,} bytes")
    return 0


def cmd_find(args: argparse.Namespace) -> int:
    memory = extract_memory(args.savestate)
    needle = parse_pattern(args.pattern)
    offsets = find_all(memory, needle)
    if not offsets:
        print(f"(no matches for {needle.hex()})", file=sys.stderr)
        return 1
    for off in offsets:
        seg, rem = divmod(off, 16)
        print(f"phys=0x{off:08x}  seg:off=0x{seg:04x}:{rem:x}  ({off:,})")
    return 0


def cmd_dump(args: argparse.Namespace) -> int:
    memory = extract_memory(args.savestate)
    region = memory[args.offset : args.offset + args.length]
    if len(region) < args.length:
        print(
            f"warning: requested {args.length} bytes at 0x{args.offset:x}, "
            f"only {len(region)} available (memory size {len(memory):,})",
            file=sys.stderr,
        )
    if args.output:
        args.output.write_bytes(region)
        print(f"wrote {len(region):,} bytes to {args.output}", file=sys.stderr)
    else:
        sys.stdout.buffer.write(region)
    return 0


def hex_arg(s: str) -> int:
    return int(s, 0)


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_info = sub.add_parser("info", help="list ZIP members")
    p_info.add_argument("savestate", type=Path)
    p_info.set_defaults(func=cmd_info)

    p_find = sub.add_parser("find", help="search for a hex byte pattern")
    p_find.add_argument("savestate", type=Path)
    p_find.add_argument("--pattern", required=True, help='e.g. "55 8B EC 83"')
    p_find.set_defaults(func=cmd_find)

    p_dump = sub.add_parser("dump", help="dump a byte range")
    p_dump.add_argument("savestate", type=Path)
    p_dump.add_argument("--offset", type=hex_arg, required=True)
    p_dump.add_argument("--length", type=hex_arg, required=True)
    p_dump.add_argument("--output", type=Path)
    p_dump.set_defaults(func=cmd_dump)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
