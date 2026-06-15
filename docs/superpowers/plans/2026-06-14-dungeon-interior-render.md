# Byte-Exact Level-0 Interior Rendering Implementation Plan (#091 Piece B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the level-0 dungeon interior (cells past the forced doors) render byte-exact in the port, by capturing the engine's actual viewport per `(gx,gy,facing)` and replaying it verbatim — the same capture-replay approach that already makes the entrance pixel-perfect.

**Architecture:** Reach interior cells by driving the engine's **real** FORCE-open (poking is proven dead, #087/#091 Piece A), open each door **once**, freeze a transient interior-seed state, then run the engine-truth BFS + clean per-cell capture **seeded from that state**. The capture writes `maze-freeroam-*.idx.gz` into the existing oracle dir, which `build-viewport-oracles.ts` merges into `viewport-oracles.json` unchanged; the viewer already replays it byte-exact.

**Tech Stack:** TypeScript ESM (pnpm monorepo); the dosbox-pure live harness (`HostClient`/`LiveSession`) driven by `tools/libretro/trace-maze.ts`; the `tools/parity/build-viewport-oracles.ts` asset builder; Vitest parity tests; Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-06-13-dungeon-interior-render-design.md`.

---

## ✅ Stage 0 GATE: PASSED (GO) — 2026-06-15

Task 1 ran and returned **GO**. The (124,121,f2) lock-3 door **can** be forced open and traversed (THESUS STR-18 vs lock-3, ~3/8 rolls succeed). The first NO-GO was a false negative from two cadence bugs in `forceDoorOpen` (interactive STRAINING bar not resolved; post-success keys rotated the party off the door edge) — both fixed and committed (`bc38366`, `a89b8c4`). RNG-phase stepping (`c.step(2 + attempt*17)` after `unserialize`) **does** vary the roll. Proven machinery now in `tools/libretro/trace-maze.ts`: `forceDoorOpen(c, base, memberDown, png?)`, `readRoster(c, base)`, `driveToDoor(c, maxBoots)`, `phaseForceThrough2`/`phaseForceDiag`. **Caveat for Stage 1:** the entry walk is encounter-prone (driveToDoor needs up to ~10 boot retries) and stepping into the interior often triggers a random encounter (gs=11) — capture/seed flows must retry for a clean gs=5 frame. Stage 1 below was updated to use this proven strategy.

## ⛔ Stage 0 is a HARD GATE

Stage 0 (Task 1) is a **feasibility spike with a GO/NO-GO decision**. Driving the live engine through a real force-opened door and navigating beyond it is **unproven**. **Do not start Stage 1 until Task 1 reports GO** (the party reached (124,120) through a real force-open). If Task 1 reports NO-GO, STOP and escalate to the human — the documented fallback (semi-manual seed creation, spec Approach 2) requires re-planning Stage 1's Task 2.

Stages 1–3 below are written assuming GO (Approach 1, automated). The force key-sequence and member-pick are **resolved live in Task 1** and exposed as the reusable `forceDoorOpen` helper that later tasks call — those tasks reference that helper rather than re-deriving the sequence.

---

## File structure

**Modify:**
- `tools/libretro/trace-maze.ts` — add the `forceDoorOpen` helper + `forcethrough` spike phase (Task 1); add a `--seed <stateFile>` option to `collmap` (Task 3) and `engcap` (Task 4); add an `interiorcap` driver phase that iterates doors (Task 10).
- `tools/parity/fixtures/engine/maze-reachability-interior.json` — NEW committed artifact: the engine's interior reachability (cells + forward verdicts), produced by seeded `collmap` (Tasks 3, 10).
- `tools/parity/fixtures/engine/maze-viewport-oracles.json` + `extracted/maze/viewport-oracles.json` — regenerated (merged entrance + interior; Tasks 6, 10).
- `packages/parser/tests/maze/maze-capture-replay-parity.test.ts` — extend to interior configs (Tasks 7, 10).
- `packages/viewer/e2e/maze-walk-interior.spec.ts` — NEW e2e walking gate through the door (Task 8).

**No changes needed:** `tools/parity/build-viewport-oracles.ts` (auto-merges any `maze-freeroam-*.idx.gz` in the oracle dir); viewer wiring (`loadMazeViewportOracles` / `renderMazeViewport` — just loads a bigger map).

**Note on test style:** Tasks 1–6 and 10's capture are **live-engine RE/capture work**, verified by observation against engine ground truth (the project convention for `trace-maze.ts` work), not classic red-green TDD. Tasks 7–9 are gate tests verified against committed oracles.

---

## Stage 0 — Feasibility spike (GATE)

### Task 1: `forceDoorOpen` helper + `forcethrough` spike

**Files:**
- Modify: `tools/libretro/trace-maze.ts` (add helper + phase near the other door phases; register in `main()`'s phase dispatch ~L5000-5070)

Context: `driveToFreeRoam(c)` returns the DGROUP base, party at gx127 gy121 f0 in gs=5 free-roam. `frParty(c, base)` → `{gs, f, gx, gy, sp}`. `frMove(c, base, key)` taps a key and returns whether it took. `c.key(name,'tap')`, `c.step(n)`, `c.serialize(path)`, `c.unserialize(path)`. The #089 door is at global (124,121) facing 2; from the entrance the path to land in the door cell facing the door is `left, up, up, up, left` (per `state-catalog.ts` `MAZE_DOOR_*`). The FORCE/PICK/EXIT menu is reached by `enter` (PARTY OPTIONS, cursor SEARCH) then `right down enter` (move to OPEN grid idx4, detect type-7 door, raise menu with cursor on FORCE). Selecting FORCE then prompts WHO WILL TRY? (member picker).

- [ ] **Step 1: Add the `forceDoorOpen` helper above the spike phase**

This helper assumes the party is already standing in the door cell facing the door. It runs the real FORCE flow once and returns whether the door is now traversable (it taps `up` and checks movement). It does NOT navigate or retry — the caller owns retry/seed.

```typescript
/** Run the engine's real OPTIONS→OPEN→FORCE→WHO flow ONCE on the door the party
 *  is currently facing, then attempt to step through. Returns the post-attempt
 *  party plus whether the party stepped forward (= door opened & traversable) and
 *  whether combat triggered. The party MUST already be in the door cell facing the
 *  door. Key sequence (verified live in Task 1):
 *    enter            -> PARTY OPTIONS (cursor SEARCH)
 *    right down enter -> OPEN (grid idx4) -> detect type-7 door -> FORCE/PICK/EXIT (cursor FORCE)
 *    enter            -> select FORCE -> WHO WILL TRY? picker (cursor on first member)
 *    enter            -> pick the first member -> animated strain roll
 *  Then settle for the roll, dismiss any result window, and tap up. */
async function forceDoorOpen(c: HostClient, base: number): Promise<{ moved: boolean; gs: number; gx: number; gy: number }> {
  const before = await frParty(c, base);
  // OPTIONS -> OPEN -> FORCE menu.
  await c.key('enter', 'tap'); await c.step(40);          // PARTY OPTIONS
  await c.key('right', 'tap'); await c.step(20);
  await c.key('down', 'tap'); await c.step(20);
  await c.key('enter', 'tap'); await c.step(60);          // OPEN -> FORCE/PICK/EXIT (cursor FORCE)
  await c.key('enter', 'tap'); await c.step(60);          // select FORCE -> WHO picker
  await c.key('enter', 'tap'); await c.step(220);         // pick first member -> strain roll plays
  // Dismiss the result window (success/failure/jammed) and let the menu tear down.
  await c.key('enter', 'tap'); await c.step(60);
  await c.key('escape', 'tap'); await c.step(40);
  // Attempt the step (no unserialize — keep the door's opened state).
  await c.key('up', 'tap'); await c.step(70);
  const after = await frParty(c, base);
  return { moved: after.gx !== before.gx || after.gy !== before.gy, gs: after.gs, gx: after.gx, gy: after.gy };
}
```

- [ ] **Step 2: Add the `forcethrough` spike phase**

```typescript
/** `forcethrough` — SPIKE (#091 Piece B Stage 0). Drive to the (124,121,f2) door,
 *  run forceDoorOpen with retry, and report whether the party walks through to
 *  (124,120). Decides GO (automated capture) vs NO-GO (manual-seed fallback). */
async function phaseForceThrough(c: HostClient): Promise<void> {
  const base = await driveToFreeRoam(c);
  // Navigate into the door cell facing the door (path from state-catalog MAZE_DOOR_*).
  for (const k of ['left', 'up', 'up', 'up', 'left'] as const) { await frMove(c, base, k); }
  const at = await frParty(c, base);
  console.log(`forcethrough: at gx${at.gx} gy${at.gy} f${at.f} gs${at.gs} (want gx124 gy121 f2)`);
  if (at.gx !== 124 || at.gy !== 121 || at.f !== 2) { console.log('NOT at the door — abort (re-check the nav path)'); return; }
  const atDoor = '/tmp/wiz6-forcethrough-door.state';
  await c.serialize(atDoor);
  const MAX = 12;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    await c.unserialize(atDoor); await c.step(2);
    const r = await forceDoorOpen(c, base);
    console.log(`  attempt ${attempt}/${MAX}: moved=${r.moved} gs=${r.gs} -> gx${r.gx} gy${r.gy}`);
    if (r.gs !== 5) { console.log(`    combat/menu (gs=${r.gs}) triggered — retrying`); continue; }
    if (r.moved && r.gx === 124 && r.gy === 120) { console.log(`GO: forced + stepped to (124,120) in ${attempt} attempt(s)`); return; }
  }
  console.log('NO-GO: could not force + step through in ' + MAX + ' attempts — escalate (Approach 2 fallback)');
}
```

- [ ] **Step 3: Register the phase in `main()`**

Find the phase dispatch chain in `main()` (e.g. `else if (phase === 'screencap') ...`) and add:

```typescript
    else if (phase === 'forcethrough') await phaseForceThrough(c);
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @wiz6/mcp exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Run the spike (live) and observe**

Run: `pnpm tsx tools/libretro/trace-maze.ts forcethrough`
Expected one of:
- `GO: forced + stepped to (124,120) ...` → **proceed to Stage 1.**
- `NO-GO: ...` → the key sequence or member-pick is wrong, OR the harness party can't force. **Debug the menu navigation live before declaring NO-GO:** capture frames at each step with the existing `screencap` phase (`pnpm tsx tools/libretro/trace-maze.ts screencap <state> <keys> <out.png>`) or `dosbox_live_screenshot`, confirm each key lands where the comment claims (PARTY OPTIONS → OPEN → FORCE → WHO → member), and adjust the `forceDoorOpen` key sequence / settle counts. Re-run. Only declare NO-GO (and escalate) if, after confirming the menu navigation is correct and a member is forcing, the engine still won't let the party step through — that would mean real force-open isn't traversable in the harness.

> If the boot flakes with "free-roam unlock failed" (the known non-deterministic scripted-walker drain), just re-run — it's unrelated to this change.

- [ ] **Step 6: Commit**

```bash
git add tools/libretro/trace-maze.ts
git commit -m "feat(#091): forceDoorOpen helper + forcethrough spike (Stage 0 gate)"
```

**🚦 DECISION GATE:** If Step 5 was NO-GO, STOP here and escalate. Only continue to Stage 1 on GO.

---

## Stage 1 — Interior capture pipeline (the (124,121,f2) door first)

### Task 2: Interior-seed creation phase

**Files:**
- Modify: `tools/libretro/trace-maze.ts` (add phase + register)

Produces a capture-time-only seed state: party cleanly in the interior at (124,120) gs=5, door open. **Reuses the Stage-0-proven `driveToDoor`, `readRoster`, and `forceDoorOpen` (with the RNG-step + strongest-member strategy)** — do NOT re-derive the force flow. This targets the (124,121,f2) door specifically; generalization to all doors is Task 10.

- [ ] **Step 1: Add the `interiorseed` phase**

```typescript
/** `interiorseed [outState] [maxAttempts]` — drive to the (124,121,f2) door, force
 *  it open with the strongest living member under RNG-phase variation, step through,
 *  and serialize a CLEAN interior free-roam state (party at (124,120), gs=5). The
 *  seed is a transient capture-time artifact, NOT committed. Reuses the Stage-0
 *  machinery (driveToDoor/readRoster/forceDoorOpen). An arrival encounter (gs=11) is
 *  rejected (we want a clean gs=5 seed); the loop retries with a fresh RNG phase. */
async function phaseInteriorSeed(c: HostClient): Promise<void> {
  const outState = process.argv[3] ?? '/tmp/wiz6-interior-seed.state';
  const maxAttempts = Number(process.argv[4] ?? '24');
  const base = await driveToDoor(c); // (124,121,f2), gs=5 (boot-retries internally)
  const roster = await readRoster(c, base);
  const living = roster.filter((m) => m.alive);
  const strongest = living.length ? living.reduce((a, b) => (b.str > a.str ? b : a)) : roster[0]!;
  const memberDown = strongest.idx + 1;
  console.log(`interiorseed: forcing with member${strongest.idx} STR=${strongest.str} (down x${memberDown})`);
  const atDoor = '/tmp/wiz6-interiorseed-door.state';
  await c.serialize(atDoor);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await c.unserialize(atDoor);
    await c.step(2 + attempt * 17); // vary RNG phase (Stage-0-proven to change the roll)
    const r = await forceDoorOpen(c, base, memberDown);
    if (r.moved && r.gx === 124 && r.gy === 120 && r.gs === 5) {
      await c.serialize(outState);
      console.log(`interiorseed: clean seed at (124,120) gs5 on attempt ${attempt} -> ${outState}`);
      return;
    }
    console.log(`  attempt ${attempt}: moved=${r.moved} gs=${r.gs} -> gx${r.gx} gy${r.gy}${r.gs === 11 ? ' (arrival encounter — reject, retry)' : ''}`);
  }
  console.log('interiorseed: FAILED to create a clean interior seed — abort (raise maxAttempts or add a flee step)');
}
```

> Note: requiring `gs === 5` rejects arrival-encounter (gs=11) traverses so the seed is clean free-roam. If encounters dominate and 24 attempts isn't enough, raise `maxAttempts` or add a flee/resolve step after a gs=11 traverse — but try the clean-retry approach first.

- [ ] **Step 2: Register `else if (phase === 'interiorseed') await phaseInteriorSeed(c);` in `main()`.**

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @wiz6/mcp exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Create the seed (live) + verify**

Run: `pnpm tsx tools/libretro/trace-maze.ts interiorseed /tmp/wiz6-interior-seed.state`
Expected: `interiorseed: clean seed at (124,120) gs5 on attempt N -> /tmp/wiz6-interior-seed.state`, and the file exists (`ls -la /tmp/wiz6-interior-seed.state`). (Re-run on the known boot flake; `driveToDoor` already retries internally.)

- [ ] **Step 5: Commit**

```bash
git add tools/libretro/trace-maze.ts
git commit -m "feat(#091): interiorseed phase — force a door + freeze the interior state"
```

### Task 3: `collmap --seed` — engine reachability from a seed state

**Files:**
- Modify: `tools/libretro/trace-maze.ts` (`phaseCollMap`)

`phaseCollMap` currently starts from `driveToFreeRoam` + serializes the entrance node. Add an optional seed: if a `--seed <state>` arg is present, unserialize it (party already in the interior, door open) and BFS from there instead. The BFS already explores via the engine itself, so it maps the interior. Output goes to a distinct file.

- [ ] **Step 1: Read `phaseCollMap` (~L4040) and find the entrance setup**

Confirm the lines `const base = await driveToFreeRoam(c); const start = await frParty(c, base);` and the entrance-node serialize. Note the output-file arg parsing (`process.argv[3]`) and budget (`process.argv[4]`).

- [ ] **Step 2: Add seed handling at the top of `phaseCollMap`**

Replace the entrance setup with a seed-aware version (keep the existing `openAllDoors` poke — harmless; the seed already has the door open):

```typescript
  // #091 Piece B: optionally BFS from an interior SEED state (party already past an
  // opened door) instead of the entrance, to map the interior reachable graph.
  const seedArg = process.argv.indexOf('--seed');
  const seedState = seedArg !== -1 ? process.argv[seedArg + 1] : null;
  let base: number;
  if (seedState) {
    await c.unserialize(seedState); await c.step(2);
    base = await c.anchor();
    console.log(`collmap: SEEDED from ${seedState}`);
  } else {
    base = await driveToFreeRoam(c);
  }
  const start = await frParty(c, base);
```

(If `outFile`/`budget` were read from `process.argv[3]`/`[4]`, guard them so `--seed`/its value aren't misparsed as the outfile/budget — e.g. read them as the first two args that aren't `--seed` or its value, or require `--seed` to come after the positional args. Match the existing arg style; simplest is to pass positional outFile + budget first, then `--seed <state>` last.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @wiz6/mcp exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Build interior reachability (live) + verify**

Run: `pnpm tsx tools/libretro/trace-maze.ts collmap /tmp/wiz6-collmap-interior.json 2000 --seed /tmp/wiz6-interior-seed.state`
Expected: BFS progress, ending with a reachable set that INCLUDES (124,120) and interior cells beyond it. Verify:
```bash
python3 -c "import json;d=json.load(open('/tmp/wiz6-collmap-interior.json'));cells={(v['gx'],v['gy']) for v in d['reachable']};print('cells',len(cells),'(124,120) in?',(124,120) in cells)"
```
Expected: `(124,120) in? True` and more cells than the entrance-only set.

- [ ] **Step 5: Promote to the committed interior-reachability fixture**

```bash
cp /tmp/wiz6-collmap-interior.json tools/parity/fixtures/engine/maze-reachability-interior.json
git add tools/libretro/trace-maze.ts tools/parity/fixtures/engine/maze-reachability-interior.json
git commit -m "feat(#091): collmap --seed + interior reachability fixture"
```

### Task 4: `engcap --seed` — clean per-cell interior capture

**Files:**
- Modify: `tools/libretro/trace-maze.ts` (`phaseEngCapture`)

`phaseEngCapture` builds its BFS graph from `maze-reachability.json` and an `ENTRANCE` node, capturing each cell by a clean move from its predecessor's serialized state. Add a seed mode: when `--seed <state>` + `--reach <interiorJson>` are present, use the interior reachability json and the seed's start node as the BFS root, writing `maze-freeroam-*.idx.gz` into the SAME outDir (so the builder merges them).

- [ ] **Step 1: Read `phaseEngCapture` (~L4353)** — confirm the `reach` load (`maze-reachability.json`), the `ENTRANCE` node const, the `reachedOrder`/`prev` BFS, and `driveToFreeRoam` + `entranceState` serialize.

- [ ] **Step 2: Parameterize the reachability file + entrance node**

```typescript
  // #091 Piece B: optional interior seed + reachability override.
  const seedArg = process.argv.indexOf('--seed');
  const reachArg = process.argv.indexOf('--reach');
  const seedState = seedArg !== -1 ? process.argv[seedArg + 1]! : null;
  const reachFile = reachArg !== -1 ? process.argv[reachArg + 1]! : `${process.cwd()}/tools/parity/fixtures/engine/maze-reachability.json`;
  const reach = JSON.parse(readFileSync(reachFile, 'utf8'));
```

Replace the hardcoded `ENTRANCE` with the seed's actual start node when seeded:

```typescript
  // When seeded, the BFS root is wherever the seed state's party stands.
  let ENTRANCE: Node;
  if (seedState) {
    await c.unserialize(seedState); await c.step(2);
    const base0 = await c.anchor();
    const p0 = await frParty(c, base0);
    ENTRANCE = { gx: p0.gx, gy: p0.gy, facing: p0.f };
  } else {
    ENTRANCE = { gx: 127, gy: 121, facing: 0 };
  }
```

And make the entrance-frame source seed-aware (the `fromEntrance`/`driveToFreeRoam` + `entranceState` setup):

```typescript
  const base = seedState ? await c.anchor() : await driveToFreeRoam(c);
  const entranceState = `${outDir}/engcap-entrance.state`;
  if (seedState) { await c.unserialize(seedState); await c.step(2); }
  await c.serialize(entranceState);
```

(Keep the rest of the incremental-BFS-capture loop unchanged — it BFSes `reachedOrder` from `ENTRANCE` and writes `maze-freeroam-*.idx.gz` + `state-*.state` into `outDir`.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @wiz6/mcp exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Capture the interior (live) into the SAME oracle dir as the entrance**

First ensure the entrance oracles exist in the dir (re-capture if needed):
```bash
pnpm tsx tools/libretro/trace-maze.ts engcap all /tmp/wiz6-oracles
```
Then the interior, seeded:
```bash
pnpm tsx tools/libretro/trace-maze.ts engcap all /tmp/wiz6-oracles --seed /tmp/wiz6-interior-seed.state --reach tools/parity/fixtures/engine/maze-reachability-interior.json
```
Expected: `engcap all: N captured, M failed`, and interior `maze-freeroam-gx124-gy120-*.idx.gz` files now exist in `/tmp/wiz6-oracles` (`ls /tmp/wiz6-oracles | grep gy120`).

- [ ] **Step 5: Commit the tooling change**

```bash
git add tools/libretro/trace-maze.ts
git commit -m "feat(#091): engcap --seed/--reach — clean per-cell interior capture"
```

### Task 5: Spot-check the interior capture

- [ ] **Step 1: Decode a captured interior view to a PNG and eyeball it**

Use the existing screen decoder on one interior oracle (e.g. (124,120,f2)):
```bash
python3 -c "
import gzip,json
raw=gzip.open('/tmp/wiz6-oracles/maze-freeroam-gx124-gy120-f2.idx.gz').read()
print('bytes',len(raw),'distinct idx',len(set(raw)))
"
```
Expected: a 320×200 (64000-byte) index buffer with several distinct palette indices (not all-zero / not a solid fill) — i.e. a real rendered corridor/room view, confirming the capture is a genuine frame.

- [ ] **Step 2: Confirm coverage count**

```bash
ls /tmp/wiz6-oracles/maze-freeroam-*.idx.gz | wc -l
```
Expected: more than the entrance-only count (~204, the entrance-normal-connected component) — the interior added cells.

No commit (inspection only).

---

## Stage 2 — Wire + gate

### Task 6: Rebuild the merged viewport-oracle asset

**Files:**
- Modify (regenerate): `tools/parity/fixtures/engine/maze-viewport-oracles.json`, `extracted/maze/viewport-oracles.json`

- [ ] **Step 1: Build from the merged oracle dir**

```bash
pnpm tsx tools/parity/build-viewport-oracles.ts /tmp/wiz6-oracles
```
Expected: `build-viewport-oracles: N oracles -> N distinct-config viewports -> ...` with N larger than the previous entrance-only count (204).

- [ ] **Step 2: Confirm the interior config is in the asset**

```bash
python3 -c "import json;d=json.load(open('extracted/maze/viewport-oracles.json'));ks={c['posKey'] for c in d['cases']};print('cases',len(d['cases']),'124,120,2 in?','124,120,2' in ks)"
```
Expected: `124,120,2 in? True` and a larger case count.

- [ ] **Step 3: Commit**

```bash
git add tools/parity/fixtures/engine/maze-viewport-oracles.json extracted/maze/viewport-oracles.json
git commit -m "feat(#091): rebuild viewport-oracles with level-0 interior (byte-exact interior render)"
```

### Task 7: Extend the capture-replay parity gate to the interior

**Files:**
- Modify: `packages/parser/tests/maze/maze-capture-replay-parity.test.ts`

This test is **data-driven** — `it.each(ORACLES.cases)` asserts each config replays byte-exact, so the new interior cases are gated automatically. BUT it has a hardcoded `expect(ORACLES.cases.length).toBe(204)` and `expect(oracleMap.size).toBe(204)` (the entrance-only count) that will now fail.

- [ ] **Step 1: Run the test (now failing on the count)**

Run: `pnpm --filter @wiz6/parser test maze-capture-replay-parity`
Expected: FAIL on `expect(ORACLES.cases.length).toBe(204)` (and `oracleMap.size`), because the asset now has more cases. The per-config `it.each` assertions should still pass.

- [ ] **Step 2: Replace the literal 204 with an asset-derived expectation**

Edit the test: change the two `.toBe(204)` assertions to derive from the asset itself (it's the ground truth — a literal count is a maintenance trap). Assert the case count equals the distinct-posKey count (no duplicate posKeys) rather than a literal, and add a spot-check that the interior config `124,120,2` is present:

```typescript
  it('one oracle per walkable level-0 view, no duplicate posKeys', () => {
    expect(oracleMap.size).toBe(ORACLES.cases.length); // no duplicate posKeys
    expect(oracleMap.has('124,120,2')).toBe(true);     // interior captured (#091 Piece B)
  });
```

- [ ] **Step 3: Run, verify PASS**

Run: `pnpm --filter @wiz6/parser test maze-capture-replay-parity`
Expected: PASS (all configs, including interior, byte-exact).

- [ ] **Step 4: Full parser suite (no regression)**

Run: `pnpm --filter @wiz6/parser test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/parser/tests/maze/maze-capture-replay-parity.test.ts
git commit -m "test(#091): gate interior viewport configs byte-exact (capture-replay)"
```

### Task 8: e2e walking gate through the door (+ a DEV maze-injection hook)

**Files:**
- Create: `packages/viewer/e2e/maze-walk-interior.spec.ts`
- Modify: the viewer's maze entry/store wiring to add a DEV-only maze-state injection hook (confirmed location in Step 1)
- Create (capture + commit): independent interior walk fixtures `tools/parity/fixtures/engine/maze-walk-gxNN-gyNN-fF.idx.gz`

Reality check (confirmed against the codebase): there is **no maze party-injection hook** — only the creation flow injects (`gotoCreation` → `window.__WIZ6_E2E_STATE__`; the maze specs reach free-roam via the real START-NEW-GAME cutscene + `localStorage('wiz6:active-party')`, then navigate by **real `ArrowUp`/`ArrowRight` presses**). `expectMazeViewportMatchesFixture(page, name)` takes a **fixture-NAME string** (e.g. `'maze-walk-gx127-gy121-f2'`) and compares the running app's `MAZE_VIEWPORT` rect to an **independently captured** `maze-walk-*` fixture (intentionally a different file set from the renderer's `maze-freeroam-*` oracles — that's what makes it non-tautological: it catches wiring bugs like a wrong lookup key or screen coords).

Getting the e2e camera into the interior deterministically therefore needs a small **DEV-only maze-state injection hook** (mirroring the creation one): set party `(gx,gy,facing)` + an open-door overlay before the maze mounts, so the spec skips the RNG FORCE (the deterministic-force RNG dev hook is a separate #089 deferred item — not built here).

- [ ] **Step 1: Find where the maze reads its initial party position + door overlay**

Read `packages/viewer/e2e/maze-walk-gate-square.spec.ts` (the cutscene cadence + `expectMazeViewportMatchesFixture(page, name)` usage), `packages/viewer/e2e/lib/drive.ts` (the `gotoCreation` injection pattern — `page.evaluate` setting `window.__WIZ6_E2E_STATE__`), and the maze page/store (`packages/viewer/src/pages/.../MazeView*` + its game-session store) to find where party `(gx,gy,facing)` and the `DoorStateOverlay` (from #089) are initialized. Identify the single seam where a DEV hook can override them at mount.

- [ ] **Step 2: Add a DEV-only maze-injection hook**

In the maze mount/store init seam, when `import.meta.env.DEV` (or the existing E2E flag) and `window.__WIZ6_E2E_MAZE__` is set, override the initial party position + seed the door overlay open. Example shape (adapt to the actual store API found in Step 1):

```typescript
// DEV/E2E only: let tests place the party in the interior with a door pre-opened,
// so interior rendering can be gated without driving the RNG FORCE. (#091 Piece B)
if (import.meta.env.DEV && (window as any).__WIZ6_E2E_MAZE__) {
  const s = (window as any).__WIZ6_E2E_MAZE__ as { gx: number; gy: number; facing: number; openDoors?: Array<{ gx: number; gy: number; facing: number }> };
  setPartyPosition({ gx: s.gx, gy: s.gy, facing: s.facing });
  for (const d of s.openDoors ?? []) markDoorOpen(d); // the #089 DoorStateOverlay setter
}
```

- [ ] **Step 3: Capture + commit independent interior walk fixtures**

For each interior cell the spec will assert, capture an independent `maze-walk-*` fixture (engine ground truth). Reuse the interior capture from Task 4 (the `/tmp/wiz6-oracles/maze-freeroam-gxNN-gyNN-fF.idx.gz` files ARE engine captures); copy the ones the spec uses into the fixture dir under the walk-gate name:

```bash
# pick interior cells confirmed present in the asset (Task 6 Step 2), e.g. 124,120,2 and one step deeper
for cell in gx124-gy120-f2 gx124-gy119-f2; do
  cp /tmp/wiz6-oracles/maze-freeroam-$cell.idx.gz tools/parity/fixtures/engine/maze-walk-$cell.idx.gz
done
```

> If `maze-walk-*` fixtures are stored as the `MAZE_VIEWPORT` crop (176×112) rather than the full 320×200, match whatever the existing `maze-walk-gx127-*` fixtures are (inspect one: `python3 -c "import gzip;print(len(gzip.open('tools/parity/fixtures/engine/maze-walk-gx127-gy121-f2.idx.gz').read()))"` — 64000 = full screen, 19712 = viewport crop). If they're cropped, crop the interior captures the same way before committing (the crop math is `vp[r*176+c] = full[(y+r)*320 + x + c]` with `MAZE_VIEWPORT {x,y}` — same as `build-viewport-oracles.ts`).

- [ ] **Step 4: Write the interior walking spec**

Model exactly on `maze-walk-gate-square.spec.ts` (seed party via `localStorage('wiz6:active-party')`, `/castle/start-new-game`, cutscene cadence to free-roam), then inject the interior position and assert:

```typescript
import { test } from '@playwright/test';
import { expectMazeViewportMatchesFixture } from './lib/drive.js';
import { waitForNonBlankCanvas, waitForStableCanvas } from './lib/canvas.js';

// #091 Piece B: the level-0 interior past the (124,121) door renders byte-exact.
// We DEV-inject the party past an open door (the RNG FORCE itself is gated elsewhere).
test('level-0 interior renders byte-exact past the (124,121) door', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.evaluate(() => {
    (window as any).__WIZ6_E2E_MAZE__ = { gx: 124, gy: 120, facing: 2, openDoors: [{ gx: 124, gy: 121, facing: 2 }] };
    window.localStorage.setItem('wiz6:active-party', JSON.stringify({ schemaVersion: 1, members: [/* one seedMember, copy from maze-walk-gate-square.spec.ts */] }));
  });
  await page.goto('/castle/start-new-game');
  await page.waitForURL('**/game/maze', { timeout: 15_000 });
  await waitForNonBlankCanvas(page, 'canvas', 500, 20_000);
  await waitForStableCanvas(page, 'canvas');
  await expectMazeViewportMatchesFixture(page, 'maze-walk-gx124-gy120-f2');
  await page.keyboard.press('ArrowUp'); // step deeper into the interior
  await expectMazeViewportMatchesFixture(page, 'maze-walk-gx124-gy119-f2');
});
```

> Copy the `seedMember(0,'THESUS')` helper from `maze-walk-gate-square.spec.ts` (don't re-derive the member shape). Use only interior cells confirmed in the asset (Task 6 Step 2); if `(124,119,f2)` isn't captured, pick a captured neighbor and a matching `ArrowUp`/`ArrowRight` sequence. If the cutscene auto-completes to the *entrance* and the maze-injection only applies after free-roam settles, apply `__WIZ6_E2E_MAZE__` at the seam Step 1 identified so it overrides the post-cutscene position (verify the asserted facing-2 view is the interior, not the entrance gate).

- [ ] **Step 5: Run the e2e**

Run: `pnpm --filter @wiz6/viewer test:e2e maze-walk-interior`
Expected: PASS — the running app's interior render matches the independently-captured engine fixture.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer/e2e/maze-walk-interior.spec.ts packages/viewer/src tools/parity/fixtures/engine/maze-walk-gx124-*.idx.gz
git commit -m "test(#091): DEV maze-injection hook + e2e walking gate — interior byte-exact past the door"
```

### Task 9: Manual smoke + docs

- [ ] **Step 1: Manual browser smoke**

Run `pnpm dev:viewer`, start a new game, walk to the (124,121) door, OPTIONS→OPEN→FORCE it open, walk through into the interior, and move around. Expected: the view renders correctly (no garbling) while moving through the interior — the "worse as you move" symptom is gone for the captured interior.

- [ ] **Step 2: Update TODO + spec status**

Edit `TODO.md`: mark #091's Piece B progress (interior byte-exact via capture; note what's covered vs. any logged coverage gaps from Task 4/10). If the whole reachable level-0 interior is now captured, note remaining scope = other levels (needs stairs).

```bash
git add TODO.md
git commit -m "docs(#091): Piece B — level-0 interior byte-exact via capture-replay"
```

---

## Stage 3 — Complete the interior (iterate over all doors)

### Task 10: Door-iteration driver

**Files:**
- Modify: `tools/libretro/trace-maze.ts` (add `interiorcap` driver phase + register)
- Modify (regenerate): the two viewport-oracle assets + `maze-reachability-interior.json`
- Modify: `packages/parser/tests/maze/maze-capture-replay-parity.test.ts` (auto-covers new cases if data-driven)

Tasks 2–6 captured the region past ONE door. The full interior needs every openable level-0 door (and doors revealed beyond them — iterative discovery). This driver loops the seed→collmap→engcap process per door, accumulating oracles + interior reachability, and logs coverage (CLAUDE.md "no silent caps").

- [ ] **Step 1: Add the `interiorcap` driver phase**

It reads the door list from `extracted/maze/doors.json` (excluding welded), and for each openable door not already behind a captured region: navigate (deriving the nav path via the engine-truth graph to the door cell), `forceDoorOpen` + step → seed, `collmap --seed` → interior reachability, `engcap --seed` → oracles into the shared dir. Repeat until no new openable door / cell is found. Log every door that couldn't be opened and every reachable cell not captured.

```typescript
/** `interiorcap <oracleDir>` — iterate ALL openable level-0 doors: force each open,
 *  seed, BFS-map + clean-capture the interior beyond it, accumulating oracles into
 *  oracleDir and unioning interior reachability. Logs unopened doors + uncaptured
 *  reachable cells (no silent caps). Doors discovered beyond opened doors are added
 *  to the queue (iterative). */
async function phaseInteriorCap(c: HostClient): Promise<void> {
  // Implementation: reuse forceDoorOpen + the seed/collmap/engcap routines factored
  // in Tasks 2-4 as in-process helpers (refactor those phases to call shared fns so
  // this driver can invoke them without shelling out). Maintain: a queue of doors,
  // a set of captured (gx,gy,facing), a union interior-reachability accumulator, and
  // a coverage-gap log. For each door: drive to it via the current reachable graph,
  // forceDoorOpen (retry up to 12, skip+log on persistent combat/failure), seed,
  // collmap --seed -> interior reach, engcap --seed --reach -> oracles. Add any new
  // openable doors found inside the newly-captured region to the queue. Stop when the
  // queue is empty. Print a final coverage report: doors opened/failed, cells captured/uncaptured.
}
```

> This task refactors Tasks 2–4's phases (`interiorseed`, `collmap --seed`, `engcap --seed`) to expose their cores as callable functions (`createInteriorSeed`, `collmapFromSeed`, `engcapFromSeed`) so `interiorcap` composes them in one process rather than shelling out. Keep the individual phases as thin wrappers over those functions (DRY — no duplicated logic).

- [ ] **Step 2: Register + typecheck**

Add `else if (phase === 'interiorcap') await phaseInteriorCap(c);`. Run `pnpm --filter @wiz6/mcp exec tsc --noEmit` (expect exit 0).

- [ ] **Step 3: Run the full interior capture (live)**

```bash
pnpm tsx tools/libretro/trace-maze.ts interiorcap /tmp/wiz6-oracles
```
Expected: a final coverage report listing doors opened (and any failed) + total interior cells captured. Review the gap log; any unopened door or uncaptured reachable cell must be explicitly listed (not silently dropped).

- [ ] **Step 4: Rebuild the asset + re-run gates**

```bash
pnpm tsx tools/parity/build-viewport-oracles.ts /tmp/wiz6-oracles
pnpm --filter @wiz6/parser test maze-capture-replay-parity
pnpm --filter @wiz6/viewer test:e2e maze-walk-interior
```
Expected: all PASS, with the full interior covered byte-exact.

- [ ] **Step 5: Commit**

```bash
git add tools/libretro/trace-maze.ts tools/parity/fixtures/engine/maze-viewport-oracles.json extracted/maze/viewport-oracles.json tools/parity/fixtures/engine/maze-reachability-interior.json packages/parser/tests/maze/maze-capture-replay-parity.test.ts
git commit -m "feat(#091): full level-0 interior byte-exact (iterate all openable doors)"
```

- [ ] **Step 6: Final smoke + close-out**

Manual browser walk through multiple interior regions. Update `TODO.md`: close #091's Piece B (level-0 interior byte-exact); note residual scope (other levels = stairs, out of scope). Commit.

---

## Self-review notes

- **Spec coverage:** Stage 0 spike (spec §Stage 0 → Task 1); force-once-freeze-seed (spec key decision → Tasks 2–4); door-aware interior capture + iterative discovery + coverage logging (spec §Stage 1 → Tasks 4, 10); wire + 3 gates (spec §Stage 2 → Tasks 6–9); error handling (retry/combat/coverage → Tasks 1,2,10); risks (forceable member, real-force-traverse → Task 1 gate). All spec sections map to tasks.
- **Hard gate honored:** Task 1 is an explicit GO/NO-GO with a STOP-and-escalate on NO-GO and a documented fallback.
- **No silent caps:** Tasks 4 and 10 log uncaptured cells / unopened doors explicitly.
- **DRY:** Task 10 refactors Tasks 2–4 cores into shared functions rather than duplicating; the asset builder and viewer wiring are reused unchanged.
- **Known soft spots (live-RE reality, flagged inline, not placeholders):** the exact FORCE key-sequence + member-pick is resolved live in Task 1 and reused via `forceDoorOpen`; arg-parsing for `--seed` must not collide with positional args (Task 3 Step 2); the engcap seed-mode reuses the existing incremental-BFS-capture loop unchanged (only the BFS root + reachability source swap).
- **e2e correction (verified against the codebase):** there is NO maze party-injection hook (only the creation flow injects); the existing maze specs reach free-roam via the real cutscene + real key nav, and `expectMazeViewportMatchesFixture(page, name)` takes a fixture-NAME string comparing against independent `maze-walk-*` fixtures. Task 8 therefore ADDS a small DEV-only maze-injection hook (mirroring the creation pattern) + commits independent interior `maze-walk-*` fixtures, rather than assuming an injection helper that doesn't exist. The deterministic-force RNG dev hook (#089 deferred) is explicitly out of scope — the DEV maze-injection sidesteps it.
- **Count correction:** the entrance-only oracle/parity count is 204 (the entrance-normal-connected component), not 266 (an older distinct-config figure). The parity test's hardcoded `.toBe(204)` is replaced with an asset-derived assertion in Task 7.
- **Gate strength:** per CLAUDE.md, the capture-replay parity test is tautological (compares the renderer to the oracle it returns); the non-tautological gate is the Task 8 e2e walk (running app vs independently-captured fixture) + the Task 9/10 manual smoke. Both are required before claiming the interior is byte-exact.
```
