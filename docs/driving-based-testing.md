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
| **DOSBox** (MCP + `build-saves`) | the ORIGINAL engine | PRODUCE ground truth (saves → fixtures); RE; reach an engine state | n/a — it *is* the source of truth |

Rule of thumb: **capture/define ground truth on DOSBox; gate the port in the
browser.** The browser test compares our render to the fixture the DOSBox surface
produced.

## Promote an interactive drive → a committed gate

### Browser (a ported screen)
1. Drive interactively: `pnpm --filter @wiz6/viewer test:e2e <spec> -- --headed`,
   or a scratch spec using `e2e/lib/drive.ts` (`gotoCreation`, `pressKeys`).
2. On success, save the key sequence into a `*.spec.ts` as `pressKeys(page, [...])`.
3. Ensure the engine fixture exists (capture it via the DOSBox recipe below).
4. Assert: `await expectCanvasMatchesFixture(page, '<fixture>')` (tolerance 0).

See `packages/viewer/e2e/README.md` for the harness + the DEV-only injection hook.

### DOSBox (an engine state / a fixture)
1. Drive interactively via the MCP tools (`dosbox_launch` / `dosbox_send_input` /
   `dosbox_screenshot`) until the engine is at the target state.
2. Encode the verified key macros as a `SaveStateRecipe` in
   `tools/dosbox/state-catalog.ts`.
3. Build it: `pnpm tsx tools/dosbox/build-saves.ts <name> --slot N`
   (run from an **Accessibility-granted terminal** — synthetic keys need it).
4. Capture the fixture:
   `pnpm tsx tools/parity/gen-fixture.ts --save N --name <fixture>`.
5. Commit the `.idx.gz`/`.png` and wire it into a parity test.

See `tools/dosbox/README.md` for the catalog + the determinism caveat (creation
recipes reach the right *screen*, not a specific stat roll; castle recipes are
exact).

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
| `tools/dosbox/state-catalog.ts` | named drive recipes (the catalog) | DOSBox |
| `tools/dosbox/build-saves.ts` | materialize a recipe → save slot | DOSBox |
| `packages/mcp/src/dosbox/stable-frame.ts` | `waitForStableFrame` settle-poll | both (builder + `dosbox_screenshot --settle`) |
| `tools/parity/gen-fixture.ts` | save → committed `.idx.gz`/`.png` fixture | DOSBox → both |
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
