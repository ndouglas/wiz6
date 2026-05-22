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

## Known partial / in-progress issues

- **Multi-segment .pic cell rendering**: cells whose atlas position extends past segment-0's end render as garbage. Affects 16 of 60 .pic files. Naive concatenation, skip-phantom, and various padding alignments all fail. Needs Ghidra analysis of the .pic loader's segment-destination logic to resolve. See `docs/superpowers/plans/2026-05-22-pic-stage-b-pixel-rendering.md` and the most recent conversation context.
- **Per-scene palettes**: we ship one empirical palette with 7 overrides on standard EGA that matches the most common scenes. Other scenes (e.g. specific NPCs) may show slightly-off colors; per-scene palette selection deferred.

## Where to look when stuck

1. `docs/re/<format>.md` — investigation notes per file format
2. `docs/re/dynamic-traces/` — DOSBox-X traces with timestamps + interpretations
3. Auto-memory `wiz6-project.md` (loaded every session) — architectural pillars, philosophy
4. Git history — every stage's commits document the journey
