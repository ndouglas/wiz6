# `.pic` Stage B — Pixel Rendering + Monster-Sprite Integration

**Status:** Design (Phase 1 imminent)
**Predecessor:** Stage A (`docs/superpowers/plans/2026-05-22-pic-stage-a-outer-decoder.md`) — shipped 2026-05-22, decoded the LIT/RUN/END envelope of all 60 `.pic` files into `(header={pos,W,H}, payload bytes)` per segment.

## Goal

Render every `.pic` sprite as actual pixels in the viewer, and wire those sprites onto monster detail pages by resolving the `combatSpriteId → monNN.pic` indirection table.

## Why two phases

Stage A taught us not to write a plan against unverified format hypotheses (the first plan baked in a wrong "LIT/SKIP/END with transparency" model and was thrown out after the disassembly revealed LIT/RUN/END). Stage B has **two unknown specs** (the pixel encoding and the sprite-ID table). Both must be confirmed by disassembly before the implementation plan can be written.

- **Phase 1 (research):** answer the three open questions below via disassembly. Land findings as docs in `docs/re/`. No production code changes.
- **Phase 2 (implementation):** write the Stage B plan against confirmed specs. Pure decoder in `@wiz6/parser`, canvas in viewer, sprite-ID lookup in `@wiz6/data`, monster-page wiring.

## Phase 1: research deliverables

Three open questions. (A) and (B) share a disassembly target (`ega.drv`) so they're one workstream; (C) is a separate target (`wroot.exe`) and runs in parallel.

### (A) Pixel encoding

Continue ega.drv disassembly from where Stage A stopped (the decode loop at 0x1C6C in the function entered at 0x1C25). The caller of that loop must consume `(pos, W, H, payload)` and produce pixels. Identify:

- Bit-depth and layout: 1bpp packed, 4bpp packed, 4 separate planes via EGA plane-select port writes (0x3C4 / 0x3CE), or something else.
- Palette source: hardware default 16 colors, or custom palette loaded from another file/resource.
- Mask/transparency: is there a mask plane or magic color?
- Units of W, H: pixels, bytes, 8-pixel cells.
- Where `pos` indexes: screen offset, sprite-buffer offset, scratch area, etc.

Deliverable: extend `docs/re/pic.md` with a "Pixel encoding" section that fully specifies how to convert a `PicSegment` (from Stage A's schema) to an `(width, height, pixels)` triple.

### (B) Multi-segment composition

Same disassembly session. 16 of the 60 files have 2-3 segments. After segment 1 decodes and renders at `pos₁`, what does segment 2 do at `pos₂`?

- Composition (each segment overwrites a different region of the same destination — `pos` is the offset within a shared buffer)
- Independent frames (each segment is its own sprite, e.g., animation poses)
- Layered overlays (segment N draws on top of segment N-1, possibly with a mask)

Deliverable: a "Composition" subsection of the pixel-encoding doc. If composition is used, document the destination buffer's geometry (width, pixel format) and how segments tile within it.

### (C) Sprite-ID indirection

Disassemble `wroot.exe` (the main game executable). Monsters carry a `combatSpriteId` field already extracted into `extracted/scenario.json`. That ID must map to one of the 59 `monNN.pic` filenames (credits.pic is excluded — it's the credits screen, not a monster).

- Locate the lookup table in `wroot.exe`.
- Determine layout: index → filename, index → number suffix, index → resource ID, or other.
- Identify overrides or quirks: shape-shifters with multiple IDs per monster, dummy entries, off-by-ones.

Deliverable: a new doc `docs/re/sprite-id-table.md` capturing where the table lives, its byte layout, and the full extracted mapping (so Phase 2 can either embed it as a TS constant or write a CLI extractor depending on size).

## Phase 2: implementation plan shape (anticipated)

Written **after Phase 1**, based on confirmed specs. Approximate task list:

1. **Pixel decoder in `@wiz6/parser`** — `renderSegment(segment) → { width, height, pixels: Uint8ClampedArray }`. Pure function, tests against small known sprites.
2. **Sprite-ID table in `@wiz6/data`** — either embedded constant or extracted JSON, depending on Phase 1C findings.
3. **`<PicCanvas segment />` component** in viewer — renders one segment to a canvas at integer scale.
4. **PicDetail enhancement** — canvas alongside hex preview per segment; if composition exists, composed canvas at the top.
5. **PicsIndex thumbnails** — 60 sprites visible at a glance on the index page.
6. **MonsterDetail sprite display** — look up `combatSpriteId`, render the composed canvas.
7. **Smoke + deploy** — same pattern as Stage A Task 5.

**Schema impact:** `PicSchema` stays bytes-only; pixels render at view time. Baking pixels into JSON would inflate file sizes (a 64KB-byte sprite expands to ~256KB at 4bpp+RGBA) for no real win. Sprite-ID table is its own JSON asset.

**What might change after Phase 1:** task count if composition turns out trivial (drop the composition pass) or hairy (e.g., layered with a mask — adds a Task between 1 and 2). Task 2 collapses to a constant if the sprite-ID table is small. Task 5 (thumbnails) becomes a stretch if rendering 60 canvases on the index has a perf cost we want to defer.

## Out of scope (Stage B)

- CGA / Hercules / Tandy driver interpretations. EGA only. The other drivers may be a retro-feel toggle in Stage C+.
- Sprite animation (if multi-segment files turn out to be animation frames rather than composition, we'll display the first frame and defer animation to Stage C).
- Any change to monster data extraction — `combatSpriteId` is already in `extracted/scenario.json`.

## Decision log

- **Disassembly over candidate-rendering:** matches the Stage A approach that worked. User explicitly chose this over the eyeball-test path.
- **Bundled scope (sprites + monster integration in one stage):** user picked the most ambitious option. Could be split into 2a (sprites) + 2b (monster integration) if Phase 1 reveals either side is messier than expected.
- **Two-phase split:** research first, implementation plan written against confirmed specs. Avoids Stage A's "rewrite and restart" failure mode.
