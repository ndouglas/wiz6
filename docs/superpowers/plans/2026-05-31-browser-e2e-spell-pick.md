# Browser e2e Screen-Driving (Spell Picker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the creation spell-picker a real-browser pixel-parity gate — Playwright drives the actual app by keyboard and compares the live canvas to the engine fixtures — closing the integration-layer gap the vitest gate can't see.

**Architecture:** A guarded JSON state-injection hook in `CreationPage` (DEV-only) lets tests jump to a known screen; shared `e2e/lib/drive.ts` helpers (`pressKeys`, `expectCanvasMatchesFixture`) drive + assert; `e2e/creation-spell-pick.spec.ts` runs one golden-path drive-from-scratch smoke plus six inject-state pixel-parity checks against the existing `creation-spell-*` fixtures.

**Tech Stack:** Playwright (`@playwright/test`, already a dep), the existing `e2e/lib/canvas.ts` (`captureCanvas`/`waitForNonBlankCanvas`) + `tools/parity/diff-image.ts` (`compareRgba`) + `tools/parity/decode-screen.ts` (`indicesToRgba`), Vite (`import.meta.env.DEV`).

**Spec:** `docs/superpowers/specs/2026-05-31-driving-based-testing-browser-e2e-design.md`.

**Prerequisite (run once):** `pnpm --filter @wiz6/viewer exec playwright install chromium` (installs the browser the e2e webServer drives).

---

## File Structure

- `packages/viewer/src/pages/roster/creation/state.ts` — add the pure `mergeInjectedState` helper.
- `packages/viewer/src/pages/roster/creation/CreationPage.tsx` — call it in the reducer initializer under `import.meta.env.DEV`.
- `packages/viewer/tests/pages/roster/creation/state.test.ts` (or existing state test file) — unit-test `mergeInjectedState`.
- `packages/viewer/e2e/lib/creation-states.ts` — NEW: named JSON state partials (`mageSpellPick`).
- `packages/viewer/e2e/lib/drive.ts` — NEW: `pressKeys`, `expectCanvasMatchesFixture`, `loadFixtureRgba`.
- `packages/viewer/e2e/creation-spell-pick.spec.ts` — NEW: the spec.
- `packages/viewer/e2e/README.md` — NEW (or append): run command + interactive→committed recipe.

---

## Task 1: DEV-only state-injection hook

**Files:**
- Modify: `packages/viewer/src/pages/roster/creation/state.ts`
- Modify: `packages/viewer/src/pages/roster/creation/CreationPage.tsx`
- Test: `packages/viewer/tests/pages/roster/creation/state.test.ts`

- [ ] **Step 1: Write the failing test for `mergeInjectedState`**

In `state.test.ts` (create if absent; mirror sibling test imports):
```ts
import { describe, it, expect } from 'vitest';
import { initialCreationState, mergeInjectedState } from '../../../../src/pages/roster/creation/state.js';
import { WichmannHill } from '@wiz6/data';

describe('mergeInjectedState', () => {
  const base = () => initialCreationState(new WichmannHill(3000, 1, 29999));

  it('returns base unchanged when injected is undefined', () => {
    const b = base();
    expect(mergeInjectedState(b, undefined)).toBe(b);
  });

  it('overlays screen + draft fields, preserving the base rng and untouched draft fields', () => {
    const b = base();
    const merged = mergeInjectedState(b, { screen: 'spellPick', draft: { name: 'MAGE', class: 1 } });
    expect(merged.screen).toBe('spellPick');
    expect(merged.draft.name).toBe('MAGE');
    expect(merged.draft.class).toBe(1);
    expect(merged.rng).toBe(b.rng);               // live rng preserved (not serialized)
    expect(merged.draft.skills).toEqual(b.draft.skills); // untouched draft field kept
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (mergeInjectedState undefined)**

Run: `pnpm --filter @wiz6/viewer test state.test`
Expected: FAIL — `mergeInjectedState` is not exported.

- [ ] **Step 3: Implement `mergeInjectedState` in `state.ts`**

Add near the other state helpers:
```ts
/**
 * Overlay a JSON-serializable partial state (e.g. an e2e injection of
 * { screen, draft }) onto a freshly-built base state. The base supplies the
 * live `rng` (a WichmannHill instance, NOT JSON-serializable) and all default
 * fields; the partial overlays screen + selected draft fields. Returns `base`
 * unchanged when `injected` is falsy.
 */
export function mergeInjectedState(
  base: CreationState,
  injected: (Partial<CreationState> & { draft?: Partial<DraftState> }) | undefined,
): CreationState {
  if (!injected) return base;
  return {
    ...base,
    ...injected,
    draft: { ...base.draft, ...(injected.draft ?? {}) },
  };
}
```
(Ensure `CreationState` and `DraftState` are exported from this module — they already are, since other files import them.)

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm --filter @wiz6/viewer test state.test`
Expected: PASS.

- [ ] **Step 5: Wire the hook into `CreationPage` (DEV-only)**

In `CreationPage.tsx`, replace the reducer initializer:
```ts
  const [state, dispatch] = useReducer(creationReducer, undefined, () => {
    if (_testInitialState) return _testInitialState;
    const base = initialCreationState(rng, { pinMaxBonusRoll: getHouseRules().pinMaxBonusRoll });
    // E2E-only: a Playwright test may inject a starting { screen, draft } via a
    // window global. Guarded by import.meta.env.DEV so Vite strips it from the
    // production build (verified in Task 4).
    if (import.meta.env.DEV) {
      const injected = (globalThis as { __WIZ6_E2E_STATE__?: Partial<CreationState> & { draft?: Partial<DraftState> } }).__WIZ6_E2E_STATE__;
      if (injected) return mergeInjectedState(base, injected);
    }
    return base;
  });
```
Add `mergeInjectedState` (and `DraftState` if not already a type import) to the `state.js` import. Keep `initialCreationState`/`getHouseRules` imports as they are.

- [ ] **Step 6: Run the creation test suites — expect no regression**

Run: `pnpm --filter @wiz6/viewer test CreationPage && pnpm --filter @wiz6/viewer test state.test`
Expected: PASS (the injection branch is inert when no global is set).

- [ ] **Step 7: Commit**

```bash
cd /Users/nathan/Projects/ndouglas/wiz6
git add packages/viewer/src/pages/roster/creation/state.ts packages/viewer/src/pages/roster/creation/CreationPage.tsx packages/viewer/tests/pages/roster/creation/state.test.ts
git commit -m "feat(creation): DEV-only e2e state-injection hook (mergeInjectedState + window global) (#test-e2e)"
```

---

## Task 2: Named state registry + `drive.ts` helpers

**Files:**
- Create: `packages/viewer/e2e/lib/creation-states.ts`
- Create: `packages/viewer/e2e/lib/drive.ts`

- [ ] **Step 1: Create the named-state registry**

`packages/viewer/e2e/lib/creation-states.ts` — the JSON partial for the fixture Mage (mirror `tools/parity/spell-screen-parity.test.ts`'s `mageDraft()`; portrait 0 + age 20×365 are fixture-critical):
```ts
import type { CreationState, DraftState } from '../../src/pages/roster/creation/state.js';

/** Injection partial = { screen, draft } only (JSON-serializable; no rng). */
export type CreationStatePartial = Partial<CreationState> & { draft?: Partial<DraftState> };

/**
 * The exact M-Elf Mage the creation-spell-* engine fixtures were captured from.
 * Must match tools/parity/spell-screen-parity.test.ts's mageDraft(). Portrait 0
 * and derived.age = 20*365 are fixture-critical (the char sheet shows AGE 20).
 */
export const mageSpellPick: CreationStatePartial = {
  screen: 'spellPick',
  draft: {
    name: 'MAGE',
    race: 1, // Elf
    sex: 0, // Male
    class: 1, // Mage
    attributes: { str: 7, int: 18, pie: 11, vit: 7, dex: 9, spd: 9, per: 8, kar: 5 },
    bonusPool: 0,
    portrait: 0,
    spellPicks: [],
    derived: { hpInitial: 2, stamina: 63, level: 1, secondAge: 1, age: 20 * 365 },
  },
};
```
(If `DraftState.derived` requires more fields under `exactOptionalPropertyTypes`, copy the exact `derived` object from `spell-screen-parity.test.ts`'s `mageDraft()` so the two stay identical.)

- [ ] **Step 2: Create the driving helpers**

`packages/viewer/e2e/lib/drive.ts`:
```ts
import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { resolve, join } from 'path';
import { captureCanvas, waitForNonBlankCanvas } from './canvas.js';
import { compareRgba } from '../../../tools/parity/diff-image.js';
import { indicesToRgba } from '../../../tools/parity/decode-screen.js';
import type { CreationStatePartial } from './creation-states.js';

const REPO_ROOT = resolve(new URL(import.meta.url).pathname, '..', '..', '..', '..');
const FIXTURES_ENGINE = join(REPO_ROOT, 'tools', 'parity', 'fixtures', 'engine');

/** Inject a creation state BEFORE navigation, then goto the creation route. */
export async function gotoCreation(page: Page, injected?: CreationStatePartial): Promise<void> {
  if (injected) {
    await page.addInitScript((s) => {
      (window as unknown as { __WIZ6_E2E_STATE__: unknown }).__WIZ6_E2E_STATE__ = s;
    }, injected);
  }
  await page.goto('/castle/character-menu');
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);
}

/** Fire a keydown sequence on window, settling between keys. */
export async function pressKeys(page: Page, keys: string[]): Promise<void> {
  for (const key of keys) {
    await page.keyboard.press(key);
    await page.waitForTimeout(60); // let the canvas re-render before the next key/capture
  }
}

/** Load a committed engine fixture as a 320×200 RGBA buffer. */
export function loadFixtureRgba(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(join(FIXTURES_ENGINE, `${name}.idx.gz`)));
  if (raw.length !== 64000) throw new Error(`Fixture "${name}": expected 64000 bytes, got ${raw.length}`);
  return indicesToRgba(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
}

/**
 * Assert the live <canvas> matches the named engine fixture. Defaults to
 * byte-exact (tolerance 0) — the canvas getImageData returns the exact
 * putImageData buffer. Raise tolerance only with a documented reason.
 */
export async function expectCanvasMatchesFixture(page: Page, name: string, tolerance = 0): Promise<void> {
  const cap = await captureCanvas(page, 'canvas');
  expect(cap.width).toBe(320);
  expect(cap.height).toBe(200);
  const result = compareRgba(new Uint8Array(cap.rgba), loadFixtureRgba(name), { tolerance });
  expect(result.matchPct, `${name}: ${result.matchPct.toFixed(2)}% match`).toBe(100);
}
```
(Verify the `REPO_ROOT` depth: `e2e/lib/` → repo root is four `..` up from the file. Adjust if `expectCanvasMatchesFixture` throws a fixture-not-found at run time in Task 3.)

- [ ] **Step 3: Commit**

```bash
git add packages/viewer/e2e/lib/creation-states.ts packages/viewer/e2e/lib/drive.ts
git commit -m "feat(e2e): drive.ts helpers (pressKeys, expectCanvasMatchesFixture) + creation-states registry (#test-e2e)"
```

---

## Task 3: The spell-pick e2e spec

**Files:**
- Create: `packages/viewer/e2e/creation-spell-pick.spec.ts`

Key codes: the creation screens map ArrowUp/Down/Left/Right/Enter; Playwright key
names are `'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Enter'`.

- [ ] **Step 1: Write the inject-state pixel-parity tests**

```ts
import { test } from '@playwright/test';
import { gotoCreation, pressKeys, expectCanvasMatchesFixture } from './lib/drive.js';
import { mageSpellPick } from './lib/creation-states.js';

// Reaching each fixture state from the spellPick start (cursor on FIRE, grid mode).
// Grid: ←/→ = ±3 (between rows), ↑/↓ = ±1 within a row. Layout row0 FIRE/WATER/AIR,
// row1 EARTH/MENTAL/MAGIC. ENTER drills into a school's sub-list; ↑/↓ then move the
// spell cursor.
const GRID_CASES: Array<{ fixture: string; keys: string[] }> = [
  { fixture: 'creation-spell-pick',       keys: [] },                       // FIRE (start)
  { fixture: 'creation-spell-grid-water', keys: ['ArrowDown'] },            // WATER
  { fixture: 'creation-spell-grid-air',   keys: ['ArrowDown', 'ArrowDown'] },// AIR
  { fixture: 'creation-spell-grid-earth', keys: ['ArrowRight'] },           // EARTH
];
const SUBLIST_CASES: Array<{ fixture: string; keys: string[] }> = [
  { fixture: 'creation-spell-sublist-chill',  keys: ['ArrowDown', 'Enter'] },             // WATER → drill → spell 0
  { fixture: 'creation-spell-sublist-terror', keys: ['ArrowDown', 'Enter', 'ArrowDown'] },// WATER → drill → spell 1
];

for (const c of [...GRID_CASES, ...SUBLIST_CASES]) {
  test(`spell-pick full-screen parity — ${c.fixture}`, async ({ page }) => {
    await gotoCreation(page, mageSpellPick);
    await pressKeys(page, c.keys);
    await expectCanvasMatchesFixture(page, c.fixture);
  });
}
```

- [ ] **Step 2: Run the inject-state tests**

Run: `pnpm --filter @wiz6/viewer test:e2e -- creation-spell-pick`
Expected: 6 passing (byte-exact). If a case is <100%, the live component diverges
from the fixture — debug the component, not the threshold. If fixtures aren't
found, fix `REPO_ROOT` depth in `drive.ts`.

- [ ] **Step 3: Add the golden-path drive-from-scratch smoke**

Append to the spec. Reuse the key sequence the vitest integration test drives
(`CreationPage.integration.test.tsx`, Fighter happy-path + Mage caster path),
translated to Playwright keys. Pin the seed via the route query (`?seed=` is not
wired — instead inject only `{ draft: {} }`? No: the golden path must NOT inject
state — it drives from the menu). Drive deterministically by spending the bonus
to a fixed distribution:
```ts
test('golden path: create a Mage and pick two distinct spells end-to-end', async ({ page }) => {
  await gotoCreation(page); // no injection — start at the real character menu
  // CHARACTER MENU → CREATE PC (cursor starts on EXIT; up + left×2 reaches CREATE PC)
  await pressKeys(page, ['ArrowUp', 'ArrowLeft', 'ArrowLeft', 'Enter']);
  // NAME: type "GROND" + Enter
  await pressKeys(page, ['G', 'R', 'O', 'N', 'D', 'Enter']);
  // RACE: Enter (HUMAN) ; SEX: Enter (MALE)
  await pressKeys(page, ['Enter', 'Enter']);
  // PROFESSION: down to MAGE (FIGHTER, MAGE = 1 down) + Enter
  await pressKeys(page, ['ArrowDown', 'Enter']);
  // BONUS: drain the pool onto STR (30 ArrowRights cover any pool; reducer caps), Enter
  await pressKeys(page, Array(30).fill('ArrowRight'));
  await pressKeys(page, ['Enter']);
  // KARMA: Enter ; PORTRAIT: Enter
  await pressKeys(page, ['Enter', 'Enter']);
  // SKILLS: 30 ArrowRights to drain budget, Enter to exit → spell pick
  await pressKeys(page, Array(30).fill('ArrowRight'));
  await pressKeys(page, ['Enter']);
  // SPELL PICK: FIRE drill+pick, ArrowDown to WATER, drill+pick → SPELLS_DONE
  await pressKeys(page, ['Enter', 'Enter', 'ArrowDown', 'Enter', 'Enter']);
  // CONFIRM: Enter (YES)
  await pressKeys(page, ['Enter']);
  // Assert a character was committed (roster persisted to localStorage).
  const count = await page.evaluate(() => {
    const raw = localStorage.getItem('wiz6.roster'); // confirm the actual key in roster-store.ts
    return raw ? (JSON.parse(raw).characters?.length ?? 0) : 0;
  });
  expect(count).toBeGreaterThan(0);
});
```
**Before running:** confirm two things in the codebase and fix the spec to match —
(a) the exact CHARACTER MENU cursor start + key path to CREATE PC (read
`CharacterMenuScreen`/the menu nav), and (b) the localStorage roster key (read
`packages/viewer/src/lib/*roster*store*.ts`). The vitest integration test's
`readRoster()` helper shows the canonical read.

- [ ] **Step 4: Run the full spec**

Run: `pnpm --filter @wiz6/viewer test:e2e -- creation-spell-pick`
Expected: 7 passing (6 parity + 1 golden path). Debug the golden-path key
sequence against screenshots (`--headed` or `saveCanvasPng`) if a screen doesn't
advance as expected.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/e2e/creation-spell-pick.spec.ts
git commit -m "test(e2e): creation spell-picker — golden-path smoke + 6 inject-state pixel-parity (#test-e2e)"
```

---

## Task 4: Docs + prod-strip verification + the success-criterion check

**Files:**
- Create: `packages/viewer/e2e/README.md`

- [ ] **Step 1: Verify the injection hook is stripped from the prod build**

Run a production build and confirm the global name does not survive:
```bash
pnpm --filter @wiz6/viewer build
grep -rc "__WIZ6_E2E_STATE__" packages/viewer/dist/ || echo "absent (good)"
```
Expected: `absent (good)` (Vite dead-code-eliminates the `import.meta.env.DEV` branch). If present, the guard isn't working — wrap the hook so the dead branch is statically removable, and re-check.

- [ ] **Step 2: Prove the gate catches what the vitest gate missed (success criterion)**

Temporarily revert the portrait-glyph overlay in
`packages/viewer/src/pages/roster/creation/ega/compose-spell-screen-frame.ts`
(comment out the 3×3 `puts(...)` loop), then:
```bash
pnpm --filter @wiz6/viewer test:e2e -- creation-spell-pick
```
Expected: the parity tests FAIL (portrait region differs). Restore the loop;
re-run → green. This confirms the e2e catches a real component regression the
panel-region vitest gate could not. (Do not commit the revert.)

- [ ] **Step 3: Write `e2e/README.md`**

```markdown
# Viewer e2e (Playwright)

Real-browser screen driving + canvas pixel-parity. Deliberate-run (NOT in default
CI) per the project convention — run pre-merge for touched screens.

## Run
    pnpm --filter @wiz6/viewer exec playwright install chromium   # once
    pnpm --filter @wiz6/viewer test:e2e                           # all specs
    pnpm --filter @wiz6/viewer test:e2e -- creation-spell-pick    # one spec
    pnpm --filter @wiz6/viewer test:e2e -- --headed               # watch it drive

## How it works
- `playwright.config.ts` auto-starts `vite --port 5199`.
- Screens render to a <canvas> + listen on `window` keydown.
- `e2e/lib/drive.ts`: `gotoCreation` (optional DEV-only state injection via
  `window.__WIZ6_E2E_STATE__`), `pressKeys`, `expectCanvasMatchesFixture`
  (byte-exact vs `tools/parity/fixtures/engine/<name>.idx.gz`).
- `e2e/lib/creation-states.ts`: named JSON state partials.

## Interactive → committed (the convergence recipe)
The same helpers drive ad-hoc exploration and committed specs. To promote an
interactive drive into a gate:
1. Save the key sequence into a `*.spec.ts` `pressKeys(...)` call.
2. Capture + commit the engine fixture for the target state:
   `pnpm tsx tools/parity/gen-fixture.ts --save <N> --name <fixture>`.
3. Add `await expectCanvasMatchesFixture(page, '<fixture>')`.
```

- [ ] **Step 4: Commit**

```bash
git add packages/viewer/e2e/README.md
git commit -m "docs(e2e): run command + interactive→committed convergence recipe (#test-e2e)"
```

---

## Self-Review

**Spec coverage:** drive.ts helpers (Task 2) ✓; DEV-guarded `window.__WIZ6_E2E_STATE__` injection (Task 1) ✓; `creation-states.ts` mage-spellpick reusing the fixture draft (Task 2) ✓; spec with 1 golden-path + 6 inject-state parity reusing existing fixtures (Task 3) ✓; README convergence recipe (Task 4) ✓; deliberate-run posture (README) ✓; prod-strip + reverted-bug success criteria (Task 4) ✓. All spec sections covered.

**Placeholder scan:** No TBD/“handle errors”. Two explicit *verify-against-codebase* steps remain (Task 3 Step 3: CHARACTER MENU key path + roster localStorage key; Task 2 Step 2: `REPO_ROOT` depth) — these are real lookups with the canonical source named (the integration test / roster store), not hand-waving, because the exact menu nav + storage key must be read from current code rather than guessed.

**Type consistency:** `mergeInjectedState(base, injected)` (Task 1) ↔ `CreationStatePartial` (Task 2) ↔ `mageSpellPick` (Task 2) ↔ `gotoCreation(page, injected)` (Task 2) ↔ spec usage (Task 3) all agree on `{ screen, draft }` partials. `expectCanvasMatchesFixture(page, name, tolerance=0)` signature consistent between Task 2 and Task 3.
