# Driving-based testing (the convergence convention)

Drive the *real thing* and pixel-assert it against engine ground truth. This is
how wiz6 catches the bugs unit tests structurally can't see — component↔composer
divergence, missing props, key-handler wiring, routing, asset loading. The same
helpers serve both interactive exploration and committed gates, so "I drove this
and it worked" converts cheaply into a permanent check.

> **Cautionary cases (2026-05-31).** The creation spell picker rendered 100% in
> the vitest composer parity yet showed a **blank char sheet** in the mounted
> app (the component didn't call the composer the test rendered); and
> `MenuPickerScreen` carried its cursor across race→sex→class, picking the wrong
> race/sex/class. Only driving the *real app* (browser e2e) caught both. Unit
> parity is necessary but not sufficient — it tests pieces, not the mounted whole.

## Two surfaces

| Surface | What it drives | Use it to | Asserts against |
|---|---|---|---|
| **Browser** (Playwright e2e) | the ported React app | verify the PORT end-to-end (mount, keys, routing, assets) | the live `<canvas>` vs engine `.idx.gz` fixtures |
| **dosbox-pure** (live MCP + `build-state`) | the ORIGINAL engine | PRODUCE ground truth (recipe → fixtures); RE; reach an engine state | n/a — it *is* the source of truth |

Rule of thumb: **capture/define ground truth on dosbox-pure; gate the port in the
browser.** The browser test compares our render to the fixture the dosbox-pure
surface produced.

## Promote an interactive drive → a committed gate

### Browser (a ported screen)
1. Drive interactively: `pnpm --filter @wiz6/viewer test:e2e <spec> -- --headed`,
   or a scratch spec using `e2e/lib/drive.ts` (`gotoCreation`, `pressKeys`).
2. On success, save the key sequence into a `*.spec.ts` as `pressKeys(page, [...])`.
3. Ensure the engine fixture exists (capture it via the DOSBox recipe below).
4. Assert: `await expectCanvasMatchesFixture(page, '<fixture>')` (tolerance 0).

See `packages/viewer/e2e/README.md` for the harness + the DEV-only injection hook.

### dosbox-pure (an engine state / a fixture)
1. Drive interactively via the live MCP tools (`dosbox_live_launch` /
   `dosbox_live_key` / `dosbox_live_step` / `dosbox_live_screenshot`) — headless,
   deterministic, no Accessibility/focus dance — until the engine is at the target state.
2. Encode the verified key macros as a recipe in `tools/dosbox/state-catalog.ts`
   (`recipe-replay`, `pcfileFixture`, or `bootCapture` shape).
3. Build + commit the fixture: `pnpm tsx tools/libretro/build-state.ts <name>`
   (deterministic recipe-replay), or `--mint` for a non-deterministic creation roll
   (freezes a committed `test-fixtures/states/*.state.gz` + a `.character.json` sidecar).
4. Verify it reproduces: `pnpm tsx tools/libretro/build-state.ts <name> --check`
   (re-mint + diff vs the committed fixture; 100% gate, exit 0/1).
5. Wire the `.idx.gz`/`.png` into a parity test (load the sidecar via
   `draftFromEngineDump` for minted screens).

See `tools/parity/CLAUDE.md` + the `build-state.ts` header for the recipe modes and
the non-determinism caveat (creation rolls vary run-to-run → freeze via `--mint`;
deterministic screens — menus, castle from the pinned roster — use recipe-replay).

## When to promote / what to gate

Promote when ALL hold: (a) you've manually verified the screen/flow; (b) it has
engine ground truth (a committed fixture); (c) the behavior is gate-worthy.

- **Pixel-parity (tolerance 0)** for ported screens.
- **Behavioral smoke** for flows (screen loads, keys advance state, roster
  commits) where pixel ground truth is impractical.
- **Don't gate non-deterministic state** (e.g. rolled stats) — gate the
  deterministic region (the spell *panel*, not the rolled char-sheet digits).

## Shared-helper inventory (the convergence point)

The convergence *is* that the same helpers serve interactive driving and
committed tests:

| Helper | Role | Surface |
|---|---|---|
| `packages/viewer/e2e/lib/drive.ts` | `gotoCreation`, `pressKeys`, `expectCanvasMatchesFixture` | browser |
| `CreationPage` `window.__WIZ6_E2E_STATE__` (DEV-only) | inject a starting screen + draft | browser |
| `tools/dosbox/state-catalog.ts` | named drive recipes (the catalog) | dosbox-pure |
| `tools/libretro/build-state.ts` | recipe → committed `.idx.gz`/`.png` (+ `.state.gz`/sidecar); `--check` re-mint gate | dosbox-pure → both |
| `packages/mcp/src/live/{host-client,live-session}.ts` | drive/inspect the live harness (shared by MCP + build-state) | dosbox-pure |
| `.../creation/lib/draft-from-engine-dump.ts` | load a minted `.character.json` sidecar into a render draft | dosbox-pure → parity |
| `tools/parity/fixtures/engine/` | the engine ground-truth fixtures | both |

## Templates

### Browser e2e parity spec
```ts
import { test } from '@playwright/test';
import { gotoCreation, pressKeys, expectCanvasMatchesFixture } from './lib/drive.js';
import { mageSpellPick } from './lib/creation-states.js';

test('<screen> matches the engine fixture', async ({ page }) => {
  await gotoCreation(page, mageSpellPick);        // inject a known starting state
  await pressKeys(page, ['ArrowDown', 'Enter']);  // the verified drive
  await expectCanvasMatchesFixture(page, '<fixture-name>');
});
```

### state-catalog recipe
```ts
{
  name: '<state-name>',
  description: '<what screen / why> (note any determinism caveat).',
  steps: [
    // macros sent AFTER the title is dismissed; the builder settles between steps.
    'down down enter',
    // ...
  ],
  settleMs: 300, // optional extra settle before saving
}
```
