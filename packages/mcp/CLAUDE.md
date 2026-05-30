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

Fixes in place:
- `Window.swift focusWindow` sets the app's **`AXFrontmost`** attribute (the
  System Events `set frontmost` mechanism) — reliable even when another app is
  active.
- `withFocusedDosbox` **does NOT restore prior focus** — it leaves DOSBox
  frontmost. The old restore flipped focus back to the editor after each call,
  which dropped guest keys (Enter/arrows) before the emulator processed them
  and caused a DOSBox<->editor flicker. Removed (530368b).

### Driving (just use the MCP tools)
Each `dosbox_send_input` / `dosbox_screenshot` call AX-force-frontmosts DOSBox
and **leaves it frontmost**, so synthetic keys land and there's no flicker — no
`osascript` dance needed. DOSBox stays frontmost after driving; click back to
your editor when done.
- Still screenshot **before every Enter** when mapping unfamiliar menus — don't
  batch `down down enter` blind; the castle menu cursor can surprise you.
- If a guest key ever misses right after a focus change, the AX-force may need a
  beat to settle: a redundant `dosbox_screenshot` (it polls) or a repeat send
  before the key covers it.

NOTE: changes to this layer need a Claude Code restart to reach the running MCP
child. `build-castle-saves.ts` still uses old blind macros — rewrite to single
keys; it can now drive unattended since focus is no longer restored.

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
