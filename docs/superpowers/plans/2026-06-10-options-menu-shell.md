# OPTIONS Menu Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pressing Return in free-roam opens the engine-faithful "PARTY OPTIONS" 3×3 command menu (an in-place bottom-strip overlay); the player navigates it, selects a command (all dispatch to stubs), and EXIT/Escape closes back to free-roam.

**Architecture:** No new game-state — a `MazeView`-local `optionsMenu` UI state. The menu is a bottom-strip overlay (maze viewport, panels, top bar unchanged). A measured-constants module (`@wiz6/data`) holds the grid layout/labels/strip rect (pinned from the harness in Task 1); pure nav logic lives in `@wiz6/parser`; a composer (sibling of the castle `compose-action-menu.ts`) renders the strip byte-exact; `MazeView` wires open/navigate/dispatch/close.

**Tech Stack:** TypeScript ESM (`.js` import extensions), pnpm monorepo (`@wiz6/data`, `@wiz6/parser`, `@wiz6/viewer`), vitest, Playwright e2e, the dosbox-pure libretro harness (`trace-maze.ts screencap`). Spec: `docs/superpowers/specs/2026-06-10-options-menu-shell-design.md`.

**Execution note:** Task 1 runs the harness + commits fixtures/constants — run it in the MAIN session (the harness is cwd-bound + stateful). Tasks 2–6 are pure code/tests and are subagent-friendly.

---

## File structure

- **Create** `packages/data/src/maze/options-menu.ts` — measured layout constants: the 9 commands + grid positions + labels, the strip rect, grid base/step, highlight attr, blink. (Plain const module, like `corridor-geometry.ts`.) Pinned in Task 1.
- **Create** `packages/parser/src/maze/options-menu.ts` — pure nav logic: `OptionsCommand` type, `moveOptionsCursor`, `commandAt`.
- **Modify** `packages/parser/src/maze/index.ts` + `packages/parser/src/index.ts` — re-export the parser symbols.
- **Create** `packages/viewer/src/pages/game/compose-options-strip.ts` — the bottom-strip composer (mirrors `castle/compose-action-menu.ts`).
- **Modify** `packages/viewer/src/pages/game/MazeView.tsx` — `optionsMenu` state, key routing, dispatch stub, strip render.
- **Create** `packages/parser/tests/maze/options-menu.test.ts` — nav unit tests.
- **Create** `packages/viewer/tests/game/options-strip-parity.test.ts` — composer pixel-parity vs the engine fixture(s).
- **Create** `packages/viewer/e2e/maze-options-menu.spec.ts` — drive the real app: Return → menu → navigate → Escape.
- **Fixtures** `tools/parity/fixtures/engine/options-menu-<cursor>.idx.gz` — per cursor cell (Task 1). `options-menu-search.idx.gz` already committed.

---

## Task 1: RE-pin the menu layout (harness, MAIN session)

**Files:**
- Create: `packages/data/src/maze/options-menu.ts` (measured constants + grid model)
- Create (fixtures): `tools/parity/fixtures/engine/options-menu-{search,review,spell,use,open,order,rest,disk,exit}.idx.gz`

**Goal:** Produce the measured ground truth the code tasks consume — per-cursor fixtures, the strip rect + cell coordinates, the highlight attr/colour, the blink phase, and the cursor-navigation table — so nothing downstream is guessed.

- [ ] **Step 1: Capture a fixture for each cursor cell**

The cursor starts on SEARCH. The grid is column-major (index = col*3 + row): SEARCH(0) REVIEW(1) SPELL(2) | USE(3) OPEN(4) ORDER(5) | REST(6) DISK(7) EXIT(8). First, empirically map which arrow reaches which cell, then capture all nine. Start from the committed entrance free-roam state. The `screencap` macro presses `enter` (open menu) then arrows:

```bash
ST=/tmp/wiz6-collmap-states/n-127_121_0.state
FIX=tools/parity/fixtures/engine
# SEARCH already captured; re-capture for consistency:
pnpm tsx tools/libretro/trace-maze.ts screencap $ST enter            $FIX/options-menu-search.png 150
# Probe navigation: from SEARCH, does DOWN go to REVIEW (within column) and RIGHT to USE (next column)?
pnpm tsx tools/libretro/trace-maze.ts screencap $ST enter,down       /tmp/opt-down.png 150
pnpm tsx tools/libretro/trace-maze.ts screencap $ST enter,right      /tmp/opt-right.png 150
```

Open `/tmp/opt-down.png` and `/tmp/opt-right.png` (Read the PNGs) and confirm the highlighted cell: DOWN from SEARCH should highlight REVIEW, RIGHT should highlight USE. Record the actual behavior. Then capture all nine by driving the confirmed arrow path to each cell, e.g. (adjust the macros to the confirmed nav):

```bash
pnpm tsx tools/libretro/trace-maze.ts screencap $ST enter,down            $FIX/options-menu-review.png 150
pnpm tsx tools/libretro/trace-maze.ts screencap $ST enter,down,down       $FIX/options-menu-spell.png 150
pnpm tsx tools/libretro/trace-maze.ts screencap $ST enter,right           $FIX/options-menu-use.png 150
pnpm tsx tools/libretro/trace-maze.ts screencap $ST enter,right,down      $FIX/options-menu-open.png 150
pnpm tsx tools/libretro/trace-maze.ts screencap $ST enter,right,down,down $FIX/options-menu-order.png 150
pnpm tsx tools/libretro/trace-maze.ts screencap $ST enter,right,right     $FIX/options-menu-rest.png 150
pnpm tsx tools/libretro/trace-maze.ts screencap $ST enter,right,right,down $FIX/options-menu-disk.png 150
pnpm tsx tools/libretro/trace-maze.ts screencap $ST enter,right,right,down,down $FIX/options-menu-exit.png 150
```

`screencap` writes both `.png` and `.idx.gz`. Each `.idx.gz` must gunzip to 64000 bytes:
```bash
for f in search review spell use open order rest disk exit; do node -e "console.log('$f', require('zlib').gunzipSync(require('fs').readFileSync('$FIX/options-menu-'+'$f'+'.idx.gz')).length)"; done
```
Expected: each prints `<name> 64000`.

- [ ] **Step 2: Verify navigation (wrap vs clamp) at the edges**

From SEARCH (top-left), does UP wrap to the bottom of the column or clamp? Does LEFT wrap/clamp? Probe:
```bash
pnpm tsx tools/libretro/trace-maze.ts screencap $ST enter,up    /tmp/opt-up.png 150     # from SEARCH(row0)
pnpm tsx tools/libretro/trace-maze.ts screencap $ST enter,left  /tmp/opt-left.png 150   # from SEARCH(col0)
```
Read both PNGs. Record whether each edge **wraps** (UP from row0 → row2; LEFT from col0 → col2) or **clamps** (stays on SEARCH). This sets `OPTIONS_NAV_WRAP` in Step 4.

- [ ] **Step 3: Measure the strip rect, cell coordinates, highlight attr, and blink**

Decode the SEARCH fixture to find the geometry. Run this probe (adjust if the strip isn't where expected):
```bash
node -e '
const z=require("zlib"),fs=require("fs");
const idx=new Uint8Array(z.gunzipSync(fs.readFileSync("tools/parity/fixtures/engine/options-menu-search.idx.gz")));
// scan rows 140..199 for non-background content; find the strip top and the highlighted (palette!=gray/black) run
const W=320;
for(let y=138;y<200;y++){let nonbg=0,hi={}; for(let x=0;x<W;x++){const v=idx[y*W+x]; if(v!==0&&v!==8)nonbg++; hi[v]=(hi[v]||0)+1;} if(nonbg>0)console.log("y"+y,"nonbg="+nonbg,"palette",JSON.stringify(hi));
}' | head -40
```
From the output: record the strip top Y, the text rows (where "PARTY OPTIONS" + the grid sit), the highlighted-cursor palette index (the colour the SEARCH cell uses vs the others — confirm it's colored text, not inverse, per the CLAUDE.md highlight-attr-sign lesson), and the cell X/Y of each of the 9 labels (compare the SEARCH fixture vs a moved-cursor fixture to see which cell-region changes).

For **blink**: capture SEARCH at two settle values and diff:
```bash
pnpm tsx tools/libretro/trace-maze.ts screencap $ST enter /tmp/opt-a.png 90
pnpm tsx tools/libretro/trace-maze.ts screencap $ST enter /tmp/opt-b.png 220
node -e 'const z=require("zlib"),fs=require("fs");const a=new Uint8Array(z.gunzipSync(fs.readFileSync("/tmp/opt-a.idx.gz"))),b=new Uint8Array(z.gunzipSync(fs.readFileSync("/tmp/opt-b.idx.gz")));let d=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])d++;console.log("settle-90 vs settle-220 differ by",d,"px");'
```
If `d>0` and the differing pixels are at the cursor cell → the cursor **blinks**; record both phases (which palette index each phase uses). If `d==0` → no blink. The committed fixture must be a known phase; note which settle value produced `options-menu-search.idx.gz` (150) and which phase that is.

- [ ] **Step 4: Write the measured-constants module**

Create `packages/data/src/maze/options-menu.ts` with the values measured above. Structure (fill the measured numbers; `<...>` are the Step-1/3 measurements):

```typescript
/**
 * options-menu.ts — measured layout of the in-dungeon PARTY OPTIONS menu (the
 * "PRESS RETURN FOR OPTIONS" 3×3 command grid). An in-place bottom-strip overlay
 * on the maze screen. Constants pinned from the engine via trace-maze.ts screencap
 * (fixtures tools/parity/fixtures/engine/options-menu-*.idx.gz). See
 * docs/superpowers/specs/2026-06-10-options-menu-shell-design.md.
 */

/** The 9 commands, in COLUMN-MAJOR grid order (index = col*3 + row). */
export const OPTIONS_COMMANDS = [
  'search', 'review', 'spell', // column 0 (rows 0..2)
  'use', 'open', 'order',      // column 1
  'rest', 'disk', 'exit',      // column 2
] as const;
export type OptionsCommand = (typeof OPTIONS_COMMANDS)[number];

/** Display labels (uppercase, as the engine draws them). */
export const OPTIONS_LABELS: Record<OptionsCommand, string> = {
  search: 'SEARCH', review: 'REVIEW', spell: 'SPELL',
  use: 'USE', open: 'OPEN', order: 'ORDER',
  rest: 'REST', disk: 'DISK', exit: 'EXIT',
};

/** The "PARTY OPTIONS" header text. */
export const OPTIONS_HEADER = 'PARTY OPTIONS';

/** Does cursor navigation wrap at column/row edges (true) or clamp (false)? — Step 2. */
export const OPTIONS_NAV_WRAP = false; // <-- set from Step 2

/** Bottom-strip rect (screen px) the menu overlay occupies — Step 3. */
export const OPTIONS_STRIP = { x: 0, y: 0, w: 0, h: 0 } as const; // <-- measure (e.g. {x:0,y:144,w:320,h:56})

/** Per-cell label origin (screen px) for cell index 0..8, and the header origin — Step 3. */
export const OPTIONS_HEADER_AT = { x: 0, y: 0 } as const;  // <-- measure
export const OPTIONS_CELL_AT: Array<{ x: number; y: number }> = [/* 9 entries, index order */]; // <-- measure

/** Highlight palette index for the cursor cell + whether it's colored-text (true) or
 *  inverse (false), and the blink phases — Step 3. */
export const OPTIONS_HILITE = { paletteIndex: 0, coloredText: true, blinks: false } as const; // <-- measure
```

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/maze/options-menu.ts tools/parity/fixtures/engine/options-menu-*.idx.gz tools/parity/fixtures/engine/options-menu-*.png
git commit -m "re(maze): pin OPTIONS menu layout — per-cursor fixtures + measured constants"
```

---

## Task 2: Parser nav logic (TDD)

**Files:**
- Create: `packages/parser/src/maze/options-menu.ts`
- Modify: `packages/parser/src/maze/index.ts`, `packages/parser/src/index.ts`
- Test: `packages/parser/tests/maze/options-menu.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/parser/tests/maze/options-menu.test.ts`. (The exact edge expectations use `OPTIONS_NAV_WRAP` from Task 1; this test assumes CLAMP — if Task 1 measured WRAP, flip the four edge cases accordingly.)

```typescript
import { describe, it, expect } from 'vitest';
import { moveOptionsCursor, commandAt } from '../../src/maze/options-menu.js';

describe('options menu navigation (3×3 column-major grid)', () => {
  it('commandAt maps the column-major index', () => {
    expect(commandAt(0)).toBe('search');
    expect(commandAt(1)).toBe('review');
    expect(commandAt(3)).toBe('use');
    expect(commandAt(8)).toBe('exit');
  });
  it('down moves within a column, right moves across columns', () => {
    expect(moveOptionsCursor(0, 'down')).toBe(1);   // SEARCH -> REVIEW
    expect(moveOptionsCursor(0, 'right')).toBe(3);  // SEARCH -> USE
    expect(moveOptionsCursor(3, 'down')).toBe(4);   // USE -> OPEN
  });
  it('clamps at the edges (per Task 1 OPTIONS_NAV_WRAP=false)', () => {
    expect(moveOptionsCursor(0, 'up')).toBe(0);     // top row clamps
    expect(moveOptionsCursor(0, 'left')).toBe(0);   // left col clamps
    expect(moveOptionsCursor(2, 'down')).toBe(2);   // bottom row clamps
    expect(moveOptionsCursor(8, 'right')).toBe(8);  // right col clamps
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @wiz6/parser test -- options-menu`
Expected: FAIL (module not found / functions undefined).

- [ ] **Step 3: Implement the nav logic**

Create `packages/parser/src/maze/options-menu.ts`:

```typescript
/**
 * options-menu.ts — pure navigation for the in-dungeon PARTY OPTIONS 3×3 grid.
 * Column-major index: index = col*3 + row (col,row in 0..2). Data + labels live
 * in @wiz6/data (options-menu.ts, measured from the engine).
 */
import { OPTIONS_COMMANDS, OPTIONS_NAV_WRAP, type OptionsCommand } from '@wiz6/data';

export type { OptionsCommand };

const COLS = 3;
const ROWS = 3;

export function commandAt(index: number): OptionsCommand {
  return OPTIONS_COMMANDS[index]!;
}

/** Move the cursor over the 3×3 grid. Clamps (or wraps if OPTIONS_NAV_WRAP). */
export function moveOptionsCursor(index: number, dir: 'up' | 'down' | 'left' | 'right'): number {
  let col = Math.floor(index / ROWS);
  let row = index % ROWS;
  if (dir === 'up') row = OPTIONS_NAV_WRAP ? (row + ROWS - 1) % ROWS : Math.max(0, row - 1);
  else if (dir === 'down') row = OPTIONS_NAV_WRAP ? (row + 1) % ROWS : Math.min(ROWS - 1, row + 1);
  else if (dir === 'left') col = OPTIONS_NAV_WRAP ? (col + COLS - 1) % COLS : Math.max(0, col - 1);
  else col = OPTIONS_NAV_WRAP ? (col + 1) % COLS : Math.min(COLS - 1, col + 1);
  return col * ROWS + row;
}
```

(If Task 1 set `OPTIONS_NAV_WRAP = true`, update the test's clamp cases to the wrap expectations.)

- [ ] **Step 4: Re-export from the barrels**

In `packages/parser/src/maze/index.ts` add: `export { moveOptionsCursor, commandAt, type OptionsCommand } from './options-menu.js';`
In `packages/parser/src/index.ts` add the same re-export (the viewer imports from the top index).

- [ ] **Step 5: Run the test + typecheck**

Run: `pnpm --filter @wiz6/parser test -- options-menu` → PASS.
Run: `pnpm --filter @wiz6/parser exec tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add packages/parser/src/maze/options-menu.ts packages/parser/src/maze/index.ts packages/parser/src/index.ts packages/parser/tests/maze/options-menu.test.ts
git commit -m "feat(maze): OPTIONS menu nav logic (3x3 column-major grid)"
```

---

## Task 3: Strip composer + pixel-parity (TDD)

**Files:**
- Create: `packages/viewer/src/pages/game/compose-options-strip.ts`
- Test: `packages/viewer/tests/game/options-strip-parity.test.ts`

- [ ] **Step 1: Write the failing pixel-parity test**

Create `packages/viewer/tests/game/options-strip-parity.test.ts`. It composes the strip for the cursor-on-SEARCH state and compares the strip rect to the committed engine fixture, byte-exact.

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { composeOptionsStrip } from '../../src/pages/game/compose-options-strip.js';
import { OPTIONS_STRIP } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(here, '../../../../tools/parity/fixtures/engine');

function loadStripFromFixture(name: string): Uint8Array {
  const full = new Uint8Array(gunzipSync(readFileSync(resolve(FIX, `${name}.idx.gz`)))); // 320x200 idx
  const { x, y, w, h } = OPTIONS_STRIP;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + (x + c)]!;
  return out;
}

describe('options strip parity (cursor on SEARCH)', () => {
  it('renders the PARTY OPTIONS strip byte-exact', () => {
    const ours = composeOptionsStrip(0, { phase: 0 }); // index 0 = SEARCH; phase per Task 1's committed fixture
    const eng = loadStripFromFixture('options-menu-search');
    expect(ours.length).toBe(eng.length);
    let match = 0;
    for (let i = 0; i < ours.length; i++) if (ours[i] === eng[i]) match++;
    expect(match, `${match}/${ours.length} px`).toBe(ours.length);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @wiz6/viewer test -- options-strip-parity`
Expected: FAIL (composer not found).

- [ ] **Step 3: Implement the composer**

Create `packages/viewer/src/pages/game/compose-options-strip.ts`, mirroring `castle/compose-action-menu.ts` (use the same `createTileWindow/clearWindow/setCursor/puts` primitives from `@wiz6/parser` + the chrome bottom-border `0x1e` baseline if Task 1 shows row-199 black). It returns the strip rect as a `w*h` palette-index buffer. Use the measured constants:

```typescript
/**
 * composeOptionsStrip — renders the in-dungeon PARTY OPTIONS bottom-strip overlay
 * (header + 3×3 command grid + cursor highlight) as an OPTIONS_STRIP.w × .h
 * palette-index buffer. Layout constants measured from the engine (@wiz6/data
 * options-menu.ts). Sibling of castle/compose-action-menu.ts.
 */
import { createTileWindow, clearWindow, puts, type TileWindow } from '@wiz6/parser';
import {
  OPTIONS_STRIP, OPTIONS_HEADER, OPTIONS_HEADER_AT, OPTIONS_LABELS, OPTIONS_COMMANDS,
  OPTIONS_CELL_AT, OPTIONS_HILITE,
} from '@wiz6/data';

export function composeOptionsStrip(cursorIndex: number, opts?: { phase?: number }): Uint8Array {
  const phase = opts?.phase ?? 0;
  const win: TileWindow = createTileWindow(OPTIONS_STRIP.w, OPTIONS_STRIP.h);
  clearWindow(win /*, bg attr per Task 1 */);
  puts(win, OPTIONS_HEADER_AT.x, OPTIONS_HEADER_AT.y, OPTIONS_HEADER /*, header attr */);
  for (let i = 0; i < OPTIONS_COMMANDS.length; i++) {
    const at = OPTIONS_CELL_AT[i]!;
    const isCursor = i === cursorIndex;
    // Highlight: colored-text vs inverse per OPTIONS_HILITE.coloredText; blink via `phase`
    // (only the cursor cell uses the highlight attr; others use the base attr). Match the
    // exact attr sign/colour Task 1 measured — do NOT infer colour from the cell.
    puts(win, at.x, at.y, OPTIONS_LABELS[OPTIONS_COMMANDS[i]!] /*, isCursor ? hiliteAttr(phase) : baseAttr */);
  }
  return renderTileWindowToIndices(win); // -> OPTIONS_STRIP.w * .h palette-index buffer
}
```

Adapt the exact `createTileWindow`/`puts`/render-to-indices calls to the real `@wiz6/parser` tile-window API (see `compose-action-menu.ts` for the precise signatures and the index-buffer extraction). The composer MUST reproduce the committed fixture's strip rect byte-exact — iterate against the test until 100%.

- [ ] **Step 4: Run the test until byte-exact**

Run: `pnpm --filter @wiz6/viewer test -- options-strip-parity` → PASS (100%).
If <100%, dump the diff (mismatch coords) and fix the attr/colour/coords — re-check Task 1's measurements (esp. the highlight attr-sign + blink phase).

- [ ] **Step 5: Add the other cursor positions to the gate**

Extend the test to `it.each` over all 9 cursor cells, comparing `composeOptionsStrip(i)` to `options-menu-<command>.idx.gz` (handle the blink phase per Task 1). All byte-exact.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/src/pages/game/compose-options-strip.ts packages/viewer/tests/game/options-strip-parity.test.ts
git commit -m "feat(viewer): PARTY OPTIONS strip composer + pixel-parity gate"
```

---

## Task 4: MazeView wiring (open / navigate / dispatch-stub / close)

**Files:**
- Modify: `packages/viewer/src/pages/game/MazeView.tsx`
- Modify: `packages/viewer/tests/game/MazeView.test.tsx` (if a new mock/state assertion is needed)

- [ ] **Step 1: Add the menu UI state + key routing**

In `MazeView.tsx`, add an `optionsMenu` ref/state `{ open: boolean; cursorIndex: number }` (default `{ open: false, cursorIndex: 0 }`). In the `onKeyDown` handler, BEFORE the movement switch, branch on `optionsMenu.open`:
- Closed + `Enter` (and `entryMode === 'free'`) → `{ open: true, cursorIndex: 0 }`; consume the event.
- Open:
  - `ArrowUp/Down/Left/Right` → `cursorIndex = moveOptionsCursor(cursorIndex, dir)`; consume.
  - `Enter` → `dispatchOptionsCommand(commandAt(cursorIndex))`; consume.
  - `Escape` → `{ open: false }`; consume.
  - (movement/turn keys do NOT reach the party while open.)

```typescript
import { moveOptionsCursor, commandAt, type OptionsCommand } from '@wiz6/parser';
// ...
const optionsMenuRef = useRef<{ open: boolean; cursorIndex: number }>({ open: false, cursorIndex: 0 });

function dispatchOptionsCommand(cmd: OptionsCommand): void {
  // SHELL: EXIT + everything else close the menu (placeholder). Per-command real handlers
  // (review -> character view, open -> doors, ...) wire in here in later sub-projects.
  optionsMenuRef.current = { open: false, cursorIndex: 0 };
  // (no-op for non-exit commands for now; intentionally a single close seam)
}
```

- [ ] **Step 2: Render the strip when the menu is open**

In the render path that composes the bottom strip (where the free-roam movement/OPTIONS widget is drawn), when `optionsMenu.open` compose `composeOptionsStrip(cursorIndex, { phase })` and blit it into the strip rect instead of the movement widget. Keep the maze viewport + panels render unchanged.

- [ ] **Step 3: Typecheck + viewer suite**

Run: `pnpm --filter @wiz6/viewer exec tsc --noEmit` → clean.
Run: `pnpm --filter @wiz6/viewer test` → all pass (add `composeOptionsStrip`/loader to the MazeView test mock only if the test imports break; the menu defaults closed so existing tests are unaffected).

- [ ] **Step 4: Commit**

```bash
git add packages/viewer/src/pages/game/MazeView.tsx packages/viewer/tests/game/MazeView.test.tsx
git commit -m "feat(viewer): wire PARTY OPTIONS menu into MazeView (open/navigate/dispatch-stub/close)"
```

---

## Task 5: e2e walking-gate spec

**Files:**
- Create: `packages/viewer/e2e/maze-options-menu.spec.ts`

- [ ] **Step 1: Write the spec**

Mirror `maze-walk-gate-square.spec.ts` (seed party → cutscene → free-roam). Then:

```typescript
// after reaching free-roam (cursor faces 0 at the entrance):
// 1. Return opens the menu — the bottom strip becomes PARTY OPTIONS (assert vs fixture).
await page.keyboard.press('Enter');
await expectStripMatchesFixture(page, 'options-menu-search');
// 2. ArrowDown moves the cursor to REVIEW (strip changes).
await page.keyboard.press('ArrowDown');
await expectStripMatchesFixture(page, 'options-menu-review');
// 3. Escape closes — back to the free-roam strip (cursor highlight gone).
await page.keyboard.press('Escape');
// assert the strip no longer matches the OPTIONS fixture (back to movement widget).
```

Add a bottom-strip crop helper `expectStripMatchesFixture` to `e2e/lib/drive.ts` (clone of `expectMazeViewportMatchesFixture` but cropping `OPTIONS_STRIP` instead of `MAZE_VP`). Handle the blink phase per Task 1 (drive to a deterministic phase or compare a non-blinking sub-region).

- [ ] **Step 2: Run it**

Run: `pnpm --filter @wiz6/viewer test:e2e maze-options-menu` → PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/viewer/e2e/maze-options-menu.spec.ts packages/viewer/e2e/lib/drive.ts
git commit -m "test(maze): e2e — Return opens PARTY OPTIONS, navigate, Escape closes"
```

---

## Task 6: Full verify + manual smoke + TODO

**Files:** `TODO.md`

- [ ] **Step 1: Full suites + build**

Run: `pnpm --filter @wiz6/parser test && pnpm --filter @wiz6/viewer test && pnpm --filter @wiz6/viewer build`
Expected: parser + viewer suites green; build clean.

- [ ] **Step 2: Manual smoke**

`pnpm dev:viewer` → create party → START NEW GAME → enter level-0 → press Return: the PARTY OPTIONS grid appears; arrows move the highlight; Escape (and selecting EXIT) closes back to free-roam; movement still works when the menu is closed.

- [ ] **Step 3: TODO**

Add a `TODO.md` note under the dungeon section: OPTIONS menu SHELL shipped (3×3 picker, navigate, dispatch-to-stubs, EXIT/Escape close; all 9 commands stubbed). List the follow-on command sub-projects (OPEN→doors, REVIEW→char view, SPELL/USE/REST/DISK/SEARCH/ORDER). Commit:
```bash
git add TODO.md
git commit -m "docs(todo): OPTIONS menu shell shipped (commands stubbed)"
```

---

## Notes for the implementer

- ESM: relative imports use `.js` extensions even though sources are `.ts`.
- The menu is an OVERLAY — `game_state` stays 5; do NOT add a new game-state. Only the bottom strip changes; the maze viewport + party panels + top bar are untouched.
- Highlight attr-sign + blink: follow the CLAUDE.md lessons (the SEARCH cursor's colour comes from the measured attr sign, NOT inferred from the cell; blink needs a phase flag + a deterministic phase in the e2e).
- The composer is the sibling of `packages/viewer/src/pages/castle/compose-action-menu.ts` — copy its tile-window/font approach and the row-199 chrome-baseline handling.
- All 9 commands are stubs this sub-project; `dispatchOptionsCommand` is the single seam where real handlers wire in later.
