# DOSBox-X MCP Server — Design Spec

**Date:** 2026-05-23
**Status:** Design approved (no implementation work yet).
**Tracker:** [`TODO.md`](../../../TODO.md) #017.
**Scope:** Design a [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes the running DOSBox-X emulator (with Wizardry VI loaded) to AI agents as a set of typed tools — turning live DOS-engine introspection into a first-class capability for RE, mechanic verification, and differential testing.

## Problem

The Wiz6 project has accumulated substantial structural knowledge about the original DOS engine: ~800 named functions, the full BSS layout per overlay, the state machine, the runtime data structures (character records, combat slots, sound table, animation queue, monster prejudice, palette registers, ...). All of that vocabulary is currently **applied statically** — we use it to decode files, document mechanics, and inform our reimplementation.

But the running engine is a live system. Many open questions can only be answered by *observation* of the engine in motion — when does `wiz6-main` actually get loaded into the EGA Attribute Controller? Which `*0x363a` state value fires when the player walks into the temple? What's in the animation queue when a high-AoE spell hits? These are difficult to answer through static RE alone; they're trivial to answer if we can poke memory in a running emulator.

DOSBox-X has a built-in debugger that can answer these questions. But driving it manually — pausing the game, typing `D 0x363a 2`, parsing the hex output, correlating to known struct fields, repeating dozens of times — is slow and error-prone.

The solution: a **Model Context Protocol server** that exposes a typed, schema-backed view of DOSBox-X's runtime state to AI agents. Instead of asking the user "could you check what's at offset X", an agent can directly call `dosbox_read_struct('character_record', 0x43e8)` and get a typed party-member record back.

The naming passes already produced the vocabulary; this spec is about *pointing it at the live engine.*

## Decisions

### Form factor: MCP server

The Model Context Protocol (MCP) is the standard way to expose tools to AI agents (Claude Code, Codex, others). An MCP server runs as a separate process; the AI client connects via stdio or socket; tools are declared as JSON-RPC methods with typed schemas. Once installed, the tools are available to any agent in any conversation that has the MCP server configured.

This is the right form factor because:

- **AI-first.** Tools are designed for programmatic use, not human ergonomics. Memory reads, structured queries, expression evaluation — not a debugger UI.
- **Composable.** Many tools chain naturally: launch → run-until → read-struct → record → continue. Agents can script these without human assistance.
- **Sharable.** The spec defines a tool surface; any LLM-driven workflow benefits.
- **Resumable.** The MCP server's lifecycle is independent of any one agent session. Long experiments (set breakpoint, run game for 10 minutes, hit breakpoint, return) work cleanly across conversation boundaries.

A human-driven web UI for the same data ("the data explorer for the running DOS engine") remains a sensible follow-up, but is out of scope for this spec. The tools landed here can power it later.

### Language: TypeScript / Node

Aligns with the rest of the project's monorepo. The MCP server becomes a new package `packages/wiz6-mcp/` with shared imports from `@wiz6/data` for struct schemas. No language-zoo cost; existing pnpm/tsconfig/vitest pipelines apply.

The MCP TypeScript SDK is mature (`@modelcontextprotocol/sdk`), well-typed, and ships with stdio transport out of the box.

### Bridge to DOSBox-X: debugger console (initial), with room to evolve

DOSBox-X has a built-in debugger toggleable at boot (`--debugbreak` flag or runtime keybind). It accepts commands via the emulator's debug window:

- `D <addr> <count>` — dump hex
- `BP <seg>:<offset>` — set execution breakpoint
- `MEMR <addr>` — set memory read watchpoint
- `G` — continue
- `T` — trace single instruction
- `P` — step over
- `R` — show registers
- ... and more

The MCP server drives DOSBox-X by:

1. Launching it as a child process with debug mode enabled.
2. Sending commands to its stdin (or debugger socket where supported).
3. Parsing the formatted output back into structured data.

This is brittle (output format isn't a stable API) but **maximally compatible** — works on every DOSBox-X build, no plugin authoring required. Later versions of the server can layer:

- Direct memory poking via OS APIs (Linux `/proc/<pid>/mem`, macOS `vm_read`).
- DOSBox-X scripting plugins if a sufficient API surface exists.
- Save-state snapshot reads (offline, complement to live driving).

The initial server abstracts the bridge so swapping in faster backends doesn't change the tool surface.

### Struct-schema model: derived from naming-pass findings

The naming-pass findings JSONs document BSS layouts as prose (e.g. wpcvw's character record at `0x43e8` stride `0x1b0`, with named fields at offsets `+0x00`, `+0x0c`, etc.). For typed reads we need machine-readable schemas.

We mint a new `packages/data/src/schemas/structs/` directory with one file per documented BSS struct:

```typescript
// packages/data/src/schemas/structs/character-record.ts
export const CharacterRecordStruct: BssStruct = {
  name: 'character_record',
  bytes: 0x1b0,
  fields: [
    { name: 'name', offset: 0x00, type: 'string', length: 16, encoding: 'wiz-ascii' },
    { name: 'xp', offset: 0x0c, type: 'u32_le' },
    { name: 'gold', offset: 0x10, type: 'u32_le' },
    { name: 'hp_current', offset: 0x14, type: 'u16_le' },
    { name: 'hp_max', offset: 0x16, type: 'u16_le' },
    // ... full field list from wpcvw findings
  ],
};
```

`BssStruct` is a small declarative format with a runtime decoder that the MCP server uses to translate raw bytes → typed records. Schemas come from naming-pass evidence; they're authored once and reused across:

- The MCP server's `read_struct(name, addr)` tool.
- A future save-state viewer (Tier 1 of #010 reimagined).
- The eventual TS port's runtime state representation.
- Doc generation (auto-generated field tables on `/explore/overlays`).

The schemas are the durable artifact of this spec; the MCP server is one consumer.

## Tool surface

The initial v1 server exposes a focused subset; later versions extend. Naming convention: `dosbox_<verb>_<noun>`.

### Lifecycle

- `dosbox_launch(options?)` — start DOSBox-X with Wiz6, optionally with a starting save state. Returns session ID.
- `dosbox_kill()` — terminate the running DOSBox-X. Idempotent.
- `dosbox_status()` — running / paused / stopped + current PC + current overlay.

### Control

- `dosbox_send_input(keys: string)` — string macro like `"down down enter"` or `"a b c return"`.
- `dosbox_send_key(key: string, hold_ms?: number)` — single key, optional hold duration.
- `dosbox_pause()`, `dosbox_resume()`.
- `dosbox_step(n=1)`, `dosbox_step_over()`, `dosbox_step_into()`.
- `dosbox_run_until(condition: string)` — e.g. `"*0x363a == 0x0d"`, `"pc == 0x209b"`. Pauses when satisfied.

### Breakpoints

- `dosbox_set_breakpoint(addr_or_symbol: string)` — accepts numeric addresses or names from our wroot-naming-pass (e.g. `"audio_play_sound"`). Returns breakpoint ID.
- `dosbox_clear_breakpoint(id: number)`.
- `dosbox_list_breakpoints()`.

### Inspection

- `dosbox_read_memory(addr: number, length: number)` — raw bytes.
- `dosbox_read_struct(struct_name: string, addr: number)` — typed read using a `BssStruct` schema from `@wiz6/data`. Returns a typed record.
- `dosbox_read_palette_registers()` — the 16 AC palette regs + overscan, decoded to RGB via the EGA color-code → RGB function.
- `dosbox_get_state_machine()` — `*0x363a` value + which overlay is currently loaded + handler function (resolved via wroot-naming-pass).
- `dosbox_get_registers()` — CPU registers (AX, BX, CX, DX, SI, DI, BP, SP, IP, flags, segments).
- `dosbox_get_call_chain(depth?)` — walk the stack, resolve each return address to a named function. Resolves both intra-overlay and cross-overlay (via thunk-delta law).

### Snapshots & evidence

- `dosbox_save_state(label: string)` — save to a named slot in `tools/dosbox/save/`.
- `dosbox_load_state(label: string)` — restore.
- `dosbox_screenshot()` — capture current display as PNG bytes. Useful for the agent to "see" what's happening visually.

### Tracing (deferred to v2)

- `dosbox_trace_log(filter)` — start logging events matching the filter (`int10_palette`, `int21_open`, ...). Returns a stream / poll handle.
- `dosbox_get_trace(handle, max_events?)` — read accumulated events.

v1 ships everything except tracing. v2 adds tracing once the v1 surface stabilizes.

## File structure

```
packages/wiz6-mcp/                          # NEW package
├── package.json                            # @wiz6/mcp; node entry point
├── tsconfig.json
├── src/
│   ├── server.ts                           # MCP server entry; tool registration
│   ├── dosbox/
│   │   ├── bridge.ts                       # abstract DOSBox-X bridge interface
│   │   ├── debugger-console.ts             # implementation: drive via debugger I/O
│   │   └── process.ts                      # child-process lifecycle, env, args
│   ├── tools/
│   │   ├── lifecycle.ts                    # launch, kill, status
│   │   ├── control.ts                      # input, pause, resume, step, run-until
│   │   ├── breakpoints.ts                  # set/clear/list
│   │   ├── inspect.ts                      # read_memory, read_struct, registers, ...
│   │   ├── snapshots.ts                    # save_state, load_state, screenshot
│   │   └── index.ts                        # tool inventory + schema declarations
│   ├── structs/
│   │   ├── decoder.ts                      # BssStruct → typed-record decoder
│   │   └── symbols.ts                      # name → address resolver (from naming-pass JSONs)
│   └── index.ts                            # CLI: `wiz6-mcp serve`
├── tests/                                  # vitest, mirrors src structure

packages/data/src/schemas/structs/          # NEW — declarative BSS struct schemas
├── bss-struct.ts                           # type definitions + zod validator
├── character-record.ts                     # from wpcvw findings
├── combat-slot.ts                          # from wmele/wmexe findings
├── position-state.ts                       # from wmaze findings
├── sound-table-entry.ts                    # from snd-format docs
├── monster-prejudice.ts                    # from wpops findings
└── ...                                     # one per documented BSS struct
```

A new `wiz6-mcp` CLI ships with the package: `pnpm exec wiz6-mcp serve` starts the server on stdio. Users add a line to their MCP client config:

```json
{
  "mcpServers": {
    "wiz6": {
      "command": "pnpm",
      "args": ["--filter", "@wiz6/mcp", "exec", "wiz6-mcp", "serve"],
      "cwd": "/path/to/wiz6"
    }
  }
}
```

Configuration for which DOSBox-X binary to use, where save states live, etc., reads from `tools/dosbox/wiz6.conf` (already canonical for the project) plus environment overrides.

## Implementation phases

Each phase ships independently with tests. The order minimizes risk: schemas first (durable, doesn't depend on DOSBox-X integration), then bridge (highest unknown), then tools.

### Phase 1 — `BssStruct` schemas in `@wiz6/data` ✅ shipped (`259d4ef`)

Define the declarative format (`BssStruct`, `BssField`, type-name enum) + decoder. Author the first ~5 schemas from existing naming-pass findings (character record, position state, sound table entry, combat slot, monster prejudice). TDD: decoder tests use fixture byte arrays.

**Status**: 5 schemas live (`@wiz6/data/structs/`), decoder + 11 tests. Plus 2 bug fixes during dogfooding (`position_state.bytes` off-by-one, decoder string trim was wrong for embedded nulls).

### Phase 2 — Symbol resolver ✅ shipped (`2aaf3c7`)

Module that loads every `docs/re/findings/<overlay>-naming-pass.json` at startup and builds a `name → {binary, file_offset, runtime_offset}` lookup. Plus the inverse: `addr → name` for call-chain resolution. Uses the thunk-delta law for cross-overlay resolution.

**Status**: 763 symbols indexed across 10 binaries. Two on-disk formats parsed (`renamed_full_list[]` for overlays; per-finding `applied_name` for wroot). Wroot segment-prefixed addresses normalised to bare image offsets so the thunk-delta law applies cleanly. Pure-TS resolver in `@wiz6/data/symbols/`; Node disk loader in `@wiz6/cli/lib/symbols-loader.ts`.

### Phase 3 — DOSBox-X bridge (the unknown) ✅ shipped with v1 fallback (`d38d9f4`)

The riskiest phase; do it early so we know if the whole approach is viable.

**Status**: Two practical limits documented. macOS gates the debugger on `isatty(stdin)` — bypassable with `node-pty`, verified empirically via `script(1)`. But the debugger UI is ncurses; parsing it as a request/response shell needs a vt100 screen scraper, which is heavy enough to defer. Fallback adopted: `SaveStateBridge` wraps `tools/parity/extract.py` to read raw memory out of `tools/dosbox/save/N.sav` snapshots. v2 path: patch DOSBox-X to expose a TCP debug port.

### Phase 4 — MCP server scaffold + lifecycle tools ✅ shipped (`899f790`)

`@modelcontextprotocol/sdk` integration. Stdio transport. Register `dosbox_launch`, `dosbox_kill`, `dosbox_status`. Smoke test via the MCP CLI.

**Status**: `wiz6-mcp` bin entry speaks JSON-RPC over stdio. Lifecycle tools all real — `DebuggerConsole` can manage the dosbox-x child process even though it can't drive its debugger.

### Phase 5 — Control tools ⏸ all stubs (blocked on Phase 9 backend)

`dosbox_send_input`, `pause`/`resume`, `step`, `step_over`, `run_until`.

**Status**: All 6 tools throw `NotImplementedError` with a clear pointer at the blocker. Re-enable when a dynamic-driving backend lands (node-pty+scraper, or DOSBox-X TCP patch).

### Phase 6 — Inspection tools ✅ 7 real + 3 stubs (`899f790`)

`read_memory`, `read_struct`, `read_palette_registers`, `get_state_machine`, `get_registers`, `get_call_chain`.

**Status**: Real over save states — `read_memory`, `read_struct` (symbol-aware via Phase 2 SymbolIndex), `resolve_symbol`, `list_symbols`, `inspect_save`, `find_pattern`, `get_state_machine`. Stubbed pending VGA/CPU blob parsers — `read_palette_registers`, `get_registers`, `get_call_chain`. Per-save DGROUP base is located at runtime by anchoring on the `SOUND00.SND` template and cached per save path.

### Phase 7 — Breakpoint tools ⏸ all stubs (blocked on Phase 9 backend)

`set_breakpoint`, `clear_breakpoint`, `list_breakpoints`. Resolves symbol names via the Phase 2 resolver.

**Status**: Symbol resolution of breakpoint targets at request time IS implementable (Phase 2 SymbolIndex), but actually setting the breakpoint requires the dynamic backend. All 3 stubs throw with a pointer at `dosbox_resolve_symbol` as the resolution-only fallback.

### Phase 8 — Snapshots ✅ 1 real + 3 stubs (`899f790`)

`save_state`, `load_state`, `screenshot`.

**Status**: `list_saves` works (enumerates `tools/dosbox/save/*.sav`). The other three (`save_state`, `load_state`, `screenshot`) need dynamic driving or a VGA framebuffer parser — stubbed with documented blockers.

### Phase 9 — First-payoff experiment ⏸ requires dynamic backend

Use the v1 server to answer `#Q-F` (when does the engine load `wiz6-main` / `wiz6-dungeon`?). Concrete experiment script — set breakpoints at wroot 0x209B and 0x2105 (the two AX=1002h sites), play through every game state, log every hit with surrounding context. Document the findings; close `#Q-F` or refine the question.

**Status**: Blocked by the breakpoint-setting gap. v1 workaround that DOES work today: capture save states by hand at each game-state boundary, use `dosbox_inspect_save` + `dosbox_read_memory` to dump the VGA palette tables, and reason about activation from the deltas. Less elegant than breakpoints but answers the same question.

### Phase 10 — Tracing (deferred)

`trace_log` + `get_trace` for streaming event capture. v2 of the server.

## First-payoff target: `#Q-F` (palette activation)

Concrete v1 experiment using the spec'd tools:

```typescript
// pseudocode for the agent-driven experiment
await dosbox_launch({ savestate: 'fresh-boot' });
await dosbox_set_breakpoint('0x209b');   // wiz6-main load
await dosbox_set_breakpoint('0x2105');   // wiz6-dungeon load
await dosbox_resume();

// Drive through scenes:
const scenes = [
  { name: 'title',   inputs: 'wait 5000' },
  { name: 'menu',    inputs: 'return' },
  { name: 'roster',  inputs: 'arrow_down return' },
  { name: 'dungeon', inputs: 'return wait 3000' },
  // ...
];

for (const scene of scenes) {
  await dosbox_send_input(scene.inputs);
  const status = await dosbox_status();
  if (status.last_breakpoint_hit) {
    console.log(`${scene.name}: hit ${status.last_breakpoint_hit.name}`);
    await dosbox_resume();
  }
}
```

A few iterations of this would close `#Q-F` definitively. The same pattern generalizes — set breakpoints at the boundaries of any RE question, play through, record what fires when.

## Setup ergonomics

The MCP server's "happy path" for a developer:

1. Clone the wiz6 repo.
2. `pnpm install` from the root (the MCP package builds via existing pipeline).
3. Have DOSBox-X installed (already a project requirement).
4. Add the MCP server entry to their Claude Code / Codex / Gemini config.
5. Ask Claude "use DOSBox MCP to find out when wiz6-main is loaded."

No separate install step. No language-zoo. The MCP server's lifecycle is owned by the AI client (stdio-spawned); no daemon process to manage. Snapshots and screenshots write to `tools/dosbox/save/` and `tools/dosbox/screenshots/` which are gitignored.

## Non-goals

- **Replace DOSBox-X's debugger.** The MCP server *uses* the debugger; it doesn't reimplement it.
- **Headless / CI use.** v1 assumes DOSBox-X has a display (windowed or virtualized). Headless on macOS in particular may not work; treat as deferred.
- **Multi-game support.** Wiz6-specific. The struct schemas + symbol resolver are tightly coupled to our naming-pass findings.
- **Direct emulation patching.** No "live edit and continue" — the MCP server reads + controls, doesn't rewrite engine code at runtime.
- **Performance for high-frequency probes.** Each tool call has per-call overhead (debugger round-trip). Designed for hundreds-of-calls-per-second at best, not millions.

## Open questions

These are the unknowns that the spec acknowledges without resolving:

- **Is DOSBox-X's debugger output stable enough across versions to parse reliably?** Phase 3 answers this. If not, fall back to save-state snapshots as the primary backend.
- **Does headless DOSBox-X work on macOS via X11 / virtual display?** Probably not without effort; defer.
- **Can the debugger console handle high-frequency stepping (millions of instructions) without falling behind?** Probably not — tracing/streaming should use a different backend (memory-poking?). v2 problem.
- **Symbol resolution across all overlays at once: how do we disambiguate `wmele.fn_at_0x100` from `wpops.fn_at_0x100`?** Need a fully-qualified naming convention. Probably `<overlay>:<symbol>` (e.g. `wmele:wmele_state_0a_init_combat`). Phase 2 nails this down.
- **How does the v1 server cope when DOSBox-X crashes?** Auto-restart with state restore, or surface error and require human relaunch? Probably the latter for v1.

## See also

- [Model Context Protocol](https://modelcontextprotocol.io/) — the standard.
- [`docs/re/findings/wpcvw-naming-pass.json`](../../re/findings/wpcvw-naming-pass.json) — primary source for the `character_record` struct schema.
- [`docs/re/findings/wmele-naming-pass.json`](../../re/findings/wmele-naming-pass.json) + [`wmexe-naming-pass.json`](../../re/findings/wmexe-naming-pass.json) — sources for `combat_slot`, `monster_group`, sub-action queue schemas.
- [`docs/re/findings/wmaze-naming-pass.json`](../../re/findings/wmaze-naming-pass.json) — `position_state` (party position globals at `0x4f80..0x4faa`).
- [`docs/re/snd-format.md`](../../re/snd-format.md) — `sound_table_entry` (12-byte records at DGROUP `0x3344`).
- [`docs/re/findings/wroot-naming-pass.json`](../../re/findings/wroot-naming-pass.json) — symbol-resolver source for cross-overlay thunks via the thunk-delta law.
- [`tools/parity/extract.py`](../../../tools/parity/extract.py) — existing save-state reader; the snapshot backend would extend this.
- [`tools/dosbox/wiz6.conf`](../../../tools/dosbox/wiz6.conf) — canonical DOSBox-X config the MCP server inherits from.
