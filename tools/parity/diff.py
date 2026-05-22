#!/usr/bin/env python3
"""Byte-diff two binary files, with hex context around the first divergence.

Exit codes: 0 = byte-perfect match, 1 = divergence found, 2 = I/O error.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def hex_row(data: bytes, start: int, end: int) -> str:
    return " ".join(f"{c:02x}" for c in data[start:end])


def diff(a: bytes, b: bytes, context: int) -> int:
    n = min(len(a), len(b))
    first_diff = -1
    diff_count = 0
    for i in range(n):
        if a[i] != b[i]:
            if first_diff < 0:
                first_diff = i
            diff_count += 1
    if len(a) != len(b):
        if first_diff < 0:
            first_diff = n
        diff_count += abs(len(a) - len(b))

    if first_diff < 0:
        print(f"BYTE-PERFECT MATCH: {len(a):,} bytes identical")
        return 0

    print(f"DIVERGENCE at offset 0x{first_diff:x} ({first_diff:,})")
    print(f"  diff bytes: {diff_count:,} of max={max(len(a), len(b)):,}")
    print(f"  lengths: a={len(a):,}  b={len(b):,}")

    start = max(0, first_diff - context)
    end_a = min(len(a), first_diff + context)
    end_b = min(len(b), first_diff + context)

    print(f"\n  a[0x{start:x}..0x{end_a:x}]:")
    print(f"    {hex_row(a, start, end_a)}")
    print(f"  b[0x{start:x}..0x{end_b:x}]:")
    print(f"    {hex_row(b, start, end_b)}")
    print("    " + ("   " * (first_diff - start)) + "^^")

    return 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("file_a", type=Path)
    ap.add_argument("file_b", type=Path)
    ap.add_argument("--context", type=int, default=32, help="bytes of hex context (default 32)")
    args = ap.parse_args()

    try:
        a = args.file_a.read_bytes()
        b = args.file_b.read_bytes()
    except OSError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    return diff(a, b, args.context)


if __name__ == "__main__":
    sys.exit(main())
