# wiz6 TODO

Stable-ID task list for cross-session tracking. Future sessions: read this on start; new items go in **Open** with the next free ID; closed items get **deleted** (git log preserves history). Never reuse IDs.

Format:

```
- #NNN [open|blocked] — Title
  - Notes / dependencies / refs
```

`open` = ready to work, `blocked` = waiting on another ID. There is no `done` status — finished items are removed.

Companion file: [`INBOX.md`](INBOX.md) — Nate's freeform jot pad. Claude processes it into TODO entries (single batch commit per session).

Next free ID: **#017**

---

## Open

- #003 [open] — Naming passes for combat/character/NPC/treasure overlays
  - Still on `FUN_XXXX` auto-names: `wmele.ovr`, `wpcmk.ovr`, `wpcvw.ovr`, `wmnpc.ovr`, `wtrea.ovr`.
  - Schedule when simulation work on those subsystems starts.
  - Pattern reference: `docs/re/findings/wmaze-naming-pass.json`, `docs/re/findings/wbase-main-menu.json`.

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

- #007 [open] — Intro sound effects per transition (RE-traced)
  - Raw: "title/credits sound effects wrong (should be drag, explosion or whoosh, clang of steel-on-steel)".
  - Currently all three intro phase transitions (sirtech logo, D.W. Bradley credits, scroll start) play the same title clang sound (commit `7a3d8ba`). Should be three distinct sounds matching the original DOS playback.
  - **Method**: find the engine code that triggers each intro-phase sound. CLAUDE.md notes `winit_state1_title_and_credits` makes `audio_play_sound` calls with N = `4, 0xD, 0xE, 6, 7` — five calls, not three. Disambiguate which map to actual phase transitions vs other events; use those sound IDs to determine which `.snd` file is canonical per transition.
  - Refs: `7a3d8ba`, `winit.ovr` state 1 entry @ image 0x9f3, `audio_play_sound` @ wroot 0x10AAA, `docs/re/snd-format.md` §"Sound ID → filename mapping".

- #008 [open] — Title "Wizardry" lingers before scroll (RE-traced)
  - Raw: "title 'Wizardry' needs to linger a moment before everything starts scrolling up".
  - **Method**: find the delay loop in `winit.ovr` state 1 (title-and-credits routine at image 0x9f3) that holds the title visible before the scroll begins. Reproduce its frame count, NOT its wall-clock duration (per CLAUDE.md RE caveat: "wall-clock parity ≠ byte parity").
  - Builds on prior intro-timing work — `959e304` (scroll runs 3× slower), `6061453` (credit panels cull at y<cap), `54f9b6f` (tokens 1-indexed).
  - Refs: `winit.ovr` state 1 @ image 0x9f3.

- #009 [open] — Savegame management strategy for the web port
  - Raw: "how do we do savegame management for the public at large? local browser storage?".
  - **Open design question.** How do public-facing users save/load Wizardry VI state in the browser-based port?
  - Possibilities to evaluate: `localStorage` / IndexedDB (browser-local; lost on cache clear; per-device); server-side store (requires auth + infra); download/upload save file (user manages files; portable); URL-encoded share links (small saves only).
  - Investigation needed before design: how big is a Wizardry VI save? What's the `.sav` format on the DOS side? Per-character vs per-party save model?
  - Refs: `original/*.sav` (DOS save files), DOSBox-X save-state files (different format, captures engine memory).

- #010 [open] — DOS↔TS A/B comparison harness
  - Raw: "how do we maximize the ability to run the DOS version and the TS version and compare behavioral and graphical outputs?".
  - **Open design question.** Today: DOSBox-X separately + manual screenshot diffing + `tools/parity/` for byte-level decoder validation.
  - Possibilities to evaluate: side-by-side dev mode in the viewer (DOSBox-X embed via iframe / noVNC; probably hard); automated pixel-diff pipeline that captures canonical frames on both sides continuously; DOSBox-X state-replay harness (deterministic input → check engine memory at checkpoints); recording/playback of user input sessions for replay on both engines.
  - Driving question: what's the friction users hit today when validating the port? Answer shapes the design.
  - Refs: `tools/parity/` (existing differential tooling), `tools/dosbox/wiz6.conf`.

- #012 [open] — Docs left-hand menu: render backticks as `<code>`
  - Raw: "Docs left-hand menu in the Data Explorer should render backticks as <code> tags."
  - In `DocsPage`'s sidebar (the file tree), filenames like `docs/re/snd-format.md` show their `code-styled-segments` as literal backticks rather than rendering them as monospace. Strip backticks + wrap in `<code>` when rendering each tree entry's label.
  - Refs: `packages/viewer/src/pages/DocsPage.tsx`, `packages/viewer/src/pages/DocsPage.module.css`.

- #013 [open] — Replace top-bar nav with collapsible sidebar
  - Raw: "Header menu in the Data Explorer is getting pretty crowded."
  - Current TopNav holds 10 data items + 4 tools items + divider + title + back-link. Wraps to multiple rows on narrower viewports.
  - Direction (per user): **sidebar instead of top bar.** Collapsible left-side rail; frees horizontal space; common pattern for tooling-heavy apps. Larger refactor than overflow-menu approach.
  - Considerations: persistence of open/closed state (localStorage?), responsive collapse on small viewports, breadcrumb-or-title slot at top of content area to replace the title bar role, keyboard-accessible toggle.
  - Refs: `packages/viewer/src/components/TopNav.tsx`, `packages/viewer/src/layouts/ExploreLayout.tsx`.

- #014 [open] — Per-card permalinks on `/explore/notes`
  - Raw: "Permalinks for the notes (as you suggested)".
  - Each Engineering Notes card already has an `id` anchor (e.g. `/explore/notes#bonus-point-lottery`), but no affordance to copy that URL. Add a "🔗" copy-to-clipboard button on each card header that copies the deep-link.
  - Optional polish: brief "Copied!" toast after click.
  - Refs: `packages/viewer/src/pages/EngineeringNotes.tsx`.

- #015 [open] — Tag-count badges on filter chips (`/explore/notes`)
  - Raw: "Tag-count badges on the filter chips in notes would be nice".
  - Each tag chip in the filter bar shows just the tag name. Add a small count badge per chip showing how many cards carry that tag (e.g. `design-choice (4)`). Helps gauge tag distribution at a glance.
  - Refs: `packages/viewer/src/pages/EngineeringNotes.tsx`, `EngineeringNotes.module.css`.

- #016 [open] — Inline TOC at top of `/explore/notes`
  - Raw: "Inline TOC at the top of the notes page would be cool".
  - Once the page crosses ~10 cards, scrolling to find a specific one gets cumbersome. Add a collapsible TOC at the top of the page listing each card title, anchor-linked. Honor the active tag filter (TOC reflects what's currently visible).
  - Cross-references #014 (each TOC entry could double as a permalink source).
  - Refs: `packages/viewer/src/pages/EngineeringNotes.tsx`.

---

## Open questions (lower priority; investigation tasks, not features)

- #Q-A — Variable-port audio hardware (`*0x1756 ≥ 2` selector)
  - Engine uses runtime-patched port from `[cs:0x175B]`. Tandy PSG / SB DSP / other? `docs/re/snd-format.md` §"Open questions" #1.

- #Q-B — wbase.ovr audio-config struct
  - 5 bytes copied to `0x3590..0x3594` at file `0x1488`. Identify option labels ("PC Speaker / AdLib / Tandy / Silent") and the device-selection contract.

- #Q-C — Per-sound rate populator
  - Runtime sound table at DGROUP `0x3344` (12-byte entries) has `duration` / `rate_or_vol` / `flags`. Find the boot-time populator so we can play each sound at its native rate instead of the global default.

- #Q-D — Fast-mode trigger (`*0x1760 & 2`)
  - Which gameplay states or sounds set the fast bit? Title clang uses slow.

- #Q-E — Bogus `audio_adlib_init_voice` rename at image `0x11962`
  - Listed in findings file but the bytes there are just an EOI/IRET stub. Real AdLib init must be elsewhere — possibly `FUN_1000_17fe`. Not yet traced.

- #Q-F — When does the engine actually load `wiz6-main` / `wiz6-dungeon`?
  - Phase 1 of #002 confirmed both palette tables are loaded via `INT 10h AX=1002h` at wroot 0x209B and 0x2105 respectively, but Phase 6 calibration showed the current asset-render scenes operate against the BIOS-default palette (the engine has not yet executed either load when those scenes draw). Gameplay states that exercise the two engine palettes haven't been identified.
  - Method: DOSBox-X `int10 = debug` runtime trace through every game state.
  - Until resolved, both palettes ship in `@wiz6/data`'s catalog as RE artifacts but are not referenced by any extractor.
