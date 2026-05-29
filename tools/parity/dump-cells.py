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

=========================================================================
PICKER MODE (--picker)
=========================================================================
The wbase ADD PARTY MEMBER picker draws two dynamically-allocated tile
windows that are NOT pointed to by the fixed wpcmk handles. They live
elsewhere in DGROUP/heap. To extract them we use a content-signature
scan: locate known cell patterns (the 'ADD WHO?' prompt for the left
panel, the highlighted NATHAN row for the right panel), then walk back
to find a plausible window struct header.

The wbase struct format is similar to wpcmk's BUT the cells_off offset
from the struct base varies. Empirically we observe BOTH 0x10 and 0x14
in this save (state 0xffff, party_size=0, one PCFILE char NATHAN). The
scanner tries both and prefers the alignment that puts the signature
cell at a logical column.

See docs/re/findings/wbase-window-struct.json for evidence.
"""
import argparse, json, sys, zipfile
from pathlib import Path

DGROUP_BASE = 0x18048  # constant across this capture session (verified vs save 3 inspect)
HANDLES = {"top": 0x546e, "bottomBar": 0x56ca, "menuPanel": 0x56cc, "skillTrain": 0x7e26}

# Picker cell signatures. Each is a bytes pattern (char,attr alternating).
# The pattern is the FIRST cell of the row in question — see column_in_row to
# anchor it to a specific column (0 = leftmost) when scoring candidates.
PICKER_SIGNATURES = {
    "leftPanel": {
        # 'ADD WHO?' rendered as wfont3-attr cells. This row is centred in a
        # ~19-wide panel so we don't pin a specific column.
        "pattern": bytes.fromhex("4103440344032003570348034f033f03"),
        "column_in_row": None,
    },
    "rightPanel": {
        # 'NATHAN' as the highlight-cursor cells (attr 0x50). This is the
        # FIRST six cells of the roster entry row, so column_in_row=0.
        "pattern": bytes.fromhex("4e504150545048504150 4e50".replace(" ", "")),
        "column_in_row": 0,
    },
}


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
    return read_window_at(b, struct_off, cells_off_delta=0x10)


def read_window_at(b, struct_off, cells_off_delta=0x10):
    w = b[struct_off]
    h = b[struct_off + 1]
    x = b[struct_off + 2]
    y = b[struct_off + 3]
    attr = b[struct_off + 4]
    cells_off = struct_off + cells_off_delta
    grid = []
    for cy in range(h):
        row = []
        for cx in range(w):
            i = cells_off + (cy * w + cx) * 2
            row.append([b[i], b[i + 1]])
        grid.append(row)
    return {"w": w, "h": h, "x": x, "y": y, "attr": attr, "cells": grid}


def find_picker_window(b, signature_bytes, column_in_row=None, search_back=0x2000):
    """Locate a wbase picker window whose cells contain `signature_bytes`.

    Walks back from the (first) occurrence of the signature in memory and
    tests every candidate struct_off for a plausible window header. Returns
    the unique candidate, or raises if zero or multiple plausible matches.

    A candidate is plausible when:
      - 1 <= w <= 40, 1 <= h <= 25 (sane dimensions)
      - 0 <= x <= 39, 0 <= y <= 24 (sane position)
      - x + w <= 40, y + h <= 25 (fits in 40x25 text grid)
      - Some cells_off_delta in {0x10, 0x14} aligns the signature to an
        integer (row, col) within the cell grid
      - If column_in_row is set, the signature must land at exactly that
        column (this is what disambiguates wbase's 0x10-vs-0x14 layout)
    """
    pattern_off = b.find(signature_bytes)
    if pattern_off < 0:
        raise RuntimeError(f"signature pattern {signature_bytes.hex()} not found in memory")

    sig_cells = len(signature_bytes) // 2  # one cell per (char, attr) pair
    candidates = []
    for cells_off_delta in (0x10, 0x14):
        start = max(0, pattern_off - search_back)
        for struct_off in range(start, pattern_off - cells_off_delta + 1):
            w = b[struct_off]
            h = b[struct_off + 1]
            x = b[struct_off + 2]
            y = b[struct_off + 3]
            attr = b[struct_off + 4]
            if not (1 <= w <= 40 and 1 <= h <= 25 and 0 <= x <= 39 and 0 <= y <= 24):
                continue
            if x + w > 40 or y + h > 25:
                continue
            cells_off = struct_off + cells_off_delta
            delta = pattern_off - cells_off
            if delta < 0 or delta % 2 != 0:
                continue
            cell_index = delta // 2
            row = cell_index // w
            col = cell_index % w
            if row >= h:
                continue
            # Signature must fit entirely within ONE row of this candidate
            # (no wrap to the next row).
            if col + sig_cells > w:
                continue
            if column_in_row is not None and col != column_in_row:
                continue
            candidates.append({
                "struct_off": struct_off,
                "cells_off": cells_off,
                "cells_off_delta": cells_off_delta,
                "w": w, "h": h, "x": x, "y": y, "attr": attr,
                "pattern_row": row, "pattern_col": col,
            })

    if not candidates:
        raise RuntimeError(
            f"no plausible window struct found for signature {signature_bytes.hex()[:32]}... "
            f"at pattern_off=0x{pattern_off:x}"
        )

    # Prefer candidates that match the expected anchor column, then the one
    # closest to the signature (smallest pattern_off - struct_off).
    candidates.sort(key=lambda c: (
        0 if (column_in_row is None or c["pattern_col"] == column_in_row) else 1,
        pattern_off - c["struct_off"],
    ))
    if len(candidates) > 1 and column_in_row is None:
        # Multiple candidates with no column anchor — pick the one with smallest
        # struct (i.e. closest to the cells, treating other matches as overlapping
        # windows from background screens). Print all so a human can sanity-check.
        for c in candidates:
            sys.stderr.write(
                f"  candidate: struct@0x{c['struct_off']:x} +{c['cells_off_delta']:x} "
                f"{c['w']}x{c['h']}@({c['x']},{c['y']}) attr=0x{c['attr']:02x} "
                f"sig@row{c['pattern_row']}col{c['pattern_col']}\n"
            )
    return candidates[0]


def render_human(name, win):
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


def cmd_default(save_path, out_path):
    b = mem(save_path)
    out = {"save": save_path.name, "windows": {}}
    for name, handle in HANDLES.items():
        out["windows"][name] = read_window(b, handle)
    if out_path is not None:
        out_path.write_text(json.dumps(out))
        print(f"wrote {out_path}")
    for name, win in out["windows"].items():
        render_human(name, win)


def scan_for_windows(b: bytes):
    """Scan the full Memory blob for plausible TileWindow structs.

    A candidate offset must satisfy:
      - byte[0] (w) in [1, 40]
      - byte[1] (h) in [1, 25]
      - byte[2] (x) in [0, 39]
      - byte[3] (y) in [0, 24]
      - x + w <= 40, y + h <= 25
      - cells region (struct+0x10 .. struct+0x10+w*h*2) fits inside the blob
      - score = fraction of cell-chars (even offsets in cell region) that are
        printable ASCII (0x20..0x7e). Discard candidates with score < 0.5.

    Per docs/re/findings/wbase-picker-internals.json the canonical cells_off
    is struct+0x10 unconditionally; this scan uses that.

    Note: the score deliberately counts only printable ASCII (0x20..0x7e),
    not control codes — null bytes are too common in memory and would push
    too much garbage into the top of the result list. Real wiz6 UI windows
    are dense with space (0x20) padding + ASCII text, so they comfortably
    score >= 0.7. The control-code chrome glyphs (0x00..0x1f) used by
    framing tiles are sparse enough that excluding them from the score
    doesn't disqualify real windows.

    Returns: list of (struct_off, w, h, x, y, attr, preview, score) tuples
    sorted by descending score then ascending offset.
    """
    candidates = []
    n = len(b)
    upper = n - 0x10
    if upper <= 0:
        return candidates
    for off in range(0, upper):
        w = b[off]
        h = b[off + 1]
        x = b[off + 2]
        y = b[off + 3]
        attr = b[off + 4]
        if not (1 <= w <= 40 and 1 <= h <= 25):
            continue
        if not (0 <= x <= 39 and 0 <= y <= 24):
            continue
        if x + w > 40 or y + h > 25:
            continue
        cells_off = off + 0x10
        cells_len = w * h * 2
        if cells_off + cells_len > n:
            continue
        chars = b[cells_off:cells_off + cells_len:2]
        if not chars:
            continue
        hits = sum(1 for c in chars if 0x20 <= c <= 0x7e)
        score = hits / len(chars)
        if score < 0.5:
            continue
        # Preview of row 0: ASCII printables only, others as '.'.
        row0_chars = b[cells_off:cells_off + w * 2:2]
        preview = ''.join(chr(c) if 0x20 <= c < 0x7f else '.' for c in row0_chars)
        candidates.append((off, w, h, x, y, attr, preview, score))
    candidates.sort(key=lambda c: (-c[7], c[0]))
    return candidates


def cmd_scan(save_path):
    b = mem(save_path)
    cands = scan_for_windows(b)
    print(f"Found {len(cands)} candidate window structs (score >= 0.5):\n")
    for off, w, h, x, y, attr, preview, score in cands[:50]:
        print(f"  off=0x{off:x} {w}x{h}@({x},{y}) attr=0x{attr:02x} score={score:.2f}")
        print(f"    row0: {preview!r}")


def cmd_picker(save_path, out_path):
    """Find the wbase ADD PARTY MEMBER picker's two panels by content-signature
    scan, and emit a fixture with the same shape as the wpcmk fixtures."""
    b = mem(save_path)
    out = {"save": save_path.name, "windows": {}}
    for name, sig in PICKER_SIGNATURES.items():
        cand = find_picker_window(
            b,
            sig["pattern"],
            column_in_row=sig["column_in_row"],
        )
        win = read_window_at(b, cand["struct_off"], cand["cells_off_delta"])
        win["_struct_off"] = f"0x{cand['struct_off']:x}"
        win["_cells_off"] = f"0x{cand['cells_off']:x}"
        win["_cells_off_delta"] = f"0x{cand['cells_off_delta']:x}"
        out["windows"][name] = win
    if out_path is not None:
        # Strip diagnostic underscored fields from the persisted fixture
        persist = {"save": out["save"], "windows": {}}
        for n, w in out["windows"].items():
            persist["windows"][n] = {k: v for k, v in w.items() if not k.startswith("_")}
        out_path.write_text(json.dumps(persist))
        print(f"wrote {out_path}")
    for name, win in out["windows"].items():
        render_human(name, win)
        print(f"  (struct@{win['_struct_off']} cells@{win['_cells_off']} cells_delta={win['_cells_off_delta']})")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("save", type=Path, help="path to N.sav DOSBox save state")
    parser.add_argument("out", type=Path, nargs="?", help="optional output JSON path")
    parser.add_argument(
        "--picker",
        action="store_true",
        help="extract the wbase ADD PARTY MEMBER picker's leftPanel + rightPanel "
             "by content-signature scan instead of the fixed wpcmk handles",
    )
    parser.add_argument(
        "--scan",
        action="store_true",
        help="scan the entire Memory blob for plausible TileWindow structs "
             "(heuristic: valid w/h/x/y + printable-ish cell content)",
    )
    args = parser.parse_args()
    if args.scan:
        cmd_scan(args.save)
    elif args.picker:
        cmd_picker(args.save, args.out)
    else:
        cmd_default(args.save, args.out)


if __name__ == "__main__":
    main()
