# Tooling + Hygiene Roadmap — design spec

**Date:** 2026-05-28
**Context:** retrospective on the ADD PARTY port surfaced eight discrete improvements across test hygiene, RE follow-up, tooling, test patterns, and architecture. This roadmap addresses all eight in five sequenced phases.

## Goal

Convert the lessons from the ADD PARTY port (where cell-grid tests gave false confidence, ad-hoc tile-search scripts were rewritten four times, and engine struct mysteries were papered over) into permanent improvements: test discipline, a small permanent toolkit, and an architecture seam for future rendering work.

## Phases

### Phase 1 — Test hygiene (~1 hour)

Stop trusting cell-grid parity as a CI gate.

**Files:**
- Rename `packages/viewer/tests/pages/roster/creation/ega/cell-parity.test.ts` → `cell-parity.diagnostic.test.ts`.
- Rename `packages/viewer/tests/pages/castle/add-party-cell-parity.test.ts` → `add-party-cell-parity.diagnostic.test.ts`.
- Edit `packages/viewer/vitest.config.ts` to add `exclude: ['**/*.diagnostic.test.{ts,tsx}']` alongside the existing `include`. Apply the same exclude pattern to any other package vitest configs that exist (`packages/parser`, `packages/data`, `packages/cli`, `packages/mcp`, `tools/parity`).
- Add `"test:diagnostics": "vitest run --testPathPattern '\\.diagnostic\\.test\\.[tj]sx?$'"` (or equivalent) at the root and per-package as needed.
- Update `CLAUDE.md` "Project conventions" to formalize the diagnostic-vs-gate split.

**Convention rationale:** the `.diagnostic.test.ts` suffix is greppable, IDE-visible, and one renaming step from a normal test if we ever decide a diagnostic is the right gate for a specific case. Less invasive than moving files into a subdirectory.

**Deliverable:** two renames + vitest config exclusion + `test:diagnostics` script + CLAUDE.md note. Single commit.

---

### Phase 2 — RE follow-up: wbase picker internals (~1-2 hours)

Resolve the engine mysteries we worked around in the ADD PARTY port.

Open questions to answer:

1. **`ui_window_create` arg semantics for the picker's outer + inner windows.** Specifically why the struct in memory ends up with x=20 but the engine renders content as if x=22. Trace the actual arg values and any post-creation adjustment.
2. **Where the four chrome tiles (0x5f, 0x1d, 0x23, 0x1c, 0x1f) get written.** Find the routine that draws the banner row + right-edge line + corner. Determine whether there's a reusable "bordered picker frame" helper.
3. **The `cells_off` discrepancy.** Why the left panel's cells start at struct+0x10 but the right panel's at struct+0x14. What are those 4 mystery bytes at struct+0x10..0x13 for the right panel?

**Method:** Subagent-driven RE pass on `wbase_pcfile_picker` @ wbase.ovr 0x2143 (matches project convention from CLAUDE.md). The subagent uses `tools/ghidra/scripts/decompile.py` for static decode and cross-checks against live memory in `tools/dosbox/save/1.sav` via the MCP tools. Subagent writes findings JSON; parent reviews and promotes to canonical doc.

**Deliverable:** findings JSON at `docs/re/findings/wbase-picker-internals.json` (segment-typed addresses, evidence anchors, confidence levels per CLAUDE.md convention). Promote verified findings to `docs/re/wbase-main-menu.md`. Update `docs/re/findings/wbase-window-struct.json` to mark the cells_off question as resolved (or update its "unresolved" entries if partial).

---

### Phase 3 — RE toolkit (~1 day)

Four small tools, in this order. Each is a separate commit. All live under `tools/` and integrate with the existing `pnpm tsx` runner pattern.

**3a. wfont inspector** — `tools/wfont/inspect.ts`

```
pnpm tsx tools/wfont/inspect.ts <font-name>        # render one font
pnpm tsx tools/wfont/inspect.ts --all              # render all 5 (wfont0..wfont4)
```

Reads `extracted/fonts/<font-name>.json`. Renders every 128 glyphs at 4× scale into a 16×8-grid PNG, with each glyph labeled with its hex char code below. Output: `extracted/font-sheets/<font-name>.png` (one PNG per font; `--all` writes all five).

Use case: "find me the chrome tile that looks like ⌐" — open the PNG, eyeball, get a char code in seconds instead of writing ad-hoc decoder scripts.

**3b. find-tile CLI** — `tools/wfont/find-tile.ts`

```
pnpm tsx tools/wfont/find-tile.ts --pattern '00000000;88888887;...'
```

Search all wfonts for a glyph matching the given 8×8 pattern. Pattern syntax: 8 rows separated by `;`, each row 8 chars, each char a hex palette index (0..f) or `?` for wildcard. Output: list of `(font, char)` matches with the matched glyph rendered ASCII-style for verification.

The pattern arg also accepts `@<image-path>` to load an 8×8 PNG and convert to a pattern (useful when you have a screenshot of the engine tile and want to find which font glyph produced it).

Replaces the `/tmp/find-tile*.mjs` scripts we kept rewriting.

**3c. `dump-cells.py` `--scan` mode**

Extend `tools/parity/dump-cells.py` with a `--scan` flag that walks the entire memory blob looking for plausible TileWindow structs. Heuristic: byte sequences where `w ∈ [1, 40]`, `h ∈ [1, 25]`, `x ∈ [0, 39]`, `y ∈ [0, 24]`, `x+w ≤ 40`, `y+h ≤ 25`, followed by at least `w*h*2` bytes of cell-like data (alternating char-ish + attr-ish bytes).

For each candidate, output: `struct_off, w, h, x, y, attr, first_row_chars (printable preview), confidence_score`. Sort by confidence score (highest plausibility first).

This is what would have caught the missing banner window in the ADD PARTY picker fixture — `dump-cells.py` only found windows matching specific content signatures and missed the rest.

**3d. save-state diff tool** — `tools/parity/save-state-diff.ts`

```
pnpm tsx tools/parity/save-state-diff.ts <save-a> <save-b>
```

Diff two save states. For each DGROUP offset that differs between the two, print:
- Offset (segment-typed if it falls within a known segment)
- Old value, new value (hex + decimal)
- Named meaning if the offset matches a known DGROUP variable from any findings JSON

Group runs of contiguous diffs into single entries (e.g. "0x43dc..0x43e3: 8 bytes changed, possibly party_member_pcfile_idx_array[]").

Use case: capture saves at "before X" and "after X" engine states, diff them, see exactly what state X changed.

---

### Phase 4 — Test patterns (~half day)

Bake in what works; encode the lessons.

**4a. Tile-catalog tests** — `packages/parser/tests/wfont-catalog.test.ts`

For each wfont, assert that the chrome glyphs we now know are critical have the expected pattern:
- wfont3 `0x5f` (banner-bar): black top + black bottom + gray middle
- wfont3 `0x1d` (banner-bar + right edge)
- wfont3 `0x1e` (status row underline)
- wfont3 `0x1f` (banner + right + bottom corner)
- wfont1 `0x23` (top-edge tile)
- wfont1 `0x1c` (right-edge vertical line)
- wfont1 `0x1f` (bottom-right L-corner)

Each assertion uses the proper 4bpp plane decoder. If a font asset is ever regenerated or corrupted, these tests catch it immediately. (The ADD PARTY port relied on these glyphs implicitly — without this test, a silent font change could regress the port.)

**4b. Per-region pixel tolerances** — extend `tools/parity/diff-image.ts`

Today `compareRgba(ours, eng, { tolerance: 0 })` is a single per-pixel match call. Extend to:

```typescript
compareRgba(ours, eng, {
  regions: [
    { name: 'castle-gate', x: 64, y: 16, w: 192, h: 128, tolerance: 5 },
    { name: 'picker', x: 0, y: 144, w: 320, h: 56, tolerance: 0 },
  ],
  defaultTolerance: 0,
})
```

Use case: when a screen has animation (water tiles) that we don't perfectly reproduce, allow a tolerance THERE without weakening the picker/text gates.

**4c. CLAUDE.md update** — document the test-layer convention:

> - **Pixel parity** = the gate (one per ported screen, target 100%)
> - **Schema / composer / store unit tests** = pure-function gates
> - **`*.diagnostic.test.ts`** = informational, excluded from default CI
> - **Component tests with `skipAssetLoad`** = weak by default — flag them explicitly if they don't verify rendering

---

### Phase 5 — Presenter abstraction (~design + minimal refactor, ~1 day)

Unlock future shader/HD work without coupling composers to canvas.

**Interface:**

```typescript
// packages/parser/src/presenter.ts (or viewer/lib)
export interface Presenter {
  present(rgba: Uint8ClampedArray, width: number, height: number): void;
  /** Optional: present a pre-allocated RGBA buffer that the presenter will read each frame.
   *  Useful for RAF loops to avoid re-allocating buffers. */
  presentInPlace?(getBuffer: () => Uint8ClampedArray, w: number, h: number): void;
}
```

**Default implementation:** `CanvasPresenter`

```typescript
export class CanvasPresenter implements Presenter {
  constructor(private canvas: HTMLCanvasElement) {}
  present(rgba, w, h) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const img = new ImageData(w, h);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);
  }
}
```

**Refactor scope:** `CastleScreen`, `AddPartyPage`, `CreationPage`, `GameTitle` switch from direct `ctx.putImageData(...)` to `presenter.present(rgba, w, h)`. ~10–30 lines per file, mostly mechanical. The `useRef<HTMLCanvasElement>` pattern stays; the presenter is constructed inside the canvas-effect.

**Out of scope for this phase:**
- WebGL presenter (deferred to a separate effort when there's a concrete shader/HD need)
- Higher-resolution rendering paths (composer changes are out of scope; the Presenter only sees pre-rendered RGBA)
- Effects passes (postprocessing — also a future concern)

**Why minimal refactor and not just "design only":** if we just write the interface without applying it, the next port (DISMISS) will land with direct `putImageData` calls and we'll have more refactor to do later. Applying it now to four files is small and prevents drift.

**Risk:** the interface might be wrong (no WebGL backend exists to validate against). Mitigation: keep the API as small as possible (single `present` method); any future Presenter just needs to consume an RGBA buffer.

## Cross-cutting

- Each phase commits at the end. Phase 3 is multiple commits (one per tool).
- TODO.md entries created at plan-write time: #028 (Phase 1) through #034 (Phase 4), #035 (Phase 5). Phase 3 tools split into #030 (3a), #031 (3b), #032 (3c), #033 (3d).
- No worktree per phase — small enough to do on main, or one worktree for the whole roadmap.

## Out of scope

Explicitly NOT part of this roadmap:
- `AddPartyPage` ↔ `CastleScreen` asset-loading deduplication (defer until DISMISS port informs the right abstraction)
- `EngineScreen` / state-machine abstraction (same reason — port more screens first)
- JSON → spritesheet asset migration (defer until we have volume data)
- WebGL/shader implementations (deferred Presenter consumer)
- Higher-resolution rendering (composer-side concern)
- AI portraits / additional content (asset-layer, decoupled from this work)

## Testing strategy

- Each tool gets a smoke test (loads a known input, verifies output structure).
- Phase 4's tile-catalog tests are themselves the test pattern being introduced.
- The renamed cell-parity diagnostics remain runnable via `pnpm test:diagnostics` for any future debugging.
- Phase 5's Presenter gets a unit test verifying `present()` calls `putImageData` with the right buffer.

## Open items / things to revisit

- After Phase 2's RE pass, we may discover the cells_off discrepancy has a clean explanation that would let us simplify the ADD PARTY composer (e.g. drop the hard-coded x=22 if we now understand the proper struct interpretation). Flag any such simplifications during Phase 2 — apply opportunistically.
- Phase 4b (per-region tolerances) may not be needed if no current parity test has animation drift. Skip if vacuously empty.
