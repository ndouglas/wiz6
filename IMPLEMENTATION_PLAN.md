# Replace DOSBox-X with a libretro (dosbox-pure) control backend

**Goal:** a fast, deterministic, low-latency engine backend — own the frame loop
(step/input/framebuffer/memory) instead of GUI-automating DOSBox-X. Spike already
proved: dosbox-pure boots Wiz6, exposes contiguous RAM via `SET_MEMORY_MAPS`
(desc[0] = conventional memory), and the existing DGROUP anchor-search + offsets
work unchanged (`game_state` validated). See `docs/re/findings/` spike notes.

**The load-bearing risk** (decides whether this is a full replacement or an
additive backend): does dosbox-pure render Wiz6 **pixel-identically** to the
DOSBox-X-minted fixtures? If yes → full replacement. If no → libretro becomes the
control/inspection backend and DOSBox-X stays for fixture minting (or we re-mint
deliberately). **Stage 2 answers this empirically before we migrate anything.**

## Stage 1: Persistent control harness
**Goal:** a long-running native host (`tools/libretro/host.c`) that loads Wiz6 and
serves a line protocol over stdio: `step N`, `key <name> <down|up|tap>`,
`read <hexaddr> <len>`, `fb <path>`, `serialize/unserialize <path>`, `anchor`, `quit`.
**Success:** drive the boot, inject a keypress, read the DGROUP anchor + game_state,
dump a framebuffer — all from one persistent process.
**Tests:** a smoke script that boots → anchor found → base validated → framebuffer non-blank.
**Status:** Complete

## Stage 2: Framebuffer divergence check (THE GATE)
**Goal:** drive dosbox-pure to a state with an existing DOSBox-X fixture and pixel-compare.
**Success:** a quantified match % vs DOSBox-X. Decision: full-replace vs additive.
**RESULT (2026-06-01):** drove BOTH backends to the no-party MASTER OPTIONS menu
(boot → ENTER) and compared. DOSBox-X renders 640×400 (clean 2× of 320×200);
nearest-downscaled to 320×200 it is **100.00% pixel-identical** to dosbox-pure's
native 320×200 — 0/64000 pixels differ, including the animated water strip.
**DECISION: full replacement is viable — no fixture re-minting.** Remaining
confirmation: spot-check a font/text-heavy screen (char view) and a sprite-heavy
screen (combat/dungeon) before decommissioning DOSBox-X in Stage 5.
**Status:** Complete (gate GREEN; broader screen-type spot-check pending)

## Stage 3: MCP backend swap
**Goal:** repoint `packages/mcp` memory tools (`read_memory`, `read_struct`,
`find_pattern`, `resolve_symbol`, `get_state_machine`) at the harness's live
`read`/`anchor` instead of `.sav` ZIP parsing; add real `send_input`/`step`/
`screenshot` driving (replacing GUI automation). Keep the symbol/struct/dgroup
layers as-is (proven portable).
**Success:** existing MCP tools return correct values against the live harness.
**Status:** Not Started

## Stage 4: Parity/fixture pipeline
**Goal:** repoint `tools/parity` (gen-fixture, extract.py) + `tools/dosbox`
(build-saves, state-catalog) at the harness (framebuffer from `fb`, memory from
`read`, save states from `serialize`). Per Stage-2 decision: re-mint fixtures or
keep DOSBox-X ones.
**Success:** the parity + e2e suites pass against the libretro-sourced fixtures.
**Status:** Not Started

## Stage 5: Decommission + docs
**Goal:** remove/retire DOSBox-X-specific paths per Stage-2 outcome; update CLAUDE.md,
the RE toolkit table, and driving-based-testing doctrine.
**Status:** Not Started

## Notes / decisions
- Core: dosbox-pure libretro (`tools/libretro/fetch-core.sh` downloads the official
  arm64 build; the `.dylib` is gitignored — not committed).
- JIT: spike forced `cpu_core=normal` (interpreter, no dynarec) to sidestep
  Apple-Silicon JIT hardening. Revisit the dynarec (faster, needs the JIT
  entitlement working) as a perf pass once correctness is locked.
- Host must be codesigned with `com.apple.security.cs.allow-jit` (even for the
  interpreter the core probes JIT); `tools/libretro/entitlements.plist`.
