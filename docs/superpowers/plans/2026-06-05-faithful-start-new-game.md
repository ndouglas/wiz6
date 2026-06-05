# Faithful START NEW GAME — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Port the engine's START-NEW-GAME entry sequence — outer-gate narration (3 lines on the bottom message strip) → ENTER-dismiss → 3-step forward gate-walk → free control at gy=121 — with the narration text strip gated pixel-exact.

**Architecture:** A session `entryMode` FSM (`narration → gate-walk → free`) keyed off `stepsRemaining` (no engine DGROUP flag — modeled behaviorally). A pure reducer in `@wiz6/parser` reuses `tryStepForward` for the 3 scripted steps. `MazeView` renders the bottom strip per-mode and dispatches input per-mode. Narration text is decoded from the already-loaded `msg.json` (IDs 10010–12). The renderer (`renderMazeViewport`) is unchanged.

**Tech Stack:** TS ESM (`.js` imports), zod, vitest, React + react-router-dom, Playwright. Spec: `docs/superpowers/specs/2026-06-05-faithful-start-new-game-design.md`. RE: `docs/re/findings/maze-entry-{narration,sequence}.json`.

**Coordinate model:** `MazeParty = {gx,gy,z,facing}` global cells. Level-0 scripted start = `{gx:127, gy:118, z:0, facing:0}`; facing-0 forward = gy+1; 3 steps ⇒ gy 118→121 (= the MVP free entrance). The scripted walk ARRIVES at the existing `entrance` (gy=121); no separate free-seed needed.

---

## Pre-flight (read first)

- Spec + the two RE findings (above). Fixture: `tools/parity/fixtures/engine/maze-entry-narration.idx.gz` (+ `.png`); regen via `tools/libretro/capture-narration-fixture.ts`. Parity rect: bottom strip, text band **y=153..174** (strip y=144..199); EXCLUDE the dungeon above + cursor corner (x=313..319, y=184..190).
- Existing code: `packages/viewer/src/game/game-session-store.ts` (`GameSessionSchema`, `initGameSession`, `updateParty`), `packages/viewer/src/pages/game/{MazeView.tsx,StartNewGamePage.tsx}`, `packages/parser/src/maze/movement.ts` (`tryStepForward`,`turn`), `packages/data/src/maze/level-schema.ts` (`DungeonLevelSchema`,`DungeonEntranceSchema`), `packages/cli/src/extractors/maze-level.ts` (`KNOWN_ENTRANCES`), `packages/viewer/src/data-loader.ts` (`loadMessageDb` / how `msg.json` is fetched + the `MessageDb` shape), the existing bottom-strip render in `MazeView`/`compose-maze-frame.ts` + the message-render/font path used elsewhere (e.g. castle `compose-action-menu.ts`), and `tools/parity/` compare helpers (`compareRgba` — global tolerance only; crop the rect).
- `@wiz6/parser` MUST stay isomorphic (no `node:*` in viewer-compiled modules). Schema is source of truth (types via `z.infer`).

---

## Stage 1 — Schema + data (the entry config + session state)

### ⌨️ Task 1: extend session + level schemas

**Files:** `packages/data/src/maze/level-schema.ts` (+ test `packages/data/tests/maze/level-schema.test.ts`); `packages/viewer/src/game/game-session-store.ts` (+ test `packages/viewer/tests/game/game-session-store.test.ts`); `packages/cli/src/extractors/maze-level.ts` (+ re-extract `extracted/maze/level-0.json`).

- [ ] **Schema:** add `ScriptedEntrySchema = z.object({ start: DungeonEntranceSchema, steps: z.number().int().nonnegative(), narrationMsgIds: z.array(z.number().int()), bumpMsgId: z.number().int() })`; add optional `scriptedEntry: ScriptedEntrySchema.optional()` to `DungeonLevelSchema`. Export the inferred `ScriptedEntry` type.
- [ ] **Session:** extend `GameSessionSchema` with `entryMode: z.enum(['narration','gate-walk','free'])` + `stepsRemaining: z.number().int().nonnegative()`. Bump `schemaVersion` to `2` (and have `readGameSession` return null on a version mismatch so the old `wiz6:session` is discarded cleanly). `initGameSession(level)`: if `level.scriptedEntry`, seed `party = scriptedEntry.start`, `entryMode='narration'`, `stepsRemaining = scriptedEntry.steps`; else (no scriptedEntry) seed `party = level.entrance`, `entryMode='free'`, `stepsRemaining=0` (back-compat).
- [ ] **Extractor:** add level-0's scripted entry to `maze-level.ts` (start `{gx:127,gy:118,z:0,facing:0}`, steps 3, `narrationMsgIds:[10010,10011,10012]`, `bumpMsgId:10020`) and emit it into `level-0.json`. Confirm `level-0.json` gains `scriptedEntry` and `entrance` is unchanged (gy=121).
- [ ] Tests: schema accepts/round-trips a level with `scriptedEntry`; `initGameSession` seeds narration mode + steps from the config (and free mode when absent); `readGameSession` discards a v1 blob. Commit.

---

## Stage 2 — Pure entry FSM (parser)

### ⌨️ Task 2: `advanceEntry` reducer + narration decode

**Files:** `packages/parser/src/maze/entry-sequence.ts` (new); `packages/parser/src/index.ts` (export); test `packages/parser/tests/maze/entry-sequence.test.ts`.

- [ ] **Reducer** (pure, isomorphic): `advanceEntry(session, block) → session` modeling ENTER in a scripted mode:
  - `entryMode==='narration'` → return `{...session, entryMode:'gate-walk'}` (dismiss; no move).
  - `entryMode==='gate-walk'` → `party2 = tryStepForward(party, block)`; `steps = stepsRemaining-1`; if `steps<=0` → `{party:party2, entryMode:'free', stepsRemaining:0}` else `{party:party2, stepsRemaining:steps}`.
  - `entryMode==='free'` → unchanged (ENTER handled elsewhere as OPTIONS, deferred).
  Keep it a pure function over the session's `{party, entryMode, stepsRemaining}` slice (don't import the store).
- [ ] **Narration decode helper** here or in the viewer (Task 3) — decide: a pure `decodeNarrationLines(msgDb, ids) → string[]` belongs in parser if `MessageDb` is a `@wiz6/data` type (parser may import data). Put it where it stays isomorphic + unit-testable. Strip/normalize the `^` anchored-x code (drop the leading `^`; the strip render left-aligns at x=8 regardless).
- [ ] Tests: narration→gate-walk (no move); 3× gate-walk from gy=118 ⇒ gy 121 + `entryMode==='free'` (use the real level-0 block, or a minimal stub block where forward is open); free is inert; `decodeNarrationLines` returns the 3 exact strings with `^` handled. Commit.

---

## Stage 3 — Viewer wiring (input + bottom-strip render)

### ⌨️ Task 3: narration decode in the viewer + StartNewGamePage

**Files:** `packages/viewer/src/data-loader.ts` (if the decode helper is viewer-side); `packages/viewer/src/pages/game/StartNewGamePage.tsx` (+ test).

- [ ] `StartNewGamePage`: unchanged load of level-0; `initGameSession(level)` now seeds narration mode (Task 1) → navigate `/game/maze`. (No behavior change needed if Task 1's `initGameSession` already keys off `scriptedEntry`.) Verify the test asserts the session is seeded in `entryMode:'narration'` at the scripted start.
- [ ] Ensure the narration lines are available to `MazeView` (the decode runs from the loaded `msg.json`; `MazeView` already loads assets/spans — add the msg-db load or pass the decoded lines). Commit.

### ⌨️ Task 4: MazeView bottom-strip states + per-mode input

**Files:** `packages/viewer/src/pages/game/MazeView.tsx` (+ `compose-maze-frame.ts` if the strip lives there) (+ test `packages/viewer/tests/game/MazeView.test.tsx`).

- [ ] **Bottom-strip render state machine:**
  - `entryMode==='narration'` → render the 3 narration lines: white (palette idx 5) on the black strip (idx 0), lines at **y=153 / 161 / 169**, left margin **x=8**, using the existing glyph/font render path (match the font the engine uses for the strip — reuse the message-render helper used by other screens; don't hand-roll a font).
  - `entryMode==='gate-walk'` → the engine shows the normal dungeon strip here; render the existing movement/blank strip (no narration text).
  - `entryMode==='free'` → the existing movement widget (unchanged).
- [ ] **Per-mode keydown:** in `narration`/`gate-walk`, **ENTER** → `updateSession(advanceEntry(session, block))` + re-render; **arrows ignored**. In `free`, arrows → turn/step (existing); **ENTER** → deferred no-op (OPTIONS out of scope — leave a comment + the TODO ref). De-register on unmount; read current session via ref.
- [ ] The viewport (dungeon) renders every frame as today (`renderMazeViewport` per `party`) — the strip overlays the bottom. During the walk the party advances gy 118→121, so the view updates per step (partial fidelity behind, by design).
- [ ] Tests: with a narration-mode session, the strip renders non-blank text (and ENTER advances the FSM: narration→gate-walk→…→free, party at gy=121); arrows inert in narration/gate-walk; arrows move in free. Match existing MazeView test conventions (mock session + assets/spans). Commit.

---

## Stage 4 — Parity + e2e

### ⌨️ Task 5: region-gated narration-strip pixel parity

**Files:** test `packages/viewer/tests/game/maze-entry-narration-parity.test.ts` (or under `packages/parser/tests/maze/` if the compose is pure); reuse `tools/parity` compare.

- [ ] Compose the narration frame our way (the dungeon viewport for the scripted-start cell gy=118 + the narration strip) → RGBA. Load `maze-entry-narration.idx.gz` → engine RGBA. Compare the **cropped text-band rect (x: full strip width or x=8..~enginewidth, y=153..174)** at tolerance 0 — exclude everything outside the band (dungeon above; cursor corner). Use a rect-crop of both buffers then `compareRgba` (global tol 0), since `compareRgba` lacks named regions.
- [ ] If the dungeon-behind at gy=118 is needed to place the strip correctly but isn't byte-exact, that's fine — the gate only asserts the text-band rect. Document the rect + the exclusions in the test. The gate must be a real `*.test.ts` (CI), 100% on the band. Commit.

### ⌨️ Task 6: Playwright e2e

**Files:** `packages/viewer/e2e/faithful-start-new-game.spec.ts`.

- [ ] Create a party (or inject a roster) → MASTER OPTIONS → START NEW GAME → assert the canvas shows the narration strip (pixel-assert the text-band vs the fixture, or assert non-blank text region) → press Enter → (gate-walk) → press Enter ×3 → assert **free control**: an ArrowLeft/Right turns the view (canvas changes) at gy=121. Reuse the e2e helpers in `packages/viewer/e2e/`. Commit.

---

## Final verification

- [ ] `pnpm --filter @wiz6/{data,parser,cli,viewer} run typecheck` clean; parser isomorphic.
- [ ] All suites green incl. the new FSM unit tests + the narration-strip parity gate; e2e passes.
- [ ] Manual: `pnpm dev:viewer` → create party → START NEW GAME → see the narration → ENTER → walk 3 → arrows free at the entrance.
- [ ] Update `TODO.md` #078 (close or note remaining: OPTIONS menu, gate-open, mode-flip static pin) + the spec/plan Outcome.
