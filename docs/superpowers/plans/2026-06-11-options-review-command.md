# OPTIONS → REVIEW Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the OPTIONS-menu REVIEW command: `OPTIONS → REVIEW → "REVIEW WHO?" member picker → pick member → the existing character view → EXIT back to the dungeon`.

**Architecture:** A new in-place "REVIEW WHO?" bottom-strip overlay in `MazeView` (sibling of the OPTIONS-shell picker), then reuse the already-ported full-screen `CharacterViewPage` via a new `/game/review/:slotIdx` route with an additive return-context (EXIT → `/game/maze`, castle behavior unchanged). The char view's actions are reused as-is.

**Tech Stack:** TypeScript ESM (`.js` import extensions), pnpm monorepo (`@wiz6/data`, `@wiz6/parser`, `@wiz6/viewer`), vitest, Playwright e2e, React Router, the dosbox-pure harness (`trace-maze.ts screencap`). Spec: `docs/superpowers/specs/2026-06-11-options-review-command-design.md`.

**Execution note:** Task 1 runs the harness (capture fixtures, measure layout) — run it in the MAIN session. Tasks 2–6 are pure code/tests, subagent-friendly.

---

## File structure

- **Create** `packages/data/src/maze/review-picker.ts` — measured "REVIEW WHO?" layout constants (strip rect, header origin, EXIT cell, member-cell origins, highlight, nav order). Pinned in Task 1. (Sibling of `options-menu.ts`.)
- **Create** `packages/parser/src/maze/review-picker.ts` — pure `moveReviewCursor(index, dir, cellCount)` nav over the (members + EXIT) cells. Re-export from parser barrels.
- **Create** `packages/viewer/src/pages/game/compose-review-picker.ts` — the "REVIEW WHO?" strip composer (header + member names + EXIT + cursor), byte-exact. Sibling of `compose-options-strip.ts`.
- **Modify** `packages/viewer/src/pages/game/MazeView.tsx` — REVIEW dispatch opens the picker; nav; select member → route; EXIT/Escape close. Read a `?review=1` mount intent.
- **Modify** `packages/viewer/src/pages/castle/CharacterViewPage.tsx` — additive return-context (dungeon vs castle) via `useLocation` pathname.
- **Modify** `packages/viewer/src/router.tsx` — add `/game/review/:slotIdx`.
- **Create** `packages/parser/tests/maze/review-picker.test.ts` — nav unit tests.
- **Create** `packages/viewer/tests/game/review-picker-parity.test.ts` — composer pixel-parity.
- **Create** `packages/viewer/e2e/maze-review.spec.ts` — e2e.
- **Fixtures** `tools/parity/fixtures/engine/review-who-*.idx.gz` — per cursor (Task 1). Reference `review-who-picker.idx.gz` already committed.

---

## Task 1: RE-pin the "REVIEW WHO?" picker layout (harness, MAIN session)

**Files:**
- Create: `packages/data/src/maze/review-picker.ts`
- Create (fixtures): `tools/parity/fixtures/engine/review-who-{exit,m0,m1,m2}.idx.gz`

**Goal:** Produce the measured ground truth: per-cursor fixtures + the strip rect, header/EXIT/member-cell coordinates, the highlight, and the cursor navigation (cursor starts on EXIT; how arrows reach members).

- [ ] **Step 1: Capture per-cursor fixtures + map navigation**

The cursor starts on EXIT. Drive `enter,down,enter` to reach the "REVIEW WHO?" picker, then arrows. From the harness this session: `down` from EXIT enters the member grid (`enter,down,enter,down` highlighted a member; `enter,down,enter,down,enter` selected it → char view). Probe each direction from EXIT and from a member, reading the PNGs, to map the nav. Capture:
```bash
ST=/tmp/wiz6-collmap-states/n-127_121_0.state
FIX=tools/parity/fixtures/engine
pnpm tsx tools/libretro/trace-maze.ts screencap "$ST" "enter,down,enter"           $FIX/review-who-exit.png 200   # cursor EXIT
pnpm tsx tools/libretro/trace-maze.ts screencap "$ST" "enter,down,enter,down"       $FIX/review-who-m0.png 200     # first member
pnpm tsx tools/libretro/trace-maze.ts screencap "$ST" "enter,down,enter,down,down"  $FIX/review-who-m1.png 200     # 2nd (adjust macro to the mapped nav)
pnpm tsx tools/libretro/trace-maze.ts screencap "$ST" "enter,down,enter,down,right" $FIX/review-who-m2.png 200     # 3rd (adjust)
```
Read each PNG; record which member each highlights and the arrow-path to it. (The reference roster is THESUS / LYSANDR / TEMPEST.) Verify each `.idx.gz` is 64000 bytes.

- [ ] **Step 2: Measure layout (strip rect, header, EXIT, member cells, highlight)**

Reuse the OPTIONS Task-1 analysis approach. Decode `review-who-exit.idx.gz`:
```bash
node -e '
const z=require("zlib"),fs=require("fs");const W=320;
const s=new Uint8Array(z.gunzipSync(fs.readFileSync("tools/parity/fixtures/engine/review-who-exit.idx.gz")));
for(let y=140;y<200;y++){let runs=[],inrun=false,st=0;for(let x=0;x<260;x++){const t=s[y*W+x]!==0&&s[y*W+x]!==8;if(t&&!inrun){inrun=true;st=x;}else if(!t&&inrun){inrun=false;runs.push(st+".."+(x-1));}}if(runs.length)console.log("y"+y,runs.join(" "));}'
```
Record: the strip rect (`{x,y,w,h}` covering "REVIEW WHO?" + the member cells + EXIT), the header origin, the EXIT cell origin, each member-cell origin, and the highlight palette/attr (expect INVERSE palette 5, like OPTIONS — confirm by diffing the EXIT-cursor vs member-cursor fixtures: the highlighted cell swaps to bg=5/stroke=0).

- [ ] **Step 3: Write the measured-constants module**

Create `packages/data/src/maze/review-picker.ts` (sibling shape of `options-menu.ts`):
```typescript
/**
 * review-picker.ts — measured layout of the in-dungeon "REVIEW WHO?" member picker
 * (OPTIONS → REVIEW). An in-place bottom-strip overlay; lists the active party members
 * + an EXIT cell, cursor starts on EXIT. Pinned via trace-maze.ts screencap (fixtures
 * tools/parity/fixtures/engine/review-who-*.idx.gz). Member NAMES are dynamic (the
 * active party); only the cell ORIGINS + chrome are fixed.
 * Spec: docs/superpowers/specs/2026-06-11-options-review-command-design.md.
 */
export const REVIEW_HEADER = 'REVIEW WHO?';
/** Cursor navigation wrap (measured — set from Step 1). */
export const REVIEW_NAV_WRAP = false; // <-- set from Step 1
/** Bottom-strip rect (screen px) / parity crop. */
export const REVIEW_STRIP = { x: 0, y: 0, w: 0, h: 0 } as const; // <-- measure
export const REVIEW_HEADER_AT = { x: 0, y: 0 } as const;         // <-- measure
export const REVIEW_EXIT_AT = { x: 0, y: 0 } as const;           // <-- measure (the EXIT cell)
/** Member-cell origins (screen px), in selection order (slot 0..5). Up to 6. */
export const REVIEW_MEMBER_AT: ReadonlyArray<{ x: number; y: number }> = [/* measure */];
/** The cursor index of EXIT in the combined (members…, EXIT) cell list = memberCount. */
export const REVIEW_TEXT_PALETTE = 1;   // white normal
export const REVIEW_HEADER_PALETTE = 9; // header (confirm)
export const REVIEW_HILITE = { paletteIndex: 5, coloredText: false, blinks: false } as const; // INVERSE, like OPTIONS (confirm)
/** Cursor navigation model: cells are [member0..memberN-1, EXIT]; the measured
 *  arrow→cell transitions (record the table from Step 1, e.g. grid vs list). */
```
Document the nav model in a comment (the exact arrow transitions from Step 1) so Task 2's `moveReviewCursor` implements it.

- [ ] **Step 4: Export from `@wiz6/data` + commit**

Add the exports to `packages/data/src/index.ts` (mirror the `options-menu.ts` export block). Verify `pnpm --filter @wiz6/data exec tsc --noEmit` is clean.
```bash
git add packages/data/src/maze/review-picker.ts packages/data/src/index.ts tools/parity/fixtures/engine/review-who-*.idx.gz tools/parity/fixtures/engine/review-who-*.png
git commit -m "re(maze): pin REVIEW WHO? picker layout — fixtures + measured constants"
```

---

## Task 2: Picker nav logic + composer + pixel-parity (TDD)

**Files:**
- Create: `packages/parser/src/maze/review-picker.ts`, `packages/parser/tests/maze/review-picker.test.ts`
- Modify: `packages/parser/src/maze/index.ts`, `packages/parser/src/index.ts`
- Create: `packages/viewer/src/pages/game/compose-review-picker.ts`, `packages/viewer/tests/game/review-picker-parity.test.ts`

- [ ] **Step 1: Nav logic — failing test + impl**

Write `packages/parser/tests/maze/review-picker.test.ts` per the nav model recorded in Task 1 (cells = `[member0..N-1, EXIT]`; EXIT index = `cellCount-1`). Example (adjust to the measured transitions):
```typescript
import { describe, it, expect } from 'vitest';
import { moveReviewCursor } from '../../src/maze/review-picker.js';
describe('review picker nav (members + EXIT; cursor starts on EXIT)', () => {
  it('navigates members and EXIT per the engine layout', () => {
    // cellCount = memberCount+1; e.g. 3 members + EXIT = 4 cells, EXIT index 3.
    expect(moveReviewCursor(3, 'up', 4)).toBe(0);   // EXIT -> first member (set per Task 1)
    expect(moveReviewCursor(0, 'down', 4)).toBe(3); // member0 -> ... (per Task 1)
  });
});
```
Then implement `packages/parser/src/maze/review-picker.ts` exporting `moveReviewCursor(index, dir, cellCount)` matching the Task-1 nav model. Re-export `moveReviewCursor` from `packages/parser/src/maze/index.ts` + `packages/parser/src/index.ts`. Run the test → PASS; `tsc --noEmit` clean.

- [ ] **Step 2: Composer — failing pixel-parity test**

Write `packages/viewer/tests/game/review-picker-parity.test.ts`. The picker shows the ACTIVE party member names, so the test constructs the reference roster (THESUS/LYSANDR/TEMPEST — matching the fixtures) and crops `REVIEW_STRIP`:
```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { composeReviewPicker } from '../../src/pages/game/compose-review-picker.js';
import { REVIEW_STRIP } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(here, '../../../../tools/parity/fixtures/engine');
const NAMES = ['THESUS', 'LYSANDR', 'TEMPEST'];
function loadStrip(name: string): Uint8Array {
  const full = new Uint8Array(gunzipSync(readFileSync(resolve(FIX, `${name}.idx.gz`))));
  const { x, y, w, h } = REVIEW_STRIP; const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + (x + c)]!;
  return out;
}
describe('REVIEW WHO? picker parity', () => {
  it('renders cursor-on-EXIT byte-exact', () => {
    const ours = composeReviewPicker(NAMES, /*cursorIndex*/ NAMES.length); // EXIT
    const eng = loadStrip('review-who-exit');
    let diff = 0; for (let i = 0; i < ours.length; i++) if (ours[i] !== eng[i]) diff++;
    expect(diff, `${diff}/${ours.length} px`).toBe(0);
  });
});
```

- [ ] **Step 3: Implement the composer**

Create `packages/viewer/src/pages/game/compose-review-picker.ts` — `composeReviewPicker(memberNames: string[], cursorIndex: number): Uint8Array` returning the `REVIEW_STRIP.w×.h` palette-index buffer. COPY `compose-options-strip.ts`'s glyph/index-buffer/inverse-highlight machinery; draw `REVIEW_HEADER` at `REVIEW_HEADER_AT`, each member name at `REVIEW_MEMBER_AT[i]`, EXIT at `REVIEW_EXIT_AT`; the cursor cell (member i, or EXIT when `cursorIndex===memberNames.length`) uses the inverse highlight. Iterate against the test to byte-exact.

- [ ] **Step 4: Extend the gate to each cursor position + commit**

Add `it.each` over the per-cursor fixtures (`review-who-exit`/`m0`/`m1`/`m2`) comparing `composeReviewPicker(NAMES, i)` byte-exact. All pass.
```bash
git add packages/parser/src/maze/review-picker.ts packages/parser/src/maze/index.ts packages/parser/src/index.ts packages/parser/tests/maze/review-picker.test.ts packages/viewer/src/pages/game/compose-review-picker.ts packages/viewer/tests/game/review-picker-parity.test.ts
git commit -m "feat(maze): REVIEW WHO? picker nav + composer + pixel-parity gate"
```

---

## Task 3: MazeView wiring — REVIEW opens the picker, select → char view

**Files:**
- Modify: `packages/viewer/src/pages/game/MazeView.tsx`

- [ ] **Step 1: REVIEW dispatch opens the picker**

Add a `reviewPickerRef = useRef<{ open: boolean; cursorIndex: number }>({ open: false, cursorIndex: 0 })` (mirror `optionsMenuRef`). In `dispatchOptionsCommand`, replace the stub for `'review'`: open the picker `{ open: true, cursorIndex: <EXIT index = memberCount> }` (cursor starts on EXIT, per Task 1) and `present()`. Other commands keep the stub-close.

- [ ] **Step 2: Picker key routing + render**

When `reviewPickerRef.current.open`, the keydown handler routes (before/instead of the OPTIONS-menu branch):
- `ArrowUp/Down/Left/Right` → `cursorIndex = moveReviewCursor(cursorIndex, dir, memberCount + 1)`; `present()`; consume.
- `Enter` → if cursor is EXIT (`cursorIndex === memberCount`) close the picker (`{open:false}`, present); else `navigate('/game/review/' + cursorIndex)` (the selected slot).
- `Escape` → close the picker; present.
In `composeFrame`, when the picker is open, blit `composeReviewPicker(memberNames, cursorIndex)` into `REVIEW_STRIP` (same palette→RGBA overlay as the OPTIONS strip; `memberNames` from the active party / session). Reads `useNavigate` (already imported, or add it) for the member selection.

- [ ] **Step 3: Re-open the picker on return-with-intent**

On MazeView mount, read `?review=1` from the location; if present, open the review picker (so the char-view in-view REVIEW returning to `/game/maze?review=1` re-shows the picker). If wiring the intent proves fiddly, fall back to NOT auto-opening (return to plain free-roam) and note it.

- [ ] **Step 4: Typecheck + viewer suite + commit**

`pnpm --filter @wiz6/viewer exec tsc --noEmit` clean; `pnpm --filter @wiz6/viewer test` green (picker defaults closed → existing tests unaffected).
```bash
git add packages/viewer/src/pages/game/MazeView.tsx
git commit -m "feat(viewer): OPTIONS REVIEW opens the REVIEW WHO? picker; select -> /game/review"
```

---

## Task 4: Char-view dungeon route + additive return-context

**Files:**
- Modify: `packages/viewer/src/router.tsx`, `packages/viewer/src/pages/castle/CharacterViewPage.tsx`

- [ ] **Step 1: Add the dungeon route**

In `router.tsx`, add `<Route path="/game/review/:slotIdx" element={<CharacterViewPage />} />` (alongside the existing `/castle/review-member/:slotIdx`).

- [ ] **Step 2: Additive return-context via pathname**

In `CharacterViewPage.tsx`, derive the entry context from `useLocation().pathname`:
```typescript
import { useLocation } from 'react-router-dom';
// ...
const location = useLocation();
const fromDungeon = location.pathname.startsWith('/game/review');
const exitTarget = fromDungeon ? '/game/maze' : '/castle';
const repickTarget = fromDungeon ? '/game/maze?review=1' : '/castle/review-member';
```
Replace the hardcoded `navigate('/castle')` (the EXIT path) with `navigate(exitTarget)`, and `navigate('/castle/review-member')` (the in-view REVIEW re-pick) with `navigate(repickTarget)`. Leave every other behavior identical — castle entry (`fromDungeon === false`) keeps `'/castle'` / `'/castle/review-member'` exactly as before. (If `?review=1` intent-passing is dropped per Task 3 Step 3, set `repickTarget = '/game/maze'` and note it.)

- [ ] **Step 3: Typecheck + viewer suite (castle regression) + commit**

`pnpm --filter @wiz6/viewer exec tsc --noEmit` clean. `pnpm --filter @wiz6/viewer test` green — ESPECIALLY the castle review-member tests (the return-context is additive; castle behavior must be unchanged). If a char-view test asserts the exact navigate target, confirm it still gets `'/castle'` for the castle route.
```bash
git add packages/viewer/src/router.tsx packages/viewer/src/pages/castle/CharacterViewPage.tsx
git commit -m "feat(viewer): /game/review route + dungeon return-context for the character view (additive)"
```

---

## Task 5: e2e + castle regression

**Files:**
- Create: `packages/viewer/e2e/maze-review.spec.ts`

- [ ] **Step 1: Write the e2e**

Mirror `maze-options-menu.spec.ts` (seed party → cutscene → free-roam). Then:
```typescript
// at free-roam:
await page.keyboard.press('Enter');                 // OPTIONS
await page.keyboard.press('ArrowDown');              // SEARCH -> REVIEW
await page.keyboard.press('Enter');                  // select REVIEW -> "REVIEW WHO?" picker
await expectOptionsStripMatchesFixture(page, 'review-who-exit'); // picker shown (reuse the strip-crop helper; OPTIONS_STRIP rect = REVIEW_STRIP if equal, else add an expectReviewStrip helper)
// pick the first member (per Task 1 nav, e.g. ArrowDown into the grid):
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');                  // -> /game/review/0
await page.waitForURL('**/game/review/0', { timeout: 5_000 });
await waitForStableCanvas(page, 'canvas');
// the char sheet is up — assert a char-view signature (e.g. non-blank, or a known pixel region). Then EXIT:
await page.keyboard.press('Escape');                 // char-view EXIT
await page.waitForURL('**/game/maze', { timeout: 10_000 });
await waitForStableCanvas(page, 'canvas');
// back in the dungeon (free-roam strip, not the picker)
```
(The seed party in the e2e is one member "THESUS"; the picker strip fixture has 3 members. So for the e2e's picker assertion, EITHER seed the 3-member reference roster to match `review-who-exit`, OR assert behaviorally — picker appears (strip differs from free-roam) + member-select reaches `/game/review/0` + EXIT returns to `/game/maze`. Prefer seeding the 3-member roster so the strip pixel-asserts.)

- [ ] **Step 2: Run + commit**

`pnpm --filter @wiz6/viewer test:e2e maze-review` → PASS. (If flaky on cutscene timing, mirror `maze-options-menu.spec.ts` exactly.)
```bash
git add packages/viewer/e2e/maze-review.spec.ts packages/viewer/e2e/lib/drive.ts
git commit -m "test(maze): e2e — OPTIONS REVIEW -> picker -> char view -> EXIT back to dungeon"
```

---

## Task 6: Full verify + manual smoke + TODO

**Files:** `TODO.md`

- [ ] **Step 1: Full suites + build**

`pnpm --filter @wiz6/parser test && pnpm --filter @wiz6/data test && pnpm --filter @wiz6/viewer test && pnpm --filter @wiz6/viewer build` → all green, build clean.

- [ ] **Step 2: Manual smoke**

`pnpm dev:viewer` → enter dungeon → Return → REVIEW → pick a member → the character sheet appears (actions navigable) → EXIT → back in the dungeon; movement still works.

- [ ] **Step 3: TODO**

Update `TODO.md` #088: REVIEW command shipped (picker + reuse char view; TRADE/USE/MERGE/DROP + dungeon char-view pixel-parity deferred). Commit:
```bash
git add TODO.md
git commit -m "docs(todo): #088 REVIEW command shipped (picker + char-view reuse)"
```

---

## Notes for the implementer

- ESM: relative imports use `.js` extensions even though sources are `.ts`.
- The picker is an OVERLAY (game stays mounted, `composeFrame` blits the strip); the char view is a full-screen ROUTE (MazeView unmounts, re-mounts on return into free-roam since `entryMode` persists as `'free'`).
- The composer is the sibling of `compose-options-strip.ts` (inverse highlight, same glyph/index approach). Member names are dynamic (active party).
- The return-context change to `CharacterViewPage` MUST be additive — the castle review-member flow (its pixel + e2e gates) stays green. Verify by running the castle tests.
- Reuse the ported char view as-is; do NOT implement TRADE/USE/MERGE/DROP or a dungeon char-view pixel gate (deferred per the spec).
