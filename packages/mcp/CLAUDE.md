# packages/mcp/ — the live dosbox-pure MCP backend

The MCP server drives + inspects a **running dosbox-pure (libretro)** session. This
is the sole backend for control/inspection. The old DOSBox-X path (save-state
snapshots, GUI key-driving via `dosbox_send_input`/`dosbox_screenshot`/
`dosbox_save_state`, the ncurses-debugger console, the Swift `HelperClient`, the
single-key SDL mapper) has all been **removed** — along with its macOS-focus and
screenshot-race lore. DOSBox-X is now only an interactive-RE tool (its debugger +
file-I/O logging; see the repo-root `CLAUDE.md`).

## Architecture

```
dosbox_live_* tool (src/tools/live.ts)
  → LiveSession   (src/live/live-session.ts)   — typed drive/inspect API + dumpDraft
    → HostClient  (src/live/host-client.ts)     — spawns + line-protocols the harness
      → tools/libretro/host                      — the C control harness (host.c) that
                                                    loads dosbox_pure_libretro.dylib + wroot.exe
```

- **`HostClient`** (`src/live/host-client.ts`) spawns the persistent `tools/libretro/host`
  process (built by `tools/libretro/build.sh`) and exposes its stdio **line protocol**
  as a typed async API: `step`, `key`, `batch`, `anchor` (DGROUP base), `find`,
  `read`, `fb` (framebuffer PNG), `serialize` / `unserialize`. It is the shared
  bridge used by the MCP, `build-state.ts`, and the parity tooling.
- **`LiveSession`** (`src/live/live-session.ts`) wraps `HostClient` with game-aware
  helpers: `launch(bootFrames)`, `state()` (game_state + DGROUP base), `readStruct`
  (symbol-aware BssStruct decode), and `dumpDraft()` (decodes the in-progress
  character draft at DGROUP `0x5470` + bonus/skill pools — the source of the
  `--mint` `.character.json` sidecars).

## Tools (registered in `src/server.ts`)

**Live tools** (`src/tools/live.ts`):
- `dosbox_live_launch`, `dosbox_live_kill` — lifecycle
- `dosbox_live_step` — advance N frames
- `dosbox_live_key` — key down / up / tap
- `dosbox_live_batch` — raw protocol commands, replies in order
- `dosbox_live_state` — game_state + DGROUP base
- `dosbox_live_read` — bytes at a physical or DGROUP-relative offset
- `dosbox_live_read_struct` — symbol-aware BssStruct decode (same registry as the
  parity tooling)
- `dosbox_live_find` — byte-pattern search over live RAM
- `dosbox_live_screenshot` — framebuffer PNG
- `dosbox_live_serialize` / `dosbox_live_unserialize` — libretro serialize-state
  round-trip (the mechanism behind `build-state.ts --mint`)

**Symbol tools** (`src/tools/symbols.ts`, backend-agnostic — kept across the
migration): `dosbox_resolve_symbol`, `dosbox_list_symbols` — name↔address over the
in-memory `SymbolIndex` built from the findings docs.

## Notes

- Code/harness changes need a Claude Code restart to reach the running MCP child
  (it holds the spawned harness from launch). Standalone `tsx` harnesses that spawn
  a fresh `HostClient` (e.g. `build-state.ts`) pick changes up immediately.
- No macOS focus dance, no synthetic CGEvents, no mapper file, no screenshot
  write-race: keys and framebuffer reads go straight through the harness's line
  protocol, so driving is deterministic and headless.
