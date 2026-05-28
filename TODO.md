# wiz6 TODO

Stable-ID task list for cross-session tracking. Future sessions: read this on start; new items go in **Open** with the next free ID; closed items get **deleted** (git log preserves history). Never reuse IDs.

Format:

```
- #NNN [open|blocked] — Title
  - Notes / dependencies / refs
```

`open` = ready to work, `blocked` = waiting on another ID. There is no `done` status — finished items are removed.

Companion file: [`INBOX.md`](INBOX.md) — Nate's freeform jot pad. Claude processes it into TODO entries (single batch commit per session).

Next free ID: **#022**

---

## Open

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
