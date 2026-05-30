# Setup — macOS permissions for the wiz6 MCP server

The dynamic-driving tools (`dosbox_send_input`, `dosbox_screenshot`, etc.) use
macOS CGEvent injection to drive a visible DOSBox-X window. This requires
**Accessibility** permission for whichever app launches the MCP server.

## One-time setup

1. Open **System Settings → Privacy & Security → Accessibility**.
2. Add (or enable) the app that runs the MCP server:
   - **Claude Code**: enable `Claude.app` or the terminal binary launching it.
   - **iTerm / Terminal**: enable the terminal app you use.
3. The wiz6 MCP helper binary will then be able to post key events to other
   apps. Without this permission, CGEvent silently no-ops and you'll see
   `accessibility denied` errors from the MCP tools.

## DOSBox-X capture directory

The screenshot tool reads PNGs from DOSBox-X's captures directory, configured
via `[render] captures=` in `tools/dosbox/wiz6.conf`. If unset, defaults to
`~/Documents/DOSBox-X`.

Recommended: set an explicit path under the repo for cleaner cleanup:

```ini
[render]
captures = /Users/you/Projects/wiz6/tools/dosbox/captures
```

The MCP server reads this at startup.

## Save-state key chords

DOSBox-X's stock save/load key chords:

| Chord | Action |
|---|---|
| Ctrl+F4 | cycle to next save slot |
| Ctrl+F5 | save state to current slot / screenshot |
| Ctrl+F6 | load state from current slot |

If your DOSBox-X build uses different chords (some forks rebind these), update
the `CYCLE_KEY` / `SAVE_KEY` / `LOAD_KEY` constants in
`packages/mcp/src/dosbox/state.ts`. To check your bindings: in DOSBox-X, open
the Mapper Editor (Ctrl+F1 or via the menu) and inspect `key_save` / `key_load` /
`key_capslot`.

NOTE: Ctrl+F5 is used by stock DOSBox-X for BOTH screenshot and save-state
(context-dependent). If your build resolves them to different chords, update
the constants in `screenshot.ts` and `state.ts` accordingly.

## Verifying the setup

After permissions are granted and DOSBox-X is configured, run the smoke test:

```bash
WIZ6_MCP_INTEGRATION=1 pnpm --filter @wiz6/mcp test:integration
```

This launches DOSBox-X, sends ~30 keystrokes, takes a screenshot, and saves
state to slot 5. If the test passes, your setup is correct.

## Troubleshooting

- **`accessibility denied`**: the parent app lacks Accessibility permission
  (see step 1 above). Quit + reopen the app after enabling.
- **`no window matched appName=dosbox-x`**: DOSBox-X isn't running, or its
  window is minimized to the Dock. Bring it back on-screen.
- **`DOSBox-X did not write a screenshot`**: the captures directory is wrong
  or unwritable. Check the `[render] captures=` line in your wiz6.conf.
- **`DOSBox-X did not save state`**: the SAVE_KEY chord doesn't match your
  DOSBox-X version's binding. Check the Mapper Editor.
