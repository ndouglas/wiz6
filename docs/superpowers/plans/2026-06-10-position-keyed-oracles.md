# Position-keyed Capture-Replay Oracles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix decoration aliasing in the faithful level-0 renderer by keying capture-replay oracles on exact `(gx,gy,facing)` position instead of wall-geometry `viewConfigKey`, and capturing all 293 reachable views (was 266).

**Architecture:** The oracle lookup key drops `viewConfigKey` (wall geometry only — it aliases cells with different decorations) for a position key `"gx,gy,facing"`, which structurally cannot alias. The 293 cached engine states in `/tmp/wiz6-collmap-states/` are replayed through the existing framebuffer grab (no re-driving). Touches: the capture phase, the asset builder, the renderer lookup, the viewer loader, and the parity/coverage tests.

**Tech Stack:** TypeScript ESM (`.js` import extensions), pnpm monorepo (`@wiz6/parser`, `@wiz6/viewer`), vitest, the dosbox-pure libretro harness (`tools/libretro/trace-maze.ts` + the patched `dosbox_pure_libretro.dylib` + `host`). Spec: `docs/superpowers/specs/2026-06-10-position-keyed-oracles-design.md`.

**Execution note:** Tasks 1 and 2 run the libretro harness / regenerate committed assets — run them in the MAIN session (the harness is cwd-bound and stateful), not a fresh subagent. Tasks 3–6 are pure code/tests and are subagent-friendly.

---

## File structure

- **Modify** `tools/libretro/trace-maze.ts` — `phaseCollCapture`: capture one oracle per `(gx,gy,facing)` (drop the `viewConfigKey` dedup).
- **Modify** `tools/parity/build-viewport-oracles.ts` — key cases by `posKey`, no dedup; emit 293 cases.
- **Regenerate** `tools/parity/fixtures/engine/maze-viewport-oracles.json` + `extracted/maze/viewport-oracles.json` (293 cases).
- **Modify** `packages/parser/src/maze/render.ts` — `capturedViewports` lookup by position key.
- **Modify** `packages/viewer/src/data-loader.ts` — `loadMazeViewportOracles` map keyed by position.
- **Modify** `packages/parser/tests/maze/maze-capture-replay-parity.test.ts` — 293 byte-exact + coverage gate + aliasing spot-check.

---

## Task 1: Capture all 293 reachable views (harness)

**Files:**
- Modify: `tools/libretro/trace-maze.ts` (`phaseCollCapture`, ~line 4266)

- [ ] **Step 1: Drop the configKey dedup in `phaseCollCapture`**

In `tools/libretro/trace-maze.ts`, function `phaseCollCapture`, replace the `repByKey` dedup with a direct iteration over `cm.reachable`. Find:

```typescript
  const { block } = loadLevel0();
  const cm = JSON.parse(readFileSync(cmJson, 'utf8'));
  const repByKey = new Map<string, { gx: number; gy: number; facing: number }>();
  for (const v of cm.reachable) {
    const key = viewConfigKeyFor(block, { gx: v.gx, gy: v.gy, z: 0, facing: v.facing });
    if (!repByKey.has(key)) repByKey.set(key, v); // first reached view per distinct config
  }
```

Replace with (one oracle per reachable position — no aliasing):

```typescript
  const cm = JSON.parse(readFileSync(cmJson, 'utf8'));
  // POSITION-KEYED: capture one oracle per reachable (gx,gy,facing). The old
  // viewConfigKey dedup collapsed cells with identical wall geometry but different
  // decorations onto one oracle (the chest<->candlestick aliasing bug). Each reachable
  // view gets its own engine frame from its cached state.
  const views: Array<{ gx: number; gy: number; facing: number }> = cm.reachable;
```

Then update the loop + logs that referenced `repByKey`:
- `console.log(\`collcapture: ${repByKey.size} distinct configs among ${cm.reachable.length} reached views -> ${outDir}\`);` → `console.log(\`collcapture: ${views.length} reachable views -> ${outDir}\`);`
- `for (const v of repByKey.values()) {` → `for (const v of views) {`
- `if (ok % 50 === 0) console.log(\`  captured ${ok}/${repByKey.size}...\`);` → `if (ok % 50 === 0) console.log(\`  captured ${ok}/${views.length}...\`);`

The now-unused import `viewConfigKeyFor` inside `phaseCollCapture` can be removed (the `const { loadLevel0 } = ...` line stays; remove the `const { viewConfigKeyFor } = ...` dynamic import and the `loadLevel0()`/`block` lines only if `block` is otherwise unused — verify and keep what the framebuffer grab needs). Do not touch other phases that define their own `repByKey`.

- [ ] **Step 2: Confirm the cached states + reachability fixture are present**

Run:
```bash
ls /tmp/wiz6-collmap-states/*.state | wc -l
node -e "console.log(require('./tools/parity/fixtures/engine/maze-reachability.json').reachable.length)"
```
Expected: `293` and `293`. If the states dir is gone (it lives in `/tmp`), regenerate first (needs the patched core + host built — `tools/libretro/build-core.sh && tools/libretro/build.sh`):
```bash
pnpm tsx tools/libretro/trace-maze.ts collmap /tmp/wiz6-sweep/collmap-full.json 1300
```

- [ ] **Step 3: Run the capture against the committed reachability fixture**

Run (point cmJson at the committed fixture for reproducibility; states dir + outDir are the defaults):
```bash
pnpm tsx tools/libretro/trace-maze.ts collcapture /tmp/wiz6-collmap-states tools/parity/fixtures/engine/maze-reachability.json /tmp/wiz6-sweep/oracles
```
Expected final log: `collcapture: 293 oracles written, 0 missing-state, 0 palette-miss`.
Verify:
```bash
ls /tmp/wiz6-sweep/oracles/*.idx.gz | wc -l   # -> 293
```
If any are `missing-state` / `palette-miss`, STOP — the cached-state set is incomplete (regenerate via collmap) or a palette drift exists; do not proceed with a partial set.

- [ ] **Step 4: Commit the capture-phase change**

```bash
git add tools/libretro/trace-maze.ts
git commit -m "feat(maze): collcapture captures one oracle per reachable position (293, no configKey dedup)"
```

---

## Task 2: Position-keyed asset builder

**Files:**
- Modify: `tools/parity/build-viewport-oracles.ts`
- Regenerate: `tools/parity/fixtures/engine/maze-viewport-oracles.json`, `extracted/maze/viewport-oracles.json`

- [ ] **Step 1: Key cases by position, drop the dedup + configKey**

In `tools/parity/build-viewport-oracles.ts`, replace the `byKey` (configKey) dedup block. Find:

```typescript
  const byKey = new Map<string, { configKey: string; gx: number; gy: number; facing: number; viewportB64: string }>();
  for (const m of files) {
    const gx = +m[1]!, gy = +m[2]!, facing = +m[3]!;
    const full = new Uint8Array(gunzipSync(readFileSync(resolve(oracleDir, m[0]))));
    const vp = new Uint8Array(w * h);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) vp[r * w + c] = full[(y + r) * 320 + x + c]!;
    const configKey = viewConfigKeyFor(block, { gx, gy, z: 0, facing });
    if (byKey.has(configKey)) continue; // one oracle per distinct config
    byKey.set(configKey, { configKey, gx, gy, facing, viewportB64: Buffer.from(gzipSync(vp)).toString('base64') });
  }
  const cases = [...byKey.values()].sort((a, b) => a.gx - b.gx || a.gy - b.gy || a.facing - b.facing);
```

Replace with (position key, one case per file, no dedup):

```typescript
  const byKey = new Map<string, { posKey: string; gx: number; gy: number; facing: number; viewportB64: string }>();
  for (const m of files) {
    const gx = +m[1]!, gy = +m[2]!, facing = +m[3]!;
    const full = new Uint8Array(gunzipSync(readFileSync(resolve(oracleDir, m[0]))));
    const vp = new Uint8Array(w * h);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) vp[r * w + c] = full[(y + r) * 320 + x + c]!;
    // POSITION-KEYED: each reachable (gx,gy,facing) is its own oracle. No wall-geometry
    // dedup (that aliased differing decorations onto one frame — the chest<->candlestick bug).
    const posKey = `${gx},${gy},${facing}`;
    byKey.set(posKey, { posKey, gx, gy, facing, viewportB64: Buffer.from(gzipSync(vp)).toString('base64') });
  }
  const cases = [...byKey.values()].sort((a, b) => a.gx - b.gx || a.gy - b.gy || a.facing - b.facing);
```

Remove the now-unused `viewConfigKeyFor` import if nothing else in the file uses it (check the import block `import { viewConfigKeyFor } from '../../packages/parser/src/maze/view-config.js';` — delete it if unused). Update the `_comment` string in the payload to say "one engine viewport per reachable (gx,gy,facing) position; keyed by posKey".

- [ ] **Step 2: Run the builder**

Run: `pnpm tsx tools/parity/build-viewport-oracles.ts`
Expected: `build-viewport-oracles: 293 oracles -> 293 distinct-config viewports -> ...` (the "distinct-config" wording in the existing log is fine, or update it to "positions").

- [ ] **Step 3: Verify the asset**

Run:
```bash
node -e "const d=require('./extracted/maze/viewport-oracles.json'); console.log('cases',d.cases.length,'firstKeys',Object.keys(d.cases[0])); const keys=new Set(d.cases.map(c=>c.posKey)); console.log('unique posKeys',keys.size);"
```
Expected: `cases 293 firstKeys [ 'posKey', 'gx', 'gy', 'facing', 'viewportB64' ]` and `unique posKeys 293`. Confirm the fixture copy matches:
```bash
diff extracted/maze/viewport-oracles.json tools/parity/fixtures/engine/maze-viewport-oracles.json && echo IDENTICAL
```

- [ ] **Step 4: Commit**

```bash
git add tools/parity/build-viewport-oracles.ts extracted/maze/viewport-oracles.json tools/parity/fixtures/engine/maze-viewport-oracles.json
git commit -m "feat(maze): position-keyed viewport oracles (293 cases, decoration-correct)"
```

---

## Task 3: Renderer position-key lookup (TDD)

**Files:**
- Modify: `packages/parser/src/maze/render.ts`
- Test: covered by Task 5's parity gate (the existing gate already drives `renderMazeViewport` with the oracle map).

- [ ] **Step 1: Change the `capturedViewports` lookup to a position key**

In `packages/parser/src/maze/render.ts`, find the capture-replay block:

```typescript
  if (o.capturedViewports?.size) {
    try {
      const vp = o.capturedViewports.get(viewConfigKeyFor(block, party));
      if (vp) return vp;
    } catch {
      /* fall through to generation */
    }
  }
```

Replace the lookup key with the position key (the map is now keyed by `"gx,gy,facing"`):

```typescript
  if (o.capturedViewports?.size) {
    // POSITION-KEYED capture-replay: look up the engine viewport by exact (gx,gy,facing).
    // (Was viewConfigKeyFor — wall geometry only — which aliased differing decorations.)
    const vp = o.capturedViewports.get(`${party.gx},${party.gy},${party.facing}`);
    if (vp) return vp;
  }
```

If `viewConfigKeyFor` becomes unused in `render.ts` after this (the generation-path `capturedSpans` lookup uses `lookupCapturedCase` which calls it internally — check), keep the import only if still referenced. Verify `pnpm --filter @wiz6/parser exec tsc --noEmit` is clean.

- [ ] **Step 2: Confirm via the parity gate**

This is verified by Task 5. Do not commit Task 3 alone — commit together with Task 5 (the test that exercises it). If you want an interim check now:
```bash
pnpm --filter @wiz6/parser test -- maze-capture-replay-parity
```
(Will fail until the test is updated in Task 5 — that's expected; Task 5 commits both.)

---

## Task 4: Viewer loader position-key map

**Files:**
- Modify: `packages/viewer/src/data-loader.ts`

- [ ] **Step 1: Key the oracle map by position**

In `packages/viewer/src/data-loader.ts`, `loadMazeViewportOracles`, find:

```typescript
    const data = (await res.json()) as { cases?: Array<{ configKey: string; viewportB64: string }> };
    if (!Array.isArray(data?.cases)) return null;
```
Replace with:
```typescript
    const data = (await res.json()) as { cases?: Array<{ gx: number; gy: number; facing: number; viewportB64: string }> };
    if (!Array.isArray(data?.cases)) return null;
```
And find:
```typescript
        if (c?.configKey && typeof c.viewportB64 === 'string') map.set(c.configKey, await gunzipB64(c.viewportB64));
```
Replace with:
```typescript
        if (Number.isFinite(c?.gx) && typeof c.viewportB64 === 'string') map.set(`${c.gx},${c.gy},${c.facing}`, await gunzipB64(c.viewportB64));
```
Update the JSDoc above the function: it currently says "keyed by configKey ... the 266 from the complete collmap BFS" → "keyed by (gx,gy,facing) position ... the 293 engine-reachable views".

- [ ] **Step 2: Typecheck + viewer suite**

Run: `pnpm --filter @wiz6/viewer exec tsc --noEmit` (expect clean).
Run: `pnpm --filter @wiz6/viewer test` (expect all pass — the MazeView test mocks `loadMazeViewportOracles` with `mockResolvedValue(null)`, so no mock change needed; confirm).

- [ ] **Step 3: Commit**

```bash
git add packages/viewer/src/data-loader.ts
git commit -m "feat(viewer): load viewport oracles keyed by (gx,gy,facing) position"
```

---

## Task 5: Parity gate + anti-regression coverage + aliasing spot-check (TDD)

**Files:**
- Modify: `packages/parser/tests/maze/maze-capture-replay-parity.test.ts`
- Also commits: `packages/parser/src/maze/render.ts` (Task 3)

- [ ] **Step 1: Update the oracle case type + map builder to position keys**

In `packages/parser/tests/maze/maze-capture-replay-parity.test.ts`, change `interface OracleCase` `configKey: string;` → `posKey: string;`. In `buildOracleMap`, change:
```typescript
    m.set(c.configKey, new Uint8Array(gunzipSync(Buffer.from(c.viewportB64, 'base64'))));
```
to:
```typescript
    m.set(`${c.gx},${c.gy},${c.facing}`, new Uint8Array(gunzipSync(Buffer.from(c.viewportB64, 'base64'))));
```

- [ ] **Step 2: Update the count gate to 293**

Find:
```typescript
  it('committed all engine-reachable level-0 configs (the complete BFS)', () => {
    expect(ORACLES.cases.length).toBe(266);
    expect(oracleMap.size).toBe(266);
  });
```
Replace with:
```typescript
  it('committed one oracle per engine-reachable level-0 view (the complete BFS)', () => {
    expect(ORACLES.cases.length).toBe(293);
    expect(oracleMap.size).toBe(293);
  });
```
(The existing `it.each(ORACLES.cases ...)` byte-exact block needs no change — it drives each case's party through `renderMazeViewport` with `capturedViewports: oracleMap`, which now resolves by position. All 293 render byte-exact.)

- [ ] **Step 3: Add the anti-regression coverage gate**

Add a `REACH` load near the `ORACLES` load:
```typescript
const REACH = JSON.parse(readFileSync(resolve(FIX, 'maze-reachability.json'), 'utf8')) as {
  reachable: Array<{ gx: number; gy: number; facing: number }>;
};
```
Add inside the `describe`:
```typescript
  it('covers exactly the engine-reachable set — one oracle per (gx,gy,facing), no gaps, no dupes', () => {
    const oracleKeys = new Set(ORACLES.cases.map((c) => `${c.gx},${c.gy},${c.facing}`));
    expect(oracleKeys.size, 'no duplicate posKeys').toBe(ORACLES.cases.length);
    const reachKeys = new Set(REACH.reachable.map((r) => `${r.gx},${r.gy},${r.facing}`));
    // every reachable view has an oracle (no silent drop — the bug that aliased decorations)
    for (const k of reachKeys) expect(oracleKeys.has(k), `missing oracle for reachable view ${k}`).toBe(true);
    // and no oracle for a non-reachable view
    for (const k of oracleKeys) expect(reachKeys.has(k), `oracle for non-reachable view ${k}`).toBe(true);
  });
```

- [ ] **Step 4: Add the aliasing spot-check (the chests render distinct frames)**

Add inside the `describe`:
```typescript
  it('previously-aliased decoration neighbours now render DISTINCT frames', () => {
    // The chest<->candlestick pairs: same wall geometry, different decorations. Before the
    // position-key fix these shared one oracle; now each has its own engine frame.
    const pairs: Array<[[number, number, number], [number, number, number]]> = [
      [[127, 124, 1], [127, 132, 1]], // group 2: special4=9 ahead vs special4=1 ahead
      [[126, 133, 0], [128, 133, 0]], // group 3: the symmetric "either side" chests
    ];
    for (const [a, b] of pairs) {
      const va = oracleMap.get(`${a[0]},${a[1]},${a[2]}`);
      const vb = oracleMap.get(`${b[0]},${b[1]},${b[2]}`);
      expect(va, `oracle ${a}`).toBeDefined();
      expect(vb, `oracle ${b}`).toBeDefined();
      const identical = va!.length === vb!.length && va!.every((x, i) => x === vb![i]);
      expect(identical, `${a} and ${b} must render different frames (different decorations)`).toBe(false);
    }
  });
```

- [ ] **Step 5: Run the gate**

Run: `pnpm --filter @wiz6/parser test -- maze-capture-replay-parity`
Expected: all pass (count 293, 293 byte-exact renders, coverage gate, aliasing spot-check).
Run: `pnpm --filter @wiz6/parser test` — expect no regressions.

- [ ] **Step 6: Commit (render.ts + test together)**

```bash
git add packages/parser/src/maze/render.ts packages/parser/tests/maze/maze-capture-replay-parity.test.ts
git commit -m "feat(maze): position-key capture-replay lookup + 293 parity, coverage & anti-aliasing gates"
```

---

## Task 6: Full verify + manual smoke + TODO

**Files:** `TODO.md`

- [ ] **Step 1: Full suites + viewer build**

Run: `pnpm --filter @wiz6/parser test && pnpm --filter @wiz6/viewer test && pnpm --filter @wiz6/viewer build`
Expected: parser + viewer suites green; build clean. Verify the asset bundled:
```bash
node -e "const d=require('./packages/viewer/dist/maze/viewport-oracles.json'); console.log('bundled cases',d.cases.length,'sampleKey',[d.cases[0].gx,d.cases[0].gy,d.cases[0].facing].join(','));"
```
Expected: `bundled cases 293 ...`.

- [ ] **Step 2: Manual smoke**

Run: `pnpm dev:viewer`. In the browser: create a party → START NEW GAME → enter level-0. Walk to both central treasure chests; confirm each renders correctly (no chest↔candlestick swap) at every distance, including standing right in front. Spot-check a straight corridor still renders.

- [ ] **Step 3: Update TODO**

Edit `TODO.md`: under #086, note the decoration-aliasing fix shipped (capture-replay now keyed by `(gx,gy,facing)`; all 293 reachable views captured; the chest↔candlestick aliasing gone; anti-regression coverage gate added). Commit:
```bash
git add TODO.md
git commit -m "docs(todo): #086 decoration-aliasing fixed (position-keyed oracles, 293 views)"
```

---

## Notes for the implementer

- ESM: all relative imports use `.js` extensions even though sources are `.ts`.
- The `capturedSpans` generation-path mechanism (keyed by `viewConfigKey` via `lookupCapturedCase`) is SEPARATE and must stay untouched — only the full-viewport `capturedViewports` switches to position keys.
- Tasks 1–2 run the harness / regenerate committed assets — run them in the MAIN session (the dosbox-pure host is stateful + cwd-bound). Tasks 3–6 are pure code/tests.
- `MazeParty` is `{ gx, gy, z, facing }`. The position key is `"gx,gy,facing"` (no `z` — level-0 only).
- Cached states (`/tmp/wiz6-collmap-states/`) and raw oracles (`/tmp/wiz6-sweep/oracles/`) live in `/tmp` (ephemeral). If absent, regenerate via `trace-maze.ts collmap` then re-run Task 1's capture.
