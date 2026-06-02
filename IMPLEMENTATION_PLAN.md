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
**DECISION: full replacement is viable** — *rendering* is pixel-identical, no
re-minting needed for pixel fidelity. NOTE (superseded scope): Stage 4 later found
the *data* (RNG rolls + roster) diverges, so divergent fixtures ARE re-minted — not
because dosbox-pure renders differently, but because it produces a different (equally
valid, deterministic) character than the lost DOSBox-X seed did.
**Status:** Complete (gate GREEN; broader screen-type spot-check pending)

## Stage 3: MCP backend swap
**Goal:** repoint `packages/mcp` memory tools (`read_memory`, `read_struct`,
`find_pattern`, `resolve_symbol`, `get_state_machine`) at the harness's live
`read`/`anchor` instead of `.sav` ZIP parsing; add real `send_input`/`step`/
`screenshot` driving (replacing GUI automation). Keep the symbol/struct/dgroup
layers as-is (proven portable).
**Success:** existing MCP tools return correct values against the live harness.
**Progress:** harness gained a general `find <hex>` command; `tools/libretro/host-client.ts`
(async TS bridge: step/key/read/find/anchor/fb/serialize) built + smoke-passing
(base 0xffa0, game_state, find==base+0x5d6, 320x200 fb). `find`/`read` map 1:1 to
SaveStateBridge.findPattern/readPhysical — MCP repoint is a drop-in adapter (make
the bridge async + await at call sites; OR a live-vs-save-N design decision).
**DONE:** 12 `dosbox_live_*` tools (launch/kill/step/key/batch/state/read/read_struct/
find/screenshot/serialize/unserialize) on a per-process LiveSession; reuse the
BssStruct registry for live read_struct. The live backend (HostClient+LiveSession)
now lives in packages/mcp/src/live/. Proven end-to-end via the registered handlers
(launch→drive→read game_state) + a live character_record decode (THESUS). MCP
suite green (88), full typecheck clean.
**Status:** Complete

## Stage 4: Parity/fixture pipeline — re-mint divergent fixtures from dosbox-pure
**Goal:** make dosbox-pure the single source of truth for ALL fixtures, rebuildable
from the pinned source. Stage-2 proved the *rendering* is pixel-identical, but the
creation subagent (2026-06-01) found the *data* diverges on 22/24 creation fixtures:
 - **Stat-roll RNG**: dosbox-pure's deterministic roll ≠ the lost DOSBox-X seed
   (different BONUS pool → different class/stats). Stable run-to-run, just different.
 - **Stale roster**: roster fixtures hardcode a 1-char NATHAN; pinned pcfile.dbs is
   the 4-char THESUS party.
**User decisions (2026-06-02):**
 - Re-mint from dosbox-pure (adopt its native deterministic rolls as truth).
 - **Data-driven sidecar**: re-minting dumps the engine's decoded character/draft +
   render-state into a committed `<name>.character.json`; parity render fns LOAD that
   JSON instead of hardcoding RE'd stats. Kills the staleness class permanently.
 - **Committed minimal-roster save-state**: commit a dosbox-pure serialize-state with
   a small purpose-built roster (1-char NATHAN-equiv) as pinned source; roster
   fixtures `unserialize` it deterministically. Keeps them isolated from the castle party.

**Sub-stages:**
- **4a — Draft-struct reader (RE prerequisite).** Locate the in-creation draft
  character in DGROUP during creation states (no documented offset yet — RE via
  Ghidra/live memory). Decode via the `character` BssStruct (or a draft schema).
  Deliver `dumpDraft()` in LiveSession that decodes the engine's current draft → JSON
  at any waypoint.
- **4b — Sidecar pipeline + schema.** Extend build-state to emit `<name>.character.json`
  (decoded draft/character + cursor/category/skillPoints/portrait/prompt state) beside
  the `.idx.gz`+`.png`. Define + commit the sidecar zod schema.
- **4c — Committed minimal-roster state.** Drive dosbox-pure to a 1-char roster,
  `serialize`, commit as `test-fixtures/states/<name>.state`. Roster fixtures
  unserialize it before driving.
- **4d — Re-mint roll fixtures.** Lock a deterministic canonical creation playthrough
  (re-tune the recipe to dosbox-pure's rolls; robust settle-timing for animated
  screens — the skill/spell capture jitter). Re-mint class-select/portrait-select/
  skill-train*/confirm/spell-* + sidecars; refactor render fns to load sidecar JSON;
  each → 100% via build-state --check.
- **4e — Re-mint roster fixtures.** From the committed minimal-roster state, re-mint
  review/delete/rename/portrait*/review-character/review-member + sidecars; refactor
  render fns; each → 100%.
- **4f — Full-suite sweep.** Re-verify all 58 fixtures reproduce from pinned source;
  give any other stale ones (castle/char-view) the same treatment. Parity + e2e green.
**Success:** every fixture rebuildable byte-exact from the pinned repo via build-state;
parity + e2e suites green.
**Status:** In Progress (4a starting)

## Stage 5: Decommission + docs
**Goal:** remove/retire DOSBox-X-specific paths per Stage-2 outcome; update CLAUDE.md,
the RE toolkit table, and driving-based-testing doctrine.
**Status:** Not Started


## Reproducibility guarantee (pinned source)
Every harness session boots from an **ephemeral COPY** of the COMMITTED
`test-fixtures/original/` image (163 files, complete — `HostClient` copies it to a
throwaway dir per session). Nothing depends on the mutable `./original` workspace,
and the committed source is never mutated by in-game saves (verified: pcfile.dbs
hash identical before/after a build; `castle-1` byte-identical across two runs).
All fixtures are rebuildable from the repo alone.

## Notes / decisions
- Core: dosbox-pure libretro (`tools/libretro/fetch-core.sh` downloads the official
  arm64 build; the `.dylib` is gitignored — not committed).
- JIT: spike forced `cpu_core=normal` (interpreter, no dynarec) to sidestep
  Apple-Silicon JIT hardening. Revisit the dynarec (faster, needs the JIT
  entitlement working) as a perf pass once correctness is locked.
- Host must be codesigned with `com.apple.security.cs.allow-jit` (even for the
  interpreter the core probes JIT); `tools/libretro/entitlements.plist`.
