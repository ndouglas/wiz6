# DOSBox save-state library + unthrottling (sub-project #2)

**Date:** 2026-05-31
**Status:** Design approved; ready for implementation plan.

## Why

RE and fixture-capture repeatedly need the engine parked at a specific screen
(a caster at spell-pick, a castle with N party members, a combat round, …).
Today that means re-driving character creation / the castle flow from scratch
every time — slow, fiddly, and easy to get subtly wrong. This session leaned on
a single hand-parked save (`save 1` = Mage spell-pick) plus manual re-driving. A
**catalog of reproducible drive recipes** + an **on-demand builder** turns "drive
the whole flow again" into "build `<state>` into a slot," and **un-throttling**
(plus a settle-poll) removes the incomplete-transition screenshots that the
human-paced config causes.

## Scope

Sub-project #2 of the driving-based-testing vision (#1 browser e2e shipped; #3
interactive↔automated convergence is a cross-cutting convention). This spec is
one cohesive piece — the save-state library and unthrottling are tightly-coupled
DOSBox-driving tooling.

## Constraints (hard)

- `tools/dosbox/save/*.sav` are **gitignored, disposable scratch** — never
  committed. The library's durable artifact is the recipes (committed code); the
  `.sav` files are materialized on demand.
- The DOSBox-X MCP is cwd-bound to the main checkout (`tools/dosbox/`).
- The MCP `load_state` accepts slots **1–10** only; `gen-fixture.ts --save N`
  reads `tools/dosbox/save/N.sav`.

## Existing infrastructure (reused / generalized)

- `tools/parity/build-castle-saves.ts` — the precedent: a Node script that
  **drives DOSBox** by importing the MCP helper modules directly
  (`packages/mcp/src/dosbox/helper-client.js`, `input.js` `sendMacro`,
  `state.js` `saveStateToSlot`/`resetSlotTracking`) — no MCP server in the loop.
  Launches DOSBox, sends key macros with empirical timing waits, saves to a slot,
  idempotent per slot. This is the model the library generalizes.
- `tools/dosbox/wiz6.conf` — throttled (`cputype`/`cycles` ~386) for human
  inspection.
- The MCP `dosbox_screenshot` (live framebuffer capture).
- `tools/parity/gen-fixture.ts --save N --name <fixture>` — reads `save/N.sav`,
  writes the committed `.idx.gz`/`.png` fixture.

## Architecture

### 1. State catalog — `tools/dosbox/state-catalog.ts`
A registry of named states, each a recipe:
```ts
export interface SaveStateRecipe {
  name: string;            // e.g. 'mage-spellpick'
  description: string;     // human note (what screen / why)
  /** Key macros driving DOSBox from a fresh boot to the target state, using the
   *  MCP input key-names (the same the helper `sendMacro` accepts). */
  macros: string[];
  /** Optional extra settle (ms) after the last macro before saving. */
  settleMs?: number;
}
export const STATE_CATALOG: readonly SaveStateRecipe[] = [ /* seed entries */ ];
```
The catalog is the durable library (committed). Each recipe is self-contained
(boot → state). Adding a state = appending a recipe.

### 2. Builder — `tools/dosbox/build-saves.ts`
Generalizes `build-castle-saves.ts`. Imports the MCP helper modules directly
(no server). For a named recipe:
1. Launch DOSBox with the **fast** config (`wiz6-fast.conf`).
2. Wait for boot, then `sendMacro` the recipe's macros, settle-polling between
   transitions (see §4) so each screen is stable before the next key.
3. `waitForStableFrame`, then `saveStateToSlot(slot)`.
4. Quit DOSBox.

CLI: `pnpm tsx tools/dosbox/build-saves.ts <name> [--slot N=1] [--force]` builds
one state into slot N (default 1); `--all` iterates the catalog (each to its
default slot). On-demand materialization sidesteps the 10-slot ceiling — you
build only the state you need, then `gen-fixture --save N` or MCP `load_state N`.

### 3. Fast config — `tools/dosbox/wiz6-fast.conf`
A clone of `wiz6.conf` with un-throttled `cycles` (e.g. `cycles=max`), used by
the builder and the MCP launch for **automated** driving. `wiz6.conf` stays
throttled for human inspection. The MCP launch gains a way to select the config
(param or env) so automated runs use the fast one.

### 4. Settle-poll — `waitForStableFrame` (in `packages/mcp/src/dosbox/`)
Polls `dosbox_screenshot` until **N consecutive frames are byte-identical** (or a
timeout), confirming a transition has settled. Used by the builder before
`saveStateToSlot`. The MCP `dosbox_screenshot` tool gains an optional `settle`
flag that runs the same poll, so interactive driving (my live loop) also stops
capturing mid-transition frames. This is the robust complement to un-throttling
(fast settle **and** verified-stable capture).

## Seed catalog + castle migration

Seed with the proven states:
- `mage-spellpick` — CREATE PC → Elf → Male → Mage → spend bonus → karma →
  portrait → skills → spell-pick. (Macro sequence captured this session.)
- `priest-spellpick` — same flow, Human → Male → Priest. (Also captured this
  session; note bonus must satisfy class stat reqs.)
- **Migrate `build-castle-saves.ts`** into the catalog as `castle-1`…`castle-6`
  recipes (its N-member drive logic becomes catalog entries; the `castle-parity`
  fixtures' save inputs are unchanged — the migration preserves behavior). The
  old script becomes a thin wrapper over `build-saves.ts --all` for those names,
  or is removed once callers point at the new builder.

Alchemist / Psionic / Bishop spell-pick and other screens (combat, dungeon) are
added as recipes when RE/fixture work needs them.

## Success criteria

- `pnpm tsx tools/dosbox/build-saves.ts mage-spellpick --slot 1` produces a
  `save/1.sav` from which `gen-fixture --save 1 --name creation-spell-pick`
  reproduces the committed FIRE-grid fixture byte-for-byte (proves the recipe
  lands the exact state).
- `wiz6-fast.conf` exists; the builder uses it; a build completes noticeably
  faster than the throttled config (and no mid-transition save).
- `waitForStableFrame` is used by the builder; `dosbox_screenshot --settle`
  returns only after the frame is stable.
- `castle-1`…`castle-6` build via the new builder and still feed `castle-parity`.
- A short `tools/dosbox/README.md` (or section) documents: build a state, list
  the catalog, add a recipe.

## Risks

- **Drive fragility / timing:** upstream screen/key changes break a recipe.
  Mitigated by settle-polling (not fixed sleeps where possible) + recipes being
  small, named, and individually rebuildable; a recipe that fails to reach its
  state fails loudly (the success-criterion gen-fixture check catches drift).
- **macOS Accessibility permission** required for the driving process (same as
  `build-castle-saves`; documented in `packages/mcp/PERMISSIONS.md`).
- **Class stat requirements:** caster recipes must allocate bonus to meet the
  class's minimums before the profession is selectable; each caster recipe
  encodes its own bonus macro.
- **cycles=max determinism:** un-throttled speed must not change decoded game
  state (it shouldn't — saves capture machine state, not wall-clock); the
  gen-fixture byte-match success criterion guards this.

## Non-goals (YAGNI)

- **No save patching** (editing `.sav` memory bytes) — drive-to-state only.
- **No committing `.sav` files** — recipes are the library.
- **Not pre-building every game state** — seed + grow on demand.
- **No browser/e2e work** — that was #1.
