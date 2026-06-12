# Dungeon Interior Movement Capture Implementation Plan (#091 Piece A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-capture the engine's reachability/passability with all doors poked open, so the party navigates the dungeon interior past a forced door with engine-faithful collision (no walking through walls).

**Architecture:** Extend the engine-oracle BFS (`trace-maze.ts collmap`) so it traverses doors into the interior, then re-run it → expanded `maze-reachability.json` → `build-passability.ts` → expanded `passability.json`. MazeView already loads that asset and overlay-gates door edges (Task 4.4 of #089), so no viewer changes — the expanded table fills in the interior's non-door verdicts.

> **REVISED 2026-06-12 after a feasibility spike — READ THIS.** The original approach (memory-poke each door's `+0x240` wall-plane edge to OPEN) was implemented (Task 1, `openAllDoors`) and **disproved**: 12 doors poked, reachability unchanged at 74 cells. The `+0x240` edge is the door's FORCE/PICK *state*, NOT what the movement gate (`maze_can_step_in_facing`) reads — poking it does not make a door walkable (the #087 collision-model wall). **The validated approach (spike-confirmed): actually FORCE the door open via the real mechanic during the BFS.** Spike result: at (124,121,f2), poke the door's *lock* (`+0x630`) to 0 (so FORCE succeeds deterministically — no RNG, no welding), drive the FORCE flow, and the party then **steps through** (`y 5→4`). So forcing runs the real door-open path (`0x891d`: clears `0x4ee0[facing]` + record-update `0x84ce`) which DOES open the door for movement. The `openAllDoors` edge-poke from Task 1 is superseded — replace it with the lock-poke + force-flow below.

**Tech Stack:** TypeScript ESM (pnpm monorepo); the dosbox-pure live harness (`HostClient`/`LiveSession`) driven by `tools/libretro/trace-maze.ts`; Vitest parity tests.

**Scope note:** This plan is **Piece A** of spec `docs/superpowers/specs/2026-06-12-dungeon-interior-capture-design.md`. **Piece B** (the #077 deferred-renderer endgame for byte-exact interior render, + interior viewport fixtures) is an uncertain RE research effort that depends on this piece's outputs and gets its own plan once A lands. After A, walking into the interior is **movement-faithful with the existing recognizable render**; B makes it byte-exact.

### Revised Stage 1 design (force-in-BFS — the executable approach)

Replace `openAllDoors` (edge-poke) with door-forcing inside the BFS `up`-blocked branch
(`phaseCollMap`, the `for mv of ['up','left','right']` loop, ~L4061):

1. **One-time, after `driveToFreeRoam`:** poke EVERY type-7 door's lock `+0x630` to 0
   (table near-ptr at DGROUP `0x4fa8`; per-record type `+0x360`==7; lock byte `+0x630+rec`).
   This makes every FORCE succeed deterministically (strain_len clamps to 1; no welding).
   Serialize the entrance node AFTER this poke so locks-0 persists through BFS restores.
2. **In the `up` branch, when `up` is BLOCKED:** detect whether a forceable door sits at the
   party's `(gx,gy,facing)` — match against the live special-record table (reuse
   `decodeDoorRecords`' coord logic: per-record x `+0x3f0`/y `+0x480`/z `+0x510`, global via
   the level's gxBase/gyBase; level-0 bases are `[120,128,120,128,120,128,10,18,10,18,26,26]`
   / `[116,116,124,124,132,132,10,10,18,18,10,18]`). If a type-7 door matches with a
   closed/welded edge at `facing`:
   - Drive the FORCE flow (spike-confirmed key macro from free-roam facing the door):
     `enter` (OPTIONS) → `right down enter` (→OPEN→FORCE/PICK/EXIT menu) → `enter` (FORCE→WHO)
     → `down enter` (select member 0 → roll) → `enter` (dismiss result). Settle between taps.
   - Re-tap `up`; read party. If it MOVED → the door opened → record `open`, serialize the new
     interior node, enqueue. If still blocked → record `blocked` (a genuine wall, or a
     force edge case — log it).
3. Everything downstream (Tasks 3–5) is unchanged.

**Spike evidence (2026-06-12):** lock-poke + the macro above at (124,121,f2) → party stepped
to (124,120). Door-detection is the one piece not yet spiked; if matching live coords proves
fiddly, an acceptable fallback is to attempt the force macro on EVERY blocked `up` BUT guard
it: abort the macro the instant `enter`→OPTIONS does not yield the FORCE menu (read game_state
/ a screen check) so a plain wall's `OPEN` no-op can't derail into REVIEW/char-view. Door
detection is cleaner — prefer it.

---

## File structure

**Modify:**
- `tools/libretro/trace-maze.ts` — add a door-poke step to the `collmap` phase (`phaseCollMap`, ~L4000): after `driveToFreeRoam`, poke every type-7 door edge open in the live special-record table, before the BFS serializes the entrance node.
- `tools/parity/fixtures/engine/maze-reachability.json` — regenerated (committed ground truth, now covering the interior).
- `extracted/maze/passability.json` — regenerated from the above (committed served asset).
- `packages/parser/tests/maze/maze-faithful-movement-parity.test.ts` — update the reachable-set expectation (was the 74-cell entrance component; now includes the door-connected interior).

**No viewer changes** — `MazeView` already loads `passability.json` and overlay-gates door edges before consulting the table.

---

## Stage 1: Poke doors open + re-capture the interior

### Task 1: Add the door-poke step to `collmap`

**Files:**
- Modify: `tools/libretro/trace-maze.ts` (`phaseCollMap`, ~L4000)

The special-record table layout (from `docs/re/findings/maze-open-door-menu.json`, used by `packages/parser/src/maze/door-record.ts`): base = the DGROUP near-pointer at `0x4fa8`; per-record byte arrays at `+0x360` (type; 7 = door), `+0x3f0` (x), `+0x480` (y), `+0x510` (z/region); the **wall-plane is a WORD array at `+0x240`** (stride 2, index = recidx, LE) holding a 2-bit edge code per facing at bit offset `facing*2` (0 = open, 1 = closed, 2 = welded). Max 144 records.

To open every door: for each record with type byte == 7, read its `+0x240` word, set the 2-bit field at **every** facing whose code is `1` (closed) to `0` (open) — leave welded (2) alone is unnecessary here since we want the full reachable graph, so set ALL non-zero edge codes to 0 — then write the word back. (We poke all four facings to 0 so the BFS can traverse the door from either side.)

- [ ] **Step 1: Read the existing `collmap` phase + the live-read/write helpers**

Read `phaseCollMap` (~L4000) and the `HostClient` API it uses. Confirm: `driveToFreeRoam(c)` returns the DGROUP base; the BFS serializes the entrance node via `c.serialize(ent)` right after `driveToFreeRoam`. Find the existing byte read/write helpers (e.g. `c.read(addr, len)` returns bytes; the `w16` helper writes a 16-bit LE word — grep `w16` / `c.write` in the file). Note how an absolute physical address is formed from the DGROUP base (`base + offset`), as `frParty`/other helpers do.

- [ ] **Step 2: Add an `openAllDoors(c, base)` helper above `phaseCollMap`**

```typescript
/** Poke every type-7 door's wall-plane edges to OPEN (code 0) in the live
 *  special-record table, so the collmap BFS can traverse them and reach the
 *  dungeon interior. Special-record layout: base ptr at DGROUP 0x4fa8; per-record
 *  type byte at +0x360 (7 = door); wall-plane WORD array at +0x240 (stride 2,
 *  2-bit edge per facing at bit facing*2). Ref: maze-open-door-menu.json. */
async function openAllDoors(c: HostClient, base: number): Promise<number> {
  // Resolve the special-record table base (a DGROUP near-pointer at 0x4fa8).
  const ptrBytes = await c.read(base + 0x4fa8, 2);
  const tableOff = ptrBytes[0]! | (ptrBytes[1]! << 8);
  const tableBase = base + tableOff;
  const MAX = 144;
  let poked = 0;
  for (let rec = 0; rec < MAX; rec++) {
    const typeByte = (await c.read(tableBase + 0x360 + rec, 1))[0]!;
    if (typeByte !== 7) continue;
    // Wall-plane is a WORD array (stride 2): edges word for this record.
    const wOff = tableBase + 0x240 + rec * 2;
    const wb = await c.read(wOff, 2);
    let word = wb[0]! | (wb[1]! << 8);
    // Clear all four 2-bit fields (facings 0..3) to 0 (open).
    for (let f = 0; f < 4; f++) word &= ~(0b11 << (f * 2));
    word &= 0xffff;
    await c.write(wOff, [word & 0xff, (word >> 8) & 0xff]);
    poked++;
  }
  return poked;
}
```

> If the file's write helper is named differently than `c.write(addr, bytes)` (e.g. the `w16` closure inside another phase), define `openAllDoors` to use whatever the file's established absolute-write primitive is — read Step 1's findings and match it. The byte read primitive likewise: match the file's `c.read` signature.

- [ ] **Step 3: Call it in `phaseCollMap` after `driveToFreeRoam`, before the entrance serialize**

In `phaseCollMap`, immediately after `const base = await driveToFreeRoam(c);` and `const start = await frParty(c, base);`, add:

```typescript
  const pokedDoors = await openAllDoors(c, base);
  console.log(`collmap: poked ${pokedDoors} type-7 doors OPEN (interior capture #091)`);
```

This MUST run before the entrance `c.serialize(ent)` so the open-door machine state is captured into the BFS's entrance node and persists through every later `unserialize`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @wiz6/mcp exec tsc --noEmit` (host-client types) and confirm `tools/libretro/trace-maze.ts` has no new TS errors (it's run via tsx; a quick `pnpm tsx --eval "import('./tools/libretro/trace-maze.ts')"` is not needed — just ensure the edited region parses by the next step's run).

- [ ] **Step 5: Commit**

```bash
git add tools/libretro/trace-maze.ts
git commit -m "feat(#091): poke all doors open in collmap BFS (interior reachability capture)"
```

### Task 2: Re-capture the interior reachability

**Files:**
- Modify (regenerate): `tools/parity/fixtures/engine/maze-reachability.json`

- [ ] **Step 1: Run the expanded collmap capture**

The interior is much larger than the 74-cell entrance, so raise the budget. Run (this is a long live-driven BFS — allow several minutes):

```bash
pnpm tsx tools/libretro/trace-maze.ts collmap /tmp/wiz6-collmap-interior.json 2000
```

Expected console: `poked N type-7 doors OPEN` (N ≥ 12 for level 0), then BFS progress, ending with a reachable view-set substantially larger than 293 views / 74 cells. Confirm the door-connected cells now appear — spot-check that **(124,120)** (north of the canonical door) is reached:

```bash
python3 -c "import json; d=json.load(open('/tmp/wiz6-collmap-interior.json')); cells=set(); [cells.add((v['gx'],v['gy'])) for v in d['reachableViews']]; print('cells:', len(cells), '(124,120) reached:', (124,120) in cells)"
```

Expected: more cells than before, `(124,120) reached: True`.

- [ ] **Step 2: Promote the capture to the committed fixture**

Compare to the old fixture (sanity: the entrance cells must still be present + verdicts unchanged for non-door edges), then copy into place:

```bash
python3 -c "
import json
old=json.load(open('tools/parity/fixtures/engine/maze-reachability.json'))
new=json.load(open('/tmp/wiz6-collmap-interior.json'))
oc={(v['gx'],v['gy'],v['facing']) for v in old['reachableViews']}
nc={(v['gx'],v['gy'],v['facing']) for v in new['reachableViews']}
print('old views', len(oc), 'new views', len(nc), 'old ⊆ new:', oc <= nc)
"
cp /tmp/wiz6-collmap-interior.json tools/parity/fixtures/engine/maze-reachability.json
```

Expected: `old ⊆ new: True` (the interior capture is a superset — the entrance set is preserved). If NOT a superset, STOP — the door-poke perturbed entrance verdicts; investigate before committing.

- [ ] **Step 3: Commit**

```bash
git add tools/parity/fixtures/engine/maze-reachability.json
git commit -m "test(#091): re-capture engine reachability with doors open (interior reachable)"
```

### Task 3: Rebuild the passability asset

**Files:**
- Modify (regenerate): `extracted/maze/passability.json`

- [ ] **Step 1: Run the pure transform**

```bash
pnpm tsx tools/parity/build-passability.ts
```

Expected: rewrites `extracted/maze/passability.json` from the new reachability fixture (open/blocked/warp verdict counts printed; counts larger than before).

- [ ] **Step 2: Confirm the interior is now in the table**

```bash
python3 -c "import json; p=json.load(open('extracted/maze/passability.json')); import sys; print('entries:', len(p) if isinstance(p,dict) else len(p))"
```

Expected: more entries than the pre-#091 table.

- [ ] **Step 3: Commit**

```bash
git add extracted/maze/passability.json
git commit -m "feat(#091): rebuild passability from interior reachability (faithful interior movement)"
```

### Task 4: Update the faithful-movement parity gate

**Files:**
- Modify: `packages/parser/tests/maze/maze-faithful-movement-parity.test.ts`

This test currently asserts the reachability BFS reaches exactly the 74-cell entrance component (and never a cell outside the engine's set). With the interior captured, the reachable set is larger.

- [ ] **Step 1: Read the current test + run it (now failing)**

Run: `pnpm --filter @wiz6/parser test maze-faithful-movement-parity`
Expected: FAIL — the hardcoded cell/view counts (74 cells / the connected-component assertion) no longer match the expanded reachability fixture.

- [ ] **Step 2: Update the expectations to the new captured set**

Read the test. Replace the hardcoded count assertions (e.g. `expect(reachable.size).toBe(74)`) with the values from the new fixture, and keep the INVARIANT assertions that don't hardcode size:
- The BFS reachable set equals the committed `maze-reachability.json` view-set (derive the expected count from the fixture itself rather than a literal, so future re-captures don't silently drift — e.g. load the fixture, build the expected set, assert the movement model's reachable set matches it exactly).
- Verdict parity: for every `(gx,gy,facing)` in the fixture, `passabilityFromTable` returns the same verdict the engine recorded.
- Spot-check assertion: `(124,120)` (interior, north of the canonical door) is reachable.

Prefer deriving expectations from the fixture over hardcoded literals (the fixture is the ground truth; a literal count is a maintenance trap).

- [ ] **Step 3: Run, verify PASS**

Run: `pnpm --filter @wiz6/parser test maze-faithful-movement-parity`
Expected: PASS.

- [ ] **Step 4: Run the full parser suite (no regression)**

Run: `pnpm --filter @wiz6/parser test`
Expected: PASS (the other maze tests read the same fixtures; confirm none assumed the 74-cell set).

- [ ] **Step 5: Commit**

```bash
git add packages/parser/tests/maze/maze-faithful-movement-parity.test.ts
git commit -m "test(#091): gate faithful movement over the expanded interior reachable set"
```

### Task 5: Manual smoke — walk into the interior

- [ ] **Step 1: Run the viewer + walk through a door**

Run: `pnpm dev:viewer`, start a new game, walk to the (124,121) door (turn-left, forward×3, turn-left from the gate), OPTIONS→OPEN→FORCE/PICK, force it open, and walk through (north). Then move around the interior.

Expected: movement is now **faithful** — you can only step where the engine allows (no walking through walls), and the "worse as you move" garbling is gone (the render is the existing recognizable generated view; byte-exact is Piece B). If FORCE keeps failing (RNG), retry or pick a member with high STR; the movement fix is independent of which door you open.

- [ ] **Step 2: Confirm + note any surprises**

If movement still lets you through walls in the interior, the passability table didn't cover that cell — note the `(gx,gy,facing)` and confirm it's in `maze-reachability.json` (the capture budget may have been too low; re-run Task 2 with a larger budget). Otherwise, Piece A is done.

---

## Self-review notes

- **Spec coverage:** This plan implements spec §2 (Piece A — movement capture) in full: door-poke (Task 1), re-capture reachability (Task 2), rebuild passability (Task 3), gate (Task 4), smoke (Task 5). The §2 runtime reconciliation (door edges overlay-gated, not double-counted) needs no code — it's already MazeView's Task-4.4 behavior; Task 5 verifies it. Spec §3 (Piece B render endgame), §4 (interior viewport fixtures), and §5's render/e2e gates are **out of scope for this plan** — they belong to the Piece B plan written after this lands (the spec §6 fallback is exactly this plan's end state: movement-faithful + recognizable render).
- **Door-poke correctness:** the `+0x240` word-stride and 2-bit-per-facing layout, and the `0x4fa8` table pointer, are the same offsets `door-record.ts` already decodes successfully — low risk. The one live unknown is the exact `HostClient` read/write primitive names; Task 1 Step 1 resolves them against the file before coding.
- **No placeholders:** every step has the concrete command/code. Task 1 Step 2's helper is complete; the only "match the file" note is the write-primitive name, resolved in Step 1.
- **Determinism caveat:** `collmap` is a long live-driven BFS; the budget (2000) must be large enough to exhaust the interior — Task 2 Step 1 spot-checks `(124,120)`, Task 5 Step 2 catches under-capture.
