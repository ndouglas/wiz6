# Maze Corridor Frame — Pixel-Exact Composer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the zone-0 first-person corridor reference frame (party facing the green gate) in the viewer, pixel-exact (full 320×200) against a committed engine fixture.

**Architecture:** Framebuffer-oracle port. A `build-state` recipe captures the engine frame as the parity fixture. An extractor cuts semantic texture pieces (floor, ceiling, gate, depth-0 side-wall strips) from that frame. A pure composer places them using the RE'd geometry tables — side walls **convergence-scaled** across depth so the convergence math is genuinely under test — then assembles the full 320×200 frame with chrome. A parity test gates it at 100%. A viewer route makes it visible.

**Tech Stack:** TypeScript ESM (`.js` import specifiers), pnpm monorepo (`@wiz6/data`, `@wiz6/parser`, viewer), Vitest, the dosbox-pure harness (`tools/libretro/build-state.ts` + `tools/dosbox/state-catalog.ts`), `tools/parity/diff-image.ts` (`compareRgba`), React viewer with `Presenter`/canvas.

**Spec:** `docs/superpowers/specs/2026-06-03-maze-corridor-port-design.md`
**RE inputs:** `docs/re/findings/{wmaze-render-in-egadrv,egadrv-blit-internals,wmaze-uv-texture}.json`, `docs/re/wmaze-functions.md`. **Tracking:** TODO #076.

**Known constants (from RE, to be re-confirmed in Task 2/3):**
- Viewport rect: `x=72, y=32, w=176, h=112` (covers x72–247, y32–143).
- Convergence columns per depth 0..3: left `[0,104,128,144]` (DGROUP @0x42), right `[0,216,192,176]` (@0x4a). Corridor center ≈ x160.
- Walltype slots @0x5220: `0`=open, `2`=solid stone side wall.
- Composed palette: `COMPOSED_PALETTE` from `tools/parity/decode-screen.ts` (the WIZ6_MAIN AC→DAC palette; `SCREEN_WIDTH=320`, `SCREEN_HEIGHT=200`).

---

## Task 1: Capture the engine fixture

**Files:**
- Modify: `tools/dosbox/state-catalog.ts` (add the `maze-corridor` recipe)
- Create (committed by the build): `tools/parity/fixtures/engine/maze-corridor.idx.gz`, `tools/parity/fixtures/engine/maze-corridor.png`
- Reference: `tools/libretro/trace-maze.ts` (its `reach` phase has the proven drive), `tools/libretro/build-state.ts`

- [ ] **Step 1: Read the proven drive and the recipe format.**

Read `tools/libretro/trace-maze.ts` `driveToMaze()` (the working drive to the corridor frame) and `tools/dosbox/state-catalog.ts` (the `SaveStateRecipe` shape + how `build-state.ts` replays it: default prologue boots + dismisses the title, then runs `steps` with a settle between each). Note the drive needs ENTER both to dismiss the "approaching the gate" narration AND to walk forward; confirm whether tap-ENTER (recipe macros) advances the party, or whether held-ENTER is required (trace-maze used `key enter down; step20; key enter up`).

- [ ] **Step 2: Add the `maze-corridor` recipe.**

Add to the catalog (after the existing recipes). Use the documented sequence. If tap-ENTER advances (verify in Step 4), express the walk as repeated `enter` taps; the drive from MASTER OPTIONS:

```ts
// tools/dosbox/state-catalog.ts — add to SEED_CATALOG (or the appropriate array)
const MAZE_CORRIDOR_RECIPE: SaveStateRecipe = {
  name: 'maze-corridor',
  // From MASTER OPTIONS: build a 3-member party (ADD PARTY MEMBER x3), then
  // START NEW GAME -> scenario -> dungeon, then ENTER through narration to the gate.
  steps: [
    'enter', 'enter', 'up up up',     // ADD PARTY MEMBER #1
    'enter', 'enter', 'up up up',     // #2
    'enter', 'enter', 'up up up',     // #3
    'down down down',                  // -> START NEW GAME
    'enter',                           // START NEW GAME
    'enter',                           // scenario
    'enter',                           // -> dungeon (narration)
    'enter', 'enter', 'enter',         // dismiss narration + walk toward gate
    'enter', 'enter', 'enter',
  ],
};
```

Register it in the exported catalog list the same way sibling recipes are registered.

- [ ] **Step 3: Build the fixture.**

Run: `pnpm tsx tools/libretro/build-state.ts maze-corridor`
Expected: writes `tools/parity/fixtures/engine/maze-corridor.{idx.gz,png}` and a scratch state. If it errors on a non-WIZ6 colour, the frame isn't the maze view — fix the drive (Step 4).

- [ ] **Step 4: Verify it is the corridor frame + deterministic phase.**

Open `tools/parity/fixtures/engine/maze-corridor.png` and confirm it shows the stone corridor receding to the green portcullis gate (party THESUS/LYSANDR/TEMPEST). If the party didn't form or the view is wrong, adjust `steps` (e.g. held-ENTER walk: if taps don't advance, add a dedicated branch in `build-state.ts` that drives this recipe with `key enter down; step 20; key enter up; step 60` per the `trace-maze.ts reach` logic). Re-run `build-state.ts maze-corridor` twice and `git diff --stat` the `.idx.gz` — it MUST be byte-identical across builds (deterministic animation phase). If not, bump the final settle or switch to a committed serialize-state (`--mint` path) per the creation-rolls precedent in CLAUDE.md.

- [ ] **Step 5: Commit.**

```bash
git add tools/dosbox/state-catalog.ts tools/parity/fixtures/engine/maze-corridor.idx.gz tools/parity/fixtures/engine/maze-corridor.png
git commit -m "feat(maze): commit engine corridor parity fixture + recipe"
```

---

## Task 2: Geometry constants in @wiz6/data

**Files:**
- Create: `packages/data/src/maze/corridor-geometry.ts`
- Modify: `packages/data/src/index.ts` (export it)
- Test: `packages/data/tests/maze/corridor-geometry.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// packages/data/tests/maze/corridor-geometry.test.ts
import { describe, it, expect } from 'vitest';
import { MAZE_VIEWPORT, CONVERGE_LEFT, CONVERGE_RIGHT, CORRIDOR_CENTER_X } from '../../src/maze/corridor-geometry.js';

describe('corridor geometry', () => {
  it('viewport rect matches the engine viewport', () => {
    expect(MAZE_VIEWPORT).toEqual({ x: 72, y: 32, w: 176, h: 112 });
  });
  it('convergence columns narrow toward center with depth', () => {
    expect(CONVERGE_LEFT).toEqual([0, 104, 128, 144]);
    expect(CONVERGE_RIGHT).toEqual([0, 216, 192, 176]);
    // left increases, right decreases (converging) for depths 1..3
    for (let d = 2; d <= 3; d++) {
      expect(CONVERGE_LEFT[d]!).toBeGreaterThan(CONVERGE_LEFT[d - 1]!);
      expect(CONVERGE_RIGHT[d]!).toBeLessThan(CONVERGE_RIGHT[d - 1]!);
    }
    expect(CORRIDOR_CENTER_X).toBe(160);
  });
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `pnpm --filter @wiz6/data test -- corridor-geometry`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the constants.**

```ts
// packages/data/src/maze/corridor-geometry.ts
/**
 * RE'd geometry for the zone-0 first-person corridor view.
 * Source: live DGROUP reads (docs/re/findings/wmaze-uv-texture.json):
 *   convergence columns @0x42 (left) / @0x4a (right); viewport from the engine
 *   frame. Per-depth screen columns of the corridor opening (depth 0..3).
 */
export const MAZE_VIEWPORT = { x: 72, y: 32, w: 176, h: 112 } as const;
export const CONVERGE_LEFT = [0, 104, 128, 144] as const;
export const CONVERGE_RIGHT = [0, 216, 192, 176] as const;
export const CORRIDOR_CENTER_X = 160;
```

- [ ] **Step 4: Export + run test.**

Add `export * from './maze/corridor-geometry.js';` to `packages/data/src/index.ts`.
Run: `pnpm --filter @wiz6/data test -- corridor-geometry`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add packages/data/src/maze/corridor-geometry.ts packages/data/src/index.ts packages/data/tests/maze/corridor-geometry.test.ts
git commit -m "feat(maze): corridor geometry constants in @wiz6/data"
```

---

## Task 3: Extract maze texture pieces from the fixture

**Files:**
- Create: `tools/parity/extract-maze-tiles.ts`
- Create (committed by the script): `packages/viewer/src/data/maze-corridor-tiles.json`
- Reference: `tools/parity/decode-screen.ts` (`COMPOSED_PALETTE`, `SCREEN_WIDTH/HEIGHT`), `tools/libretro/build-state.ts` (how `.idx.gz` fixtures are read/written)

- [ ] **Step 1: Determine the piece rects from the fixture.**

Write `tools/parity/extract-maze-tiles.ts`. It reads `maze-corridor.idx.gz` (gunzip → `Uint8Array` of 320×200 palette indices), maps indices→RGBA via `COMPOSED_PALETTE`, and cuts these rects (all in full-frame coords). Determine each rect by inspecting the fixture PNG with a pixel tool and the geometry constants (left/right walls bounded by `MAZE_VIEWPORT.x` and `CONVERGE_*[1]` for the nearest depth; floor = lower-center triangle/trapezoid below the corridor; ceiling = upper-center; gate = the far rect centered on `CORRIDOR_CENTER_X`). Encode the chosen rects as named constants at the top of the script with a comment citing how each was measured:

```ts
// tools/parity/extract-maze-tiles.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPOSED_PALETTE } from './decode-screen.js';
import { MAZE_VIEWPORT, CONVERGE_LEFT, CONVERGE_RIGHT } from '../../packages/data/src/maze/corridor-geometry.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(HERE, 'fixtures/engine/maze-corridor.idx.gz');
const OUT = resolve(HERE, '../../packages/viewer/src/data/maze-corridor-tiles.json');
const W = 320;

// Measured from the fixture (see Step 1). Each rect is {x,y,w,h} in 320x200 coords.
const RECTS = {
  ceiling:   { x: 72, y: 32, w: 176, h: /* measured */ 0 },
  floor:     { x: 72, y: /* measured */ 0, w: 176, h: /* measured */ 0 },
  gate:      { x: CONVERGE_LEFT[3]!, y: /* measured */ 0, w: CONVERGE_RIGHT[3]! - CONVERGE_LEFT[3]!, h: /* measured */ 0 },
  wallLeft0: { x: MAZE_VIEWPORT.x, y: /* measured */ 0, w: CONVERGE_LEFT[1]! - MAZE_VIEWPORT.x, h: /* measured */ 0 },
  wallRight0:{ x: CONVERGE_RIGHT[1]!, y: /* measured */ 0, w: (MAZE_VIEWPORT.x + MAZE_VIEWPORT.w) - CONVERGE_RIGHT[1]!, h: /* measured */ 0 },
} as const;

function idx(): Uint8Array { return new Uint8Array(gunzipSync(readFileSync(FIX))); }
function cut(indices: Uint8Array, r: {x:number;y:number;w:number;h:number}): number[] {
  const out: number[] = [];
  for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) out.push(indices[(r.y + yy) * W + (r.x + xx)]!);
  return out; // palette indices, row-major
}

const indices = idx();
const tiles: Record<string, { rect: typeof RECTS[keyof typeof RECTS]; indices: number[] }> = {};
for (const [name, r] of Object.entries(RECTS)) tiles[name] = { rect: r, indices: cut(indices, r) };
writeFileSync(OUT, JSON.stringify({ palette: COMPOSED_PALETTE, tiles }, null, 0));
console.log(`wrote ${OUT}: ${Object.keys(tiles).length} tiles`);
```

The `/* measured */ 0` values MUST be replaced with the real pixel measurements before running (the script is useless with zeros). Measure with: `pnpm tsx -e "..."` reading the `.idx.gz` and printing index runs per row, or pixel-pick the committed PNG.

- [ ] **Step 2: Run the extractor.**

Run: `pnpm tsx tools/parity/extract-maze-tiles.ts`
Expected: `wrote .../maze-corridor-tiles.json: 5 tiles`. Sanity-check the JSON is non-trivial (each tile's `indices.length === rect.w*rect.h`, not all zeros).

- [ ] **Step 3: Commit.**

```bash
git add tools/parity/extract-maze-tiles.ts packages/viewer/src/data/maze-corridor-tiles.json
git commit -m "feat(maze): extract corridor texture pieces from the fixture"
```

---

## Task 4: Composer — viewport from geometry + tiles (convergence-scaled)

**Files:**
- Create: `packages/viewer/src/pages/game/compose-maze-view.ts`
- Test: `packages/viewer/tests/game/compose-maze-view.test.ts`
- Reference: `packages/viewer/src/pages/game/castle-frame.ts` (existing full-screen composer; RGBA buffer conventions)

- [ ] **Step 1: Write the failing test (viewport size + side-wall convergence).**

```ts
// packages/viewer/tests/game/compose-maze-view.test.ts
import { describe, it, expect } from 'vitest';
import { composeMazeViewport } from '../../src/pages/game/compose-maze-view.js';
import tiles from '../../src/data/maze-corridor-tiles.json';
import { MAZE_VIEWPORT } from '@wiz6/data';

describe('composeMazeViewport', () => {
  it('returns a 176x112 RGBA buffer', () => {
    const buf = composeMazeViewport(tiles as any);
    expect(buf.length).toBe(MAZE_VIEWPORT.w * MAZE_VIEWPORT.h * 4);
  });
  it('left/right edges of the corridor opening follow the convergence columns', () => {
    // At a given viewport row the side-wall/opening boundary x should match the
    // convergence column for that depth. Asserted indirectly via the parity test
    // (Task 6); here just assert the buffer is non-blank in the wall regions.
    const buf = composeMazeViewport(tiles as any);
    const px = (x: number, y: number) => buf[(y * MAZE_VIEWPORT.w + x) * 4]!;
    expect(px(2, 56)).toBeGreaterThan(0); // left wall region not black
  });
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `pnpm --filter @wiz6/viewer test -- compose-maze-view`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the composer.**

Convert palette-index tiles to RGBA, blit floor/ceiling/gate at their (viewport-relative) rects, and draw the side walls by sampling the depth-0 wall strip and **scaling it across the converging trapezoid** using `CONVERGE_LEFT/RIGHT`. Viewport-relative coords = full-frame rect minus `MAZE_VIEWPORT.{x,y}`.

```ts
// packages/viewer/src/pages/game/compose-maze-view.ts
import { MAZE_VIEWPORT, CONVERGE_LEFT, CONVERGE_RIGHT, CORRIDOR_CENTER_X } from '@wiz6/data';

type Rect = { x: number; y: number; w: number; h: number };
type Tile = { rect: Rect; indices: number[] };
export interface MazeTiles { palette: [number, number, number][]; tiles: Record<string, Tile>; }

const VW = MAZE_VIEWPORT.w, VH = MAZE_VIEWPORT.h;

function putTile(out: Uint8Array, pal: [number, number, number][], t: Tile): void {
  // place a tile at its full-frame rect, mapped into viewport-relative coords
  const ox = t.rect.x - MAZE_VIEWPORT.x, oy = t.rect.y - MAZE_VIEWPORT.y;
  for (let yy = 0; yy < t.rect.h; yy++) {
    for (let xx = 0; xx < t.rect.w; xx++) {
      const vx = ox + xx, vy = oy + yy;
      if (vx < 0 || vx >= VW || vy < 0 || vy >= VH) continue;
      const [r, g, b] = pal[t.indices[yy * t.rect.w + xx]!]!;
      const o = (vy * VW + vx) * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
    }
  }
}

export function composeMazeViewport(data: MazeTiles): Uint8Array {
  const out = new Uint8Array(VW * VH * 4);
  const { palette: pal, tiles } = data;
  // background to corridor base colour (black); ceiling, floor, then walls, then gate on top
  putTile(out, pal, tiles.ceiling!);
  putTile(out, pal, tiles.floor!);
  // Side walls: sample the depth-0 strip and stretch across the converging trapezoid.
  // For each viewport column x from the wall's near edge to the convergence column,
  // copy the nearest source column (horizontal scale) over the wall's vertical span.
  // (Exact vertical span from the wallLeft0/​wallRight0 rect; the convergence law is
  //  validated by the parity test.) Implementation: nearest-neighbour horizontal map
  //  from [nearEdge..convergeCol] back to the source strip width.
  drawSideWall(out, pal, tiles.wallLeft0!, 'left');
  drawSideWall(out, pal, tiles.wallRight0!, 'right');
  putTile(out, pal, tiles.gate!);
  return out;
}

function drawSideWall(out: Uint8Array, pal: [number, number, number][], t: Tile, side: 'left' | 'right'): void {
  const near = side === 'left' ? MAZE_VIEWPORT.x : CONVERGE_RIGHT[1]!;
  const far = side === 'left' ? CONVERGE_LEFT[1]! : (MAZE_VIEWPORT.x + MAZE_VIEWPORT.w);
  const oyTop = t.rect.y - MAZE_VIEWPORT.y;
  const spanX0 = Math.min(near, far) - MAZE_VIEWPORT.x;
  const spanX1 = Math.max(near, far) - MAZE_VIEWPORT.x;
  for (let vx = spanX0; vx < spanX1; vx++) {
    const srcX = Math.floor(((vx - spanX0) / (spanX1 - spanX0)) * t.rect.w);
    for (let yy = 0; yy < t.rect.h; yy++) {
      const vy = oyTop + yy;
      if (vx < 0 || vx >= VW || vy < 0 || vy >= VH) continue;
      const [r, g, b] = pal[t.indices[yy * t.rect.w + Math.min(srcX, t.rect.w - 1)]!]!;
      const o = (vy * VW + vx) * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
    }
  }
}
```

NOTE: the exact draw order, the side-wall vertical span (currently the strip's own height — may need per-column vertical convergence too), and whether floor/ceiling are trapezoids will be tuned against the parity test in Task 6. Adjust `drawSideWall` / rects until parity passes; keep the convergence-driven horizontal mapping (that is the point of the milestone).

- [ ] **Step 4: Run the test.**

Run: `pnpm --filter @wiz6/viewer test -- compose-maze-view`
Expected: PASS (size + non-blank).

- [ ] **Step 5: Commit.**

```bash
git add packages/viewer/src/pages/game/compose-maze-view.ts packages/viewer/tests/game/compose-maze-view.test.ts
git commit -m "feat(maze): viewport composer (geometry + convergence-scaled walls)"
```

---

## Task 5: Full-frame assembler (viewport + chrome)

**Files:**
- Create: `packages/viewer/src/pages/game/compose-maze-frame.ts`
- Test: `packages/viewer/tests/game/compose-maze-frame.test.ts`
- Reference: `packages/viewer/src/pages/game/castle-frame.ts`, `party-panel-render.ts`

- [ ] **Step 1: Decide the chrome source.**

Inspect the fixture: the non-viewport region (banner + 6 party portraits/status). Determine whether existing `castle-frame.ts`/`party-panel-render.ts` already produce a byte-identical match for this party, OR whether to extract the chrome as a static full-frame background piece (add a `chrome` tile in Task 3's extractor: the full 320×200 with the viewport rect zeroed, committed alongside). Prefer reuse if it matches; otherwise extract static. Document the choice in a top-of-file comment.

- [ ] **Step 2: Write the failing test.**

```ts
// packages/viewer/tests/game/compose-maze-frame.test.ts
import { describe, it, expect } from 'vitest';
import { composeMazeFrame } from '../../src/pages/game/compose-maze-frame.js';

describe('composeMazeFrame', () => {
  it('returns a full 320x200 RGBA frame', () => {
    const buf = composeMazeFrame();
    expect(buf.length).toBe(320 * 200 * 4);
  });
});
```

- [ ] **Step 3: Implement: chrome background + viewport blit.**

```ts
// packages/viewer/src/pages/game/compose-maze-frame.ts
import { MAZE_VIEWPORT } from '@wiz6/data';
import tiles from '../../data/maze-corridor-tiles.json';
import { composeMazeViewport, type MazeTiles } from './compose-maze-view.js';
// chrome: per Step 1 — either renderChrome() reused, or a static 'chrome' tile.

export function composeMazeFrame(): Uint8Array {
  const out = new Uint8Array(320 * 200 * 4);
  // 1. paint chrome (reused renderer OR static background) into `out`.
  //    (fill with the decision from Step 1)
  // 2. blit the viewport.
  const vp = composeMazeViewport(tiles as unknown as MazeTiles);
  for (let y = 0; y < MAZE_VIEWPORT.h; y++) {
    for (let x = 0; x < MAZE_VIEWPORT.w; x++) {
      const s = (y * MAZE_VIEWPORT.w + x) * 4;
      const d = ((MAZE_VIEWPORT.y + y) * 320 + (MAZE_VIEWPORT.x + x)) * 4;
      out[d] = vp[s]!; out[d + 1] = vp[s + 1]!; out[d + 2] = vp[s + 2]!; out[d + 3] = 255;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test.**

Run: `pnpm --filter @wiz6/viewer test -- compose-maze-frame`
Expected: PASS (size).

- [ ] **Step 5: Commit.**

```bash
git add packages/viewer/src/pages/game/compose-maze-frame.ts packages/viewer/tests/game/compose-maze-frame.test.ts
git commit -m "feat(maze): full-frame assembler (viewport + chrome)"
```

---

## Task 6: Pixel-parity gate

**Files:**
- Create: `tools/parity/maze-corridor-parity.test.ts`
- Reference: `tools/parity/castle-parity.test.ts` (pattern: load `.idx.gz`, map to RGBA, `compareRgba` vs composed, 100% floor), `tools/parity/diff-image.ts`

- [ ] **Step 1: Write the parity test.**

```ts
// tools/parity/maze-corridor-parity.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareRgba } from './diff-image.js';
import { COMPOSED_PALETTE } from './decode-screen.js';
import { composeMazeFrame } from '../../packages/viewer/src/pages/game/compose-maze-frame.js';

const HERE = dirname(fileURLToPath(import.meta.url));
function engineRgba(): Uint8Array {
  const idx = new Uint8Array(gunzipSync(readFileSync(resolve(HERE, 'fixtures/engine/maze-corridor.idx.gz'))));
  const out = new Uint8Array(320 * 200 * 4);
  for (let i = 0; i < idx.length; i++) {
    const [r, g, b] = COMPOSED_PALETTE[idx[i]!]!;
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255;
  }
  return out;
}

describe('maze corridor parity', () => {
  it('composed frame matches the engine fixture (100%)', () => {
    const { matchRatio } = compareRgba(composeMazeFrame(), engineRgba(), { tolerance: 0 });
    expect(matchRatio).toBe(1);
  });
});
```

(Confirm `compareRgba`'s return shape against `tools/parity/diff-image.ts` and adjust the assertion to its actual API — it returns a ratio/diff count.)

- [ ] **Step 2: Run it.**

Run: `pnpm tsx --test tools/parity/maze-corridor-parity.test.ts` (or the project's parity runner; check `tools/parity/README.md`).
Expected: initially FAIL with a diff < 100%. Iterate Task 3 rects + Task 4 `drawSideWall`/draw-order + Task 5 chrome until `matchRatio === 1`. Use a diff-PNG dump (see `castle-parity.test.ts` / `diff-image.ts`) to localise mismatches.

- [ ] **Step 3: Commit when green.**

```bash
git add tools/parity/maze-corridor-parity.test.ts
git commit -m "test(maze): pixel-parity gate for the corridor frame (100%)"
```

---

## Task 7: Viewer route + manual smoke

**Files:**
- Create: `packages/viewer/src/pages/game/MazeView.tsx`
- Modify: the viewer router (find where routes are registered, e.g. `packages/viewer/src/App.tsx` or a routes module) to add `/game/maze`
- Reference: an existing page that renders a composed frame via the `Presenter`/canvas (e.g. `CastleScreen.tsx`)

- [ ] **Step 1: Implement the page.**

Mirror the existing composed-frame page pattern: call `composeMazeFrame()`, push the RGBA through the existing `Presenter`/canvas at 320×200 (integer-scaled), same as `CastleScreen`.

```tsx
// packages/viewer/src/pages/game/MazeView.tsx
import { useEffect, useRef } from 'react';
import { composeMazeFrame } from './compose-maze-frame.js';
// reuse the existing Presenter/canvas hook used by CastleScreen.tsx

export function MazeView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const rgba = composeMazeFrame();
    // present rgba (320x200) via the same path CastleScreen uses
  }, []);
  return <canvas ref={canvasRef} width={320} height={200} />;
}
```

(Fill the presenter wiring by copying `CastleScreen.tsx`'s exact mechanism.)

- [ ] **Step 2: Register the route.**

Add `/game/maze` → `MazeView` in the router module (match the existing route registration style).

- [ ] **Step 3: Manual smoke.**

Run: `pnpm dev:viewer`, open `/game/maze`. Confirm the corridor renders and visually matches the engine frame (the parity test guarantees pixels; this confirms the page loads + presents).

- [ ] **Step 4: Commit.**

```bash
git add packages/viewer/src/pages/game/MazeView.tsx <router-file>
git commit -m "feat(maze): /game/maze viewer route"
```

---

## Task 8: Wrap-up

- [ ] **Step 1: Run the full gate suite.**

Run: `pnpm test` (or the project's gate command). Expected: all green, including the new maze parity test.

- [ ] **Step 2: Update TODO #076.**

Mark the framebuffer-oracle corridor milestone done; note remaining (general renderer/U-V, source-texture decode, navigation/e2e) still open.

```bash
git add TODO.md
git commit -m "docs: TODO #076 — corridor frame port milestone done"
```

---

## Notes for the implementer

- ESM: relative imports use `.js` extensions on `.ts` source.
- Schema/types: prefer `@wiz6/data` exports; don't duplicate types.
- The convergence-scaling in `drawSideWall` is the milestone's real content — keep the convergence-table-driven horizontal mapping even while tuning rects/spans to reach 100% parity. If reaching 100% requires per-column *vertical* convergence too, add it (read the wall's top/bottom screen rows per depth from the fixture) rather than abandoning the convergence model.
- If the fixture proves non-deterministic (animation phase), switch Task 1 to a committed serialize-state per the `--mint` precedent (`test-fixtures/states/`), and load it in `build-state.ts --check`.
