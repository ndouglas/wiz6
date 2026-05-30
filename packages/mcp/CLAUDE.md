# packages/mcp/ — driving DOSBox-X via the MCP (hard-won findings)

The dynamic-driving tools (`dosbox_send_input`, `dosbox_screenshot`,
`dosbox_save_state`) work, but only if you understand macOS focus + the custom
mapper. These notes are the result of a long debugging saga (2026-05-30) — read
them before driving.

## macOS focus is the #1 gotcha

Synthetic key events (CGEvents) only reach the **frontmost** window. macOS
focus-stealing prevention means a background helper **cannot reliably bring
DOSBox forward with `NSRunningApplication.activate()`** — it silently no-ops
when another app (your editor, or even a shell command that briefly foregrounds
the terminal) is active. Symptoms when this bites: "keys don't reach DOSBox",
"works once then stops", screenshots return 0 bytes or stale frames.

Fixes already in place:
- `Window.swift focusWindow` now also sets the app's **`AXFrontmost`** attribute
  (the System Events `set frontmost` mechanism) — reliable regardless of what's
  active. Screenshots work because of this + the screenshot poll keeps DOSBox
  frontmost long enough.
- **BUT** `withFocusedDosbox` restores focus to the prior app after each call,
  which is too fast for *guest* keys (Enter/arrows) to register. (F9/F5/etc.
  are mapper *host* actions processed on the raw event, so they're more robust.)

### Reliable driving loop (until withFocusedDosbox stops restoring focus)
1. Force DOSBox frontmost **once**:
   `osascript -e 'tell application "System Events" to set frontmost of (first process whose name contains "dosbox") to true'`
2. Then use **only MCP tools** — `dosbox_send_input` + `dosbox_screenshot` both
   restore-to-DOSBox while it's frontmost, so focus stays put. `dosbox_screenshot`
   returns the PNG inline (no Bash → no focus theft).
3. **Re-run the force-frontmost after ANY Bash command** (Bash foregrounds the
   terminal and steals focus from DOSBox).
4. Screenshot **before every Enter** when navigating menus — don't batch
   `down down enter` blind; the castle menu cursor can surprise you.

Follow-up worth doing: make `withFocusedDosbox` hold DOSBox frontmost for the
duration of a driving session (don't restore), so the force-frontmost dance is
unnecessary and `build-castle-saves.ts` can drive unattended.

## Single-key mapper (NOT F12 chords)

`tools/dosbox/mapper-wiz6.map` (wired via `mapperfile_sdl2`, **absolute path** —
DOSBox-X resolves it relative to the config dir, and MCP launches with cwd=repo
root, so relative paths mis-resolve) rebinds host actions to bare single keys:
`F9`=screenshot, `F10`=raw screenshot, `F5`=save, `F6`=load, `F7`=prevslot,
`F8`=nextslot; guest `F5`–`F10` are unbound so they only trigger the handlers.
Synthetic F12 *host-key chords* (hold-F12 + key) deliver unreliably on macOS —
that's why we use single keys. A complete mapper file is mandatory (DOSBox-X
`ClearAllBinds` on load), generated once from the GUI editor's Save.

## Other landmines
- **Screenshot write-race**: DOSBox advances the PNG's mtime at *creation*, before
  flushing bytes. `captureScreenshot` waits for size>0 *and* stable before reading.
- **`saveStateToSlot`** writes to `tools/dosbox/save/{slot}.sav` (this DOSBox-X
  version uses flat slot filenames, not `{prog}_{slot}_{ts}.sav.zip`). `saveremark=false`
  in the conf is required, else Host+S blocks on a text-entry dialog.
- **Don't install two DOSBox-X builds**: the SDL1 `/Applications/dosbox-x.app`
  shared bundle id `com.dosbox-x` with the SDL2 cask, confusing activation. Use
  only the SDL2 cask (the MCP's default `DOSBOX_X_PATH`).
- **MCP child holds the helper binary + TS from launch** — code/helper changes
  need a Claude Code restart to take effect for the MCP tools (standalone tsx
  harnesses that spawn a fresh `HelperClient` pick them up immediately).
