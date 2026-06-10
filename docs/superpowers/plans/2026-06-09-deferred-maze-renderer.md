# Deferred Maze Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the maze renderer's two-step OR-background-then-walls approximation with the engine's deferred two-phase pipeline (BUILD a depth-tagged draw list → FLUSH it back-to-front), so see-through door recesses render byte-exact with no regression elsewhere.

**Architecture:** A pure `buildDrawList(block, party)` walks depths 0→3, classifies each cell's edges, and emits depth-tagged `DrawRecord`s (OR / masked / FUN_1c94-span). `flushDrawList` draws them strictly back-to-front (depth 3→0) onto one page, dispatching each to the already-byte-exact blit primitives. The see-through gate falls out of draw order (the near gate covers the corridor behind it; the gaps reveal it) — no mask, no clip. Build-alongside-and-switch: the new path is validated against every existing parity gate before `renderMazeViewport` flips to it.

**Tech Stack:** TypeScript (ESM, `.js` import extensions), Vitest, the `@wiz6/parser` maze modules (`callist.ts`, `classify.ts`, `build.ts`, `flush.ts`, `background.ts`, `compositor.ts`, `maze-data.ts`, `page.ts`, `render.ts`). Live RE via `tools/libretro/trace-maze.ts` (patched dosbox-pure core).

**Spec:** `docs/superpowers/specs/2026-06-09-deferred-maze-renderer-design.md`

---

## File structure

| File | Role | Action |
|---|---|---|
| `packages/parser/src/maze/drawlist.ts` | `DrawRecord` type + `buildDrawList(block, party)` (BUILD phase) | **create** |
| `packages/parser/src/maze/flush.ts` | add `flushDrawList(list, wb, assets)` (FLUSH back-to-front) | modify |
| `packages/parser/src/maze/classify.ts` | door (code 3) no longer occludes; expose forward-edge per depth | modify |
| `packages/parser/src/maze/render.ts` | `renderMazeViewport` flips to the deferred path | modify (Stage 4) |
| `packages/parser/src/maze/callist.ts` | delete subsumed special-case branches | modify (Stage 4) |
| `packages/parser/tests/maze/drawlist.test.ts` | BUILD unit tests | create |
| `packages/parser/tests/maze/deferred-parity.test.ts` | deferred path vs every committed oracle (the regression net) | create |
| `tools/parity/fixtures/engine/maze-freeroam-gx127-gy121-f2.idx.gz` (+ lookbacks) | reused as the byte-exact gate fixtures | reuse |

**Reused unchanged:** `background.ts` (`composeBackground`, `applyMaskedMirror`), `compositor.ts` (`renderPieceCall` + the per-span clip), `maze-data.ts` (`expandMazeData`, `orPlacementFor`, `maskedMirrorFor`), `page.ts` (`decodePageIndex`).

---

## Stage 1 — DrawRecord model + the back-to-front pipeline, validated on the canonical corridor

**Goal:** Establish the deferred pipeline and prove it reproduces the canonical corridor (gx127 gy121 f0) byte-exact (the 100% canary). This resolves the basic OR-vs-FUN_1c94 interleaving on the simplest gated view.

### Task 1: Define the `DrawRecord` type and the draw-kind discriminator

**Files:**
- Create: `packages/parser/src/maze/drawlist.ts`
- Test: `packages/parser/tests/maze/drawlist.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/parser/tests/maze/drawlist.test.ts
import { describe, it, expect } from 'vitest';
import type { DrawRecord } from '../../src/maze/drawlist.js';
import { sortBackToFront } from '../../src/maze/drawlist.js';

describe('DrawRecord ordering', () => {
  it('sortBackToFront orders by descending depthField, stable within a depth', () => {
    const list: DrawRecord[] = [
      { depthField: 0, kind: 'or', src: 122 },
      { depthField: 3, kind: 'or', src: 125 },
      { depthField: 0, kind: 'span', span: { x0: 0, x1: 0, clipLo: 72, clipHi: 248, walltype: 2, seamIdx: 1, depthField: 0 } },
      { depthField: 2, kind: 'masked', src: 4, dst: 13, mode: 'or' },
    ];
    const out = sortBackToFront(list);
    expect(out.map((r) => r.depthField)).toEqual([3, 2, 0, 0]);
    // stable within depth 0: 'or' before 'span'
    expect(out[2]!.kind).toBe('or');
    expect(out[3]!.kind).toBe('span');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/parser && pnpm vitest run tests/maze/drawlist.test.ts`
Expected: FAIL — `drawlist.js` / `sortBackToFront` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/parser/src/maze/drawlist.ts
import type { MazeSpan } from './compositor.js';

/** One deferred draw record, tagged with the depth it belongs to (0 = the party's
 *  own cell, 3 = farthest). The FLUSH phase draws records back-to-front (depth 3
 *  first), so nearer records paint over farther ones. */
export type DrawRecord =
  | { depthField: number; kind: 'or'; src: number }
  | { depthField: number; kind: 'masked'; src: number; dst: number; mode: 'or' | 'replace' }
  | { depthField: number; kind: 'span'; span: MazeSpan };

/** Stable sort by DESCENDING depthField (back-to-front). Records at the same depth
 *  keep their emit order — the BUILD phase emits them in the engine's intra-depth
 *  order, which the flush must preserve. */
export function sortBackToFront(list: DrawRecord[]): DrawRecord[] {
  return list.map((r, i) => [r, i] as const)
    .sort((a, b) => b[0].depthField - a[0].depthField || a[1] - b[1])
    .map(([r]) => r);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/parser && pnpm vitest run tests/maze/drawlist.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/maze/drawlist.ts packages/parser/tests/maze/drawlist.test.ts
git commit -m "feat(maze): DrawRecord type + back-to-front sort (deferred renderer Stage 1)"
```

### Task 2: `buildDrawList` — repackage the current corridor generation into a depth-tagged list

**Files:**
- Modify: `packages/parser/src/maze/drawlist.ts`
- Test: `packages/parser/tests/maze/drawlist.test.ts`

The current `generateFullCallList(block, party)` (callist.ts) returns `BackgroundCall[]` (`{kind:'OR',src}` / `{kind:'masked',src,dst,mode}`). The wall path is `classifyVisibleWalls → deriveCorridorSpans (+ deriveDoorCenterpieceSpans) → MazeSpan[]`. `buildDrawList` produces a single `DrawRecord[]` from BOTH, tagging each with its depth.

Depth derivation for OR/masked records: the placement index encodes depth via the emit law `index = base + depth` (see `EMIT_BASES` in callist.ts). Add a helper `depthOfPlacement(idx)` that returns `idx - base` for the matching base bank, else 0 (the 6 constant top-strips + non-banked pieces are depth 0 / drawn first-within-depth-0). Wall spans already carry `depthField`.

- [ ] **Step 1: Write the failing test**

```ts
// add to drawlist.test.ts
import { buildDrawList } from '../../src/maze/drawlist.js';
import { generateFullCallList } from '../../src/maze/callist.js';
import { MazeBlockSchema, type MazeBlock, type MazeParty } from '@wiz6/data';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRAMES = JSON.parse(readFileSync(resolve(HERE, '../../../..', 'tools/parity/fixtures/engine/maze-frames.json'), 'utf8'));
const BLOCK: MazeBlock = MazeBlockSchema.parse(FRAMES.mazeBlock);
const CORRIDOR: MazeParty = { gx: 127, gy: 121, z: 0, facing: 0 };

describe('buildDrawList', () => {
  it('contains every OR/masked placement that generateFullCallList emits for the corridor', () => {
    const calls = generateFullCallList(BLOCK, CORRIDOR);
    const list = buildDrawList(BLOCK, CORRIDOR);
    const orSrcsCalls = calls.filter((c) => c.kind === 'OR').map((c) => c.src).sort((a, b) => a - b);
    const orSrcsList = list.filter((r) => r.kind === 'or').map((r) => (r as { src: number }).src).sort((a, b) => a - b);
    expect(orSrcsList).toEqual(orSrcsCalls);
  });
  it('tags the perspective ceiling twins with ascending depth (122→0, 125→3)', () => {
    const list = buildDrawList(BLOCK, CORRIDOR);
    const find = (src: number) => list.find((r) => r.kind === 'or' && (r as { src: number }).src === src);
    expect(find(122)?.depthField).toBe(0);
    expect(find(125)?.depthField).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/parser && pnpm vitest run tests/maze/drawlist.test.ts`
Expected: FAIL — `buildDrawList` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// add to packages/parser/src/maze/drawlist.ts
import {
  generateFullCallList,
  EMIT_BASES,
  type MazeBlock,
  type MazeParty,
} from './callist.js';
import { classifyVisibleWalls } from './classify.js';
import { deriveCorridorSpans, deriveDoorCenterpieceSpans } from './build.js';
import { SEAM_X0_WT2, SEAM_X1_WT2 } from '@wiz6/data';

/** The per-family banks that follow the `base + depth` law (depth = idx - base). */
const DEPTH_BANKS = [
  EMIT_BASES.CEILING, // 122
  EMIT_BASES.FLOOR,   // 150
  133, 137, 141, 145, // corner/door-frame stride-4 banks (maze-callist-generation.json)
  161, 165, 169, 173, // their +28 floor twins
];

/** Derive the depth (0..3) of an OR/masked placement index from the emit banks.
 *  Pieces that don't belong to a perspective bank are depth-0 (near, drawn last). */
export function depthOfPlacement(idx: number): number {
  for (const base of DEPTH_BANKS) {
    if (idx >= base && idx <= base + 3) return idx - base;
  }
  return 0;
}

/** BUILD phase: (block, party) → ordered depth-tagged draw list. Repackages the
 *  current OR/masked + wall-span generation (no behavior change yet — Stage 1). */
export function buildDrawList(block: MazeBlock, party: MazeParty): DrawRecord[] {
  const out: DrawRecord[] = [];
  for (const c of generateFullCallList(block, party)) {
    if (c.kind === 'OR') out.push({ depthField: depthOfPlacement(c.src), kind: 'or', src: c.src });
    else out.push({ depthField: depthOfPlacement(c.dst), kind: 'masked', src: c.src, dst: c.dst, mode: c.mode });
  }
  const sides = classifyVisibleWalls(block, party);
  const spans = deriveCorridorSpans(sides, SEAM_X0_WT2, SEAM_X1_WT2);
  spans.push(...deriveDoorCenterpieceSpans(block, party));
  for (const span of spans) out.push({ depthField: span.depthField, kind: 'span', span });
  return out;
}
```

(If `EMIT_BASES`, `MazeBlock`, `MazeParty` are not already exported from `callist.ts`, export them there in this step.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/parser && pnpm vitest run tests/maze/drawlist.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/maze/drawlist.ts packages/parser/tests/maze/drawlist.test.ts packages/parser/src/maze/callist.ts
git commit -m "feat(maze): buildDrawList repackages corridor generation into a depth-tagged list"
```

### Task 3: `flushDrawList` — back-to-front compositor, validated byte-exact on the corridor

**Files:**
- Modify: `packages/parser/src/maze/flush.ts`
- Test: `packages/parser/tests/maze/deferred-parity.test.ts` (create)

`flushDrawList` builds one page: it sorts the list back-to-front, then for each record dispatches to the existing primitive — `composeBackground([orPlacementFor(wb, src)])` for `or`, `applyMaskedMirror(maskedMirrorFor(wb, src, dst, mode))` for `masked`, and `renderPieceCall(page, atlas, descriptor, call)` (via `generateCallList([span])`) for `span`. **The intra-depth order and the or-vs-span order is the open RE detail** — Stage 1 pins it on the corridor: start with `[ or/masked at depth d ] then [ spans at depth d ]` within each depth, back-to-front, and adjust until the corridor is byte-exact.

- [ ] **Step 1: Write the failing test (the corridor canary)**

```ts
// packages/parser/tests/maze/deferred-parity.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDrawList } from '../../src/maze/drawlist.js';
import { flushDrawList } from '../../src/maze/flush.js';
import { loadMazeAssets } from '../../src/maze/assets.js';
import { expandMazeData } from '../../src/maze/maze-data.js';
import { decodePageIndex } from '../../src/maze/page.js';
import { MazeBlockSchema, type MazeBlock, type MazeParty, MAZE_VIEWPORT } from '@wiz6/data';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(HERE, '../../../..', 'tools/parity/fixtures/engine');
const BLOCK: MazeBlock = MazeBlockSchema.parse(JSON.parse(readFileSync(resolve(FIX, 'maze-frames.json'), 'utf8')).mazeBlock);
const { x: VX, y: VY, w: VW, h: VH } = MAZE_VIEWPORT;
const N = VW * VH;

function oracleViewport(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(resolve(FIX, `${name}.idx.gz`)));
  const f = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const o = new Uint8Array(N);
  for (let r = 0; r < VH; r++) for (let c = 0; c < VW; c++) o[r * VW + c] = f[(VY + r) * 320 + VX + c]!;
  return o;
}
function deferredViewport(party: MazeParty): Uint8Array {
  const assets = loadMazeAssets();
  const wb = expandMazeData(assets.mazedata);
  const page = flushDrawList(buildDrawList(BLOCK, party), wb, assets);
  const full = decodePageIndex(page, 320, 200);
  const o = new Uint8Array(N);
  for (let r = 0; r < VH; r++) for (let c = 0; c < VW; c++) o[r * VW + c] = full[(VY + r) * 320 + VX + c]!;
  return o;
}

describe('deferred renderer — corridor canary', () => {
  it('gx127 gy121 f0 is byte-exact (19712/19712)', () => {
    const ours = deferredViewport({ gx: 127, gy: 121, z: 0, facing: 0 });
    const eng = oracleViewport('maze-corridor');
    let m = 0;
    for (let i = 0; i < N; i++) if (ours[i] === eng[i]) m++;
    expect(m).toBe(19712);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/parser && pnpm vitest run tests/maze/deferred-parity.test.ts`
Expected: FAIL — `flushDrawList` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// add to packages/parser/src/maze/flush.ts
import type { DrawRecord } from './drawlist.js';
import { sortBackToFront } from './drawlist.js';
import { composeBackground } from './background.js';
import { applyMaskedMirror } from './background.js';
import { orPlacementFor, maskedMirrorFor, type MazeWorkBuffer } from './maze-data.js';
import { renderFrameFromAssets } from './compositor.js';
import { PLANE_STRIDE, type MazeRenderAssets } from '@wiz6/data';

/** FLUSH phase: draw the depth-tagged list back-to-front onto one 4-plane page. */
export function flushDrawList(list: DrawRecord[], wb: MazeWorkBuffer, assets: MazeRenderAssets): Uint8Array {
  const page = new Uint8Array(4 * PLANE_STRIDE);
  for (const r of sortBackToFront(list)) {
    if (r.kind === 'or') composeBackground(page, [orPlacementFor(wb, r.src)]);
    else if (r.kind === 'masked') applyMaskedMirror(page, maskedMirrorFor(wb, r.src, r.dst, r.mode));
    else renderFrameFromAssets(page, assets, generateCallList([r.span]));
  }
  return page;
}
```

(`generateCallList` is already defined in this file — reuse it.)

- [ ] **Step 4: Run and iterate to byte-exact**

Run: `cd packages/parser && pnpm vitest run tests/maze/deferred-parity.test.ts`
Expected: PASS (19712). If not byte-exact, the intra-depth / or-vs-span order is off — adjust `sortBackToFront`'s tie-break (e.g. `or`/`masked` before `span` within a depth, or the reverse) and re-run. The corridor is pure-background (zero wall spans at facing 0) so this isolates the OR/masked ordering first. Do NOT proceed until 19712.

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/maze/flush.ts packages/parser/tests/maze/deferred-parity.test.ts
git commit -m "feat(maze): flushDrawList back-to-front compositor — corridor byte-exact"
```

---

## Stage 2 — No-regression across all currently-gated views

**Goal:** Prove the deferred path (`buildDrawList` + `flushDrawList`) reproduces every currently-gated view at ≥ its current parity, BEFORE changing any behavior. This is the regression net the switch depends on.

### Task 4: Parity sweep — deferred path vs every committed oracle

**Files:**
- Modify: `packages/parser/tests/maze/deferred-parity.test.ts`

- [ ] **Step 1: Add the sweep test (all freeroam oracles + wall-cases at their current floors)**

```ts
// add to deferred-parity.test.ts — drive each committed oracle through the deferred path
const FLOORS: Array<{ name: string; party: MazeParty; floor: number }> = [
  { name: 'maze-corridor',                party: { gx: 127, gy: 121, z: 0, facing: 0 }, floor: 19712 },
  { name: 'maze-freeroam-gx126-gy121-f3', party: { gx: 126, gy: 121, z: 0, facing: 3 }, floor: 19683 },
  { name: 'maze-freeroam-gx127-gy121-f1', party: { gx: 127, gy: 121, z: 0, facing: 1 }, floor: 19546 },
  { name: 'maze-freeroam-gx127-gy122-f0', party: { gx: 127, gy: 122, z: 0, facing: 0 }, floor: 19603 },
  { name: 'maze-freeroam-gx127-gy123-f0', party: { gx: 127, gy: 123, z: 0, facing: 0 }, floor: 19348 },
  { name: 'maze-freeroam-gx127-gy122-f3', party: { gx: 127, gy: 122, z: 0, facing: 3 }, floor: 17604 },
  { name: 'maze-freeroam-gx124-gy121-f0', party: { gx: 124, gy: 121, z: 0, facing: 0 }, floor: 16308 },
  { name: 'maze-freeroam-gx124-gy121-f3', party: { gx: 124, gy: 121, z: 0, facing: 3 }, floor: 14069 },
  { name: 'maze-freeroam-gx127-gy123-f1', party: { gx: 127, gy: 123, z: 0, facing: 1 }, floor: 7880 },
  { name: 'maze-freeroam-gx127-gy122-f2', party: { gx: 127, gy: 122, z: 0, facing: 2 }, floor: 19374 },
  // gx127-gy121-f2 (the gate) is Stage 3's byte-exact target — excluded here.
];

describe('deferred renderer — no regression sweep', () => {
  it.each(FLOORS)('$name stays >= its current floor', ({ name, party, floor }) => {
    const ours = deferredViewport(party);
    const eng = oracleViewport(name);
    let m = 0;
    for (let i = 0; i < N; i++) if (ours[i] === eng[i]) m++;
    expect(m, `${name}: ${m} < floor ${floor}`).toBeGreaterThanOrEqual(floor);
  });
});
```

- [ ] **Step 2: Run the sweep**

Run: `cd packages/parser && pnpm vitest run tests/maze/deferred-parity.test.ts`
Expected: every view ≥ its floor. Any shortfall = the deferred repackaging/ordering diverges from `generateFullCallList` for that view. Diagnose: dump `buildDrawList(party)` vs `generateFullCallList(party)` for the failing view, confirm the same placement set + the correct depth tags; fix `depthOfPlacement` / the tie-break until all floors hold.

- [ ] **Step 3: Commit**

```bash
git add packages/parser/tests/maze/deferred-parity.test.ts
git commit -m "test(maze): deferred path no-regression sweep across all gated views"
```

---

## Stage 3 — Door non-occlusion + the see-through gate (byte-exact)

**Goal:** The behavior change. A head-on door (forward edge code 3) no longer occludes; the BUILD phase emits the corridor-behind (depths 1-3); the back-to-front flush layers the gate on top so the hallway shows in the gaps. Target: gx127 gy121 f2 byte-exact, gx127 gy122 f2 holds/improves.

### Task 5: Make a head-on door non-occluding in classify

**Files:**
- Modify: `packages/parser/src/maze/classify.ts`
- Test: `packages/parser/tests/maze/classify.test.ts`

The current `classifyVisibleWalls` head-on branch treats a head-on door as the recess terminus. Per `maze-headon-recess-emit.json`, occlusion clamps the depth bound ONLY for a solid forward edge (code 2 or ≥5); a door (code 3) must NOT clamp. Amend the depth-walk so the visible-depth computation continues past a head-on door, emitting the corridor-behind sides/corners for depths beyond the door.

- [ ] **Step 1: Write the failing test**

```ts
// add to classify.test.ts
import { classifyVisibleWalls } from '../../src/maze/classify.js';
// gx127 gy121 f2 = head-on entrance gate at depth 0; corridor (gy120/119/118) behind.
it('a head-on door at depth 0 does NOT occlude — sides emit at depths >= 1', () => {
  const sides = classifyVisibleWalls(BLOCK, { gx: 127, gy: 121, z: 0, facing: 2 });
  const emittingDepths = sides.map((s, d) => (s.length ? d : -1)).filter((d) => d >= 0);
  expect(emittingDepths.some((d) => d >= 1)).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/parser && pnpm vitest run tests/maze/classify.test.ts`
Expected: FAIL — current head-on logic caps at the door, no depth ≥1 sides.

- [ ] **Step 3: Implement — door does not clamp the depth bound**

In `classifyVisibleWalls`, in the head-on (facing 2/3) path, change the occlusion test so only `front === 2 || front >= 5` (a solid wall) stops the depth walk; `front === 3` (door) continues. Emit the corridor-behind side/corner slots for each non-occluded depth using the existing per-depth slot emission (the same code that emits a normal corridor's sides). Keep the non-head-on path unchanged.

```ts
// in the depth walk: replace the door-terminates-here logic with:
//   const occludes = isSolid(front) && front !== 3;   // door (3) is see-through
//   if (occludes) break;                                // solid wall caps; door does not
// and emit the per-depth sides for every walked depth as the open-corridor path does.
```

(Exact edit depends on the current head-on block; preserve every other view's output — Task 4's sweep is the guard.)

- [ ] **Step 4: Run classify + the full sweep**

Run: `cd packages/parser && pnpm vitest run tests/maze/classify.test.ts tests/maze/deferred-parity.test.ts`
Expected: classify PASS; the sweep must STILL hold every non-gate floor (the change must not regress non-head-on views; if a head-on lookback view dips, note it for Task 6).

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/maze/classify.ts packages/parser/tests/maze/classify.test.ts
git commit -m "feat(maze): head-on door is non-occluding — emit the corridor-behind"
```

### Task 6: Emit the corridor-behind draw records + pin the gate byte-exact

**Files:**
- Modify: `packages/parser/src/maze/drawlist.ts`
- Test: `packages/parser/tests/maze/deferred-parity.test.ts`

With the door non-occluding, `buildDrawList` now emits the corridor-behind OR/masked placements (floor/ceiling/sides for depths 1-3) AND the gate recess span at depth 0. The back-to-front flush draws the gate last. **Pin the exact corridor-behind piece set + the gate span against the live capture** — use the committed doorturn capture and the `trace-maze.ts` tooling:

```bash
# the captured settled span queue + OR call-list for the gate view (already committed/regenerable):
pnpm tsx tools/libretro/trace-maze.ts spanlist 127 121 2     # FUN_1c94 spans incl. corridor-behind walls
pnpm tsx tools/libretro/trace-maze.ts doorturn               # full call-list (first-turn-to-f2)
```

- [ ] **Step 1: Add the byte-exact gate test**

```ts
// add to deferred-parity.test.ts
describe('deferred renderer — see-through gate (Stage 3 target)', () => {
  it('gx127 gy121 f2 is byte-exact', () => {
    const ours = deferredViewport({ gx: 127, gy: 121, z: 0, facing: 2 });
    const eng = oracleViewport('maze-freeroam-gx127-gy121-f2');
    let m = 0;
    for (let i = 0; i < N; i++) if (ours[i] === eng[i]) m++;
    expect(m).toBe(N); // 19712
  });
});
```

- [ ] **Step 2: Run to see the gap**

Run: `cd packages/parser && pnpm vitest run tests/maze/deferred-parity.test.ts -t 'see-through gate'`
Expected: FAIL initially (< 19712). Characterize the diff (overdraw vs missing) with the same classify-the-residual helper used in RE (`o<ours>>e<eng>` histogram + diff rows).

- [ ] **Step 3: Implement the corridor-behind emit, iterate against the capture**

In `buildDrawList`, for a head-on-door view, emit the corridor-behind records the classify now exposes: the per-depth ceiling/floor OR twins (122-125 / 150-153), the side-wall OR/masked families, and the depth-0 gate recess as a `span` (walltype matching the captured `spanlist` record). Compose back-to-front. Iterate piece set + intra-depth order until the gate test is 19712, re-running the Stage-2 sweep each iteration so no other view regresses. The capture (`spanlist 127 121 2`, doorturn) is ground truth for which pieces and at which depth.

- [ ] **Step 4: Run gate test + full sweep**

Run: `cd packages/parser && pnpm vitest run tests/maze/deferred-parity.test.ts`
Expected: gate = 19712 AND every Stage-2 floor still holds.

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/maze/drawlist.ts packages/parser/tests/maze/deferred-parity.test.ts
git commit -m "feat(maze): see-through gate byte-exact via back-to-front corridor-behind"
```

### Task 7: Pin the head-on lookback views (gy122-f2 + any gy121/gy122 f2/f3 lookbacks)

**Files:**
- Modify: `packages/parser/tests/maze/deferred-parity.test.ts`

- [ ] **Step 1: Add byte-exact (or ≥ prior floor) assertions for the other head-on-door views**

```ts
// add the remaining head-on lookbacks; gy122-f2 was 19374 — require >= 19374, aim 19712.
it('gx127 gy122 f2 holds or improves', () => {
  const ours = deferredViewport({ gx: 127, gy: 122, z: 0, facing: 2 });
  const eng = oracleViewport('maze-freeroam-gx127-gy122-f2');
  let m = 0; for (let i = 0; i < N; i++) if (ours[i] === eng[i]) m++;
  expect(m).toBeGreaterThanOrEqual(19374);
});
```

- [ ] **Step 2: Run; iterate if a lookback regressed from the door change**

Run: `cd packages/parser && pnpm vitest run tests/maze/deferred-parity.test.ts`
Expected: all pass. If a lookback dipped from Task 5's non-occlusion, reconcile in `buildDrawList` (the same corridor-behind emit must serve depth-1 doors too).

- [ ] **Step 3: Commit**

```bash
git add packages/parser/tests/maze/deferred-parity.test.ts
git commit -m "test(maze): head-on lookback views hold under the deferred renderer"
```

---

## Stage 4 — Switch over, gate, and delete the old path

**Goal:** Flip `renderMazeViewport` to the deferred pipeline, promote the deferred-parity tests into the gated suite, and remove the subsumed special-case branches.

### Task 8: Flip `renderMazeViewport` to the deferred path

**Files:**
- Modify: `packages/parser/src/maze/render.ts`
- Test: existing `tests/maze/*-parity.test.ts` (the full suite is the gate)

- [ ] **Step 1: Re-point `renderMazeViewport`**

Replace the body of `renderMazeViewport(block, party, assets, opts)` so the wall+background path is `flushDrawList(buildDrawList(block, party), wb, assets)` decoded + cropped. Keep the `opts.phase` (seam animation) + `opts.capturedSpans` honored (capturedSpans can still override the wall spans via a captured case; phase still selects `seamIdx`/`seamAlt`). Build `wb` from `assets.mazedata` once.

- [ ] **Step 2: Run the ENTIRE maze suite**

Run: `cd packages/parser && pnpm vitest run tests/maze/`
Expected: ALL green — `maze-corridor-generated-parity` (100%), `maze-wall-cases-parity` (30/32), `maze-freeroam-parity` (all floors), masked-mirror, decoration, etc. Any red = the deferred path diverges from a gate the sweep didn't cover; fix before proceeding.

- [ ] **Step 3: Run the viewer suite + tsc**

Run: `cd packages/parser && pnpm tsc --noEmit` then `pnpm --filter @wiz6/viewer test` and `(cd packages/viewer && pnpm tsc --noEmit)`
Expected: parser tsc clean; viewer 1033 green; viewer tsc clean.

- [ ] **Step 4: Commit**

```bash
git add packages/parser/src/maze/render.ts
git commit -m "feat(maze): renderMazeViewport uses the deferred BUILD/FLUSH pipeline"
```

### Task 9: Promote the gate to a gated fixture + raise floors

**Files:**
- Modify: `packages/parser/tests/maze/maze-freeroam-parity.test.ts`

- [ ] **Step 1: Raise the gy127-gy121-f2 floor to 19712 (byte-exact) and gy122-f2 to its new value**

Update the `floor` for `gx127-gy121-f2` to `19712` and the residue note ("see-through hallway via deferred back-to-front renderer; byte-exact"). Update gy122-f2 to its achieved value.

- [ ] **Step 2: Run**

Run: `cd packages/parser && pnpm vitest run tests/maze/maze-freeroam-parity.test.ts`
Expected: PASS at the raised floors.

- [ ] **Step 3: Commit**

```bash
git add packages/parser/tests/maze/maze-freeroam-parity.test.ts
git commit -m "test(maze): gate the see-through gate views byte-exact"
```

### Task 10: Delete the subsumed special-case branches

**Files:**
- Modify: `packages/parser/src/maze/callist.ts`

Remove the branches now subsumed by the uniform BUILD law: `isHeadOnDoorArchway` + `ARCHWAY_FRAME`, `headOnDoorAheadStop` + `HEADON_NEAR_FLANK_*` + `DOOR_RECESS_ARCH_BASE`, `generateDeepDoorRecess` + its tables, and any helper now only reachable through them. KEEP everything `buildDrawList` still calls (`generateCallist`, `generateNearFlankMasked`, `generateParityOddMasked`, the masked-mirror law, `EMIT_BASES`, `composeCallList`/`generateFullCallList` if still referenced by tests).

- [ ] **Step 1: Delete the dead branches**

Delete the identified exports + their constants. If `generateFullCallList` is still the source `buildDrawList` repackages, keep it; if `buildDrawList` now classifies directly, inline what it needs and delete `generateFullCallList`'s head-on special cases only.

- [ ] **Step 2: Run the full maze suite + tsc (catch dangling references)**

Run: `cd packages/parser && pnpm vitest run tests/maze/ && pnpm tsc --noEmit`
Expected: green + tsc clean. tsc surfaces any test/import still referencing a deleted symbol — update or delete those.

- [ ] **Step 3: Commit**

```bash
git add packages/parser/src/maze/callist.ts
git commit -m "refactor(maze): remove the per-view special cases subsumed by the deferred renderer"
```

### Task 11: Manual smoke + full-repo verification

**Files:** none (verification only)

- [ ] **Step 1: Manual browser smoke**

Run: `pnpm dev:viewer`, enter the dungeon, walk to the gate, turn to face it. Confirm the see-through hallway renders (corridor visible behind/through the bars), no overdraw past the gate, no munging. Walk the early corridor — confirm no regression.

- [ ] **Step 2: Full repo gates**

Run: `pnpm --filter @wiz6/parser test && pnpm --filter @wiz6/viewer test`
Expected: all green.

- [ ] **Step 3: Update TODO + memory + Engineering Notes**

- TODO #085: mark the gate byte-exact via the deferred renderer; note #084 residuals remain (deferred).
- Update memory `wiz6-dungeon-renderer-re.md` with the deferred-renderer landing.
- Propose an Engineering Notes card (ask Nate first): "The Renderer That Draws Back-to-Front" (the see-through gate as painter's order, the special-cases collapsing into one law).

- [ ] **Step 4: Commit**

```bash
git add TODO.md
git commit -m "docs(todo): #085 — see-through gate byte-exact via the deferred renderer"
```

---

## Self-review notes (planner)

- **Spec coverage:** BUILD (Task 2, 6) ✓; FLUSH back-to-front (Task 3) ✓; door non-occlusion (Task 5) ✓; reused primitives (Task 3 dispatch) ✓; module boundaries `drawlist.ts`/`flush.ts` (Tasks 1-3) ✓; consolidation/delete special cases (Task 10) ✓; migration build-alongside + sweep (Stage 2, Task 8) ✓; byte-exact gate + corridor canary + new gates (Tasks 3, 6, 9) ✓; manual smoke (Task 11) ✓; risk = OR-vs-FUN_1c94 interleaving pinned per-view against captures (Tasks 3, 6) ✓.
- **Empirical tasks (3-iterate, 6-iterate):** the exact intra-depth/or-vs-span order and the corridor-behind piece set are resolved against the live captures + the gate tests, not pre-determined — flagged explicitly, with the validation command and ground-truth capture for each. This is the one place the plan prescribes a loop rather than fixed code, because the interleaving is the documented open RE detail.
- **Type consistency:** `DrawRecord` discriminant `kind: 'or'|'masked'|'span'` used consistently (Tasks 1, 2, 3); `buildDrawList`/`flushDrawList`/`sortBackToFront`/`depthOfPlacement` signatures consistent across tasks.
