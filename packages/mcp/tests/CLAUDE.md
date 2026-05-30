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

- **Prefer synthesizing** the minimal artifact the code under test actually
  needs, at test time. `SaveStateBridge` only reads the `Memory` entry out of a
  save-state ZIP and searches it, so `debugger-console.test.ts` builds a tiny
  ZIP whose `Memory` member is `[filler][known pattern at a known offset]
  [filler]` — deterministic, no DOSBox, no committed binary, and it asserts the
  *exact* offset rather than "> 0".
- If you genuinely need a **real** captured save (an end-to-end integration
  smoke), vendor a stable, committed `.sav` under `packages/mcp/tests/fixtures/`
  (decoupled from the workspace, mirroring `test-fixtures/original/`) and gate
  it `skipIf(!existsSync(FIXTURE))`. Never point a test at a disposable
  `tools/dosbox/save/N.sav` slot just to make it "run".
