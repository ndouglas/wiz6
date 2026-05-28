#!/usr/bin/env python3
"""Dump the engine's live UI-window CELL GRIDS from a DOSBox-X save state.

The CHARACTER MENU is composed of 3 tile windows whose (char, attr) cell
arrays live in wpcmk's DGROUP. This reads them straight from save memory —
the authoritative tile layout, independent of any framebuffer decode.

Window handles (DGROUP-relative word = struct offset within DGROUP):
  top       *0x546e   40x20 @ (0,0)    cleared black (0x00, attr 0x01 / wfont1)
  bottomBar *0x56ca   40x5  @ (0,20)   cleared gray  (0x20, attr 0x03 / wfont3)
  menuPanel *0x56cc   19x13 @ (21,7)   cleared gray  (0x20, attr 0x03 / wfont3)

Struct layout (per wpcmk-charmenu-toplayout.json): width@0 height@1 xcol@2
yrow@3 attr@4 ...; cells @ +0x10, 2 bytes/cell (char, attr), row-major.
"""
import sys, json, zipfile
from pathlib import Path

DGROUP_BASE = 0x18048  # constant across this capture session (verified vs save 3 inspect)
HANDLES = {"top": 0x546e, "bottomBar": 0x56ca, "menuPanel": 0x56cc, "skillTrain": 0x7e26}


def mem(save: Path) -> bytes:
    with zipfile.ZipFile(save) as z:
        with z.open("Memory") as f:
            return f.read()


def u16(b, off):
    return b[off] | (b[off + 1] << 8)


def read_window(b, handle_off):
    # Handle offsets > 0x7000 are direct struct offsets (stack-local windows
    # whose handle has been resolved via DGROUP scan). Smaller values are
    # DGROUP-relative pointers (the engine stores the struct offset as a u16
    # at DGROUP+handle_off — see wpcmk-charmenu-toplayout.json).
    if handle_off >= 0x7000:
        struct_off = DGROUP_BASE + handle_off
    else:
        struct_off = DGROUP_BASE + u16(b, DGROUP_BASE + handle_off)
    w = b[struct_off]
    h = b[struct_off + 1]
    x = b[struct_off + 2]
    y = b[struct_off + 3]
    attr = b[struct_off + 4]
    cells_off = struct_off + 0x10
    grid = []
    for cy in range(h):
        row = []
        for cx in range(w):
            i = cells_off + (cy * w + cx) * 2
            row.append([b[i], b[i + 1]])
        grid.append(row)
    return {"w": w, "h": h, "x": x, "y": y, "attr": attr, "cells": grid}


def main():
    save = Path(sys.argv[1])
    b = mem(save)
    out = {"save": save.name, "windows": {}}
    for name, handle in HANDLES.items():
        out["windows"][name] = read_window(b, handle)
    if len(sys.argv) > 2:
        Path(sys.argv[2]).write_text(json.dumps(out))
        print(f"wrote {sys.argv[2]}")
    # Human cell map: '#'=black fill(0x00) ' '=gray space(0x20) else hex char
    for name, win in out["windows"].items():
        print(f"\n== {name} {win['w']}x{win['h']} @({win['x']},{win['y']}) attr=0x{win['attr']:02x} ==")
        for row in win["cells"]:
            line = []
            for ch, at in row:
                if ch == 0x00:
                    line.append("#")
                elif ch == 0x20:
                    line.append(" ")
                elif 0x21 <= ch < 0x7f:
                    line.append(chr(ch))
                else:
                    line.append(".")  # frame/control glyph
            print("".join(line))


if __name__ == "__main__":
    main()
