# wiz6 — project-specific instructions for Claude

This file is auto-loaded into every session. Project background lives in auto-memory (`wiz6-project.md`); this file is the **practical / operational** reference.

## Project layout

```
.
├── original/                       # Game binaries (Wiz6 DOS, 1990). DOSBox WORKSPACE — playing mutates pcfile.dbs/scenario.hdr/saves here; do NOT make tests depend on it.
├── test-fixtures/original/         # Pristine vendored copy of original/ that the test suite reads (decoupled from DOSBox mutations).
├── extracted/                      # JSON outputs from extractors. Mostly gitignored.
├── packages/                       # pnpm monorepo
│   ├── data/                       # zod schemas + BssStruct schemas + symbol resolver (no DOM/Node)
│   ├── parser/                     # pure decoders (no I/O)
│   ├── cli/                        # extractors + `wiz6 extract` subcommands
│   ├── mcp/                        # DOSBox-X MCP server (`wiz6-mcp` bin)
│   └── viewer/                     # React SPA (https://wiz6.goldentooth.net)
├── docs/
│   ├── re/                         # Reverse-engineering notes — file-format specs
│   │   └── dynamic-traces/         # DOSBox-X trace captures (timestamps + filename)
│   └── superpowers/
│       ├── specs/                  # Brainstorming output: YYYY-MM-DD-<topic>-design.md
│       └── plans/                  # Implementation plans: YYYY-MM-DD-<feature>.md
└── tools/
    ├── dosbox/                     # DOSBox-X config + log parsers
    └── ghidra/                     # Ghidra projects + helper scripts
```

## Reverse-engineering toolkit

The serious tools that make RE tractable, with paths:

| Tool | Purpose | Location / how to invoke |
|---|---|---|
| **Ghidra 12.1** | Disassembler + decompiler (NSA-developed) | GUI: `ghidraRun` ; headless: `/opt/homebrew/Cellar/ghidra/12.1/libexec/support/analyzeHeadless` |
| **DOSBox-X 2026.05.02** | DOS emulator + interactive debugger + I/O logger | `/opt/homebrew/Caskroom/dosbox-x-app/2026.05.02/dosbox-x-sdl2/dosbox-x.app/Contents/MacOS/dosbox-x` (Cmd-strip quarantine first via `xattr -dr com.apple.quarantine`) |
| **ndisasm** | Linear disassembler (NASM) | `ndisasm -b 16 <file>` — useful for quick reads; can't follow overlay loads, no decompiler |
| **Capstone + PyGhidra** | Python RE libraries | `pip3` installed system-wide (--break-system-packages) |
| **`strings`, `xxd`, `hexdump`, `objdump`** | Standard hex tooling | stdlib |

> **Backend split (2026-06):** dosbox-pure (libretro) is the **sole backend for fixtures, control, and inspection** — driven via the live MCP (`dosbox_live_*`) and `tools/libretro/build-state.ts`. DOSBox-X is retained **only as an interactive-RE tool** (its ncurses debugger + file-I/O logging). Its config/logging scripts (`tools/dosbox/*.conf`, `run-with-logging.sh`, `parse-*.sh`) and the Ghidra project are untouched.

**When to reach for which:**

- **Quick byte-pattern question** ("does this offset contain a 16-byte palette table?") → Python + `xxd` / grep raw bytes.
- **"What does this function do?"** → Ghidra. Don't reach for ndisasm unless you specifically want raw asm.
- **"What does the game do at runtime when X happens?"** → DOSBox-X interactive debugger OR file I/O logging via `tools/dosbox/wiz6.conf` + grep. (For *programmatic* drive/inspect/screenshot, use the dosbox-pure live MCP instead.)
- **"What's the actual on-screen color of pixel X?"** → `dosbox_live_screenshot` (or pixel-pick a build-state `.png`) in Python.

## DOSBox-X workflows (interactive RE only)

```bash
# 1. Boot Wiz6 with file-open logging enabled
tools/dosbox/run-with-logging.sh
#    → writes events to tools/dosbox/dosbox.log

# 2. Extract MON*.PIC opens (used during sprite-ID dynamic mapping)
tools/dosbox/parse-pic-opens.sh
#    → tick-ordered "tick N -> C:MONxx.PIC" lines

# 3. Slow down emulator for human-paced inspection
# Edit [cpu] section in tools/dosbox/wiz6.conf:
#   cputype = 386 ; cycles = fixed 6000   (≈386-DX/33)
# Or Ctrl-F11 / Ctrl-F12 at runtime to step cycles down/up
```

**Quit confirmation is disabled** in the config (`quit warning = false`), so closing the window is one click.

## Ghidra workflows

The wiz6 Ghidra project lives at `tools/ghidra/wiz6.gpr`. It has all the game binaries pre-imported and auto-analyzed.

```bash
# Open the GUI on this project
ghidraRun "$(pwd)/tools/ghidra/wiz6.gpr"

# Headless query (re-run analysis if needed)
/opt/homebrew/Cellar/ghidra/12.1/libexec/support/analyzeHeadless \
  "$(pwd)/tools/ghidra" wiz6 \
  -process wroot.exe \
  -postScript SomeScript.java
```

**Translating between Ghidra image-offsets and raw file offsets:** for MZ executables, image offset = file offset − MZ header size. For wroot.exe, header is 0x200 bytes, so file 0x1c4a = image 0x1a4a.

**Overlay relocation (per-overlay delta law):** Ghidra and live disassembly often show overlay code at virtual addresses (CS-relative) that don't match raw file offsets — overlays load into wroot's code segment with a fixed offset. To translate `CS_offset → file_offset`, subtract the overlay's delta:

| Overlay     | Runtime delta | Translation                                |
|-------------|--------------:|--------------------------------------------|
| `winit.ovr` |        0x3DB7 | `file_offset = CS_offset − 0x3DB7`         |
| `wpcmk.ovr` |        0x4564 | `file_offset = CS_offset − 0x4564`         |
| `wpcvw.ovr` |        0x4564 | `file_offset = CS_offset − 0x4564`         |
| `wbase.ovr` |        0x4564 | `file_offset = CS_offset − 0x4564`         |

How to confirm a new overlay's delta: find any in-file table referenced by a CS-disp16 instruction (e.g., `2e ff a7 <disp16>` jump-table dispatch), then `delta = disp16 − file_offset_of_table`. Verify by reading that disp16 from physical memory at `(wroot_phys_base + file_offset)` — wpcmk's table at file 0x4a6d is at phys 0x11299 in save 1, which is wroot_seg(0x82C) × 16 + 0x8FD1. Add new overlay deltas to this table when you find them.

## Project conventions

- **Avoid worktrees — use feature branches in the main checkout.** Don't create git worktrees for wiz6 work; branch off `main` in place instead. Reasons: (1) we work on one large project at a time, so parallel-isolation buys little; (2) per-worktree preview environments proliferate and are only differentiated by port number — confusing; (3) the DOSBox-X MCP is cwd-bound to the main checkout, so worktrees split DOSBox/fixture work from code. If a skill (using-git-worktrees / subagent-driven-development) wants a worktree, override it: stay in the main checkout on a feature branch.
- **Subagent-driven development** when executing plans. Don't ask, just do it.
- **TDD discipline**: failing test first, minimal implementation, then refactor. The viewer/parser/data tests all follow this pattern.
- **All decoder code is pure** (no I/O) and lives in `packages/parser/src/formats/`. File-I/O wrappers go in `packages/cli/src/extractors/`. CLI subcommand dispatch in `packages/cli/src/commands/extract.ts`.
- **Schema is source of truth** — `packages/data/src/schemas/` exports zod schemas; types come from `z.infer<typeof X>`. Don't define types separately.
- **TS ESM** — relative imports use `.js` extensions even though source is `.ts`.
- **Live deploy**: pushing to `main` of the wiz6 repo builds a container; the goldentooth gitops repo (`~/Projects/goldentooth/gitops/apps/wiz6/deployment.yaml`) pins a specific image SHA; flux reconciles to the K8s cluster. Live URL: https://wiz6.goldentooth.net/.
- **`pnpm dev:viewer` runs predev → re-extracts** all JSON assets before launching Vite, so schema changes never get tested against stale assets.
- **Every ported screen requires a pixel-exact parity test.** Rebuild the engine's framebuffer fixture via `tools/libretro/build-state.ts <recipe>` (`--mint` for non-deterministic creation rolls); commit the `.idx.gz` + `.png` (+ `.character.json` sidecar for minted screens) under `tools/parity/fixtures/engine/`; write a `*-parity.test.ts` that compares our composed RGBA to the engine pixel-by-pixel (target floor: 100%; if you ship with a lower floor, file a TODO entry for the remaining gap). **Cell-grid parity tests are a fast intermediate diagnostic, not a substitute.** A cell-grid test can pass while the rendered pixels are visually wrong (e.g. window placed at wrong screen coords — only the pixel test catches it). Don't claim "byte-exact" / "pixel-exact" until the pixel test is the gate.
- **Test-layer convention.** Tests fall into four buckets, signaled by filename:
  - `*.test.ts` (gate) — runs in default CI. Includes pixel-parity, schema/composer/store unit tests.
  - `*.diagnostic.test.ts` (informational) — excluded from default CI; runnable via `pnpm test:diagnostics`. Cell-grid parity tests live here — they validate intermediate data structures and are useful for debugging pixel-parity failures, but they can pass while the rendered output is visually wrong (e.g. windows at incorrect screen coords). Don't promote a diagnostic to a gate without a clear reason.
  - Component tests with `skipAssetLoad` (weak) — should be flagged in the test file's docstring if they don't verify rendering, only key handling.
  - End-to-end (e2e) tests via Playwright (`packages/viewer/e2e/*.spec.ts`) — drive the real app by keyboard + pixel-assert the canvas vs engine fixtures. **Now run in CI** (`.github/workflows/test.yml`, push to `main` + PRs) alongside the unit/parity suites; also runnable locally via `pnpm --filter @wiz6/viewer test:e2e`. See `packages/viewer/e2e/README.md` (incl. the DEV-only state-injection hook + the interactive→committed recipe).
  - **Driving-based testing (convergence).** We catch the integration-layer bugs the unit/parity tests can't by *driving the real thing* and pixel-asserting it against engine ground truth — the **browser** (Playwright e2e, the ported app) and **dosbox-pure** (the live MCP / `build-state.ts` harness, the original engine that produces the fixtures). The same helpers serve interactive driving and committed gates, so an interactive drive promotes cheaply to a permanent check. **Canonical guide + the two promotion recipes: [`docs/driving-based-testing.md`](docs/driving-based-testing.md).** (Browser: drive → save `pressKeys` into a spec → commit fixture → `expectCanvasMatchesFixture`. dosbox-pure: drive via `dosbox_live_*` → add a `tools/dosbox/state-catalog.ts` recipe → `build-state.ts` (recipe-replay or `--mint`) → parity test.)
  - **Pixel-parity tolerance defaults to 0.** Widening it (e.g. to handle animation drift in a known area) should be a deliberate, documented choice — prefer per-region overrides over global tolerance lift. The current `compareRgba` only supports a single global `tolerance`; if a future screen has localized drift, extend the API with named regions rather than relaxing the whole comparison (see TODO).
- **Manual smoke test before declaring a screen port done.** `pnpm dev:viewer`, click through the feature in a browser, eyeball the result. The pixel-parity test should make this fast (if it passes ≥99%, the browser will look right) — but the manual click is the final sanity check that the page loads, key handling works, and navigation goes where it should.
- **Surface interesting findings as Engineering Notes cards.** When RE turns up something a player would actually find cool (a buried debug switch, an absurd mechanic, a 1-in-400 grind that explains community lore, a formula that's wrong vs the manual), don't just bury it in a commit or a `docs/re/findings/*.json`. Propose adding it as a card in `packages/viewer/src/pages/EngineeringNotes.tsx` + `packages/viewer/src/data/note-index.ts`. The notes pages are the user-facing payoff for the RE work — they should grow organically as findings happen, not in batches. Ask Nate before writing, but raise the suggestion proactively rather than waiting to be asked.
- **Surface QoL-toggle ideas as House Rules entries.** When work surfaces a "the engine grinds X for no good reason" or "this rejected-input beep is annoying, players would love to disable it" thought, propose adding a new entry to `HOUSE_RULES_META` in `packages/data/src/schemas/house-rules.ts`. Default = matches the engine (stock UX), toggle ships in `/settings`. Same pattern: ask before implementing but raise the idea proactively — Nate adds these one at a time and the queue should come from work-in-progress observations, not a separate brainstorming session.

## Parity testing — `tools/parity/`

Differential testing against the original binary. Engine framebuffer fixtures are **rebuilt from the pinned `test-fixtures/` image via `tools/libretro/build-state.ts`** (dosbox-pure harness) — no DOSBox-X save states, no `gen-fixture.ts` (removed). Recipes live in `tools/dosbox/state-catalog.ts`.

```bash
# Rebuild a deterministic screen fixture (recipe-replay: drive a named recipe to its waypoint)
pnpm tsx tools/libretro/build-state.ts <recipe>

# Non-deterministic creation ROLLS: --mint freezes a serialize-state + writes a
#   <name>.character.json sidecar (the engine draft decoded from DGROUP 0x5470 via
#   LiveSession.dumpDraft); --mint accepts whatever roll comes up.
pnpm tsx tools/libretro/build-state.ts <recipe> --mint

# Re-mint + diff vs the committed fixture (NO overwrite); 100% match is the gate (exit 0/1).
pnpm tsx tools/libretro/build-state.ts <recipe> --check
```

Four fixture modes: **recipe-replay** (deterministic screens), **`--mint`** (non-deterministic rolls → frozen `test-fixtures/states/<name>.state.gz` + `<name>.character.json` sidecar), **`pcfileFixture`** (boots a fresh image overlaid with a committed `test-fixtures/states/<name>.pcfile.dbs` roster), **`bootCapture`** (cold-boot intro frames). Parity render fns load the sidecar via `draftFromEngineDump` so the test matches the actual engine roll, not a hardcode.

Decoder/RNG/struct ground-truth (no fixture) still uses the standalone byte tools: `extract.py` (read regions of a save image), `diff.py` (byte diff), `decode-pic.ts` / `decode-character.ts` (engine-side decoders). See `tools/parity/README.md` for the full set.

## PyGhidra scripts — `tools/ghidra/scripts/`

Reusable headless queries. PyGhidra is preinstalled. **The Ghidra GUI must be closed** while these run (project lock).

```bash
python3 tools/ghidra/scripts/list_functions.py --binary wroot.exe --only-unnamed
python3 tools/ghidra/scripts/find_string_xrefs.py --binary wroot.exe --string "MON"
python3 tools/ghidra/scripts/dump_function.py --binary wroot.exe --addr 0x1f41
```

Add new scripts under this directory when a query becomes repeat-worthy. See `tools/ghidra/scripts/README.md` for the template.

## Subagent RE findings — `docs/re/findings/`

Subagents doing RE work emit **structured JSON findings** to `docs/re/findings/<topic>.json`, not direct edits to `docs/re/<format>.md`. The parent reviews, spot-checks high-confidence claims, and promotes verified prose into the canonical docs.

Why: we've been burned by confidently-wrong RE conclusions written straight to docs. JSON-first findings force evidence anchors (address, byte pattern, save-state offset) and make audit cheap. Schema and example in `docs/re/findings/README.md`.

When dispatching an RE subagent, include in the prompt:

> **Deliverable:** write findings to `docs/re/findings/<topic>.json` per the schema in `docs/re/findings/README.md`. Do NOT modify `docs/re/<format>.md` — the parent will promote findings after review.

## Engine architecture — what we know

### Overlay state machine

wroot.exe drives a state-machine loop in `ovl_install_table` @ wroot 0x132d that reads a **game-state word at DGROUP `0x363a`** and loads whichever `.ovr` handles that state. Each overlay dispatches its own subset of states from its entry point. Overlay header sizes vary: `winit.ovr` is 12 bytes (entry at file 0x0c); `wbase.ovr` and `wmele.ovr` are 14 bytes (entry at file 0x0e); `wpcmk.ovr` is 16 bytes (entry at file 0x10) and is a **library** rather than a state handler — its dispatch stub is a no-op that returns to state 4; its UI is invoked via cross-overlay calls from wbase main-menu slot 5. `wmnpc.ovr` is also a library overlay (different shape — has *no* `*0x363a` references at all; invoked synchronously by wmaze when the party initiates an NPC encounter).

| State value (hex / dec) | Handler overlay     | Purpose                                  |
| ----------------------- | ------------------- | ---------------------------------------- |
| 0                       | `winit.ovr` 0x525   | Load disk headers (master.hdr/disk.hdr)  |
| 1                       | `winit.ovr` 0x9f3   | Title page + scrolling credits           |
| 2                       | `winit.ovr` 0xf43   | Load fonts/portraits + create UI windows |
| 4                       | `wbase.ovr`         | Main menu (MASTER OPTIONS)               |
| 5 / 6 / 0x17 (23)       | `wmaze.ovr`         | Dungeon traversal                        |
| 8                       | `winit.ovr` 0xdf6   | Graveyard / total-party-kill recovery    |
| 0x0a (10)               | `wmele.ovr` 0x2d6d  | Combat: init encounter                   |
| 0x0b (11)               | `wmele.ovr` 0x2b6a  | Combat: per-round redraw + monster attacks |
| 0x0c (12)               | `wpops.ovr` 0x000e  | Combat: action SELECTION — party picker + monster-AI selection (party + monster pickers run; then transitions to wmexe for resolution) |
| 0x0d (13)               | `wmexe.ovr` 0x2ccc  | Combat: action resolution — initiative-down-from-100 loop |
| 0x0e (14)               | `wmele.ovr` 0x2ceb  | Combat: end-of-round cleanup             |
| 0x0f (15)               | `wtrea.ovr`         | Post-combat treasure roll + distribution |
| 0x11 (17)               | `wpcvw.ovr` 0x6804  | Character view (interactive)             |
| 0x13 (19)               | `wdopt.ovr` 0x39cc  | Dungeon: cast spell (out of combat). Returns to wmaze state 5 |
| 0x14 (20)               | `wdopt.ovr` 0x32fc  | Dungeon: use item (out of combat). Returns to wmaze state 5 |
| 0x15 (21)               | `wtrea.ovr`         | In-dungeon chest encounter (open / inspect / disarm / spell / leave) |
| 0x16 (22)               | `wpcvw.ovr` 0xb4ba  | Post-combat bulk level-up                |

To transition, a handler writes the new state value to `*0x363a` (or to `*0x4fce` in wbase/wmele, which the entry dispatcher copies into `*0x363a` after the handler returns — deferred transition pattern). The outer loop reloads the appropriate overlay.

### Cross-overlay calls: the thunk-delta law (HIGH CONFIDENCE)

```
thunk_address = wroot_image_offset + 0xBA9C
wroot_file_offset = wroot_image_offset + 0x200   (MZ header)
```

Every cross-overlay call from an overlay reaches wroot via an `E8 rel16` near-call landing in a BSS thunk. Subtract `0xBA9C` from the thunk address to get the wroot **image** offset, then add `0x200` for the file offset (MZ header). **The delta is over image offsets, not file offsets.** Verified across `winit.ovr`, `wmaze.ovr`, `wbase.ovr`. Look up named functions in `docs/re/wroot-functions.md` or `docs/re/findings/wroot-naming-pass.json`. **Tell every overlay-RE subagent about this.**

Known sampled mappings (image offsets):
- `0xbbb6` − `0xBA9C` = `0x11a` → `ui_window_create`
- `0xe0df` − `0xBA9C` = `0x2643` → `kbd_check_with_filter`
- `0xee85` − `0xBA9C` = `0x33e9` → `huffman_load_and_decompress` (the .pic decoder thunk)
- `0xDF85` − `0xBA9C` = `0x24E9` → `ui_window_putstring_highlight` (the per-string highlight wrapper; per-char fn at image `0x22B7`)

## RE caveats — common bug patterns

Patterns we've been bitten by; tell every RE subagent to expect them.

### Index-shaped fields may be 1-indexed

In the credits scroll table, the `token` byte values (7, 8, 0xC, 1, 2, …, 6) turned out to be 1-indexed into `credits.pic` descriptors. Token `N` → descriptor `N-1`. Sentinel value 0 = "no token / end of list." Visual cross-check via the per-descriptor PNGs (`extracted/pics/<id>/desc-NN.png`) is the fastest validation.

### Comparator direction is easy to misread

When pseudocode includes `if (y < cap)` vs `if (y > cap)` or similar from disasm, the comparator (JL/JG/JLE/JGE) is easy to flip in a manual read. **Mark `confidence: low` on any comparator the disasm is ambiguous about**, and recommend DOSBox-X breakpoint verification before publishing. The credit-scroll clamp set + cull comparator in the winit RE pass were both wrong on first read — corrected via behavior verification during the port.

### Wall-clock parity ≠ byte parity

Engine *frame counts* and *increments* translate cleanly to the port. Engine *durations* don't — they're calibrated against the original CPU's busy-wait at boot (CRT delay calibration writes to `*(CS:0x1FE2)` and `*(CS:0x1FE4)`). On a 486DX/33 the effective tick rate was ~20 Hz, so a "60 Hz loop with 126 iterations" actually ran ~6 seconds wall-clock. DOSBox-X's `cycles=fixed` doesn't reproduce this faithfully. **Don't aim for wall-clock parity; aim for byte parity on the math and tune the per-frame interval to feel right.**

### Coordinate conventions vary

The credit-scroll table uses absolute screen pixels (320×200) even though a UI window is opened during init. But that may not generalize — combat windows, dialog windows, etc. may use window-relative coords. If positions look offset, try both interpretations.

### Structurally-plausible output can still come from a misaligned decoder

The .snd decoder bug: decoded bytes had a centered distribution around 128, 32 distinct quantized levels, mean diff ≈ 25 — every statistic looked like real 8-bit PCM. It sounded like noise because the decoder started 2 bytes too late (treated bytes 2-3 as a `rate_word` when they were actually the first word of the Huffman tree), misaligning every tree walk from the start. The format was also missing a 2-byte decoded-length prefix at the start of the bitstream, which was being consumed as 16 bits of garbage. We chased LUT transformations, sample-rate variants, unipolar-vs-bipolar interpretations, AdLib log-to-linear conversions — all post-process — for *hours* before checking the decoder against the engine's actual decode loop in asm. **When output looks structurally right but behaves wrong, suspect alignment in the decoder, not interpretation downstream.** Verify offsets against the engine's asm BEFORE exploring post-process transformations.

### Cell-grid parity ≠ pixel parity — check the highlight attr SIGN

Tile-window cell-grid parity (`dump-cells.py` → `cells/*.json`) validates the `(char, attr)` PLACEMENT, **not** the rendered pixels. A whole class of render state is NOT in the cell array and is therefore invisible to cell parity:

- **Highlight fg/bg orientation.** A highlight cell (attr low-nibble 0, e.g. `0x50`) is drawn TWO ways and the stored cell is identical for both: **colored text** (stroke = `palette[high nibble]`, bg = black — char-sheet labels: yellow STR, white values) vs **inverse** (stroke = black, bg = `palette[high nibble]` — menu selection cursors: black on a yellow bar). The engine picks via the **SIGN of the `attr` arg at the draw site** (`+n` colored, `−n` inverse; the sign becomes a "negated_flag" bit in the dirty-map, **not** the cell). dump-cells can't see it, and a settled save likely doesn't even retain it. We carry it as `TileWindow.invertHighlight` per window (menu windows = inverse, char-sheet = colored).
- **Checklist when porting any screen with highlights:** for each highlight cell, RE the draw routine to confirm the attr sign (colored vs inverse) — don't infer colour from the cell. Then **eyeball the rendered colours against the engine framebuffer** (`pnpm tsx tools/parity/decode-screen.ts --save N --out x.png` — now positionally correct), not just the cell parity. The render formula itself is locked by `packages/parser/tests/ui/tile-window.test.ts` (highlight path).

This bit us twice: a global fg/bg inversion, then the menu-vs-charsheet split — both with green byte-exact cell parity while the colours were wrong.

### Row 199 is black — wfont1/wfont3 glyph `0x1e` is the screen baseline

When a ported screen hits ~99.5% parity with 320 stray pixels at the very bottom (`y=199` solid black across the entire width, rows 192-198 still gray): the engine's bottommost UI window is one cell row TALLER than the visible content, and the extra row is filled with chrome glyph `0x1e` at the window's background attr. Glyph `0x1e` in both `wfont1` and `wfont3` is 7 rows of palette[8] (gray) + 1 row of palette[0] (black). It's the engine's universal screen baseline.

The grep that proved it: scan every `wfont1`/`wfont3` glyph for "rows 0..6 all gray, row 7 all black" — exactly one match in each font, both at codepoint `0x1e`. Saved hours of staring at `compose-action-menu.ts` wondering where the rogue row was coming from.

Pattern when porting: if the engine fixture has black at `y=199` (check via `idxRaw[(199*320 + x)]`) and your window doesn't reach that row, add a chrome bottom-border row to whichever window touches the screen edge. See `packages/viewer/src/pages/castle/compose-action-menu.ts` for the canonical implementation.

## Audio (Wiz6 sound system)

Wiz6 supports **PC speaker, AdLib, and SoundBlaster** outputs. There is **no separate audio driver file** (no `*.drv` for audio — graphics-only); audio output is inline in `wroot.exe`, gated by the video-mode flag at `*0x4FC6` or similar.

Sounds are minimal-fidelity effects: clicks, drags, clangs, the title-screen "clang." No music, no instrumental sample playback — just simple short tones / samples. The `.snd` files at `original/sound00.snd` through `sound38.snd` (35 files total) hold the effect data.

**Format** (verified against asm `huffman_decode_bitstream` @ wroot image 0x134D5, see [`docs/re/snd-format.md`](docs/re/snd-format.md)):
- bytes 0..1: `tree_size` (u16 LE). If 0 → raw 8-bit PCM at bytes 2..end. Else huffman.
- bytes 2..1+tree_size: huffman tree, 4 bytes/node = (left, right) signed i16. Top-bit-set = internal link; clear = leaf with low byte as sample.
- bytes 2+tree_size..3+tree_size: `decoded_length` (u16 LE) — number of samples to emit.
- bytes 4+tree_size..end: MSB-first bitstream.

**Sample rate is constant**: `SND_SAMPLE_RATE_HZ = 10026` (engine sets PIT counter 0 to 0x48, fractional advance gives ~10 kHz effective). No per-file rate field on disk.

**Play-sound entry** at wroot `0x10AAA` (target of overlays' `call 0xc546(N)` thunks). Parameter `N` indexes a runtime sound table at DGROUP `0x3344` (12-byte entries) which holds per-trigger settings (volume, etc.) backed by the same loaded `.snd` buffer.

**Status**: decoder is byte-correct and audible for both raw (tree_size=0) and Huffman variants. Verified against asm and by listening. Open per-sound questions (native rate per slot, fast-mode trigger, variable-port hardware) are tracked as `#Q-*` items in [`TODO.md`](TODO.md).

## MCP server — `packages/mcp/`

MCP server for AI-driven engine driving + inspection (#017). Speaks JSON-RPC over stdio; bin entry `wiz6-mcp`. Backed by the **dosbox-pure (libretro)** harness — the sole backend for control/inspection (the old DOSBox-X save-state + GUI-driving + debugger MCP tools are removed). DOSBox-X survives only as an interactive-RE tool (see the RE-toolkit table / DOSBox-X-workflows section).

The server registers two tool groups (`packages/mcp/src/tools/`):

- **Live tools** (`live.ts`) — drive + inspect a running dosbox-pure session via `LiveSession`/`HostClient` (the harness binary at `tools/libretro/host`):
  - Lifecycle: `dosbox_live_launch`, `dosbox_live_kill`
  - Drive: `dosbox_live_step` (advance N frames), `dosbox_live_key` (down/up/tap), `dosbox_live_batch` (raw protocol commands)
  - Inspect: `dosbox_live_state` (game_state + DGROUP base), `dosbox_live_read` (bytes at physical or DGROUP offset), `dosbox_live_read_struct` (symbol-aware BssStruct decode — same registry as the parity tooling), `dosbox_live_find` (byte-pattern search over live RAM)
  - Capture: `dosbox_live_screenshot` (framebuffer PNG)
  - Snapshot: `dosbox_live_serialize` / `dosbox_live_unserialize` (libretro serialize-state round-trip — the mechanism behind `build-state.ts --mint`)
- **Symbol tools** (`symbols.ts`, backend-agnostic) — `dosbox_resolve_symbol`, `dosbox_list_symbols` (name↔address over the in-memory `SymbolIndex` built from the findings docs).

To wire into Claude Code, add to your MCP config:
```json
{
  "mcpServers": {
    "wiz6": {
      "command": "/Users/nathan/Projects/ndouglas/wiz6/packages/mcp/bin/wiz6-mcp.mjs",
      "cwd": "/Users/nathan/Projects/ndouglas/wiz6"
    }
  }
}
```
(The bin script is a `tsx` shim so workspace TS source resolves cleanly without each package needing its own `dist/` build.)

## Known partial / in-progress issues

**Authoritative tracker: [`TODO.md`](TODO.md) at the repo root.** Stable numeric IDs (`#001`...), persists across sessions, edit by hand or via the Edit tool. Closed items are deleted (git log preserves them). The list below is a high-level summary; check `TODO.md` for the current open set, dependencies, and questions.

**Inbox: [`INBOX.md`](INBOX.md)** — Nate's freeform jot pad. Read it on session start; if non-empty, clarify items with him then process in a single batch commit that adds TODO entries and clears INBOX.

(See `TODO.md` for current open work.)

## Where to look when stuck

1. `docs/re/<format>.md` — investigation notes per file format
2. `docs/re/dynamic-traces/` — DOSBox-X traces with timestamps + interpretations
3. Auto-memory `wiz6-project.md` (loaded every session) — architectural pillars, philosophy
4. Git history — every stage's commits document the journey
