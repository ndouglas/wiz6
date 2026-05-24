# wiz6 TODO

Stable-ID task list for cross-session tracking. Future sessions: read this on start; new items go in **Open** with the next free ID; closed items get **deleted** (git log preserves history). Never reuse IDs.

Format:

```
- #NNN [open|blocked] — Title
  - Notes / dependencies / refs
```

`open` = ready to work, `blocked` = waiting on another ID. There is no `done` status — finished items are removed.

Companion file: [`INBOX.md`](INBOX.md) — Nate's freeform jot pad. Claude processes it into TODO entries (single batch commit per session).

Next free ID: **#018**

---

## Open

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

- #009 [open] — Savegame + Roster management strategy for the web port (design done, implementation pending)
  - **Design settled**: see [`docs/superpowers/specs/2026-05-23-savegame-strategy.md`](docs/superpowers/specs/2026-05-23-savegame-strategy.md).
  - **TL;DR**: three persistence layers (per-visitor roster + 6 save slots + curated static gallery). Our own zod schemas (`CharacterSchema`, `PartyMemberSchema`, `SaveSchema`, `RosterSchema`) in `@wiz6/data`. localStorage primary, manual download/upload for portability. RNG seed advisory. DOS `SAVEGAME.DBS` interop deferred to a bridge module (needs separate RE pass). Saves are character snapshots with optional roster back-references; saves remain loadable without the roster. Curated gallery (static `/public/gallery/characters.json`) seeds new visitors' rosters on first visit. Savegame + roster editors in the data explorer deferred.
  - **Implementation phases** (none on the critical path yet): schemas → encoder/decoder → save+roster storage → gallery seed → roster page → saves page. Phase 7 (DOS interop) + Phase 8 (editors) wait until the core ships.

- #010 [open] — DOS↔TS A/B comparison harness (now subsumed by #017)
  - Raw: "how do we maximize the ability to run the DOS version and the TS version and compare behavioral and graphical outputs?".
  - **Direction decided**: build a DOSBox-X MCP server that exposes the running engine to AI agents for live introspection. Browser-side human-driven introspection (the original "Tier 1" framing) is left as a future follow-up; the MCP server is more valuable for development right now. See #017.
  - Refs: `tools/parity/` (existing differential tooling), `tools/dosbox/wiz6.conf`.

- #017 [open] — DOSBox-X MCP server (design done, implementation pending)
  - **Design settled**: see [`docs/superpowers/specs/2026-05-23-dosbox-mcp.md`](docs/superpowers/specs/2026-05-23-dosbox-mcp.md).
  - **TL;DR**: a Model Context Protocol server (new package `packages/wiz6-mcp/`, TypeScript) that exposes the running DOSBox-X emulator to AI agents as a set of typed tools. Lifecycle (`launch`, `kill`), control (`send_input`, `pause`, `step`, `run_until`), breakpoints (with symbol resolution from naming-pass JSONs), inspection (`read_memory`, `read_struct`, `read_palette_registers`, `get_state_machine`, `get_call_chain`), snapshots (`save_state`, `load_state`, `screenshot`). Struct schemas in `@wiz6/data` derived declaratively from the existing BSS field maps in naming-pass findings.
  - **Bridge to DOSBox-X**: initial implementation drives the built-in debugger via stdin/stdout (universal, brittle output-parsing); later versions can swap in faster backends (OS memory poking, plugins).
  - **First-payoff target**: answer `#Q-F` (when does the engine load `wiz6-main` / `wiz6-dungeon`) by setting breakpoints at wroot 0x209B and 0x2105 and playing through every game state.
  - **10 implementation phases**: schemas → symbol resolver → DOSBox-X bridge (riskiest, do early) → MCP scaffold → lifecycle → control → inspection → breakpoints → snapshots → first-payoff experiment. Tracing deferred to v2.

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

- #Q-K — Runtime pitch modulation for context-dependent sounds
  - User observation (2026-05-24): the same .snd file (e.g. the death-groan sound effect) plays at different pitches depending on character context — sex of the dying character, possibly other state. Our static per-slot rate snapshot (`@wiz6/data/sound-table.ts`) captures only the BASELINE rate; the engine clearly modulates pitch at call time for some events.
  - Likely source: an additional parameter passed into `audio_play_by_id(N, duration_param, ?, flags_param)` at the call site. Or a runtime modifier byte in the sound-table flags field that the caller mutates before invocation.
  - Method to close: identify a deterministic in-game event with pitch variation (death groan via cliff-fall TPK is a good candidate per user), capture saves immediately before AND after the event in DOSBox-X, diff the sound-table memory + relevant character fields. Or decompile the specific call site (e.g. wmaze's TPK handler) to see what it passes.
  - Doesn't block any current work — intro/credits sounds are deterministic. Relevant when we get to dungeon/combat audio.

- #Q-G — Sound-slot rates differ per slot (CLOSED 2026-05-24)
  - Closed via MCP-driven memory dump of the sound table at DGROUP 0x3344 in a wroot-loaded save (THESUS party, in-dungeon save). Findings:
    - **N=0xE plays SOUND05.SND** — slot 14's buf_lo (0xC90) is IDENTICAL to slot 5's buf_lo. Sample-buffer shared. The deep-dive's static "PIC scratch overlap" hypothesis was wrong; the buffer pointer was correctly populated. (Possibly via the alias_id=5 fallback at descriptor zero-init, or via a separate code path.)
    - **N=0xD plays SOUND13.SND directly** (not aliased). But at rate_or_vol=0x3C and duration=0xBE, both distinct from the default 0x49/0x7E that most slots use.
    - **Slot 9 is aliased to slot 8** — `alias_id=8, buf_lo=buf_hi=0`. Explains why SOUND09.SND missing on disk doesn't break anything.
    - rate_or_vol semantics (PIT divisor? volume? multiplier?) not fully decoded — needs decompile of wroot 0x10AAA `audio_play_sound`. But the existence of per-slot rates is now confirmed.
  - **Open follow-up #Q-J**: decode rate_or_vol semantics and plumb per-slot playback rate into `packages/viewer/src/lib/audio.ts` so the title-credits sounds match the engine's pitch + duration. User-reported: our SOUND13 sounds "too brief and too high-pitched" at the default rate.

- #Q-F — When does the engine actually load `wiz6-main` / `wiz6-dungeon`?
  - **Effectively answered (2026-05-23)**: `dosbox_identify_palette` was run against captured saves at every reachable game state — intro, main menu, character creation, in-dungeon — and every single one shows `ega-default` at distance 0. The wiz6-main and wiz6-dungeon palettes (at distances ~4845-5015 throughout) are NEVER activated in normal play with EGA-mode + keyboard-config. Per the user: portraits, sprites, combat, NPC, treasure all look correct only with ega-default — confirming visually that the engine never switches palette during gameplay.
  - The palette LOAD code exists at wroot 0x209B and 0x2105 (verified statically), but appears to be dead code paths in this shipped binary — possibly a CGA/T16/Hercules-mode branch that doesn't fire on standard EGA configurations, or possibly a developer-mode/test artifact that survived into release.
  - **Action**: both palettes will continue to ship in `@wiz6/data`'s catalog as RE artifacts but should not be wired into any extractor or scene-render path. Mark the catalog entries as "unused in release builds, available for forensics".

- #Q-H — `tools/dosbox/save/1.sav` doesn't contain a running wroot.exe
  - Investigation finding (2026-05-23): the MCP server's two-anchor DGROUP detection (SOUND00.SND + TITLEPAG.EGA at the expected 12-byte distance) fails on `1.sav` — `TITLEPAG.EGA` isn't in memory at all, and the lone `SOUND00.SND` match is probably DOS disk-buffer remnant from a previous wroot run. `dosbox_inspect_save` previously returned a fake DGROUP base + garbage decoded values; that's now fixed in `dgroup.ts` to throw a clear error.
  - **Partially resolved**: a 45-second autodrive run (`tools/dosbox/wiz6-autodrive.conf`) produces 11 save states, 4 of which (2.sav-5.sav) have wroot loaded during the intro. So we DO have wroot-loaded saves now, just not at the game states (#Q-F needs main menu / dungeon).

- #Q-I — Autodrive reaches main menu but MCP can't decode it
  - **Wroot is fine** — corrected diagnosis (2026-05-23): saves 8-13 of a 70-second autodrive run have wroot running at game_state=4 (main menu), they just look broken because the MCP's anchor-based DGROUP detection breaks when wbase.ovr loads. The user has scenario.hdr configured for keyboard mode and wroot is sitting at the main menu waiting for arrow-key + enter navigation.
  - **Real finding**: overlay loads don't just rewrite the filename-table region in DGROUP — they ALSO appear to relocate the game_state global itself. In intro saves, game_state lives at DGROUP +0x363A (phys 0x1b682). In main-menu saves, the same value (`4`) lives at phys 0x1a16a, which is +0x2122 from the old base. Either DGROUP base shifted by 0x1518 between phases, OR wbase reads/writes game_state from its own overlay-private location at +0x2122. Static deep-dive said wroot reads `*0x363a` in its dispatcher — so probably the latter (wbase mirrors state to a local cache that the dispatcher then copies back).
  - Method to close: (a) add a stable wroot-DGROUP anchor that survives overlay loads (not the SOUND filename table — that gets reused), OR (b) add a per-overlay anchor strategy (search for known wbase/wmaze data signatures), OR (c) add a game_state-trajectory heuristic (find a u16 offset whose values progress through legal states across saves). Then continue tuning AUTOTYPE to navigate down the main menu (arrow-down × N + enter) into a new-party flow.
  - **Policy (per user)**: target keyboard mode only. Wiz6 is keyboard OR mouse, not both. User configured keyboard mode via scenario.hdr.
