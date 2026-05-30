# packages/mcp/tests/ — test isolation rules

## Never bind a test to the DOSBox workspace

`tools/dosbox/save/*.sav` is a **mutable scratch workspace** (see
`tools/dosbox/CLAUDE.md`): gameplay and `build-castle-saves.ts` overwrite slots
at will, and the castle parity suite reuses slots 2..6. A test that reads
`save/N.sav` directly will pass or fail depending on whatever was saved last.

This already bit `debugger-console.test.ts` — it was bound to `save/3.sav`,
which got clobbered by a party-build run. It only ever "passed" by *skipping*
when the save dir happened to be absent, masking the breakage.

## Instead

- Vendor a **stable, committed** `.sav` under `packages/mcp/tests/fixtures/`,
  decoupled from the workspace (mirrors the repo's `test-fixtures/original/`
  pattern for game binaries).
- Gate save-dependent tests with `skipIf(!existsSync(FIXTURE))` so they skip
  cleanly until the fixture is vendored — never point them at a disposable slot
  just to make the test "run".
