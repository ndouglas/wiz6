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
via `captures=` in `tools/dosbox/wiz6.conf`. If unset, defaults to
`~/Documents/DOSBox-X`.

Recommended: set an explicit path under the repo for cleaner cleanup:

```ini
[dosbox]
captures = /Users/you/Projects/wiz6/tools/dosbox/captures
```

The MCP server reads this at startup.

## Save-state and screenshot key chords (DOSBox-X 2026.05.02, macOS)

On macOS, DOSBox-X uses **F12 as the "host key"** (default for non-Windows
builds — see `dosbox-x.reference.full.conf` and the `Select host key` item
under the `Main` menu). The save/load/screenshot bindings are host-key chords:
F12 must be HELD while the action key is pressed.

| Chord | Action | Mapper event |
|---|---|---|
| F12+s | Save state to active slot | `savestate` |
| F12+l | Load state from active slot | `loadstate` |
| F12+. | Cycle to next slot | `nextslot` |
| F12+, | Cycle to previous slot | `prevslot` |
| F12+p | Take screenshot | `scrshot` |

These were verified by reading the running app's Capture menu items via
AppleScript. DOSBox-X exposes no direct "save to slot N" chords; slots must
be navigated via cycle presses. The MCP server tracks the current slot
internally so consecutive saves to different slots only cycle the necessary
delta. `dosbox_launch` resets the tracker to slot 1 (the DOSBox-X startup
default from `saveslot = 1`).

If you've rebound any of these in the Mapper Editor (Main → Mapper editor,
or F12+M while DOSBox-X is focused), update the corresponding constants in
`packages/mcp/src/dosbox/state.ts` and `screenshot.ts`.

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
