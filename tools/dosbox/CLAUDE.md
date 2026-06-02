# tools/dosbox/ — DOSBox-X interactive-RE workspace + recipe catalog

This directory is the **DOSBox-X interactive-RE workspace** (debugger + file-I/O
logging) plus the dosbox-pure **recipe catalog**. It is NOT a fixture/save
pipeline — fixtures are rebuilt from the pinned `test-fixtures/` image via
`tools/libretro/build-state.ts` (dosbox-pure), and the old save-state /
`build-saves` / `build-castle-saves` paths are gone.

## What lives here

- `state-catalog.ts` — **named dosbox-pure drive recipes** (`recipe-replay`,
  `pcfileFixture`, `bootCapture` shapes). `build-state.ts` consumes these to
  regenerate parity fixtures. This is the durable, committed recipe library.
- `wiz6.conf` / `wiz6-fast.conf` / `wiz6-autodrive.conf` — DOSBox-X configs
  (tracked, machine-specific absolute paths) for interactive RE sessions.
- `run-with-logging.sh`, `parse-pic-opens.sh`, `run-debug.sh` — DOSBox-X
  file-I/O logging + debugger helpers. `dosbox.log` is transient (gitignored);
  the `parse-*.sh` scripts read it.
- `save/` — DOSBox-X interactive save-state slots (`N.sav`). **Disposable
  scratch.** Used only for hand-driven RE sessions; never a fixture source.
- `capture/` — screenshots + WAVs from interactive/dev runs. **Transient.**

## Rules

- **Never commit `save/*.sav` or `capture/*`.** Both are gitignored for a reason.
  (We have committed transient WAV captures here before — don't repeat it.)
- **Never make a test read `save/N.sav` as ground truth.** Those slots get
  clobbered by hand-driving, so a bound test passes or fails on the last thing
  saved. Fixtures come from `build-state.ts`; see `tools/parity/CLAUDE.md` and
  `packages/mcp/tests/CLAUDE.md`.
