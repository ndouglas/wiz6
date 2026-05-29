# wiz6 TODO

Stable-ID task list for cross-session tracking. Future sessions: read this on start; new items go in **Open** with the next free ID; closed items get **deleted** (git log preserves history). Never reuse IDs.

Format:

```
- #NNN [open|blocked] — Title
  - Notes / dependencies / refs
```

`open` = ready to work, `blocked` = waiting on another ID. There is no `done` status — finished items are removed.

Companion file: [`INBOX.md`](INBOX.md) — Nate's freeform jot pad. Claude processes it into TODO entries (single batch commit per session).

Next free ID: **#032**

---

## Open

- #031 [open] — Asset format migration: JSON → spritesheets
  - JSON encoding bloats binary glyph/portrait/PIC data by 10-30×. Glyphs are 32 bytes binary; the JSON form is ~600+ bytes. Network cost on every viewer load.
  - Plan: pre-built PNG spritesheets for wfont/wport/PIC with a small JSON metadata file. Keep JSON form for decoder development.
  - Touches extractor pipeline (`packages/cli`), loaders (`packages/viewer/src/data-loader.ts`), test fixtures.
  - Defer until we have measured load-time pain or want to ship to mobile.

- #030 [open] — WebGL presenter for shader / HD rendering
  - Implement a second `Presenter` backend (alongside `CanvasPresenter`) that takes RGBA and runs it through a WebGL pipeline. Enables CRT shaders, scanline effects, scale-up filters, HD-asset compositing.
  - Touches only `packages/viewer/src/lib/presenter.ts` (+ a new `WebGLPresenter.ts` and possibly a hook for component-level opt-in); composers are unaffected.
  - Blocked on: concrete need (no shader experiment in flight yet).

- #029 [open] — Per-region pixel tolerances in `compareRgba`
  - Currently `compareRgba(ours, eng, { tolerance: N })` applies one global tolerance. All parity tests today use `tolerance: 0` (strict gate).
  - When a future ported screen has localized animation drift (e.g. water tiles, particle effects) that we can't reproduce byte-exact, we'll want named-region overrides: `regions: [{ name, x, y, w, h, tolerance }]` with `defaultTolerance` for everything else.
  - Implement when the first such screen lands. CLAUDE.md test-layer convention already documents this as the preferred approach over globally lifting tolerance.

- #028 [open] — Simplify ADD PARTY picker composer per the resolved struct model
  - Per `docs/re/findings/wbase-picker-internals.json`: both picker panels use `cells_off = struct + 0x10` and the engine renders NATHAN at global col 22 because the row renderer leftpads cursor to x=2 (NOT because struct.x=22).
  - Today: composer hardcodes `RIGHT_CELL_X = 22` and emits NATHAN at panel col 0, plus separate `middleStrip` + `scrollbar` windows. Mental model is wrong even though pixel output is correct.
  - Simplification: set `RIGHT_CELL_X = 20`, shift right-panel cells right by 2 cols (scrollbar at col 1, NATHAN at col 2-7), drop the standalone `scrollbar` window and possibly the `middleStrip`.
  - Also update `tools/parity/dump-cells.py --picker` to use `cells_off = struct + 0x10` unconditionally (drop the +0x14 path) and regenerate the fixture at `tools/parity/fixtures/cells/add-party-picker-1char.json`.
  - Pixel parity should remain at 100% (verify before commit).
  - Engine routine that paints chrome at cell 19 rows 19-23 (the right-edge line glyph 0x1c) is still unidentified — likely belongs to a window we haven't located. Document as open question during this refactor.

- #019 [open] — wpcmk Phase 2 — Stages A–F COMPLETE; next: layout-refinement (now measurable via parity)
  - **Stage C (screens) COMPLETE** — `packages/viewer/src/pages/roster/creation/`: `state.ts` (pure flow reducer, §1 + characterMenu entry), `messages.ts` (§3 msg-id wiring), `screens/` (CharacterMenu, NameInput, MenuPicker[race/sex/class], BonusAllocator, Personality, PortraitPicker[placeholder pixels], SkillTrain, SpellPick, Confirm), `CreationPage.tsx` + `lib/build.ts`. Plan: `…-stage-c-screens.md`.
  - **Stage D (cutover) COMPLETE** — old `/roster/new` wizard + `pinMaxBonusRoll` deleted.
  - **Stage E (shell + chrome + CHARACTER MENU) COMPLETE** — window chrome RE'd (`wpcmk-window-chrome.json`: wfont1, fill 0x00, frame 0x01-0x08) + rendered (fixed the "ring sprite" bug); CHARACTER MENU 6-option entry (`CharacterMenuScreen`); one continuous screen at `/castle/character-menu` (reached via MASTER OPTIONS), centered in the shell; `/roster/new` + RosterView "+ New" deleted. Plan: `…-stage-e-shell.md`. Verified via PNG render (chrome + menu + name) — NOT yet browser-verified.
  - **Stage F (parity testing infra) COMPLETE** — Plan `…-parity-testing-infra.md`. (1) `tools/parity/decode-screen.ts` decodes the engine's exact 320×200 screen OFFLINE from a `.sav` `Vga` section; (2) Playwright installed + `packages/viewer/e2e/`; (3) `tools/parity/diff-image.ts` (`compareRgba`+diff PNG) + `screen-parity.ts`; (4) `tools/parity/sprite.ts` (renderFontGlyph/PicSprite, extractCell, assertSpriteMatches + CLI).
  - **decode-screen now color-faithful** (`75b5709`/`38a6455`/`64b33fd`): true VRAM base **`0x84000`**, NO masking, **wiz6-main AC→DAC palette** (wroot 0x2043) — black interiors / light-gray frames / white text / dark-gray bg all decode correctly across the 3 menu saves. Menu uses EGA planes 0+3.
  - **Dynamic CHARACTER MENU** (`6a5d3d3`): roster-state options — empty → CREATE PC+EXIT; partial → all 6; full (**16** slots) → no CREATE PC. RE: `wpcmk-character-menu-options.json`.
  - **Parity uses COMMITTED fixtures, not `.sav`** (`5581447`, done): `tools/parity/fixtures/engine/character-menu-{empty,partial,full}.{idx.gz,png}` (gzipped EGA-index arrays + viewer PNGs, ~1-2.5 KB each). `packages/viewer/tests/.../ega/screen-parity.test.ts` diffs our headless render vs the committed fixture — **zero `.sav` reads** (the 5 `.sav` mentions are all comments). Regenerate via `gen-fixture`. Satisfies "we should not need the save again."
  - **Layout pass 1 DONE** (parity **47% → 49.25%**, floor raised 40→45): menu options now pixel-exact — column-major fill, columns at bottomBar-local x=[18,30,2], rows 3&4; killed the flood-yellow highlight bug (bottom list is plain white; engine reflects selection in the TOP bar, not the bottom list). Verified vs empty/partial fixtures; FULL layout flagged unverified (doesn't fit the model — `wpcmk-screens.md` §1a open question). Doc: `wpcmk-screens.md` §1a "Option placement".
  - **Layout pass 2 DONE — BYTE-EXACT tile parity** (saves 1/2/3, all 3 windows, 0 diffs). The CHARACTER MENU is entirely tiles: `top` cleared black (wfont1) + `drawCharSheetTemplate` (port of FUN_06af's stat-panel frame); `bottomBar`/`menuPanel` cleared GRAY (char 0x20, attr 0x03 / wfont3); menu options column-major at bottomBar cols [4,16,28] rows [1,2] (attr 0x03); cursor = per-label black-on-yellow highlight (attr 0x50, `highlightRange`). Verified against the engine's LIVE window CELL memory. RE: `docs/re/findings/wpcmk-charmenu-toplayout.json`.
  - **Parity oracle pivoted to CELL grids**: `tools/parity/dump-cells.py` dumps the engine's `(char,attr)` window arrays from a save → `tools/parity/fixtures/cells/save{1,2,3}.json`; `cell-parity.test.ts` asserts byte-exact. This REPLACES the framebuffer fixtures (deleted) — **`tools/parity/decode-screen.ts` is BUGGY** (≈+14-cell/+2-row cyclic shift; the prior fixtures + layout-pass-1 positions were all shifted). decode-screen now carries a warning header.
  - **decode-screen display-start fix** (deferred, low priority): correct the CRTC display-start/origin math so the framebuffer decoder matches the engine (or retire it — cell-grid parity is the better oracle). Only needed if we want a pixel-level (vs tile-level) oracle.
  - **Per-screen byte-exact ports (cell-grid parity, via `dump-cells.py` fixtures)**: CHARACTER MENU (empty/partial/full), NAME INPUT, RACE/CLASS picker (menuPanel list + centered prompt), and the **populated char-sheet** (`ega/char-sheet.ts` — `drawCharSheet(top, draft, db, title)`: STR..KAR + values, HP/STM, BONUS, EXP/LVL/MKS/RNK, name/sex/race header, 6-icon bottom grid; right-aligned space-padded numbers; attr = param<<4). RE: `docs/re/findings/wpcmk-charsheet-fields.json` (3 routines: `ui_render_stat_panel` 0x2b04, `ui_redraw_character_sheet` 0x0df7, `ui_print_character_header` 0x0d52). Fixtures: `cells/{save1,save2,save3,name-input,race-select,class-select}.json`. New tool: `tools/ghidra/scripts/decompile.py` (PyGhidra shim; old `dump_function.py` broke on pyghidra 3.x). **Unverified (0 in all fixtures)**: EXP/MKS multi-digit widths, age values, school-mana bottom-grid — need a post-screen-07 save with non-zero hp/xp/level + a mid-game char. **Next screens to capture/port**: sex picker (03), bonus allocator (06), personality (08), skill train (13), spell pick (14), confirm (15).
  - **Browser-verify** `/castle/character-menu` (centering, keyboard nav, the 3 dynamic states) — Playwright e2e covers structural render; a human eyeball is still worthwhile.
  - **Parity infra follow-ups**: Playwright `webServer` skips `predev` (assumes extracted assets — CI needs an extract step); `waitForNonBlankCanvas` has a cold-server paint race (warm runs fine) — harden to wait for the gray frame color.
  - **Deferred polish**: real WPORT*.EGA portrait pixels (placeholder now); REVIEW/DELETE/RENAME/PORTRAIT menu actions are stubs; wall-clock animation feel.
  - **Stage A (engine) COMPLETE** — RNG, formulas, record encoder, parity harness, all tested; full RNG-sequence parity pending a manual DOSBox creation-commit save capture.
    - `WichmannHill`, `rollBonus`, `rollSkillBudget`, `rollKarmaWith`, `computeDerivedStats` all live in `@wiz6/data`; compose test in `packages/data/tests/character-creation/creation-engine.compose.test.ts`.
  - **Stage B (EGA primitives) COMPLETE** — `packages/viewer/src/pages/roster/creation/ega/`: `windows.ts` (window-set), `assets.ts` (`loadCreationFontSet`+palette), `render-frame.ts` (`renderCreationFrame`→RGBA + golden snapshot), `highlight.ts` (menu-cursor), `CreationCanvas.tsx`. Plan: `docs/superpowers/plans/2026-05-26-wpcmk-port-stage-b-ega.md`.
  - **Open RE items** (see `docs/re/wpcmk-screens.md` Open Questions): Fighter skill-budget tier2 (needs a Fighter creation save); portrait default (0 vs SPD+1); real HP formula derived (per-class roll); NUG ground-truth validation in `docs/re/findings/wpcmk-nug-ground-truth-validation.json`.
  - Phase 1 RE sweep: `docs/re/wpcmk-screens.md` (17 screens, 76/76 functions named) + 12 `docs/re/findings/wpcmk-*.json`.
  - Stage A plan: `docs/superpowers/plans/2026-05-26-wpcmk-port-stage-a-engine.md`; spec: `docs/superpowers/specs/2026-05-26-wpcmk-byte-perfect-design.md`.

- #004 [open] — PIC Stage B: pixel rendering + monster sprite integration
  - In-flight plan: `docs/superpowers/plans/2026-05-22-pic-stage-b-pixel-rendering.md` (6/57 boxes checked).
  - Decoder spec is complete; need descriptor parsing rewrite, EGA cell rendering, viewer wiring.

- #005 [open] — Viewer redesign Stage 2c
  - Plan: `docs/superpowers/plans/2026-05-22-viewer-redesign-stage-2c.md` (0/50).
  - Not started.

- #006 [open] — Viewer redesign Stage 2d (monster power tools)
  - Plan: `docs/superpowers/plans/2026-05-22-viewer-redesign-stage-2d.md` (0/44).
  - Compare mode (`/monsters/compare`), family-grouped index, copy-bytes/JSON header buttons.
  - `.pic` monster sprites are still blocked on prior stage; cross-references with #004.

- #022 [open] — Skill-train screen polish + remaining RE
  - Live viewer screen is now wired up via the shared `composeSkillTrainFrame` (commit 29aa2c8); parity test stays pixel-perfect (7/7 floor 100). Key bindings match the engine: ◄►=adjust skill, ▲▼=select, Enter=next category, ArrowLeft=no-op.
  - Open items: (1) RE the row 9/11 left-vert glyph 0x0f vs 0x0d — origin still unknown, reproduced as-is; (2) RE the row-3 "second age" field at top (5,3) — currently hardcoded "  1" in `composeSkillTrainFrame` to match slot 1 (TODO: derive from a real source — possibly child age or some chargen counter); (3) confirm layout for PHYSICAL/PERSONAL/ACADEMIA categories (different row counts may need a parity fixture per category); (4) consider hoisting the persistent wfont2 portrait patch into `CreationPage` so ALL post-portrait screens (skillTrain, spellPick, confirm) get it automatically instead of each repeating the pattern.

- #023 [open] — DISMISS A PARTY MEMBER (wbase character_submenu, slot 2)
  - Engine slot 2 calls `pick_party_member(0x4b3)` then `character_submenu(picked)`. The character_submenu (`FUN_25cc` @ wbase 0x25cc) is undecoded; per-member DISMISS likely lives inside it.
  - Needs an RE subagent pass on `wbase_character_submenu` to identify per-member options. Then a sibling spec/plan to `2026-05-28-add-party-member-design.md`.
  - Spec referenced this as the per-member inverse of ADD.

- #024 [open] — Right-side party-panel rendering (`FUN_1b2d`)
  - Engine `FUN_1b2d` @ wbase 0x1b2d draws per-member info panels on the right side of MASTER OPTIONS: name, status icon, condition icons, class symbol, two equipment-tile slots.
  - Blocked on RE of the `0x526` (status icon lookup) and `0x532` (condition severity lookup) tables and the equipment-tile rendering path.
  - Currently CastleScreen renders portraits on the LEFT only (Task 7); the RIGHT side stays empty.

- #025 [open] — `msg.dbs` ID-to-text decoding for IDs ≥ 718
  - `load_msg_into_buf` (wroot 0x75b) has an ID → section/offset encoding not yet reversed. Our `extracted/messages/msg.json` covers IDs 0..717.
  - Blocks reading exact engine strings for any msg ID > 717. Picker titles (0x4b1 / 0x4b6 / 0x4b7), race/class/sex enum strings (bases 100/120/140), and many other UI labels live in the unmapped range.
  - ADD PARTY MEMBER uses fixture-captured strings (`save/1.sav` cells), so this isn't blocking the feature — but a proper decode would let the picker render strings from the msg DB rather than hardcoded constants in the composer.

- #026 [open] — Engine-faithful 64×9 party portraits (currently 24×24 wport sprites)
  - Per `docs/re/findings/wbase-add-party-member.json`, engine `FUN_0b0e` reads 9 rows × 32 bytes per portrait from `WPORT*.EGA` (= 64 pixels wide × 9 rows tall). Our castle-side blit uses the 24×24 portrait sprites from `extracted/portraits/wport*.json` instead.
  - To match engine pixel-exact: extend the portrait extractor to also produce the 64×9 castle-side variant (or compute it on the fly from raw WPORT bytes), then update `blitPortrait` in `castle-frame.ts` to use it.
  - Visual functional today (portraits show), but not engine-faithful for the castle-side rendering.

- #021 [open] — Per-class bonus-allocator AUTO-FILL animation
  - End-state implemented (commit 9c7879b): `PICK_CLASS` snaps attributes to `max(race_base, class_min)` and deducts the deficit from the pool. Verified vs the engine save (NATHAN/Samurai/pool 17→2).
  - The engine ANIMATES the ramp: `wpcmk_pick_class_menu` exit calls FUN_2e85 → FUN_2fbd which dispatches via the 14-entry jump table at wpcmk CS `0x7505` (= file `0x2FA1`) to a per-class routine that increments attrs one-at-a-time with sound + per-frame redraw. Need to:
    1. Read the 14 jump-table entries from a class-selected save state (table lives in wpcmk data segment — pick any save where `wpcmk_pick_class_menu` has run).
    2. Decompile a couple of routines (Samurai class 11, Fighter class 0) to see the increment pattern (order of attrs, per-step delay, sound trigger).
    3. Decide whether to port the animation faithfully or do a generic per-attr ramp (1 frame per +1 increment, looping STR→PER until each reaches class_min) — both end at the same state.
  - Add a screen-parity case for `creation-bonus-allocator` (current slot 1: NATHAN, Samurai, post-auto-fill, pool=2, cursor on STR). Needs a `drawBonusAllocator` helper for the cursor + bottom-prompt rows (`MSG_ASSIGN_ABILITY` 0x0460 + arrow-glyph instructions 0x0454).

- #020 [open] — `renderEgaScreen` plane-3 storage for `titlepag.scr` bottom tagline (last 1.6% of intro parity)
  - `tools/parity/intro-parity.test.ts` sits at 98.38% on `title-art` / `title-art-copyright` (1038 px). The residual is entirely in the bottom 7 rows (y 185-191) and every diff pixel is exactly `engine = ours | 8` — the engine has the **intensity plane (bit 3)** set on the bottom tagline, ours doesn't.
  - `renderEgaScreen` (`packages/parser/src/formats/ega-screen-render.ts`) uses an empirical per-plane shift (`shiftX = 64·p`, `shiftY = −5·p`, plus a `yDrop`) that's pixel-exact for the whole rest of `titlepag` AND for `graveyrd` / `dragonsc`. At `shiftY=-15` plane-3's body is 0-diff; **no other `shiftY` recovers the band**, and a true global byte-rotation (`R3=-576`, the model the docstring describes) gives the same — band 1038, body 0. So no single plane-3 transform can place both regions. `titlepag.scr` plane 3 is stored non-uniformly there, or the engine brightens the tagline by some mechanism outside the static `.scr`.
  - Method to close: byte-level inspection of `original/titlepag.scr` plane 3 in the bottom-rows region (which is where exactly?), comparing against what the rotation model expects. Or grep wroot/winit for a tagline-brightening overlay. Beware: any change to `sourceCoordForPlane` risks regressions on `graveyrd` / `dragonsc` — re-run the full parity suite after.
  - User explicitly deferred (2026-05-27): "I don't think anything will blow up, but I don't wanna do it right now either."

- #009 [open] — Savegame + Roster: Phase 6 (Saves page UX) + Phase 7-8 (DOS interop, savegame editor) remain
  - Design: [`docs/superpowers/specs/2026-05-23-savegame-strategy.md`](docs/superpowers/specs/2026-05-23-savegame-strategy.md).
  - Plan: [`docs/superpowers/plans/2026-05-25-savegame-roster-phases-1-5.md`](docs/superpowers/plans/2026-05-25-savegame-roster-phases-1-5.md).
  - **Phases 1-5 shipped 2026-05-25**: schemas (`CharacterSchema` / `PartyMemberSchema` / `RosterSchema` / `SaveSchema` in `@wiz6/data`), gzip+base64 codecs in `@wiz6/parser`, localStorage stores (`wiz6:save:0..5`, `wiz6:roster`, `wiz6:gallery-origins`), curated `/gallery/characters.json` seed + auto-seed-on-first-visit, and a working `/roster` page (list + gallery badge + character download/upload).
  - **Phase 6 (`/saves` page UX)** is the natural next step — slot grid, per-slot download/upload buttons, "form party" picker pulling from the roster.
  - **Phase 7 (DOS interop)** waits on a separate `SAVEGAME.DBS` RE pass.
  - **Phase 8 (savegame editor)** builds on Phase 6 + the per-field engineering tooltips.

---

## Open questions (lower priority; investigation tasks, not features)

- #Q-B — wbase.ovr audio-config struct (partial)
  - 5 bytes copied to `0x3590..0x3594` at file `0x1488`. Identify option labels ("PC Speaker / AdLib / Tandy / Silent") and the device-selection contract. **Partially answered by #Q-L pass (2026-05-24)**: `*0x1756` is the device byte and `*0x3590` is the audio-mode/volume class. Config is NOT auto-detected — it's set by wbase from a static struct. Still need to identify the exact label↔value mapping in the menu UI.

- #Q-D — Fast-mode trigger (`*0x1760 & 2`)
  - Which gameplay states or sounds set the fast bit? Title clang uses slow.

- #Q-E — Apply audio-driver rename fixes to Ghidra project
  - The 2026-05-24 AdLib deep-dive (`docs/re/findings/wroot-adlib-driver.json`) produced 9 rename proposals for the audio driver region of wroot.exe. Key change: the misnamed `audio_adlib_init_voice@0x11962` (which is actually a 3-byte PIC EOI IRET stub) needs to be dropped; the real AdLib init is at image `0x11765` and should be named `adlib_chip_init_voice0`. Other proposals cover `adlib_write_register@0x11892`, the two delay helpers, the volume-LUT builder at `FUN_1000_17FE`, etc.
  - Method to close: update `tools/ghidra/scripts/apply_audio_names.py` (or write a new apply script) to merge the rename_proposals from the findings file. Also update `docs/re/snd-format.md` to fix the now-known-wrong "256-byte fixed LUT" claim (the LUT is runtime-rebuilt per call by `FUN_1000_17FE`).

- #Q-J — Decode `rate_or_vol` semantics in the sound-table
  - The sound-table snapshot in `@wiz6/data/sound-table.ts` exposes per-slot `rate_or_vol` values (e.g. slot 4 = 0x49, slot 7 = 0x34, slot 13 = 0x3C). The field is labelled "volume index" in the deep-dive findings but we haven't decoded the semantics — is the high nibble rate, low nibble volume? Is it scaled by music-mode at `*0x3590`? Affects in-game playback fidelity, not the intro (the intro currently uses `duration` for rate adjustment which is sufficient for SOUND04/05/06/07/13).
  - Method to close: decompile `audio_play_sound` at wroot image 0x10AAA and trace how rate_or_vol gets consumed. Or empirically vary playback rate while listening in DOSBox-X and our viewer.

- #Q-K — Runtime pitch modulation for context-dependent sounds
  - User observation (2026-05-24): the same .snd file (e.g. the death-groan sound effect) plays at different pitches depending on character context — sex of the dying character, possibly other state. Our static per-slot rate snapshot (`@wiz6/data/sound-table.ts`) captures only the BASELINE rate; the engine clearly modulates pitch at call time for some events.
  - Likely source: an additional parameter passed into `audio_play_by_id(N, duration_param, ?, flags_param)` at the call site. Or a runtime modifier byte in the sound-table flags field that the caller mutates before invocation.
  - Method to close: identify a deterministic in-game event with pitch variation (death groan via cliff-fall TPK is a good candidate per user), capture saves immediately before AND after the event in DOSBox-X, diff the sound-table memory + relevant character fields. Or decompile the specific call site (e.g. wmaze's TPK handler) to see what it passes.
  - Doesn't block any current work — intro/credits sounds are deterministic. Relevant when we get to dungeon/combat audio.
