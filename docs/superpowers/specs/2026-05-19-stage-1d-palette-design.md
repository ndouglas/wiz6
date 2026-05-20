# Stage 1d — Runtime Palette Discovery & Application Design Spec

**Date:** 2026-05-19
**Status:** Approved (pending written-form review)
**Scope:** Discover Wizardry VI's runtime EGA palette by reading the binary, validate against the game running in DOSBox, encode it as a typed constant in the codebase, and apply it as the default in the 4bpp font viewer so rendered colors approximate the in-game appearance.

## Goals

- Replace the default 16-color EGA palette placeholder (used in Stage 1c) with the actual Wizardry runtime palette.
- Make the palette a typed first-class artifact in `@wiz6/data` (`PaletteSchema`) so future palettes (CGA, Tandy, per-screen variations) slot in cleanly.
- Restructure the viewer's palette code into a `palettes/` directory that can grow.
- Let the user toggle between "Wiz6 default" and "EGA default" in the viewer for ongoing visual debugging and verification.
- Verify the discovered palette empirically: wfont1 class abbreviations should render as bright magenta (matching the in-game class-selection screen), wfont2 movement labels as yellow, etc.

## Non-Goals (explicit)

- **Per-screen palette switching.** Stage 1d assumes a single "main" Wizardry palette is enough. If the investigation reveals per-screen variation, we document it in `docs/re/palette-discovery.md` and defer multi-palette handling to a later stage. We do **not** expand Stage 1d on the fly.
- **CGA / Tandy palettes.** Out of scope; the `palettes/` directory leaves room.
- **Building an automated screenshot → palette extractor as a real tool.** A throwaway script for cross-validation is fine; a maintained tool is overkill if disassembly works.
- **Touching the parser, decoder, schemas-other-than-Palette, or extraction CLI.** Stage 1d is viewer-side + data-side (Palette schema) only.
- **Stage 1c carry-overs.** If verification turns up something off about wfont1-4 beyond colors, document and defer.

## Methodology

Per the user's decision: **combination** of three techniques, ordered by leverage.

1. **Primary — Ghidra disassembly of `winit.ovr` (5,173 bytes).** Smallest overlay, strong candidate for initial video setup. Look for:
   - `INT 10h` BIOS calls — particularly `AX=1002h` (set all 16 palette registers from a pointer to a 17-byte table).
   - Direct port writes to the EGA Attribute Controller (port `0x3C0`) — `OUT 3C0h, AL` patterns.
   - A 16- or 17-byte table somewhere in the data section whose values look like EGA color codes (6-bit values, lots of common patterns like `0x00`, `0x07`, `0x38`, etc.).
2. **Cross-validation — DOSBox screenshot.** Run Wizardry in DOSBox, screenshot the class-selection screen (we already know what colors should appear there from Stage 1c observations). Read the 16 unique colors via a throwaway Node/Python script or by eye. Compare to step 1's values.
3. **Tiebreaker — DOSBox-X debugger.** If steps 1 and 2 disagree, pause Wizardry in DOSBox-X at a known screen and inspect the EGA palette registers directly. Document the discrepancy.

**Failure mode for the disassembly path:** if `winit.ovr` doesn't contain the palette setup (i.e., it lives in `wroot.exe` or another overlay), the disassembly investigation may exceed the stage budget. **Fallback:** derive the palette purely from a DOSBox screenshot + manual correlation with file pixel values; ship that as the WIZ6_PALETTE; defer the disassembly-confirmation step to a later stage. The stage still completes its goal (corrected colors in the viewer) without the binary cross-check.

## File Structure

```
docs/
├── re/
│   ├── palette-discovery.md            # NEW — methodology log + discovered palette table
│   └── wfont-4bpp.md                   # MODIFY — replace "approximate" caveat with link to discovered palette
packages/
├── data/
│   └── src/
│       ├── schemas/
│       │   └── palette.ts              # NEW — PaletteSchema (16 RGB triples + metadata)
│       └── index.ts                    # MODIFY — re-export PaletteSchema + types
├── viewer/
│   ├── src/
│   │   ├── palettes/
│   │   │   ├── ega-default.ts          # NEW — content moved from ega-palette.ts
│   │   │   ├── wiz6-default.ts         # NEW — the discovered Wizardry palette
│   │   │   └── index.ts                # NEW — re-exports both + a typed `PaletteName` union
│   │   ├── ega-palette.ts              # DELETE — moved to palettes/ega-default.ts
│   │   ├── views/
│   │   │   └── Font4bppGallery.tsx     # MODIFY — accept `palette` prop, default to WIZ6_PALETTE
│   │   └── App.tsx                     # MODIFY — palette picker (radio buttons) applies to all 4bpp galleries
│   └── tests/
│       ├── ega-palette.test.ts         # DELETE — replaced by palettes/ega-default.test.ts
│       └── palettes/
│           ├── ega-default.test.ts     # NEW — the existing 6 EGA tests, re-pointed at the new import path
│           └── wiz6-default.test.ts    # NEW — snapshot test pinning the discovered values
```

**File responsibilities:**

- `packages/data/src/schemas/palette.ts` — `PaletteSchema`: object with `name: string`, `provenance: string`, `colors: [RGB, RGB, ...]` (length 16, RGB = `[number, number, number]` each in 0..255). Both the EGA default and Wiz6 palettes conform to this schema.
- `packages/viewer/src/palettes/ega-default.ts` — exports `EGA_PALETTE` (a `Palette` value typed against the schema). Content is the same 16-color standard EGA palette from Stage 1c.
- `packages/viewer/src/palettes/wiz6-default.ts` — exports `WIZ6_PALETTE`. Content is the discovered values from the investigation.
- `packages/viewer/src/palettes/index.ts` — barrel: `export * from './ega-default.js'; export * from './wiz6-default.js'; export type PaletteName = 'wiz6' | 'ega';`
- `packages/viewer/src/views/Font4bppGallery.tsx` — adds a `palette?: Palette` prop, defaulting to `WIZ6_PALETTE`. Uses `palette.colors[colorIndex]` instead of the previous hardcoded `EGA_PALETTE[colorIndex]`.
- `packages/viewer/src/App.tsx` — adds palette-picker state (default `'wiz6'`), renders two radio buttons or a small `<select>`, passes the chosen palette to every `Font4bppGallery`. `FontGallery` (1bpp) is unaffected.

## Architectural Pillars (no changes for Stage 1d)

All Stage 1c pillars hold. Specifically:

- Engine purity (`@wiz6/data` stays Node/DOM-free). `PaletteSchema` only imports zod.
- Tests use vitest + the existing canvas mock.
- The viewer continues to consume schema types from `@wiz6/data`.

## Stage Plan (will become the implementation plan)

1. **Investigation.** Disassemble `winit.ovr`. Find palette setup. Document in `docs/re/palette-discovery.md` — include the 16 RGB values, their register indices, and the disassembly snippet that produced them.
2. **Cross-validate.** Screenshot the DOSBox class-selection screen. Extract 16 unique colors (script or by eye). Compare. Note result.
3. **Add `PaletteSchema`** to `@wiz6/data`. TDD with zod tests for length, byte bounds, RGB tuple shape.
4. **Move** `packages/viewer/src/ega-palette.ts` to `packages/viewer/src/palettes/ega-default.ts`; rename the constant if helpful; update imports.
5. **Add `WIZ6_PALETTE`** in `packages/viewer/src/palettes/wiz6-default.ts` with the discovered values + a snapshot test.
6. **Refactor `Font4bppGallery`** to accept a `palette` prop, default to `WIZ6_PALETTE`. Existing tests get a small update (or rely on the default).
7. **App palette picker.** Radio buttons in `App.tsx`, plumb the selected palette down to all four `Font4bppGallery` instances.
8. **Visual verification.** Dev server, user eyeballs: wfont1 class abbreviations should look bright magenta under WIZ6, cyan under EGA. Iterate on step 1 if not.
9. **Update `docs/re/wfont-4bpp.md`.** Replace the "palette is approximate" caveat with a link to the discovered palette plus any remaining caveats (e.g., if per-screen variation is observed).

## Acceptance Criteria

- `docs/re/palette-discovery.md` exists, contains the discovered palette + at least one supporting source (disassembly snippet OR screenshot color readout).
- `WIZ6_PALETTE` constant exists, validated against `PaletteSchema`, snapshot-tested for stability.
- Viewer's 4bpp galleries default to `WIZ6_PALETTE`; toggling to EGA via the picker works.
- Visual verification by the user: wfont1 class abbreviations look right (bright magenta) under WIZ6 selection.
- All tests pass (49+ tests across three packages); lint + typecheck clean.

## Open Questions / Punted

- **Per-screen palettes.** Punted; revisit if investigation reveals it.
- **CGA / Tandy palettes.** Punted; `palettes/` directory leaves room.
- **Glyph-to-codepoint mapping for wfont1-4.** Out of scope (the Stage 1c carry-over).
- **Whether the investigation will actually find the palette in `winit.ovr`.** Open until step 1 executes. Failure-mode fallback documented above.
