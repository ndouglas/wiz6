# DOSBox Save-State Library + Unthrottling Implementation Plan

> **SUPERSEDED (2026-06-02):** the save-state library path described here was replaced by the dosbox-pure live backend (`build-state.ts` rebuilds fixtures from the pinned image; recipes live in `tools/dosbox/state-catalog.ts`). See `IMPLEMENTATION_PLAN.md` and the MCP section of the repo-root `CLAUDE.md`. Retained as a historical record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Orchestrator-only steps:** any step that *runs* the builder or DOSBox-X (marked **[DRIVE]**) requires launching DOSBox-X with macOS Accessibility permission — a subagent cannot do it. The controller executes [DRIVE] steps; subagents write the code (recipes, helper, builder) and unit tests.

**Goal:** A reproducible catalog of DOSBox drive-recipes + an on-demand builder, plus an un-throttled config and a settle-poll, so RE/fixture work loads a pre-built state instead of re-driving from scratch.

**Architecture:** Recipes (committed code) drive DOSBox via the MCP helper modules (no server in the loop) under a fast config; the builder materializes a named recipe into a save slot; a frame-stable poll guards captures. `.sav` files stay disposable scratch.

**Tech Stack:** TypeScript ESM, the `packages/mcp/src/dosbox/*` helper modules (`helper-client`, `input.sendMacro`, `state.saveStateToSlot`, `screenshot.captureScreenshot`), DOSBox-X, `tsx`.

**Spec:** `docs/superpowers/specs/2026-05-31-dosbox-save-state-library-design.md`.

---

## File Structure

- `tools/dosbox/wiz6-fast.conf` — NEW: un-throttled clone of `wiz6.conf`.
- `packages/mcp/src/dosbox/stable-frame.ts` — NEW: `waitForStableFrame` (poll captures until N identical).
- `packages/mcp/tests/dosbox/stable-frame.test.ts` — NEW: unit test (pure compare logic).
- `tools/dosbox/state-catalog.ts` — NEW: `SaveStateRecipe` type + `STATE_CATALOG`.
- `tools/dosbox/build-saves.ts` — NEW: the builder (generalizes `tools/parity/build-castle-saves.ts`).
- `tools/parity/build-castle-saves.ts` — MODIFY: become a thin wrapper over the new builder (or delete once callers migrate).
- `tools/dosbox/README.md` — NEW/append: build a state, list catalog, add a recipe.

---

## Task 1: Un-throttled config

**Files:** Create `tools/dosbox/wiz6-fast.conf`

- [ ] **Step 1: Clone wiz6.conf, un-throttle [cpu]**

```bash
cd /Users/nathan/Projects/ndouglas/wiz6
cp tools/dosbox/wiz6.conf tools/dosbox/wiz6-fast.conf
```
Then edit the `[cpu]` section of `wiz6-fast.conf` (currently `cputype = 386` / `cycles = fixed 6000`) to:
```
[cpu]
cputype      = pentium_mmx
cycles       = max
```
Add a header comment at the top of `wiz6-fast.conf`:
```
# wiz6-fast.conf — un-throttled config for AUTOMATED driving (build-saves.ts +
# MCP automated launches). Transitions settle fast so screenshots aren't caught
# mid-transition. wiz6.conf stays throttled (cycles=fixed 6000) for human-paced
# inspection. Keep every OTHER section identical to wiz6.conf.
```
Leave `captures=`, `[sdl]`, autoexec, etc. identical to `wiz6.conf` (only `[cpu]` changes).

- [ ] **Step 2: Sanity-check the diff is [cpu]-only**

Run: `diff tools/dosbox/wiz6.conf tools/dosbox/wiz6-fast.conf`
Expected: only the `cputype`/`cycles` lines (+ the header comment) differ.

- [ ] **Step 3: Commit**

```bash
git add tools/dosbox/wiz6-fast.conf
git commit -m "feat(dosbox): wiz6-fast.conf — un-throttled config for automated driving"
```

---

## Task 2: `waitForStableFrame` settle-poll

**Files:**
- Create: `packages/mcp/src/dosbox/stable-frame.ts`
- Test: `packages/mcp/tests/dosbox/stable-frame.test.ts`

- [ ] **Step 1: Write the failing unit test (pure compare logic)**

`waitForStableFrame` captures frames via an injected capture fn (so it's testable without DOSBox). Test the stability logic with a fake capturer:
```ts
import { describe, it, expect } from 'vitest';
import { waitForStableFrame } from '../../src/dosbox/stable-frame.js';

const buf = (s: string) => Buffer.from(s);

describe('waitForStableFrame', () => {
  it('returns once N consecutive captures are byte-identical', async () => {
    const frames = [buf('a'), buf('b'), buf('c'), buf('c'), buf('c')];
    let i = 0;
    const capture = async () => frames[Math.min(i++, frames.length - 1)]!;
    const out = await waitForStableFrame(capture, { stableCount: 3, intervalMs: 0, timeoutMs: 1000 });
    expect(out.equals(buf('c'))).toBe(true);
    expect(i).toBe(5); // a,b,c,c,c → 3 identical 'c' at captures 3,4,5
  });

  it('throws on timeout when frames never stabilize', async () => {
    let i = 0;
    const capture = async () => buf(String(i++)); // always different
    await expect(
      waitForStableFrame(capture, { stableCount: 3, intervalMs: 0, timeoutMs: 50 }),
    ).rejects.toThrow(/did not stabilize/i);
  });
});
```

- [ ] **Step 2: Run; expect FAIL (module not found)**

Run: `pnpm --filter @wiz6/mcp test stable-frame`
Expected: FAIL.

- [ ] **Step 3: Implement `stable-frame.ts`**

```ts
/**
 * waitForStableFrame — poll a capture fn until N consecutive frames are
 * byte-identical (transition settled), or throw on timeout. Decouples the
 * stability logic from DOSBox so it's unit-testable; callers pass a capturer
 * that wraps captureScreenshot(client, capturesDir).
 */
export interface StableFrameOptions {
  /** Consecutive identical captures required (default 3). */
  stableCount?: number;
  /** Delay between captures, ms (default 120). */
  intervalMs?: number;
  /** Give up after this long, ms (default 8000). */
  timeoutMs?: number;
}

export async function waitForStableFrame(
  capture: () => Promise<Buffer>,
  opts: StableFrameOptions = {},
): Promise<Buffer> {
  const stableCount = opts.stableCount ?? 3;
  const intervalMs = opts.intervalMs ?? 120;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const deadline = Date.now() + timeoutMs;

  let last: Buffer | null = null;
  let run = 1;
  // Prime with the first capture.
  last = await capture();
  while (run < stableCount) {
    if (Date.now() > deadline) {
      throw new Error(`waitForStableFrame: frame did not stabilize within ${timeoutMs}ms`);
    }
    if (intervalMs > 0) await new Promise((r) => setTimeout(r, intervalMs));
    const next = await capture();
    if (last !== null && next.equals(last)) run += 1;
    else run = 1;
    last = next;
  }
  return last!;
}
```
Verify the loop matches the test's `i` count (prime = capture 1; then captures 2..5; identical 'c' at 3,4,5 → run reaches 3 at capture 5). If the count differs, adjust the test's `expect(i)` to the actual (the stability semantics are the contract, not the exact count).

- [ ] **Step 4: Run; expect PASS**

Run: `pnpm --filter @wiz6/mcp test stable-frame`

- [ ] **Step 5: Add an optional `settle` to the MCP screenshot tool**

In the `dosbox_screenshot` MCP tool handler (find it: `grep -rn "dosbox_screenshot" packages/mcp/src`), add an optional `settle?: boolean` (and optional `stableCount`) input. When `settle` is true, wrap the existing single capture in `waitForStableFrame(() => captureScreenshot(client, capturesDir), { stableCount })` instead of capturing once. Default `settle` false (unchanged behavior). Keep the tool's existing return shape.

- [ ] **Step 6: Run the mcp suite; commit**

Run: `pnpm --filter @wiz6/mcp test` (expect green).
```bash
git add packages/mcp/src/dosbox/stable-frame.ts packages/mcp/tests/dosbox/stable-frame.test.ts packages/mcp/src/dosbox/*screenshot* packages/mcp/src/**/*.ts
git commit -m "feat(mcp): waitForStableFrame + optional settle on dosbox_screenshot"
```
(Stage only the files you actually changed for the screenshot tool — inspect `git status` first.)

---

## Task 3: State catalog

**Files:** Create `tools/dosbox/state-catalog.ts`

- [ ] **Step 1: Define the recipe type + seed catalog**

```ts
/**
 * state-catalog.ts — named DOSBox drive recipes. The DURABLE save-state library
 * (committed); .sav files are materialized on demand by build-saves.ts. Each
 * recipe drives from a fresh boot (after the title screen) to its target state.
 *
 * Macros use the MCP input key-names accepted by sendMacro (e.g. 'enter',
 * 'down', 'right', 'up', and letters for typing). A macro string is a
 * space-separated key sequence; multiple strings run in order with a settle
 * (waitForStableFrame) between them.
 */
export interface SaveStateRecipe {
  name: string;
  description: string;
  /** Drive steps AFTER the title screen is dismissed. Each entry is one macro
   *  string; the builder settles the frame between entries. */
  steps: string[];
  /** Extra settle (ms) after the final step before saving (default 0). */
  settleMs?: number;
}

// Shared creation prologue: MASTER OPTIONS → CHARACTER MENU → CREATE PC.
// (MASTER OPTIONS cursor starts on ADD PARTY MEMBER; down×2 → CHARACTER MENU;
// in CHARACTER MENU the cursor starts on EXIT, up + left×2 → CREATE PC.)
const CREATE_PC_PROLOGUE: string[] = ['down down enter', 'up left left enter'];

export const STATE_CATALOG: readonly SaveStateRecipe[] = [
  {
    name: 'mage-spellpick',
    description:
      'M-Elf Mage parked at the creation spell picker (FIRE grid). Matches the ' +
      'creation-spell-* fixtures IF the engine stat-roll is deterministic per ' +
      'boot (verified in build-saves Task 5); otherwise a valid fresh Mage.',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'm a g e enter',        // NAME = MAGE
      'down enter',           // RACE: Elf (index 1)
      'enter',                // SEX: Male (index 0)
      'down enter',           // CLASS: Mage (index 1)
      'right right right right right right right right right right enter', // BONUS: drain pool (reducer caps), exit
      'enter',                // KARMA
      'enter',                // PORTRAIT (default)
      'right right right right right right right right right right enter', // SKILLS: drain budget, exit → spell pick
    ],
    settleMs: 300,
  },
  {
    name: 'priest-spellpick',
    description: 'M-Human Priest parked at the creation spell picker.',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'p r s t enter',        // NAME
      'enter',                // RACE: Human (index 0)
      'enter',                // SEX: Male
      'down down enter',      // CLASS: Priest (index 2)
      'right right right right right right right right right right enter', // BONUS
      'enter',                // KARMA
      'enter',                // PORTRAIT
      'right right right right right right right right right right enter', // SKILLS → spell pick
    ],
    settleMs: 300,
  },
  // castle-1..6 are appended in Task 4 Step 4 (migrated from build-castle-saves).
];

export function findRecipe(name: string): SaveStateRecipe | undefined {
  return STATE_CATALOG.find((r) => r.name === name);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @wiz6/mcp exec tsc --noEmit` is wrong scope — instead `cd tools/dosbox` has no tsconfig; verify it compiles via `pnpm tsx -e "import('./tools/dosbox/state-catalog.ts').then(m=>console.log(m.STATE_CATALOG.length))"` from repo root.
Expected: prints `2`.

- [ ] **Step 3: Commit**

```bash
git add tools/dosbox/state-catalog.ts
git commit -m "feat(dosbox): state-catalog with mage/priest spell-pick recipes"
```

---

## Task 4: The builder `build-saves.ts`

**Files:**
- Create: `tools/dosbox/build-saves.ts`
- Modify: `tools/parity/build-castle-saves.ts`

- [ ] **Step 1: Write the builder (generalize build-castle-saves.ts)**

Read `tools/parity/build-castle-saves.ts` for the launch/lifecycle/timing helpers and copy them. Key differences: launch with the **fast** config, run a recipe's `steps` with `waitForStableFrame` between them, save to the requested slot.
```ts
#!/usr/bin/env node
import { HelperClient } from '../../packages/mcp/src/dosbox/helper-client.js';
import { sendMacro } from '../../packages/mcp/src/dosbox/input.js';
import { saveStateToSlot, resetSlotTracking } from '../../packages/mcp/src/dosbox/state.js';
import { captureScreenshot } from '../../packages/mcp/src/dosbox/screenshot.js';
import { waitForStableFrame } from '../../packages/mcp/src/dosbox/stable-frame.js';
import { findRecipe, STATE_CATALOG, type SaveStateRecipe } from './state-catalog.js';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const DOSBOX_DIR = join(REPO_ROOT, 'tools', 'dosbox');
const SAVE_DIR = join(DOSBOX_DIR, 'save');
const DOSBOX_BIN = '/opt/homebrew/Caskroom/dosbox-x-app/2026.05.02/dosbox-x-sdl2/dosbox-x.app/Contents/MacOS/dosbox-x';
const BOOT_WAIT_MS = 5000;
const TITLE_DISMISS = 'enter enter enter';

function launchFast(): ChildProcess {
  return spawn(DOSBOX_BIN, ['-conf', 'wiz6-fast.conf'], { detached: false, stdio: 'ignore', cwd: DOSBOX_DIR });
}

async function buildRecipe(client: HelperClient, capturesDir: string, recipe: SaveStateRecipe, slot: number): Promise<void> {
  const child = launchFast();
  try {
    await new Promise((r) => setTimeout(r, BOOT_WAIT_MS));
    await sendMacro(client, TITLE_DISMISS);
    const settle = () => waitForStableFrame(() => captureScreenshot(client, capturesDir), { stableCount: 3 });
    await settle();
    for (const step of recipe.steps) {
      await sendMacro(client, step);
      await settle();
    }
    if (recipe.settleMs) await new Promise((r) => setTimeout(r, recipe.settleMs));
    resetSlotTracking(1);
    await saveStateToSlot(client, slot, SAVE_DIR);
    console.log(`[build] ${recipe.name} → slot ${slot} (${join(SAVE_DIR, slot + '.sav')})`);
  } finally {
    try { child.kill('SIGTERM'); } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
// CLI: <name> [--slot N] [--force]  | --all
// Parse argv; construct the HelperClient + capturesDir the same way
// build-castle-saves.ts / the MCP server do (read helper-client.ts +
// captures-dir.ts for the exact construction); resolve recipe via findRecipe;
// skip if save/<slot>.sav exists and !--force (idempotent, file-existence v1);
// for --all iterate STATE_CATALOG assigning slots sequentially (warn if >10).
```
Fill the CLI + `HelperClient`/`capturesDir` construction by reading `tools/parity/build-castle-saves.ts`'s `main()` and `packages/mcp/src/dosbox/captures-dir.ts` — use the exact same construction so it behaves identically.

- [ ] **Step 2: [DRIVE] Build mage-spellpick + sanity-check it loads**

Run: `pnpm tsx tools/dosbox/build-saves.ts mage-spellpick --slot 1`
Then visually confirm via the MCP (`dosbox_launch`; `dosbox_load_state` slot 1; `dosbox_screenshot`) that slot 1 is the Mage spell-picker. If a step under/over-shoots, adjust that recipe's macro in `state-catalog.ts` and rebuild. (Controller task — needs DOSBox + Accessibility.)

- [ ] **Step 3: Commit the builder**

```bash
git add tools/dosbox/build-saves.ts tools/dosbox/state-catalog.ts
git commit -m "feat(dosbox): build-saves.ts — on-demand recipe builder (fast config + settle-poll)"
```

- [ ] **Step 4: Migrate castle-1..6 into the catalog**

Port `build-castle-saves.ts`'s N-member drive into catalog recipes `castle-1`…`castle-6`. The per-member loop (`enter` ADD PARTY MEMBER → settle → `enter` pick first PCFILE char → settle → `up up up` re-anchor) becomes the recipe `steps` (repeat the 3-macro block N times). Add to `STATE_CATALOG`. Then make `tools/parity/build-castle-saves.ts` a thin wrapper:
```ts
// build-castle-saves.ts — back-compat wrapper; delegates to build-saves.ts.
// Usage: pnpm tsx tools/parity/build-castle-saves.ts --slots 1,2,3,4,5,6
// Maps slot N → recipe castle-N.
```
that shells/imports `buildRecipe` for `castle-${N}` at slot N. Keep the same CLI so existing docs/callers work.

- [ ] **Step 5: [DRIVE] Verify castle-1 reproduces its fixture (the rock-solid deterministic gate)**

`castle-N` uses fixed PCFILE characters, so it's deterministic. Run:
```bash
pnpm tsx tools/dosbox/build-saves.ts castle-1 --slot 1
pnpm tsx tools/parity/gen-fixture.ts --save 1 --name /tmp/castle-1-check
```
Compare `/tmp/castle-1-check.idx.gz` to the committed castle fixture the `castle-parity` test uses (gunzip + byte-compare, or run `castle-parity` against the freshly-built save). Expected: byte-identical → proves the builder + recipe + save path are correct end-to-end. (Controller task.)

- [ ] **Step 6: Commit the migration**

```bash
git add tools/dosbox/state-catalog.ts tools/parity/build-castle-saves.ts
git commit -m "refactor(dosbox): migrate castle-1..6 into the state catalog; build-castle-saves wraps build-saves"
```

---

## Task 5: README + the mage-spellpick determinism gate

**Files:** Create `tools/dosbox/README.md`

- [ ] **Step 1: [DRIVE] Determine + record creation-roll determinism**

Build `mage-spellpick` twice (fresh) and compare the saves' character stats:
```bash
pnpm tsx tools/dosbox/build-saves.ts mage-spellpick --slot 1 --force
pnpm tsx tools/parity/gen-fixture.ts --save 1 --name /tmp/mage-a
pnpm tsx tools/dosbox/build-saves.ts mage-spellpick --slot 2 --force
pnpm tsx tools/parity/gen-fixture.ts --save 2 --name /tmp/mage-b
python3 tools/parity/diff.py /tmp/mage-a.bin /tmp/mage-b.bin 2>/dev/null || \
  node -e "const z=require('zlib'),fs=require('fs');const a=z.gunzipSync(fs.readFileSync('/tmp/mage-a.idx.gz')),b=z.gunzipSync(fs.readFileSync('/tmp/mage-b.idx.gz'));console.log(a.equals(b)?'IDENTICAL (roll deterministic)':'DIFFER (roll non-deterministic)')"
```
- If **IDENTICAL**: the roll is deterministic. Then `gen-fixture --save 1 --name creation-spell-pick` must byte-match the committed `creation-spell-pick` fixture — run that comparison; if it matches, the spec's mage byte-match gate holds. Record "roll deterministic" in the README.
- If **DIFFER**: the roll is non-deterministic. `mage-spellpick` is a valid *fresh* Mage at spell-pick; the stable assertion is the spell-PANEL region (class-driven, not roll-driven). Record this in the README + the recipe's description, and note that `creation-spell-*` fixtures are tied to the original parked roll, not reproducible by driving. (Controller task.)

- [ ] **Step 2: Write `tools/dosbox/README.md`**

```markdown
# DOSBox save-state library

Reproducible drive-recipes for parking the engine at a known state, so RE and
fixture capture don't re-drive from scratch. Recipes are the committed library;
`tools/dosbox/save/*.sav` are gitignored, disposable, built on demand.

## Build a state
    pnpm tsx tools/dosbox/build-saves.ts <name> [--slot N=1] [--force]
    pnpm tsx tools/dosbox/build-saves.ts --all            # build the whole catalog
Then: `gen-fixture.ts --save N` reads it, or MCP `dosbox_load_state N` loads it.

## List the catalog / add a recipe
States live in `tools/dosbox/state-catalog.ts` (`STATE_CATALOG`). Add a recipe =
append `{ name, description, steps }` (steps = MCP key macros after the title
screen; the builder settles the frame between steps). Verify by building it and
loading slot N in the MCP.

## Configs
`wiz6-fast.conf` (un-throttled) is used by the builder + automated MCP launches;
`wiz6.conf` stays throttled for human inspection.

## Determinism note
Castle recipes (`castle-1..6`) use fixed PCFILE characters → byte-deterministic.
Creation recipes (`mage-spellpick`, …) <ROLL-DETERMINISM RESULT FROM STEP 1>.

## Requires
macOS Accessibility permission for the driving process (see packages/mcp/PERMISSIONS.md).
```
Replace `<ROLL-DETERMINISM RESULT FROM STEP 1>` with the Step 1 finding.

- [ ] **Step 3: Commit**

```bash
git add tools/dosbox/README.md tools/dosbox/state-catalog.ts
git commit -m "docs(dosbox): save-state library README + creation-roll determinism finding"
```

---

## Self-Review

**Spec coverage:** wiz6-fast.conf (Task 1) ✓; waitForStableFrame + screenshot settle (Task 2) ✓; state-catalog with mage/priest seed (Task 3) ✓; build-saves.ts on-demand builder w/ fast config + settle (Task 4) ✓; castle-1..6 migration (Task 4 Step 4) ✓; README (Task 5) ✓. Success gate: the spec's "mage byte-match" is **conditioned on roll-determinism** (Task 5 Step 1 resolves it) and backstopped by the unconditional `castle-1` byte-match gate (Task 4 Step 5) — a refinement of the spec's single criterion, flagged because creation stats are rolled.

**Placeholder scan:** No TBD/vague. Two steps say "read X for the exact construction" (the `HelperClient`/`capturesDir` build in Task 4 Step 1, and the screenshot-tool handler in Task 2 Step 5) — these are real lookups of existing code whose exact shape must match the current source, not hand-waving; the source files are named.

**Type consistency:** `SaveStateRecipe { name, description, steps, settleMs? }` (Task 3) ↔ `buildRecipe(recipe)` + `findRecipe` (Task 4) agree. `waitForStableFrame(capture, opts)` (Task 2) signature matches the builder's `settle()` call (Task 4). `steps: string[]` (macros) consistent throughout.
