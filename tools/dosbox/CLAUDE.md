# tools/dosbox/ — DOSBox-X workspace (NOT a fixture store)

This directory is a **live emulator workspace**. Two subdirs are mutable scratch
and are gitignored:

- `save/` — DOSBox-X save-state slots (`N.sav`). **Disposable.** Gameplay, the
  MCP `dosbox_save_state` tool, and `tools/parity/build-castle-saves.ts` all
  overwrite these. A slot's contents are whatever ran last — never assume.
- `capture/` — screenshots + WAVs from interactive/dev runs. **Transient.**

## Rules

- **Never commit `save/*.sav` or `capture/*`.** Both are gitignored for a reason.
  (We have committed transient WAV captures here before — don't repeat it.)
- **Never make a test read `save/N.sav` as ground truth.** Those slots get
  clobbered, so a test bound to one passes or fails based on the last thing
  saved. Vendor a stable `.sav` under the consuming package's `tests/fixtures/`
  instead — see `packages/mcp/tests/CLAUDE.md`.
- `wiz6.conf` is tracked and machine-specific (absolute paths). `captures=` must
  point at `capture/` or the MCP `dosbox_screenshot` tool returns 0 bytes.
- `dosbox.log` is transient (gitignored); the `parse-*.sh` scripts read it.
