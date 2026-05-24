# docs/re/findings/

Drop-zone for **subagent RE findings as structured JSON**, before they get promoted to a narrative `docs/re/<format>.md` doc.

## Why this exists

When a parent agent dispatches an RE subagent ("investigate the .pic loader", "name functions in wroot.exe"), the subagent has full context but its findings tend to land as confident prose. If that prose goes straight to `docs/re/<format>.md`, the parent can't easily audit the claims — and we've been burned before by confidently-wrong RE conclusions (the multi-segment .pic model, for example).

JSON findings flip the workflow:

1. Subagent emits structured findings to `docs/re/findings/<topic>.json` with explicit evidence.
2. Parent reviews the JSON: every claim has an evidence anchor (binary + address, file offset, save-state hex dump, etc.).
3. Verified claims get promoted into the canonical `docs/re/<format>.md` doc as prose.
4. Unverified or speculative claims stay in the JSON, marked `confidence: low` — they're a TODO list for follow-up investigation.

## Schema

There's no strict schema — findings vary too much. But aim for this shape:

```json
{
  "topic": "wroot-naming-pass",
  "subagent_run": "2026-05-22T16:30:00Z",
  "binaries": ["wroot.exe"],
  "summary": "Named 87 of 312 FUN_XXXX functions in wroot.exe. Major clusters: file I/O (12), video setup (8), combat resolution (11), scenario loading (15).",
  "findings": [
    {
      "id": "fn-1f41",
      "claim": "FUN_1f41 is the single int 21h ah=3D file-open site",
      "category": "file_io",
      "evidence": {
        "binary": "wroot.exe",
        "address": "0x1f41",
        "type": "single_instruction_match",
        "details": "Only function in wroot.exe containing 'mov ah, 3D; int 21h' instruction pair"
      },
      "confidence": "high",
      "applied_name": "dos_open_file"
    },
    {
      "id": "fn-6f2c",
      "claim": "FUN_6f2c is the combat damage resolver",
      "category": "combat",
      "evidence": {
        "binary": "wroot.exe",
        "address": "0x6f2c",
        "type": "string_xref",
        "details": "References format string 'takes %d points of damage' at data 0x21A8"
      },
      "confidence": "medium",
      "applied_name": "combat_apply_damage"
    }
  ],
  "unresolved": [
    "8 functions called from combat path but with no string refs or BIOS-int signature — likely combat helpers but identity unclear without dynamic trace"
  ]
}
```

## Address convention (segment-typed)

**Required for new findings**: when citing a memory address, specify the segment space alongside the offset. We've been bitten multiple times by ambiguous "DGROUP 0xXXXX" references that turned out to mean different things depending on which overlay was loaded.

Use this shape inside `evidence`:

```json
"address": {
  "space": "wbase.ovr",
  "offset": "0x2b36"
}
```

Valid `space` values (also enumerated in `@wiz6/data`'s `SegmentSpace` type):

- `wroot.exe` — the host binary; offset is a file offset (i.e. image offset + 0x200 MZ header skipped)
- `wroot.dgroup` — wroot's data segment (legacy "DGROUP 0xXXXX" findings) — context-dependent base, resolved by `resolveDgroupBase`
- `winit.ovr`, `wbase.ovr`, `wmaze.ovr`, `wmele.ovr`, `wmnpc.ovr`, `wpcvw.ovr`, `wpcmk.ovr`, `wpops.ovr`, `wtrea.ovr`, `wmexe.ovr`, `wdopt.ovr` — overlays; offset is file offset within the .ovr
- `ega.drv`, `cga.drv`, `herc.drv` — video drivers; offset is file offset within the .drv

The MCP server's `dosbox_read_memory` accepts `{ save, space, offset }` and uses the per-save segment map (`dosbox_map_segments`) to resolve to a physical-memory offset. Findings that pre-date this convention are grandfathered — but when promoting them to canonical docs in `docs/re/<format>.md`, add the explicit space.

## Confidence levels

- **high** — Direct evidence: unique string match, single BIOS-int instance, byte-exact pattern match
- **medium** — Pattern match with possible ambiguity, name inferred from caller context
- **low** — Educated guess, no direct evidence; included so future passes don't redo the speculation

## Workflow integration

A subagent prompt for RE work should end with:

> **Deliverable:** write findings to `docs/re/findings/<topic>.json` matching the schema in `docs/re/findings/README.md`. Do NOT modify `docs/re/<format>.md` — the parent will promote findings after review.

The parent then reads the JSON, spot-checks high-confidence claims, integrates verified prose into the canonical doc, and updates this file's promoted-from line.

## Promoted findings

Track which JSON files have had their findings promoted, so we know what's stale:

<!-- promoted (file → canonical doc, date):
- (none yet)
-->
