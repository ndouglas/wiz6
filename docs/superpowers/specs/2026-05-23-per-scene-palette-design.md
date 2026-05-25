# Per-scene Palette Switching — Design Spec

**Date:** 2026-05-23
**Status:** Implementation shipped, then partially superseded 2026-05-25. The spec treats `wiz6-main` / `wiz6-dungeon` as direct RGB tables and per-scene palette switching as the key payoff. The 2026-05-25 RE pass found that both tables are **AC palette register values**, not RGB triples; the DAC stays at BIOS default. Under VGA emulation of EGA mode 0Dh, both AC tables produce byte-identical final RGB (BIOS DAC has `DAC[8..15] == DAC[16..23]`), so "per-scene palette switching" is a no-op for the colors we currently render — `WIZ6_MAIN` covers every captured save state. The structural payoff of the work (catalog in `@wiz6/data`, per-asset `palette:` field) remains valid; the value-level interpretation is corrected in `packages/data/src/palettes/{wiz6-main,wiz6-dungeon}.ts`. See `docs/re/findings/menu-cursor-render-path.json` and `docs/re/palette-discovery.md`.
**Tracker:** [`TODO.md`](../../TODO.md) #002.
**Scope:** Replace the empirical sprite-rendering palette + scattered viewer-side palette files with a single RE-grounded catalog of palettes housed in `@wiz6/data`. Drive sprite rendering off whichever palette the engine actually has loaded at the moment that asset is drawn, sourced from a comprehensive reverse-engineering pass over every palette-touching site in the binaries.

## Problem

Three palettes exist in the viewer and a fourth is hardcoded inline in the parser:

- `packages/viewer/src/palettes/wiz6-palette-1.ts` — RE'd to `wroot.exe @ 0x2043`, the 17-byte table loaded at the `INT 10h AX=1002h` call site at `0x209B`. Confirmed.
- `packages/viewer/src/palettes/wiz6-palette-2.ts` — RE'd to `wroot.exe @ 0x2054`, the table loaded at `INT 10h AX=1002h` site `0x2105`. Confirmed.
- `packages/viewer/src/palettes/wiz6-title.ts` — pixel-picked from a DOSBox-X title capture. **Not** RE-confirmed; we know no engine code that loads it.
- `packages/parser/src/formats/pic-render.ts` — hardcoded `WIZ6_PALETTE` constant: "standard EGA + seven manual overrides." Matches none of the above. Index 2 = standard EGA green; both RE'd engine palettes have blue at index 2.

The spaceship sprite (mon57) and the statue-water sprite (mon08) currently render with bright green where they should be light blue. The hypothesis encoded in the parser's existing comment is that the engine reprograms logical index 2 per scene; the alternative hypothesis is that the parser's `WIZ6_PALETTE` is simply wrong and the engine's actual loaded palette would render both scenes correctly without any per-scene switching.

We don't know which hypothesis is true. We also don't know whether additional palettes exist beyond the two we've located, whether direct EGA Attribute Controller port writes (port `0x3C0`) modify palettes outside of the visible BIOS calls, or how the empirical "title palette" is set by the engine.

## Goal

Find every site in the binaries that programs the EGA palette hardware. Build a model of "given engine state, what palette is active." Use the model to choose the correct palette per rendered asset, eliminating the empirical `WIZ6_PALETTE` constant and the magic `wiz6-title` palette. Validate the output by pixel-diff against DOSBox-X captures.

## Non-goals

- Runtime palette-state simulation (engine animations, fade-in/out effects). The viewer is static; a single palette per asset is enough.
- CGA / Tandy / monochrome ports. Different binaries, different decode.
- Continuous pixel-diff regression testing. The validation is one-shot, not a CI gate.

## Architecture

### Palette catalog in `@wiz6/data`

All named palettes live in a new `packages/data/src/palettes/` directory. Each palette is a `Palette` value (per the existing `PaletteSchema`) with its full RE provenance in the `provenance:` field — call site address, source binary, and (for `INT 10h AX=1002h` sites) the decoded 17-byte register table. No empirical/pixel-picked palettes survive the comprehensive RE pass unless we explicitly fail to locate their call site and mark them as such.

```
packages/data/src/palettes/
  ├── wiz6-main.ts           # palette 1 — wroot.exe 0x2043, INT 10h site 0x209B
  ├── wiz6-dungeon.ts        # palette 2 — wroot.exe 0x2054, INT 10h site 0x2105
  ├── <others discovered during RE pass>
  └── index.ts               # exports PALETTE_CATALOG: Record<string, Palette>
```

`PALETTE_CATALOG` is the single source of truth. Both the parser and the viewer consume from it.

### Asset → palette binding

Each extracted asset JSON carries a `palette: string` field referencing a `PALETTE_CATALOG` key. The CLI extractor sets the field based on RE evidence ("monster sprites are drawn during dungeon scenes where palette 2 is active"). Example shape (exact field name and placement decided during implementation):

```jsonc
// extracted/pics/mon57/pic.json
{
  "segments": [...],
  "descriptors": [...],
  "palette": "wiz6-dungeon"
}
```

If RE uncovers per-asset palette variation later (e.g., a palette-selection byte in a `.pic` header), the field becomes per-segment or per-descriptor without breaking the catalog model.

### Renderer integration

- `packages/parser/src/formats/ega-screen-render.ts` already accepts a `Palette` argument. No change.
- `packages/parser/src/formats/pic-render.ts` — refactor `renderPicDescriptor` to accept a `Palette` argument. Remove the hardcoded `WIZ6_PALETTE` and `EGA_PALETTE` constants entirely. Remove the index-2 explanatory comment.
- Viewer pages read the `palette` name from the extracted asset JSON, look up the `Palette` from `PALETTE_CATALOG`, pass it to the renderer.

### Architectural pillars (preserved)

- `@wiz6/data` stays Node/DOM-free.
- Parser stays pure (no I/O).
- Schemas remain the source of truth — `palette` is a zod-validated field on each relevant asset schema.

## RE methodology

Two mechanisms the engine could use to program the palette:

- **BIOS via `INT 10h`** — `AX=1000h` (one register), `AX=1002h` (all 17), `AX=1003h` (blink/intensity toggle).
- **Direct port writes** — `OUT 0x3C0` after `IN 0x3DA` (Attribute Controller index/data dance).

Both must be scanned. The scan covers `wroot.exe`, every `.ovr`, and every `.drv` (the video drivers ship as separate files and may program the palette independently).

### Scan plan

1. **Static byte scan** across all binaries:
   - `CD 10` (INT 10h) preceded by `B8 02 10` / `B8 00 10` / `B8 03 10` (AX = 1002h/1000h/1003h).
   - `MOV DX, 3C0h` / `OUT DX, AL` (`E6 C0`) — direct Attribute Controller writes.
   - `IN 0x3DA` (`EC`) — Attribute Controller reset preamble.
2. **For each hit**:
   - Find enclosing function (Ghidra lookup).
   - Identify the cross-overlay call chain to determine which game state(s) trigger the site.
   - Extract the palette data: register index + value (for AX=1000h), or 17-byte table (for AX=1002h).
   - Cross-check via DOSBox-X `int10 = debug` log: confirm the site fires at the expected runtime moment.
3. **For 17-byte tables**: decode each register byte to RGB per the EGA `RrgGbB` bit layout already documented in `docs/re/palette-discovery.md`. Add the resulting `Palette` to the catalog with full provenance.
4. **For dynamic loads** (table address comes from a variable, not an immediate): trace back to find where the variable is set. Probably points at one of a few baked-in tables; may also reveal a runtime-computed palette.

### Tools

- Ghidra (GUI + `tools/ghidra/scripts/`) for static scan and call-chain tracing.
- DOSBox-X with `int10 = debug` for runtime BIOS-call logging.
- DOSBox-X debugger breakpoints on `OUT 0x3C0` for direct port-write detection.

### Deliverable

`docs/re/findings/palette-loads.json` — every palette-touching site, structured per the schema in `docs/re/findings/README.md`. Each entry: binary, file offset, mechanism (`int10-set-all` / `int10-set-one` / `int10-toggle-blink` / `attr-ctl-direct`), data (register or 17-byte table), caller context (overlay + function + game state if known), confidence.

Per project convention this is produced by a sub-agent and reviewed by the parent before promotion to canonical docs.

### Stopping condition

The RE pass terminates when:

- Every static `INT 10h` palette site and direct Attribute Controller write is documented.
- Every catalog entry (including the currently-empirical `wiz6-title`) is traced to a call site, or explicitly marked "no call site found, retained empirically" with a follow-up TODO.
- DOSBox-X runtime trace through known scenes confirms no palette load happens that the static scan missed.

## Implementation phasing

Six phases, each landing as its own commit set. Each phase passes `pnpm -r test`.

### Phase 1 — RE pass (read-only)

Sub-agent executes the scan plan. Deliverable: `docs/re/findings/palette-loads.json`. Parent reviews, spot-checks high-confidence claims by re-running the byte pattern against the binary, and promotes verified prose into `docs/re/palette-discovery.md` (replacing the current "two palettes" section if the comprehensive pass finds more).

### Phase 2 — Data-layer catalog

- Move `wiz6-palette-1.ts` and `wiz6-palette-2.ts` from `packages/viewer/src/palettes/` into `packages/data/src/palettes/`, renaming to `wiz6-main.ts` / `wiz6-dungeon.ts` to match the `name:` field on each palette.
- Add any newly-discovered palettes from Phase 1.
- `packages/data/src/palettes/index.ts` exports `PALETTE_CATALOG: Record<string, Palette>` plus a `PaletteName` string-literal union of the keys (for type-safety where callers know the name statically).
- `packages/data/src/index.ts` re-exports both.
- Tests: each palette validates against `PaletteSchema`; catalog snapshot test for stability.

### Phase 3 — Parser refactor

- `packages/parser/src/formats/pic-render.ts`: `renderPicDescriptor(descriptor, decodedBuffer, palette)` — `palette: Palette` becomes a required argument. Remove `WIZ6_PALETTE` and `EGA_PALETTE` constants. Remove the seven-override commentary.
- Update parser tests to pass an explicit palette.
- Update downstream callers in `packages/cli` and `packages/viewer` in the same commit (they all live in this repo).

### Phase 4 — Schema + extractor update

- Add an optional `palette: string` field to asset schemas that need one: `PicSchema`, `PortraitSetSchema`, `EgaScreenSchema`, `Font4bppSchema`.
- CLI extractors set `palette` based on Phase-1 evidence. Static heuristic in the extractor code (e.g., monster sprite extractor emits `"wiz6-dungeon"`); revisit if RE shows per-asset variation.
- After Phase 1 closes and every asset type has an evidence-backed assignment, tighten `palette` from optional to required and bake it into every emitted JSON.

### Phase 5 — Viewer migration

- Delete `packages/viewer/src/palettes/`.
- Each view reads `palette` from the extracted JSON and looks up the `Palette` via `PALETTE_CATALOG` from `@wiz6/data`.
- Keep the existing palette picker dropdown for debug comparison; default sourced from extracted data, not hardcoded.

### Phase 6 — Validation

- Pixel-diff each canonical scene (see below) against a DOSBox-X capture taken under `tools/dosbox/wiz6.conf`. Pass criterion: every non-transparent pixel matches in RGB.
- Mismatches indicate a Phase-1 gap. Escalate back to the RE pass, do not paper over with hand-tuning.

## Validation strategy

### Layer 1 — RE evidence cross-validation

- **Static**: each `palette-loads.json` entry includes the address and byte pattern; spot-check by `xxd`ing the binary at that offset.
- **Dynamic**: DOSBox-X with `int10 = debug` logs every BIOS palette call at runtime. Play through known scenes (title → main menu → character creation → dungeon → spaceship → statue). Each Phase-1 reachable site should fire; any site that never fires is dead code or misclassified. Any runtime load with no matching static site means the scan missed something.
- **Direct port writes**: DOSBox-X breakpoint on `OUT 0x3C0` during a suspect scene transition. If it never breaks, the engine uses BIOS exclusively.

### Layer 2 — pixel-level rendering validation

Canonical scene set:

| Scene                  | Why                                       |
| ---------------------- | ----------------------------------------- |
| Spaceship (mon57)      | Known-wrong; currently green, should be light blue |
| Statue water (mon08)   | Known-wrong; same wrong-color issue       |
| dragonsc               | Known-correct foliage (green); regression |
| titlepag               | Title palette correctness                 |
| graveyrd               | Title-palette regression                  |
| Character-creation     | Palette 1 ("main") regression             |
| Dungeon-traversal      | Palette 2 ("dungeon") regression          |
| Main menu              | Confirms wbase scene uses the expected palette |

For each scene: capture DOSBox-X frame at a fixed moment; render the same scene from the viewer with the new palette pipeline; compare per-pixel. Pin DOSBox-X to `tools/dosbox/wiz6.conf` for determinism.

### Tooling

New script in `tools/parity/` for pixel-diff between a DOSBox-X screenshot and a viewer render. Pattern matches the existing `tools/parity/diff.py`. Not a vitest test; a one-shot CLI invocation that the implementation plan runs by hand at Phase 6.

## Acceptance criteria

1. `docs/re/findings/palette-loads.json` exists; covers every palette-touching site across `wroot.exe`, all `*.ovr`, all `*.drv`; high-confidence sites spot-checked.
2. `docs/re/palette-discovery.md` reflects the comprehensive findings (supersedes the current "two palettes" view if Phase 1 found more).
3. `packages/data/src/palettes/` houses all named palettes; `PALETTE_CATALOG` exported; every palette has RE provenance or is explicitly marked empirical-with-no-call-site.
4. `packages/parser/src/formats/pic-render.ts` takes a `Palette` argument; no hardcoded color constants survive.
5. Every extracted asset JSON (`Pic`, `PortraitSet`, `EgaScreen`, `Font4bpp`) carries a `palette` name field referencing a `PALETTE_CATALOG` key.
6. `packages/viewer/src/palettes/` removed; viewer pages read palette via extracted JSON.
7. Spaceship (mon57) and statue water (mon08) render with light blue where previously green. Verified by pixel-diff against DOSBox-X capture.
8. No previously-correct scene regresses (canonical scene set above). Verified by pixel-diff.
9. `pnpm -r test` passes at every phase boundary.

## Risks

- **Phase 1 finds nothing new beyond the two known palettes.** Likely outcome. The fix then collapses to "assign each asset type to the right one." Work shrinks; we still complete the comprehensive scan to confirm the negative result.
- **Phase 1 finds direct-port writes that modify palettes mid-scene** (animations, fades). The "one palette per asset" model is insufficient. Mitigation: document mid-scene modifications, ship the per-asset model anyway (covers the static case), record what's deferred. Don't expand scope mid-work.
- **Title palette has no traced call site.** May be set by overlay code we haven't decompiled or via an indirect call. Mitigation: time-box the search; if not found, retain `wiz6-title` as an empirical catalog entry with `"no call site found"` provenance and a follow-up TODO. Doesn't block the rest.
- **EGA-color-table → RGB conversion mismatch with DOSBox-X.** The byte-to-RGB function in `palette-discovery.md` is plausible but never byte-validated against DOSBox-X output. Mitigation: a quick check during Phase 1 — pick one known palette byte, compute our RGB, screenshot DOSBox-X showing that color, pixel-pick, compare.
- **The renderer is doing something else wrong** (plane order, bit packing) that produces wrong colors even with the right palette. Less likely given Stage A landed and most scenes look right; Phase 6 pixel-diff would catch it.

## Open questions

- How does the CLI extractor know which palette to assign per asset? Static heuristic in code (e.g., `monsters → wiz6-dungeon`) or per-asset config file? Default to static heuristic; revisit if RE shows it's wrong.
- Should the palette picker dropdown in the viewer stay? Keep it for debug; default to extracted-data, user can override.

## Out of scope (recap)

- Runtime palette-state simulation (animations, fades).
- CGA / Tandy / monochrome ports.
- Continuous pixel-diff regression testing as a CI gate.

## See also

- [`docs/re/palette-discovery.md`](../../re/palette-discovery.md) — current palette RE notes (Phase 1 updates this).
- [`docs/superpowers/specs/2026-05-19-stage-1d-palette-design.md`](2026-05-19-stage-1d-palette-design.md) — Stage 1d, the original palette work. The "per-screen palette switching" non-goal there is superseded by this spec.
- [`docs/re/ega-screen.md`](../../re/ega-screen.md) — context on how `.ega` screens compose; the title-palette empirical extraction work lives here.
- [`docs/re/pic.md`](../../re/pic.md) — `.pic` decode + sprite rendering; the `WIZ6_PALETTE` constant being removed lives in the parser code referenced here.
