# DOSBox save-state library

Reproducible drive-recipes for parking the engine at a known state, so RE and
fixture capture don't re-drive from scratch. **Recipes are the committed
library** (`state-catalog.ts`); `tools/dosbox/save/*.sav` are gitignored,
disposable, built on demand.

## Build a state

```bash
pnpm tsx tools/dosbox/build-saves.ts <name> [--slot N=1] [--force]
pnpm tsx tools/dosbox/build-saves.ts --all     # build the whole catalog
pnpm tsx tools/dosbox/build-saves.ts --list     # list recipes (no DOSBox)
```
Then `gen-fixture.ts --save N` reads it, or MCP `dosbox_load_state N` loads it.
`--force` rebuilds even if `save/<slot>.sav` already exists (the idempotency
check is file-existence only — it does NOT verify the save is the right state).

## ⚠ Must run from an Accessibility-granted terminal

The builder drives DOSBox with synthetic keystrokes, which macOS only delivers
if the **running process has Accessibility permission** (System Settings →
Privacy & Security → Accessibility). Run it from your normal terminal (grant it
once). A process WITHOUT permission still "completes" but the keys never reach
DOSBox — you get a save of the **title screen**. See packages/mcp/PERMISSIONS.md.

## List the catalog / add a recipe

States live in `state-catalog.ts` (`STATE_CATALOG`). Add one by appending
`{ name, description, steps }` — `steps` are MCP key macros sent AFTER the title
is dismissed; the builder settles the frame (best-effort, `waitForStableFrame`)
between steps. Verify a new recipe by building it and loading the slot in the MCP
(screenshot to confirm the state), tuning the macros if a step under/over-shoots.

## Configs

`wiz6-fast.conf` (un-throttled, `cycles=max`) is used by the builder + automated
MCP launches; `wiz6.conf` stays throttled (`cycles=fixed 6000`) for human-paced
inspection.

## Determinism (verified 2026-05-31 via the MCP)

- **Castle recipes (`castle-1..6`) are byte-deterministic** — they add fixed
  PCFILE characters, so the result is identical every build.
- **Creation recipes (`mage-spellpick`, …) are NOT byte-deterministic** — the
  engine rolls stats fresh each boot. The recipe reliably reaches the right
  *screen*: for `mage-spellpick` the spell **panel** region is byte-identical to
  the `creation-spell-pick` fixture (100%), and the full frame matches 99.8%
  (the only differences are the rolled stat digits in the char sheet). So use a
  creation recipe to reach a screen state, not to reproduce a specific roll. To
  pin an exact character, vendor its `.sav`/draft rather than re-rolling.

## Requires

macOS Accessibility permission for the driving process (above).
