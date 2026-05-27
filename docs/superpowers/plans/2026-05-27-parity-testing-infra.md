# Parity Testing Infrastructure (Stage F)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps, TDD. Each subagent prompt MUST start by `cd`-ing into the worktree (subagents default to the main checkout).

**Goal:** End-to-end pixel-parity testing for the viewer's EGA screens: (1) decode the engine's *exact displayed screen* offline from a `.sav` save state, (2) capture the viewer's canvas pixels via Playwright, (3) diff them, (4) sprite-at-index helpers for targeted checks. This is the harness that would have caught the "ring sprite" bug (the per-screen golden-hash didn't, because it hashed our own buggy output — the engine framebuffer is the independent ground truth).

**Why offline `.sav` decode (confirmed):** the MCP's live-driving tools (screenshot/send_input/run_until) are stubs (ncurses-debugger blocker). But a `.sav` is a ZIP with a **`Vga`** section holding the full VGA framebuffer (VRAM planes + DAC palette + CRTC state). So the engine's displayed pixels are decodable offline — deterministic, CI-friendly, no DOSBox process. Existing: `packages/mcp/src/vga-palette.ts` (`readVgaBlob`, `parseVgaPaletteFromSave`); EGA planar→RGBA in `packages/parser/src/formats/ega-screen-render.ts`.

**Machine:** `vgaonly`; Wiz6 runs mode 0x0D (320×200, 16-color, 4 planes). Saves in `tools/dosbox/save/*.sav` (save 1 = NUG at the creation/confirm screen).

**Tech Stack:** TS ESM, vitest, `@playwright/test` (new), the project PNG encoder (`packages/cli/src/lib/png.ts` `encodePngRgba`), Vite dev server.

---

## Task F1 (RE + tool): Engine-screen decoder from `.sav`

**Files:** `docs/re/findings/dosbox-vga-save-layout.json` (RE); `tools/parity/decode-screen.ts` (tool); modify `tools/parity/README.md`.

**Goal:** `decode-screen.ts --save <N.sav> [--out <png>]` → the engine's displayed 320×200 RGBA (and PNG), decoded entirely from the `.sav`'s `Vga` section.

- [ ] **Step 1 (RE):** Determine the DOSBox-X `Vga` save-blob layout enough to locate: (a) the VRAM bytes for the 4 planes of mode-0x0D, (b) the **display start address** (CRTC start, so we read the right page), (c) confirm the DAC palette (already via `parseVgaPaletteFromSave`). Read `packages/mcp/src/vga-palette.ts` (`readVgaBlob`, `findDacOffset` — the pattern for locating structures in the blob). The `Vga` blob is the serialized DOSBox-X VGA component (~806 KB; includes the full 256 KB VRAM + registers + state). Approach: VRAM is the largest contiguous run; locate it (size/alignment heuristic + cross-check by decoding save 1 and matching the known NUG screenshot). Mode 0x0D planar layout: 4 planes, each byte = 8 horizontal pixels' bit for that plane; pixel index = plane0.bit | plane1.bit<<1 | plane2.bit<<2 | plane3.bit<<3; row stride from CRTC offset register (likely 40 bytes/row → 320px). Record findings (VRAM offset in blob, plane layout, stride, display-start) with evidence. **Confidence-tag** anything inferred.
- [ ] **Step 2:** Implement `decode-screen.ts` reusing `readVgaBlob` + `parseVgaPaletteFromSave` + the parser's EGA planar decode (adapt `ega-screen-render.ts` if it assumes a different source layout). Output: 320×200 RGBA via the DAC palette → PNG via `encodePngRgba`.
- [ ] **Step 3 (validate):** decode save 1 → PNG; it MUST visually match the known NUG creation screen (the user's screenshot: M-ELF NINJA sheet / SAVE THIS CHARACTER?). Eyeball the PNG (write to a path + view it). If it's garbled, the VRAM-offset/stride/display-start is wrong — iterate against the known image. This visual match IS the test for F1 (an automated test can assert the decoded buffer is non-blank + a stable hash, but correctness = matches the screenshot).
- [ ] **Step 4:** Document the recipe in `tools/parity/README.md` ("Screen parity: decode engine screen from a save"). Promote the RE to `docs/re/` if warranted. Commit findings + tool + README.

---

## Task F2 (infra): Playwright install + config + first e2e

**Files:** `packages/viewer/package.json` (devDep + scripts), `packages/viewer/playwright.config.ts`, `packages/viewer/e2e/` (tests + helpers), root config if needed.

**Goal:** Playwright running against the Vite dev server, with a canvas-pixel capture helper and a first real e2e on the character-menu.

- [ ] **Step 1:** Add `@playwright/test` as a viewer devDep; `pnpm exec playwright install chromium`. Add `playwright.config.ts`: `webServer` launches the viewer (`pnpm --filter @wiz6/viewer dev` — note `predev` runs the asset extract; allow a generous startup timeout, reuse server locally), `baseURL` the dev URL, `testDir: e2e`, chromium project, `use: { headless: true }`.
- [ ] **Step 2:** A canvas-capture helper `e2e/lib/canvas.ts`: `captureCanvas(page, selector) → { width, height, rgba: Uint8Array }` via `page.evaluate` reading the canvas 2D context `getImageData` (the engine-resolution 320×200 buffer, NOT the CSS-scaled size). Plus `saveCanvasPng(rgba,w,h,path)` (reuse `encodePngRgba`).
- [ ] **Step 3:** First e2e `e2e/character-menu.spec.ts`: goto `/castle/character-menu`; wait for the canvas to be ready (assets load async — wait for a non-blank frame); capture the 320×200 RGBA; assert (a) size 320×200, (b) NOT uniform/blank (the frame rendered), (c) it contains the frame chrome (e.g. presence of the light-gray frame color ~RGB(170,170,170) AND black fill AND the gray bg) — a structural assertion that would FAIL on the ring-sprite bug (which had no large black regions + no clean frame). Add a script `test:e2e` to the viewer package.
- [ ] **Step 4:** Run the e2e green. Commit (config + helper + first spec + scripts). Add `playwright-report/`, `test-results/`, `e2e/**/__screenshots__/` (or chosen artifact dirs) to `.gitignore`.

---

## Task F3 (parity): Canvas-vs-engine pixel diff

**Files:** `tools/parity/diff-image.ts` (or extend `diff.py`) for image diff; `packages/viewer/e2e/parity.spec.ts` (or a node harness `tools/parity/screen-parity.ts`).

**Goal:** Compare the viewer's canvas at a route against the engine screen decoded from the matching `.sav`, pixel-by-pixel with a tolerance.

- [ ] **Step 1:** `compareRgba(a, b, {tolerance}) → { equal, diffCount, firstDiffs }` — per-pixel compare of two 320×200 RGBA buffers; tolerance allows small per-channel deltas (the AC→DAC palette path can differ by a few LSBs — see `docs/re/findings/palette-loads.json` / the per-scene palette work). Produce a diff PNG (highlight mismatches) for debugging.
- [ ] **Step 2:** A parity harness/test: for a known (route, save) pair — e.g. the creation/confirm screen if a matching save exists, else the closest available — capture the canvas (F2 helper) and decode the engine screen (F1 tool), `compareRgba`, report diffCount + write a side-by-side/diff PNG artifact. Because exact pixel-parity may not hold initially (our render vs engine may differ in spots), make the FIRST parity test assert a **threshold** (e.g. ≥ 95% pixels match) + emit the diff artifact, rather than demanding 100% — and document the current match %. Note clearly which (route↔save) pairs exist and that more per-screen saves expand coverage.
- [ ] **Step 3:** Document in `tools/parity/README.md`: how to add a (route, save) parity case (capture a save at screen X, register the pair). Commit.

---

## Task F4 (helpers): Sprite-at-index extraction + check

**Files:** `tools/parity/sprite.ts` + test (or under `packages/parser` if pure).

**Goal:** "Get a sprite at an index and confirm it matches expectations." Helpers to render a single sprite/tile and compare it.

- [ ] **Step 1:** `renderFontGlyph(font, charCode) → RGBA tile` and `renderPicSprite(pic, descIndex) → RGBA` (reuse the parser's `renderTextRun4bpp`/`renderTextRun` and pic-render). A `spriteToPng` helper.
- [ ] **Step 2:** A check `assertSpriteMatches(actualRgba, expectedRgba|fixturePath, tolerance)` — and a CLI `sprite.ts --font wfont1 --char 0x00 --out png` (+ `--pic`, `--index`) to dump a sprite for eyeballing. Cross-reference the F1 engine-screen decoder so a sprite can be checked against the engine's actual rendered region (extract a cell rect from the decoded engine screen) — closing the loop ("the engine drew glyph N here; does ours match?").
- [ ] **Step 3:** A test: render wfont1 glyph 0x00 (the black-fill tile) → assert it's all-black; render a frame glyph (0x01) → assert it has the gray frame color; (optionally) compare a glyph against the corresponding cell extracted from save 1's decoded engine screen. Commit.

---

## Task F5: Wrap-up + docs

- [ ] `tools/parity/README.md` consolidated "Pixel parity" section: the offline `.sav`→screen decode, Playwright canvas capture, the diff harness, sprite helpers, and how to add cases. Update `TODO.md` (#019 or a new id) noting the parity infra + the remaining layout-refinement (Stage E follow-up) now has a tool to verify against. Full viewer suite + e2e green. Commit.

---

## Self-review notes (parent only)
- F1 (the `.sav` `Vga` VRAM decode) is the gating unknown — front-loaded; its correctness test is a VISUAL match of save 1 to the known NUG screenshot (a hash alone can't confirm correctness, same lesson as the ring-sprite golden).
- F2/F3 give the loop the project lacked: an INDEPENDENT ground truth (engine framebuffer) vs our render — not a self-hash.
- Parity threshold: don't demand 100% pixel match on day one (palette LSBs, sub-pixel). Assert a high threshold + emit diff artifacts; tighten as the layout-refinement pass lands.
- Coverage depends on having saves per screen. Save 1 (creation/confirm) is the seed; note that a CHARACTER-MENU-initial save + others would widen coverage — the harness should make adding a (route,save) pair trivial.
- Playwright `webServer` runs `predev` (asset extract) — slow cold start; set a generous timeout + `reuseExistingServer` locally.
