# wpcmk Port — Stage B: EGA Rendering Primitives for Creation Screens

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. TDD.

**Goal:** A reusable rendering layer that reproduces wpcmk's creation-screen window set pixel-accurately, built by *assembling existing primitives* (`@wiz6/parser`'s `tile-window` + fonts + `WIZ6_MAIN` palette). Output: a pure `renderCreationFrame(...) → RGBA` function + a thin `CreationCanvas` React component + RGBA snapshot tests. No screen logic yet (that's Stage C).

**Architecture:** The parser already implements wpcmk's exact window model — `TileWindow` (8×8 char+attr cells at a pixel origin), `createTileWindow`, `clearWindow`, `setCursor`, `puts`, `centeredPuts`, `renderTileWindow(win, fontSet, palette, destRgba, destW, destH, dstX, dstY)`. Stage B (a) defines the wpcmk creation window set at the exact geometry/attrs from `docs/re/wpcmk-screens.md` §2, (b) composes them into a 320×200 RGBA buffer, (c) renders that buffer to a canvas for display. **Tests assert on the RGBA buffer directly** (deterministic, no jsdom canvas needed).

**Tech Stack:** TS ESM (`.js` imports), React 18, vitest. Reuses `@wiz6/parser` `ui/tile-window.ts`, `@wiz6/data` `WIZ6_MAIN` palette, viewer `data-loader.ts` (`loadFont`/`loadFont4bpp`), and the `CastleScreen` canvas pattern (`packages/viewer/src/pages/game/CastleScreen.tsx`).

**Spec:** `docs/superpowers/specs/2026-05-26-wpcmk-byte-perfect-design.md`
**RE reference:** `docs/re/wpcmk-screens.md` §2 (window layouts), §8 (input/font notes). Stage A engine is merged (`@wiz6/data`: `WichmannHill`, formulas).

---

## Conventions for every task
- All paths absolute. The SDD controller gives each subagent the exact worktree `cd` path (and reminds: subagents default to the main checkout — always `cd` into the worktree first).
- TS ESM `.js` import suffixes. Types via `z.infer` where schemas apply.
- New creation rendering lives under `packages/viewer/src/pages/roster/creation/ega/`.
- Every commit: `pnpm --filter @wiz6/viewer test -- --run` (and parser/data if touched) green.
- **Window geometry source of truth** — `docs/re/wpcmk-screens.md` §2:
  - Persistent: `*0x546e` 40×20 cells @ (0,0) attr 0x14; `*0x56ca` 40×5 cells @ (0,160) attr 0x13; `*0x56cc` 19×13 cells @ (168,56) attr 0x15.
  - Temp: skill-train (screen-13) 20×16 @ (160,32) attr 0x19; spell outer (screen-14) 20×16 @ (160,32) attr 0x16; spell inner 19×8 @ (168,56) attr 0x17.
  - Coords are screen-absolute (320×200). Cells are 8×8 px.

---

## Task B1: Creation window-set factory

**Files:** Create `packages/viewer/src/pages/roster/creation/ega/windows.ts`, `packages/viewer/tests/pages/roster/creation/ega/windows.test.ts`.

**Goal:** Factory functions returning the wpcmk `TileWindow`s at exact §2 geometry/attrs, via `createTileWindow`.

- [ ] **Step 1: Read** `packages/parser/src/ui/tile-window.ts` — confirm `createTileWindow` opts shape (screenX, screenY, widthCells, heightCells) and how the window's fill attr is set (`clearWindow(win, char, attr)`).
- [ ] **Step 2: Write failing tests** asserting each persistent window's `screenX/screenY/widthCells/heightCells` equal the §2 values, and that a fresh window's cells are the right length (`w*h*2`).
- [ ] **Step 3: Run, expect fail.**
- [ ] **Step 4: Implement** `createPersistentWindows(): { top, bottomBar, menuPanel }` and `createSkillTrainWindow()`, `createSpellPickWindows(): { outer, inner }`, each calling `createTileWindow` with the §2 geometry and `clearWindow` with the documented attr. Export a `CREATION_WINDOW_GEOMETRY` constant table mirroring §2 (single source).
- [ ] **Step 5: Run, expect pass.**
- [ ] **Step 6: Commit.** `git add ... && git commit -m "feat(viewer): wpcmk creation window-set factory (stage B)"`

---

## Task B2: Font + palette wiring

**Files:** Create `packages/viewer/src/pages/roster/creation/ega/assets.ts`, test.

**Goal:** Identify which wfont(s) the creation screens use and provide a `loadCreationFontSet()` + the palette. The tile-window `FontSet` uses font0 (1bpp, highlight path) + font1..4 (4bpp); attr low-nibble selects the font.

- [ ] **Step 1: Confirm fonts.** Check `docs/re/findings/wfont-tile-system.json` + `wfont-highlight-render.json` for which wfont files back the creation attrs (0x13–0x19). Determine the file names served to the viewer (check `packages/viewer/public/` or the data-loader URLs) for the base + 4bpp fonts.
- [ ] **Step 2: Write failing test** that `loadCreationFontSet()` resolves a `FontSet` with a font0 and at least one 4bpp font, and that `WIZ6_MAIN` palette resolves the attr colors used (0x13–0x19).
- [ ] **Step 3: Run, expect fail.**
- [ ] **Step 4: Implement** `assets.ts` using `loadFont`/`loadFont4bpp` from `data-loader.ts`; assemble the `FontSet` the tile-window renderer expects; re-export `WIZ6_MAIN`.
- [ ] **Step 5: Run, expect pass.**
- [ ] **Step 6: Commit.**

---

## Task B3: Frame compositor (pure → RGBA)

**Files:** Create `packages/viewer/src/pages/roster/creation/ega/render-frame.ts`, test + snapshot fixture dir.

**Goal:** `renderCreationFrame(windows: TileWindow[], fontSet, palette): Uint8ClampedArray` — a 320×200×4 RGBA buffer with each window composited via `renderTileWindow`. Pure, deterministic, snapshot-testable.

- [ ] **Step 1: Read** `CastleScreen.tsx` for the compose pattern (init `new Uint8ClampedArray(320*200*4)` bg fill, call `renderTileWindow` per window, …).
- [ ] **Step 2: Write failing test**: render the 3 persistent windows (empty) + assert (a) buffer length 320*200*4; (b) a stable hash of the buffer equals a stored golden (first run: compute + store the golden in `__fixtures__/empty-frame.hash`, reviewed manually). Use a deterministic font/palette (load synchronously from a test fixture or mock the FontSet with a tiny known glyph set if real fonts aren't available in the test env — prefer real fonts).
- [ ] **Step 3: Run, expect fail.**
- [ ] **Step 4: Implement** `renderCreationFrame`. Background fill = the documented EGA bg; composite each window at its `screenX/screenY`.
- [ ] **Step 5: Run, expect pass** (store the golden hash on first run).
- [ ] **Step 6: Commit.**

---

## Task B4: Cursor / menu-highlight helper

**Files:** Create `packages/viewer/src/pages/roster/creation/ega/highlight.ts`, test.

**Goal:** Render the menu-selection highlight wpcmk uses (the font0 highlight path: attr low-nibble 0, attr!=0, high-nibble = bg palette index — per the tile-window `FontSet` doc). A helper `highlightRow(win, row, attr)` / `putHighlighted(win, text, attr)` that marks cells for the highlight render path.

- [ ] **Step 1: Read** the highlight notes in `tile-window.ts` (the `FontSet` comment) + `docs/re/findings/wfont-highlight-render.json`.
- [ ] **Step 2: Write failing test**: after `putHighlighted(win, "RACE", attr)`, the affected cells carry the highlight attr encoding; `renderCreationFrame` produces a different buffer than the non-highlighted version (assert hash differs).
- [ ] **Step 3: Run, expect fail.**
- [ ] **Step 4: Implement** the highlight helper using the documented attr encoding.
- [ ] **Step 5: Run, expect pass.**
- [ ] **Step 6: Commit.**

---

## Task B5: `CreationCanvas` React component

**Files:** Create `packages/viewer/src/pages/roster/creation/ega/CreationCanvas.tsx`, test.

**Goal:** A thin React component that takes a `TileWindow[]` (+ loaded fontSet/palette) and draws `renderCreationFrame`'s RGBA to a `<canvas>` via `putImageData`, scaled (CSS) to a crisp integer multiple. Mirrors `CastleScreen`.

- [ ] **Step 1: Read** `CastleScreen.tsx` for the canvas ref + `putImageData` + scaling pattern.
- [ ] **Step 2: Write failing test** (RTL): renders without crashing given a stub fontSet/palette + empty windows; a `<canvas>` with width 320 height 200 is present. (Don't assert pixels in jsdom — pixel correctness is covered by B3's buffer snapshot.)
- [ ] **Step 3: Run, expect fail.**
- [ ] **Step 4: Implement** `CreationCanvas`. `useRef<HTMLCanvasElement>`, `useEffect` → `ctx.putImageData(new ImageData(renderCreationFrame(...), 320, 200), 0, 0)`. `image-rendering: pixelated`, integer CSS scale.
- [ ] **Step 5: Run, expect pass.**
- [ ] **Step 6: Commit.**

---

## Task B6: Stage B wrap-up + queue Stage C

**Files:** Modify `TODO.md`.

- [ ] **Step 1:** Confirm `pnpm --filter @wiz6/viewer test -- --run` fully green.
- [ ] **Step 2: Update TODO.md** — note Stage B (EGA primitives) complete; queue Stage C (the 17 screen components + the `state.ts` reducer + `CreationPage`, driven by `docs/re/wpcmk-screens.md` §1 flow, §3 strings, §4–§9 per-screen mechanics, §8 arrow-key input). Keep format.
- [ ] **Step 3: Commit.**

---

## Self-review notes (parent only)
- **Coverage:** Stage B = spec's `ega/` layer. It deliberately stops at primitives — no screen state/logic (Stage C) and no per-screen layouts beyond the window set (Stage C positions text within these windows).
- **Leverage:** the parser's `tile-window` already implements wpcmk's char+attr cell model and the highlight path, so Stage B is assembly + wiring, not new rendering math. If a subagent finds itself reimplementing glyph blitting, stop — reuse `renderTileWindow`.
- **Test approach:** RGBA-buffer hashing (B3) gives deterministic pixel-accuracy checks without a real canvas; the React component (B5) is smoke-tested only. This matches the spec's "pixel-snapshot" intent while staying CI-friendly.
- **Open dependency unchanged:** full DOS pixel-diff parity (against DOSBox screenshots) is still possible later via the same buffer approach, but isn't required for Stage B.
