# Driving-based automated testing — Browser e2e (sub-project #1)

**Date:** 2026-05-31
**Status:** Design approved; ready for implementation plan.

## Why

Manual browser smoke is valuable but slow and fallible: it slows the feedback
cycle, and a human can miss steps, run the wrong steps, or test shallowly. This
session proved the cost — the spell-picker shipped with a blank char sheet
because the only automated gate (vitest `renderCreationFrame`) rendered composers
directly and never mounted the real app. A browser that drives the *actual* app
by keyboard and pixel-compares the canvas to engine ground truth catches that
whole class of integration bug (component↔composer divergence, missing props,
key-handler wiring, asset loading, routing) — automatically, reproducibly, and
as often as we like.

## Scope and decomposition

The broader "driving-based testing" vision spans three related-but-separable
subsystems. This spec covers **only #1**; #2 and #3 get their own specs.

1. **Browser e2e screen-driving (THIS SPEC).** Drive the real React app via
   Playwright, pixel-assert the canvas against engine fixtures, smoke the flow.
2. **DOSBox driving + save-state library + un-throttle (future spec).** Orchestrator-
   side RE/fixture-capture tooling: reusable saved states, reliable settled
   screenshots, MCP ergonomics.
3. **Interactive↔automated convergence (cross-cutting convention).** A one-off
   interactive drive should be cheaply convertible into a committed test. Not a
   standalone build — it's a convention + shared helpers documented inside #1
   (and later #2).

## Existing infrastructure (reused, not rebuilt)

- `@playwright/test` dep + `pnpm --filter @wiz6/viewer test:e2e`.
- `packages/viewer/playwright.config.ts` — auto-starts `vite --port 5199` as the
  `webServer` (bypasses the `predev` re-extract; 120s compile budget).
- `packages/viewer/e2e/parity.spec.ts` — the template: `page.goto(route)` →
  `waitForNonBlankCanvas` → `captureCanvas(page, 'canvas')` → compare the live
  320×200 RGBA against the engine `tools/parity/fixtures/engine/<name>.idx.gz`.
- `packages/viewer/e2e/lib/canvas.ts` — `captureCanvas`, `waitForNonBlankCanvas`.
- `CreationPage` accepts a `seed` (deterministic RNG) and a `_testInitialState`
  prop (used by the vitest integration tests to jump to a screen with a known
  draft).

## Architecture

### `e2e/lib/drive.ts` (new) — shared driving primitives
Used by BOTH ad-hoc interactive exploration and committed specs (the convergence
point):
- `pressKeys(page, keys: string[])` — fire a `keydown` sequence on `window` (the
  creation screens listen there), with a short settle wait between keys so the
  canvas re-render lands before the next key / capture.
- `expectCanvasMatchesFixture(page, name: string)` — `captureCanvas(page,'canvas')`
  → load `fixtures/engine/<name>.idx.gz` → byte-exact compare the 320×200 RGBA
  (same comparison `parity.spec.ts` uses; factor the shared compare out of
  `parity.spec.ts` into `e2e/lib/canvas.ts` if not already there).
- Reuse `waitForNonBlankCanvas` as-is.

### Test-only state injection (for the inject-state focused tests)
A `window.__WIZ6_E2E_STATE__` global, read by `CreationPage` **only under
`import.meta.env.DEV`**:
```ts
// CreationPage init (dev/e2e only — Vite dead-code-eliminates this in prod builds):
const injected = import.meta.env.DEV
  ? (window as any).__WIZ6_E2E_STATE__ as CreationState | undefined
  : undefined;
const initial = _testInitialState ?? injected ?? freshState(seed);
```
- The prod container builds with `import.meta.env.DEV === false`, so the branch
  is stripped — the hook never ships. The e2e `webServer` runs `vite` (dev), so
  it's present there.
- Playwright sets it before navigation via `page.addInitScript(...)`.
- `e2e/lib/creation-states.ts` (new) — a registry of named drafts, e.g.
  `'mage-spellpick'` = the exact M-Elf Mage the `creation-spell-*` fixtures were
  captured from (name `MAGE`, race 1, sex 0, class 1, STR7/INT18/PIE11/VIT7/
  DEX9/SPD9/PER8/KAR5, portrait 0, derived hp 2 / stamina 63 / level 1 /
  age 20×365). Reuse the draft already encoded in `tools/parity/spell-screen-parity.test.ts`.

### Determinism
- Golden-path drive-from-scratch tests pin `seed` so the rolled stats are
  reproducible.
- Inject-state tests are fully fixed by the named draft.

## First deliverable — `e2e/creation-spell-pick.spec.ts`

**1 golden-path smoke** (drive-from-scratch, fixed seed): title → MASTER OPTIONS
→ CHARACTER MENU → CREATE PC → name → Elf → Male → Mage → spend bonus → karma →
portrait → skills → spell-pick → drive the school grid (←/→ between rows, ↑/↓
within a row) → drill into a school → pick two DISTINCT spells → confirm. Assert
the roster gained a character (via the page's roster read / localStorage). No
pixel parity here — this is the end-to-end flow/wiring/asset-load gate.

**6 inject-state pixel-parity tests**: `addInitScript` to inject `mage-spellpick`,
`goto` the creation route, then per fixture state:
- drive the keys to reach the state (e.g. WATER grid = ↓ from FIRE; sublist-chill
  = ↓ then Enter; etc.),
- `expectCanvasMatchesFixture(page, '<fixture>')` against the existing
  `creation-spell-pick`, `creation-spell-grid-{water,air,earth}`,
  `creation-spell-sublist-{chill,terror}` fixtures.

**No new engine fixtures** — the six already exist and the component renders via
`composeSpellScreenFrame`, so the live canvas should match byte-exact. (If a
state can't reach 100%, that's a real component bug, not a fixture issue.)

## CI posture

Deliberate-run, not default CI (matches the existing "e2e = manual feature smoke,
not in default CI" convention). Run via `pnpm --filter @wiz6/viewer test:e2e`
pre-merge for touched screens. Keeps CI fast and avoids browser-timing flakiness
in the every-commit path, while still giving a strong on-demand gate.

## Convergence convention (#3) — documented in `e2e/README.md`

The same `drive.ts` helpers power ad-hoc interactive driving (a throwaway script
the agent runs, reading screenshots step-by-step like the DOSBox loop) and the
committed specs. Promoting interactive → committed:
1. Save the key sequence into a `*.spec.ts` `pressKeys(...)` call.
2. Capture + commit the engine fixture for the target state (via
   `tools/parity/gen-fixture.ts` from a DOSBox save).
3. Add `expectCanvasMatchesFixture(page, '<name>')`.

## Non-goals (YAGNI)

- **No browser MCP server.** The spec-based path covers the need; revisit only
  if frequent step-by-step interactive driving emerges as a real pain.
- **No exploratory/fuzz "play thousands of times" monkey-testing.** Compelling
  future extension; the first spec is deterministic parity + smoke.
- **No DOSBox tooling** (save-state library, un-throttle) — sub-project #2.

## Success criteria

- `e2e/lib/drive.ts` + `e2e/lib/creation-states.ts` exist and are reused by the
  spec.
- `CreationPage` reads `window.__WIZ6_E2E_STATE__` only under `import.meta.env.DEV`;
  prod build verified to strip it.
- `e2e/creation-spell-pick.spec.ts`: the golden-path smoke passes (roster gains a
  Mage with 2 distinct spell picks), and all 6 inject-state tests pixel-match the
  existing fixtures at 100%.
- `e2e/README.md` documents the run command + the interactive→committed recipe.
- A deliberate-injected component bug (e.g. revert the portrait overlay) makes the
  relevant e2e test fail — proving the gate catches what the vitest gate missed.

## Risks

- **Browser timing / flakiness** — mitigate with `waitForNonBlankCanvas` + a
  settle wait in `pressKeys`; deliberate-run (not every-commit) limits blast radius.
- **Injection-hook prod leakage** — mitigated by the `import.meta.env.DEV` guard;
  the success criteria require verifying the prod build strips it.
- **Golden-path fragility** — by design only ONE full drive-from-scratch test; the
  bulk are inject-state and robust to upstream-screen changes.
