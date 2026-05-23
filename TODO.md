# wiz6 TODO

Stable-ID task list for cross-session tracking. Future sessions: read this on start; new items go in **Open** with the next free ID; closed items get **deleted** (git log preserves history). Never reuse IDs.

Format:

```
- #NNN [open|blocked] — Title
  - Notes / dependencies / refs
```

`open` = ready to work, `blocked` = waiting on another ID. There is no `done` status — finished items are removed.

Companion file: [`INBOX.md`](INBOX.md) — Nate's freeform jot pad. Claude processes it into TODO entries (single batch commit per session).

Next free ID: **#011**

---

## Open

- #002 [open] — Per-scene palette switching
  - Ship one empirical EGA palette + 7 overrides. Other scenes (spaceship is the canonical example: blue-green) show off-colors.
  - Goal: absolute fidelity to the source app — every scene matches DOSBox-X output byte-for-byte.
  - Needs: a way to identify which palette index applies per scene (probably encoded in screen metadata or a per-screen field in the loader path).
  - Refs: palette-related commits `19df14d` ("revert overzealous index 6/14 overrides"), `docs/superpowers/specs/2026-05-19-stage-1d-palette-design.md`.

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
