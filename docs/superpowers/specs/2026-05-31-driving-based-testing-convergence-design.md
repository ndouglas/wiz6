# Interactive↔automated convergence convention (sub-project #3)

**Date:** 2026-05-31
**Status:** Design approved; ready for implementation plan.

## Why

The driving-based-testing vision's payoff is that "I drove this interactively and
it worked" should be cheaply convertible into a committed automated check — on
both driving surfaces. Sub-projects #1 (browser e2e) and #2 (DOSBox save-state
library) built the machinery; the recipes for promoting an interactive drive
into a gate exist but are **buried in two package READMEs** and easy to miss.
This sub-project makes the workflow **discoverable and standing** — a single
canonical doc + a CLAUDE.md pointer + copy-paste templates — so the convergence
is a first-class convention, not folklore.

## Scope

The cross-cutting convention woven through #1/#2. **Docs + templates only — no
new code.** The helpers (`packages/viewer/e2e/lib/drive.ts`, `tools/dosbox/
build-saves.ts`, `tools/dosbox/state-catalog.ts`, `tools/parity/gen-fixture.ts`,
`packages/mcp/src/dosbox/stable-frame.ts`, the `tools/parity/fixtures/engine/`
fixtures) already exist and are unchanged.

## Deliverables

### 1. `docs/driving-based-testing.md` (NEW — canonical)
Sections:
1. **Philosophy.** Drive the *real thing* and pixel-assert against engine ground
   truth; this catches the mount / prop-wiring / key-handler / routing /
   asset-loading gaps that unit tests structurally cannot. Cite this session's
   cautionary cases: the blank char-sheet (composer rendered fine in vitest, the
   mounted screen didn't) and the `MenuPickerScreen` race/sex/class carryover
   (only the browser e2e caught it).
2. **Two surfaces, when to use which.**
   - **Browser (Playwright e2e)** — the ported React app. Catches the
     integration layer. Pixel-asserts the canvas vs engine fixtures.
   - **DOSBox (MCP + `build-saves`)** — the *original engine*. PRODUCES the
     ground truth (saves → fixtures) and is the RE surface. Use it to capture a
     fixture or reach an engine state; use the browser to verify the port.
3. **The promotion recipes** (interactive → committed), consolidated as the
   canonical copy:
   - **Browser:** drive interactively (`test:e2e --headed` / a scratch spec
     using `e2e/lib/drive.ts`) → on success, save the `pressKeys` sequence into a
     `*.spec.ts` → commit the engine fixture (via the DOSBox recipe below) →
     `expectCanvasMatchesFixture`.
   - **DOSBox:** drive interactively via the MCP tools → save the state → encode
     the key macros as a `state-catalog.ts` recipe → `build-saves.ts <name>` →
     `gen-fixture.ts --save N --name <fixture>` → wire the fixture into a parity
     test. (Determinism caveat: creation recipes reach the right *screen*, not a
     specific roll — see `tools/dosbox/README.md`.)
4. **When to promote / what to gate.** Promote when (a) you've manually verified
   the screen/flow, AND (b) it has engine ground truth (a committed fixture),
   AND (c) the behavior is gate-worthy. Pixel-parity (tolerance 0) for ported
   screens; behavioral smoke for flows. Don't gate on non-deterministic state
   (rolled stats) — gate the deterministic region.
5. **Shared-helper inventory.** The convergence *is* that the same helpers serve
   interactive driving and committed tests — list each helper + its role + which
   surface(s) use it.
6. **Templates** — inline copy-paste skeletons:
   - a minimal Playwright e2e parity spec (inject state → `pressKeys` →
     `expectCanvasMatchesFixture`), and
   - a `SaveStateRecipe` entry skeleton.

### 2. CLAUDE.md — "Driving-based testing" subsection
Under the existing test-layer convention: a one-paragraph philosophy + the two
surfaces named + a pointer to `docs/driving-based-testing.md` as the canonical
source + the two recipes in one line each.

### 3. README cross-links
`packages/viewer/e2e/README.md` and `tools/dosbox/README.md` each gain a one-line
note that `docs/driving-based-testing.md` is the canonical convergence doc; their
detailed recipes stay (the canonical doc summarizes + links to them for depth).

## Success criteria

- `docs/driving-based-testing.md` exists with all six sections, the two recipes,
  and both templates.
- CLAUDE.md has the "Driving-based testing" subsection pointing to it.
- Both package READMEs cite the canonical doc.
- A reader new to the repo can, from CLAUDE.md alone, find the doc and follow it
  to promote an interactive drive into a committed gate on either surface.
- No code changed (helpers untouched); no test added or removed.

## Non-goals (YAGNI)

- **No new helper/scaffolding code** (no `new-driving-test.ts` CLI) — the helpers
  exist; templates cover the boilerplate.
- **No relocating** the existing helpers or fixtures.
- **No new tests** — this is documentation of an existing, proven workflow.
