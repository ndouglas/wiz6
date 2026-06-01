# Interactive↔automated Convergence Convention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "drive interactively → commit an automated check" workflow discoverable + standing — one canonical doc, a CLAUDE.md pointer, README cross-links.

**Architecture:** Docs only. No code; the helpers (`e2e/lib/drive.ts`, `build-saves.ts`, `state-catalog.ts`, `gen-fixture.ts`, `stable-frame.ts`, the engine fixtures) from #1/#2 are unchanged. Verification is by inspection + a newcomer-can-follow-it read.

**Tech Stack:** Markdown.

**Spec:** `docs/superpowers/specs/2026-05-31-driving-based-testing-convergence-design.md`.

---

## Task 1: Canonical doc `docs/driving-based-testing.md`

**Files:** Create `docs/driving-based-testing.md`

- [ ] **Step 1: Write the doc with all six sections**

Pull the two recipes from the existing source READMEs (`packages/viewer/e2e/README.md`, `tools/dosbox/README.md`) and consolidate. Use this skeleton, filling the prose from the spec's section descriptions:

````markdown
# Driving-based testing (the convergence convention)

Drive the *real thing* and pixel-assert it against engine ground truth. This is
how wiz6 catches the bugs unit tests structurally can't see — component↔composer
divergence, missing props, key-handler wiring, routing, asset loading. The same
helpers serve both interactive exploration and committed gates, so "I drove this
and it worked" converts cheaply into a permanent check.

> Cautionary cases (2026-05-31): the creation spell picker rendered 100% in the
> vitest composer parity yet showed a **blank char sheet** in the mounted app;
> and `MenuPickerScreen` carried its cursor across race→sex→class. Only driving
> the *real app* (browser e2e) caught both.

## Two surfaces

| Surface | What it drives | Use it to | Asserts |
|---|---|---|---|
| **Browser** (Playwright e2e) | the ported React app | verify the PORT end-to-end (mount, keys, routing, assets) | live `<canvas>` vs engine `.idx.gz` fixtures |
| **DOSBox** (MCP + `build-saves`) | the ORIGINAL engine | PRODUCE ground truth (saves → fixtures); RE; reach an engine state | n/a — it's the source of truth |

Rule of thumb: capture/define ground truth on **DOSBox**, gate the **port** in
the browser.

## Promote an interactive drive → a committed gate

### Browser (ported screen)
1. Drive interactively: `pnpm --filter @wiz6/viewer test:e2e <spec> -- --headed`,
   or a scratch spec using `e2e/lib/drive.ts` (`gotoCreation`, `pressKeys`).
2. On success, save the key sequence into a `*.spec.ts` `pressKeys(page, [...])`.
3. Ensure the engine fixture exists (capture it via the DOSBox recipe below).
4. Assert: `await expectCanvasMatchesFixture(page, '<fixture>')` (tolerance 0).
See `packages/viewer/e2e/README.md` for the harness + the injection hook.

### DOSBox (engine state / fixture)
1. Drive interactively via the MCP tools (`dosbox_launch` / `dosbox_send_input` /
   `dosbox_screenshot`) until the engine is at the target state.
2. Encode the key macros as a `SaveStateRecipe` in `tools/dosbox/state-catalog.ts`.
3. Build it: `pnpm tsx tools/dosbox/build-saves.ts <name> --slot N`
   (run from an Accessibility-granted terminal).
4. Capture the fixture: `pnpm tsx tools/parity/gen-fixture.ts --save N --name <fixture>`.
5. Commit the `.idx.gz`/`.png` and wire it into a parity test.
See `tools/dosbox/README.md` for the catalog + the determinism caveat (creation
recipes reach the right *screen*, not a specific roll; castle recipes are exact).

## When to promote / what to gate
Promote when ALL hold: (a) you've manually verified the screen/flow; (b) it has
engine ground truth (a committed fixture); (c) the behavior is gate-worthy.
- **Pixel-parity (tolerance 0)** for ported screens.
- **Behavioral smoke** for flows (loads, keys advance, roster commits).
- **Don't gate non-deterministic state** (rolled stats) — gate the deterministic
  region (e.g. the spell panel, not the rolled char-sheet digits).

## Shared-helper inventory (the convergence point)
| Helper | Role | Surface |
|---|---|---|
| `packages/viewer/e2e/lib/drive.ts` | `gotoCreation`, `pressKeys`, `expectCanvasMatchesFixture` | browser |
| `CreationPage` `window.__WIZ6_E2E_STATE__` (DEV-only) | inject a starting screen+draft | browser |
| `tools/dosbox/state-catalog.ts` | named drive recipes | DOSBox |
| `tools/dosbox/build-saves.ts` | materialize a recipe → save slot | DOSBox |
| `packages/mcp/src/dosbox/stable-frame.ts` | `waitForStableFrame` settle-poll | both (build + `dosbox_screenshot --settle`) |
| `tools/parity/gen-fixture.ts` | save → committed `.idx.gz`/`.png` fixture | DOSBox→both |
| `tools/parity/fixtures/engine/` | the engine ground-truth fixtures | both |

## Templates

### Browser e2e parity spec
```ts
import { test } from '@playwright/test';
import { gotoCreation, pressKeys, expectCanvasMatchesFixture } from './lib/drive.js';
import { mageSpellPick } from './lib/creation-states.js';

test('<screen> matches the engine fixture', async ({ page }) => {
  await gotoCreation(page, mageSpellPick);     // inject a known starting state
  await pressKeys(page, ['ArrowDown', 'Enter']); // the verified drive
  await expectCanvasMatchesFixture(page, '<fixture-name>');
});
```

### state-catalog recipe
```ts
{
  name: '<state-name>',
  description: '<what screen / why> (note any determinism caveat).',
  steps: [
    // macros sent AFTER the title is dismissed; builder settles between steps.
    'down down enter',
    // ...
  ],
  settleMs: 300, // optional extra settle before saving
}
```
````

- [ ] **Step 2: Verify the doc has all six sections + working links**

Run:
```bash
grep -cE '^## ' docs/driving-based-testing.md   # expect ≥ 6 (Two surfaces, Promote, When, Inventory, Templates + the H1 has no ##; adjust count)
grep -o 'packages/viewer/e2e/README.md\|tools/dosbox/README.md\|e2e/lib/drive.ts\|state-catalog.ts\|gen-fixture.ts' docs/driving-based-testing.md | sort -u
```
Expected: the section count matches the skeleton; every referenced path string is present (and the files exist — `ls` each).

- [ ] **Step 3: Commit**

```bash
git add docs/driving-based-testing.md
git commit -m "docs: canonical driving-based-testing convergence doc"
```

---

## Task 2: CLAUDE.md "Driving-based testing" subsection

**Files:** Modify `CLAUDE.md` (under the test-layer convention bullet)

- [ ] **Step 1: Add the subsection**

Immediately after the test-layer convention list (the bullet ending with the e2e
line that now says "Now run in CI"), add:

```markdown
- **Driving-based testing (convergence).** We catch integration-layer bugs the
  unit/parity tests can't by *driving the real thing* and pixel-asserting it
  against engine ground truth — the browser (Playwright e2e, the ported app) and
  DOSBox (MCP + `build-saves`, the original engine that produces the fixtures).
  The same helpers serve interactive driving and committed gates, so an
  interactive drive promotes cheaply to a permanent check. **Canonical guide +
  the two promotion recipes: `docs/driving-based-testing.md`.** (Browser: drive →
  save `pressKeys` into a spec → commit fixture → `expectCanvasMatchesFixture`.
  DOSBox: drive → `state-catalog.ts` recipe → `build-saves` → `gen-fixture` →
  parity test.)
```

- [ ] **Step 2: Verify**

Run: `grep -n "Driving-based testing\|docs/driving-based-testing.md" CLAUDE.md`
Expected: the subsection + the pointer are present.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): driving-based testing convergence convention pointer"
```

---

## Task 3: README cross-links

**Files:** Modify `packages/viewer/e2e/README.md`, `tools/dosbox/README.md`

- [ ] **Step 1: Add a canonical-doc pointer to each README**

At the top of `packages/viewer/e2e/README.md` (after the first paragraph) add:
```markdown
> Canonical convergence guide (both surfaces, when to promote a drive to a gate):
> [`docs/driving-based-testing.md`](../../../docs/driving-based-testing.md).
```
At the top of `tools/dosbox/README.md` (after the first paragraph) add:
```markdown
> Canonical convergence guide (both surfaces, when to promote a drive to a gate):
> [`docs/driving-based-testing.md`](../../docs/driving-based-testing.md).
```
(Verify the relative depth of each link: `packages/viewer/e2e/` → repo root is
`../../../`; `tools/dosbox/` → `../../`.)

- [ ] **Step 2: Verify**

Run: `grep -l "docs/driving-based-testing.md" packages/viewer/e2e/README.md tools/dosbox/README.md`
Expected: both files listed.

- [ ] **Step 3: Commit**

```bash
git add packages/viewer/e2e/README.md tools/dosbox/README.md
git commit -m "docs: cross-link e2e + dosbox READMEs to the canonical convergence doc"
```

---

## Self-Review

**Spec coverage:** canonical doc with all six sections + both recipes + both
templates (Task 1) ✓; CLAUDE.md subsection pointing to it (Task 2) ✓; README
cross-links (Task 3) ✓; no code changed (docs only) ✓. Success criterion
(newcomer: CLAUDE.md → doc → promote a drive) is satisfied by Task 2's pointer +
Task 1's recipes.

**Placeholder scan:** `<screen>`, `<fixture-name>`, `<state-name>` etc. are
intentional template placeholders inside the doc's copy-paste skeletons (that's
their purpose), not plan gaps. The grep counts in verification steps are
approximate ("≥6 / adjust count") because the exact `##` total depends on final
heading choices — the check is "all sections present," not a magic number.

**Type consistency:** the doc + templates reference real, existing symbols —
`gotoCreation`, `pressKeys`, `expectCanvasMatchesFixture`, `mageSpellPick`
(`e2e/lib/`), `SaveStateRecipe` fields `name`/`description`/`steps`/`settleMs`
(`state-catalog.ts`), `build-saves.ts`, `gen-fixture.ts --save/--name`. All match
the code shipped in #1/#2.
