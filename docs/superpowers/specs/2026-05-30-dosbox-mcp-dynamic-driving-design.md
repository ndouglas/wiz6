# DOSBox-X MCP — dynamic driving (headless-ish automation)

> **SUPERSEDED (2026-06-02):** the save-state / DOSBox-X-driving MCP path described here was replaced by the dosbox-pure live backend. See `IMPLEMENTATION_PLAN.md` / `tools/libretro/build-state.ts` and the MCP section of the repo-root `CLAUDE.md`. Retained as a historical record.

**Date:** 2026-05-30
**Status:** Design approved; ready for implementation plan.
**Supersedes (partial):** the "deferred to Phase 9 backend" stubs in [`2026-05-23-dosbox-mcp.md`](2026-05-23-dosbox-mcp.md).

## Goal

Complete the dynamic-driving half of the wiz6 MCP server so an AI agent can run a closed loop against a live DOSBox-X session: send keyboard input → take a screenshot → save state to a specific slot → read the resulting memory via the existing save-state-backed tools.

The original spec (2026-05-23) explicitly deferred this path: the ncurses debugger UI is hard to scrape, and "headless / CI use" was listed as a non-goal. v1 ships 11 real save-state-backed inspection tools and 14 dynamic stubs that all throw with a clear blocker pointer. This spec unblocks the stubs by routing around the debugger entirely.

Primary use cases (both valued):

1. **Autonomous playthroughs.** Agent boots the game, navigates menus, makes turn-based decisions. Demo + emergent RE discovery from gameplay.
2. **RE exploration.** Agent loads a save, sends a small input sequence, screenshots + reads memory + saves a new state. Faster than the human-driven debugger loop.

Spike-validation target (defines "done" for the implementation): launch DOSBox-X from the agent, navigate to ADD PARTY MEMBER → NEW CHARACTER → name input, type "NATHAN", screenshot, save state to slot 5, verify slot 5 byte-for-byte readable via existing `dosbox_inspect_save`. ~30 keystrokes + one screenshot + one state save.

## Decisions

### Approach: OS-level event injection (macOS CGEvent) + DOSBox-X's built-in keyboard shortcuts

Of three candidates considered, OS-level event injection is the recommended path.

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| Patch DOSBox-X (TCP control socket) | Cleanest API, no parsing brittleness | Maintain a fork, C++ build, slows DOSBox-X upgrades | Overkill for turn-based ~hundreds-of-events workloads |
| node-pty + ncurses scraper of debugger | Works on stock DOSBox-X | Brittle to version changes; debugger UI not designed for game input | Original spec already deferred for this reason |
| OS-level events + built-in shortcuts | Zero DOSBox modification, stable platform API, leverages DOSBox-X's existing Ctrl+F5 (screenshot) + slot-cycle (save state) | macOS-first; window must be visible + reachable to receive events | **Recommended** |

Visible-window-OK (a deliberate constraint per Nate) eliminates the offscreen-rendering yak-shave that pushed earlier designs toward DOSBox-X patching. With a visible window, CGEvent injection is straightforward and DOSBox-X's built-in screenshot/save-state shortcuts already do the heavy lifting.

The five currently-stubbed MCP tools (`send_input`, `send_key`, `screenshot`, `save_state`, `load_state`) all get real implementations atop this approach. The 11 existing save-state-backed tools are unchanged but become more useful: an agent can now produce the saves they read.

### Platform: macOS first; Linux/Windows behind the same interfaces

CGEvent-based injection is macOS-only. Linux (xdotool, ImageMagick `import`) and Windows (SendInput, screenshot APIs) would slot into the same `input.ts` / `screenshot.ts` modules behind a small platform-detection layer. Out of scope for v1; the interface is designed to make these drop in later.

### Native bridge: small Swift helper binary, not Node FFI

CGEvent injection from Node can use a native FFI library (`koffi`, `ffi-napi`) or a separate compiled helper. We ship a small Swift binary that the MCP server spawns per-request, taking a small JSON command on stdin and returning a JSON result on stdout. Rationale:

- Easier to read + maintain than FFI bindings to CoreGraphics structs.
- Self-contained and signable (helps with macOS Accessibility permissioning).
- No native-build step at `pnpm install` time — Swift helper compiles separately and the binary is checked into the repo (or downloaded at install time from a release).
- Helper binary's protocol is JSON over stdio, identical pattern to the MCP server itself.

The helper is named `wiz6-input-helper` and lives at `packages/mcp/bin/`. It accepts commands like:

```json
{"op":"keyDown","keyCode":36,"flags":0}
{"op":"keyUp","keyCode":36,"flags":0}
{"op":"findWindow","appName":"dosbox-x"}
{"op":"focusWindow","windowId":12345}
```

and replies with `{"ok":true}` or `{"ok":false,"error":"..."}`.

## Tool surface (changes from 2026-05-23 spec)

Five stubs become real, with the schemas declared in the original spec unchanged. All schemas already exist in `packages/mcp/src/tools/`.

| Tool | Before | After |
|---|---|---|
| `dosbox_send_input(keys)` | stub | macro-string ("down down enter") → CGEvent sequence |
| `dosbox_send_key(key, hold_ms?)` | stub | single key → CGEvent down/up with optional hold |
| `dosbox_screenshot()` | stub | Ctrl+F5 trigger → poll DOSBox-X captures dir → return PNG bytes |
| `dosbox_save_state({slot})` | stub | slot-cycle + save shortcut → poll `tools/dosbox/save/N.sav` mtime |
| `dosbox_load_state({slot})` | stub | slot-cycle + load shortcut → verify game-state change |

The other 9 dynamic stubs (`pause`, `resume`, `step`, `step_over`, `run_until`, breakpoints) **remain stubs**. They require driving the DOSBox-X debugger, which this spec deliberately routes around. A follow-up TODO documents that path as still-blocked.

## File structure

```
packages/mcp/
├── bin/
│   ├── wiz6-mcp.mjs                          # existing — MCP entry point
│   └── wiz6-input-helper                     # NEW — pre-built Swift binary
├── helper/                                   # NEW — Swift helper source
│   ├── Package.swift
│   ├── Sources/wiz6-input-helper/
│   │   ├── main.swift                        # JSON-over-stdio loop
│   │   ├── Input.swift                       # CGEvent key injection
│   │   ├── Window.swift                      # CGWindowList queries + focus
│   │   └── KeyCodes.swift                    # logical-name → virtual-key map
│   └── README.md                             # build instructions
├── src/
│   ├── dosbox/                               # NEW — bridge layer
│   │   ├── helper-client.ts                  # spawn + stdio protocol wrapper
│   │   ├── window.ts                         # findDosboxWindow + focusDosboxWindow
│   │   ├── input.ts                          # sendKey, sendMacro, macro parser
│   │   ├── screenshot.ts                     # captureScreenshot (focus + Ctrl+F5 + poll)
│   │   └── state.ts                          # saveStateToSlot, loadStateFromSlot
│   ├── tools/
│   │   ├── control.ts                        # stubs → real (send_input, send_key, pause-stub, ...)
│   │   └── snapshots.ts                      # stubs → real (screenshot, save_state, load_state)
│   └── ... (existing files unchanged)
└── tests/
    ├── dosbox/                               # NEW
    │   ├── input.test.ts                     # key-name resolver, macro parser
    │   ├── screenshot.test.ts                # findNewerThan, poll/timeout
    │   └── state.test.ts                     # slot validation, mtime detection
    └── integration/
        └── spike-target.test.ts              # gated on WIZ6_MCP_INTEGRATION=1
```

## Data flow

### `dosbox_send_input("down down enter")`

1. MCP tool receives request.
2. `helper-client.ts` ensures the helper process is alive (lazy spawn, reused across calls).
3. `findDosboxWindow()` — throw "DOSBox-X not running; call dosbox_launch first" if absent.
4. `focusDosboxWindow()` — record current frontmost app's bundle id so we can restore.
5. Macro parser splits the string: `["down", "down", "enter"]` → 3 key specs.
6. For each: `sendKey(spec)` posts a CGEvent keyboard-down + keyboard-up pair with bounded inter-event delay (default 30ms). After each key event, re-verify focus is still on DOSBox; abort + throw if it changed.
7. Restore prior focus.
8. Return `{ keysSent: N }`.

### `dosbox_screenshot()`

1. `focusDosboxWindow()`.
2. Note `mtime` of the newest file in DOSBox-X's captures directory (path read from `tools/dosbox/wiz6.conf` `[render] captures=`).
3. Send `Ctrl+F5` via the helper.
4. Poll the captures dir every 50ms up to 2s for a newer file.
5. Read PNG bytes. Return as MCP `ImageContent` with `type: "image"`, `mimeType: "image/png"`, and `data: <base64>`. Inline base64 keeps the round-trip self-contained and matches how other MCP tools return binary data; file URIs are a future option if PNG sizes become a concern.
6. Restore prior focus.

### `dosbox_save_state({slot: 5})`

1. Validate slot ∈ 0..9.
2. Focus DOSBox.
3. Cycle to slot 5 via the slot-set chord (Alt+F4 in stock DOSBox; **verify exact key during impl** — see Risks).
4. Send the save chord (Ctrl+F5 in stock DOSBox; **verify**).
5. Poll `tools/dosbox/save/5.sav` mtime change with 2s timeout.
6. Restore focus.
7. Return `{ slot: 5, path: "tools/dosbox/save/5.sav" }`.

### Closed-loop workflow (the headline)

```
agent → dosbox_launch                        // boot DOSBox-X
agent → dosbox_send_input("enter enter")     // dismiss title page
agent → dosbox_screenshot                    // sees ADD PARTY MEMBER menu
agent → dosbox_send_input("enter")           // pick ADD PARTY MEMBER
agent → dosbox_send_input("a")               // type 'A' in name field
agent → ...
agent → dosbox_save_state({slot: 5})         // commit to disk
agent → dosbox_inspect_save({save: 5})       // existing tool reads it back
agent → dosbox_read_struct(character_record, ...)  // existing tool decodes NATHAN
```

The new tools are write-side; the existing 11 are read-side. Together they form the full loop the original spec envisioned.

## Error handling

Every error path throws with an actionable message. No silent failures.

| Condition | Error message |
|---|---|
| DOSBox-X process not running | "DOSBox-X not running; call dosbox_launch first" |
| Process alive but window not findable | "DOSBox-X window not visible — un-minimize the window or check that it's on the active display" |
| Focus stolen mid-batch (window changed between keys) | "Focus changed during input batch — DOSBox-X window must stay focused. Retry without clicking away." |
| Screenshot file never appears within 2s timeout | "DOSBox-X did not write a screenshot — verify `[render] captures=` is set in tools/dosbox/wiz6.conf and the path is writable" |
| Save-state file mtime did not advance | "DOSBox-X did not save state to slot N — the save chord may differ on this DOSBox-X version. Check the keybinding via Mapper Editor." |
| macOS Accessibility permission missing | "Accessibility permission required: add the parent app (Terminal/iTerm/Claude Code) under System Settings → Privacy & Security → Accessibility." Detected by CGEvent returning posted=false. |
| Swift helper binary missing | "wiz6-input-helper binary not found at packages/mcp/bin/wiz6-input-helper. Build via packages/mcp/helper/README.md." |

## Testing

### Unit (default CI gate)

- `input.test.ts` — key-name → virtual-keycode map ("Enter"→36, "ArrowDown"→125, "Ctrl+F5"→96 with control mask, "a"→0 no shift, "A"→0 with shift). Macro parser tokenization. No native code invoked.
- `screenshot.test.ts` — `findNewerThan(dir, mtime)` returns newest file, polls correctly, times out as specified. Filesystem mocked.
- `state.test.ts` — slot validation 0..9, mtime-change detection, timeout behavior.
- `helper-client.test.ts` — JSON protocol encode/decode with a fake helper child (spawns `node` with a fixture script).

### Integration (`WIZ6_MCP_INTEGRATION=1` gate)

A single smoke test exercising the spike target:
1. `dosbox_launch`.
2. Wait for title page to render (~3s sleep, or until a screenshot has non-trivial entropy).
3. Send keys to reach ADD PARTY MEMBER → NEW CHARACTER → name input.
4. Type `n a t h a n Enter`.
5. `dosbox_screenshot()` — verify PNG decodes + has expected dimensions (640×400 scaled or 320×200 native).
6. `dosbox_save_state({slot: 5})` — verify `tools/dosbox/save/5.sav` mtime advanced.
7. `dosbox_inspect_save({save: 5})` — verify NATHAN appears in `party_names` OR the in-creation buffer (depends on how far the spike target boots).
8. `dosbox_kill()`.

Excluded from default CI — needs display + macOS Accessibility + Screen Recording permissions. Runnable locally via `pnpm --filter @wiz6/mcp test:integration`.

### Permission setup doc

A one-page `packages/mcp/PERMISSIONS.md` walking through:
- System Settings → Privacy & Security → Accessibility → enable for Terminal/iTerm/Claude Code.
- DOSBox-X config `[render] captures=` set to a known dir.
- A 5-line smoke that the helper can find and focus the DOSBox-X window.

## Risks + open items

1. **macOS Accessibility permission cliff.** CGEvent injection silently no-ops if the parent app lacks Accessibility. The helper self-checks on startup (posts a no-op event to itself, checks the return) and emits clear setup instructions.

2. **DOSBox-X save-state slot mechanism may differ from upstream DOSBox.** "Cycle slot with Alt+F4 / save with Ctrl+F5" is the stock-DOSBox model; DOSBox-X may have different defaults or use a Mapper Editor binding. Verify during implementation; if needed, ship a wiz6.conf snippet that sets known scancodes for slot 0..9 + save + load.

3. **Captures directory path.** DOSBox-X's `[render] captures=` defaults vary by platform. The MCP server reads `tools/dosbox/wiz6.conf` for this value at startup. One-time config tweak documented in PERMISSIONS.md.

4. **Focus stealing.** If the user clicks away mid-batch, subsequent CGEvents go to the wrong window. v1 detects this and aborts with a retry-friendly error. Future enhancement: `CGEventPostToPid` posts targeted events that don't require focus — verify viability during impl and switch if it works.

5. **Inter-key timing.** DOSBox-X's emulated BIOS polls the keyboard at a finite rate; too-fast bursts drop keys. Default 30ms inter-key delay should be safe; tune during the spike target run.

6. **Cross-platform deferral.** v1 is macOS-only. The platform-specific code is encapsulated in the Swift helper + a small `platform.ts`; Linux (xdotool) and Windows (SendInput) ports drop in at the same boundary.

7. **No regression of existing save-state-backed tools.** The new code touches only currently-stubbed paths. Add an explicit regression test that the existing 11 real tools pass before and after the new code lands.

8. **The 9 debugger-driving stubs (`pause`, `resume`, `step`, `step_over`, `run_until`, breakpoints) remain stubs.** This spec routes around the debugger; those tools still require either the deferred ncurses scraper or a DOSBox-X patch. File a follow-up TODO documenting the remaining gap.

## Non-goals

- True headless operation (offscreen rendering). Visible window is fine per the constraint Nate set.
- Linux + Windows automation. Same module shape, deferred.
- Replacing or driving DOSBox-X's debugger. That's a separate, harder problem the original spec already documented.
- Real-time / sub-frame input timing. Wiz6 is turn-based; ~30ms per event is plenty.
- Multiple concurrent DOSBox-X sessions. v1 assumes one DOSBox-X at a time.

## TODO follow-ups created by this work

- **#063 — Linux + Windows ports of the input/window/screenshot helpers** (xdotool / SendInput). Same module interfaces.
- **#064 — Drive the DOSBox-X debugger via node-pty + ncurses scraper** (or a DOSBox-X patch with a TCP control port). Re-opens the 9 still-stubbed debugger-driving tools.
- **#065 — Visual regression harness for headless playthroughs** (compare agent-driven screenshot sequences against committed reference sequences for regression testing on game flow).
