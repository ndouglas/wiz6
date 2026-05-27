# wiz6 TODO

Stable-ID task list for cross-session tracking. Future sessions: read this on start; new items go in **Open** with the next free ID; closed items get **deleted** (git log preserves history). Never reuse IDs.

Format:

```
- #NNN [open|blocked] — Title
  - Notes / dependencies / refs
```

`open` = ready to work, `blocked` = waiting on another ID. There is no `done` status — finished items are removed.

Companion file: [`INBOX.md`](INBOX.md) — Nate's freeform jot pad. Claude processes it into TODO entries (single batch commit per session).

Next free ID: **#020**

---

## Open

- #019 [open] — wpcmk Phase 2 — Stages A–E COMPLETE; next: layout-refinement pass
  - **Stage C (screens) COMPLETE** — `packages/viewer/src/pages/roster/creation/`: `state.ts` (pure flow reducer, §1 + characterMenu entry), `messages.ts` (§3 msg-id wiring), `screens/` (CharacterMenu, NameInput, MenuPicker[race/sex/class], BonusAllocator, Personality, PortraitPicker[placeholder pixels], SkillTrain, SpellPick, Confirm), `CreationPage.tsx` + `lib/build.ts`. Plan: `…-stage-c-screens.md`.
  - **Stage D (cutover) COMPLETE** — old `/roster/new` wizard + `pinMaxBonusRoll` deleted.
  - **Stage E (shell + chrome + CHARACTER MENU) COMPLETE** — window chrome RE'd (`wpcmk-window-chrome.json`: wfont1, fill 0x00, frame 0x01-0x08) + rendered (fixed the "ring sprite" bug); CHARACTER MENU 6-option entry (`CharacterMenuScreen`); one continuous screen at `/castle/character-menu` (reached via MASTER OPTIONS), centered in the shell; `/roster/new` + RosterView "+ New" deleted. Plan: `…-stage-e-shell.md`. Verified via PNG render (chrome + menu + name) — NOT yet browser-verified.
  - **NEXT — layout-refinement pass**: `/castle/character-menu` chrome renders correctly but the WINDOW SET doesn't fully match the reference screenshots yet: need the short top bar + left box + right bar + **3 rows of attribute label/value cells** (bottom-left), and the prompt/menu text should sit on the **gray background below the windows**, not inside a framed bottom bar. Refine the window geometry (the §2 layout under-describes the subdivision + attribute cells) to match the CREATE PC / CHARACTER MENU references.
  - **Browser-verify** `/castle/character-menu` in a real browser (centering, keyboard nav, layout) — no headless browser available in-session.
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
