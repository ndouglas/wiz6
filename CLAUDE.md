# wiz6 — project-specific instructions for Claude

This file is auto-loaded into every session. Project background lives in auto-memory (`wiz6-project.md`); this file is the **practical / operational** reference.

## Project layout

```
.
├── original/                       # Game binaries (Wiz6 DOS, 1990). Private repo, OK to commit.
├── extracted/                      # JSON outputs from extractors. Mostly gitignored.
├── packages/                       # pnpm monorepo
│   ├── data/                       # zod schemas (no DOM/Node)
│   ├── parser/                     # pure decoders (no I/O)
│   ├── cli/                        # extractors + `wiz6 extract` subcommands
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

**When to reach for which:**

- **Quick byte-pattern question** ("does this offset contain a 16-byte palette table?") → Python + `xxd` / grep raw bytes.
- **"What does this function do?"** → Ghidra. Don't reach for ndisasm unless you specifically want raw asm.
- **"What does the game do at runtime when X happens?"** → DOSBox-X interactive debugger OR file I/O logging via `tools/dosbox/wiz6.conf` + grep.
- **"What's the actual on-screen color of pixel X?"** → Pixel-pick a DOSBox-X screenshot in Python.

## DOSBox-X workflows

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

**Overlay relocation:** Ghidra often shows overlay code at virtual addresses that don't match file offsets. For winit.ovr, runtime delta = 0x3DB7 (DGROUP_runtime − file_offset). Use this to translate addresses you see in decompiled code back to file offsets when grepping bytes.

## Project conventions

- **Worktrees over branches**. Standing prefs: `~/.config/superpowers/worktrees/wiz6/<branch-name>/`. The using-git-worktrees skill handles setup.
- **Subagent-driven development** when executing plans. Don't ask, just do it.
- **TDD discipline**: failing test first, minimal implementation, then refactor. The viewer/parser/data tests all follow this pattern.
- **All decoder code is pure** (no I/O) and lives in `packages/parser/src/formats/`. File-I/O wrappers go in `packages/cli/src/extractors/`. CLI subcommand dispatch in `packages/cli/src/commands/extract.ts`.
- **Schema is source of truth** — `packages/data/src/schemas/` exports zod schemas; types come from `z.infer<typeof X>`. Don't define types separately.
- **TS ESM** — relative imports use `.js` extensions even though source is `.ts`.
- **Live deploy**: pushing to `main` of the wiz6 repo builds a container; the goldentooth gitops repo (`~/Projects/goldentooth/gitops/apps/wiz6/deployment.yaml`) pins a specific image SHA; flux reconciles to the K8s cluster. Live URL: https://wiz6.goldentooth.net/.
- **`pnpm dev:viewer` runs predev → re-extracts** all JSON assets before launching Vite, so schema changes never get tested against stale assets.

## Parity testing — `tools/parity/`

Differential testing against the original binary. The workflow that cracked the multi-segment `.pic` bug, generalized:

```bash
# 1. Run the game in DOSBox-X to a known checkpoint, save state to tools/dosbox/save/N.sav
# 2. Locate the target buffer in physical memory
python3 tools/parity/extract.py find tools/dosbox/save/1.sav --pattern '58 02 09 0d'

# 3. Dump engine view
python3 tools/parity/extract.py dump tools/dosbox/save/1.sav --offset 0x5b928 --length 24376 --output /tmp/engine.bin

# 4. Compute ours
pnpm tsx tools/parity/decode-pic.ts original/mon11.pic /tmp/ours.bin

# 5. Diff (exit 0 on match, 1 on divergence)
python3 tools/parity/diff.py /tmp/engine.bin /tmp/ours.bin
```

Use this any time a decoder needs ground-truth validation, or when reimplementing a game-logic routine. See `tools/parity/README.md` for additional examples.

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

wroot.exe drives a state-machine loop in `ovl_install_table` @ wroot 0x132d that reads a **game-state word at DGROUP `0x363a`** and loads whichever `.ovr` handles that state. Each overlay dispatches its own subset of states from its entry point. Overlay header sizes vary: `winit.ovr` is 12 bytes (entry at file 0x0c); `wbase.ovr` and `wmele.ovr` are 14 bytes (entry at file 0x0e); `wpcmk.ovr` is 16 bytes (entry at file 0x10) and is a **library** rather than a state handler — its dispatch stub is a no-op that returns to state 4; its UI is invoked via cross-overlay calls from wbase main-menu slot 5.

| State value (hex / dec) | Handler overlay     | Purpose                                  |
| ----------------------- | ------------------- | ---------------------------------------- |
| 0                       | `winit.ovr` 0x525   | Load disk headers (master.hdr/disk.hdr)  |
| 1                       | `winit.ovr` 0x9f3   | Title page + scrolling credits           |
| 2                       | `winit.ovr` 0xf43   | Load fonts/portraits + create UI windows |
| 4                       | `wbase.ovr`         | Main menu (MASTER OPTIONS)               |
| 5 / 6 / 17 (0x11)       | `wmaze.ovr`         | Dungeon traversal                        |
| 8                       | `winit.ovr` 0xdf6   | Graveyard / total-party-kill recovery    |
| 10 (0x0a)               | `wmele.ovr` 0x2d6d  | Combat: init encounter                   |
| 11 (0x0b)               | `wmele.ovr` 0x2b6a  | Combat: per-round redraw + monster attacks |
| 14 (0x0e)               | `wmele.ovr` 0x2ceb  | Combat: end-of-round cleanup             |

To transition, a handler writes the new state value to `*0x363a` (or to `*0x4fce` in wbase/wmele, which the entry dispatcher copies into `*0x363a` after the handler returns — deferred transition pattern). The outer loop reloads the appropriate overlay.

### Cross-overlay calls: the thunk-delta law (HIGH CONFIDENCE)

```
thunk_address = wroot_file_offset + 0xBA9C
```

Every cross-overlay call goes through a BSS function-pointer thunk at this offset. To resolve any `call [bss_offset]` indirect call in an overlay, subtract `0xBA9C` to get the wroot file offset, then look up the named function in `docs/re/wroot-functions.md` or `docs/re/findings/wroot-naming-pass.json`. Verified across `winit.ovr`, `wmaze.ovr`, and (transitively) `wbase.ovr`. **Tell every overlay-RE subagent about this.**

Known sampled mappings (illustrative):
- `0xbbb6` − `0xBA9C` = `0x11a` → `ui_window_create`
- `0xe0df` − `0xBA9C` = `0x2643` → `kbd_check_with_filter`
- `0xee85` − `0xBA9C` = `0x33e9` → `huffman_load_and_decompress` (the .pic decoder thunk)

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

## Known partial / in-progress issues

**Authoritative tracker: [`TODO.md`](TODO.md) at the repo root.** Stable numeric IDs (`#001`...), persists across sessions, edit by hand or via the Edit tool. Closed items are deleted (git log preserves them). The list below is a high-level summary; check `TODO.md` for the current open set, dependencies, and questions.

**Inbox: [`INBOX.md`](INBOX.md)** — Nate's freeform jot pad. Read it on session start; if non-empty, clarify items with him then process in a single batch commit that adds TODO entries and clears INBOX.

- **Overlay naming passes** (#003): `wmele.ovr`, `wpcmk.ovr`, `wpcvw.ovr`, `wmnpc.ovr`, `wtrea.ovr` still on `FUN_XXXX` names.

## Where to look when stuck

1. `docs/re/<format>.md` — investigation notes per file format
2. `docs/re/dynamic-traces/` — DOSBox-X traces with timestamps + interpretations
3. Auto-memory `wiz6-project.md` (loaded every session) — architectural pillars, philosophy
4. Git history — every stage's commits document the journey
