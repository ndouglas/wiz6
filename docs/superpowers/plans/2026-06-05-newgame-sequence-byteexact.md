# Byte-Exact START NEW GAME Sequence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Rework the START NEW GAME entry sequence to byte-exact, full-screen, per-frame parity: ENTERING title → narration → 3-step gate-walk → HMMMM bump → free control, with the **live party panel**, a **framebuffer-oracle'd viewport** (the gate), and the correct **per-frame bottom-strip background**. Skip copy-protection.

**Architecture:** Each frame composes: static top chrome (y0–31) + **live party panel** (`party-panel-render.ts`, from the active party) + **oracle viewport** (per-frame committed image, x72–247/y32–143) + **rendered bottom strip** (per entry sub-mode). An extended entry FSM (`title→narration→gate-walk→bump→free`) drives it. Full-screen parity vs `newgame-seq-{02..06}.idx.gz`, seeding the fixtures' 6-member roster.

**Tech Stack:** TS ESM, zod, vitest, React, Playwright. Spec: `docs/superpowers/specs/2026-06-05-newgame-sequence-byteexact-design.md`. RE: `docs/re/findings/maze-newgame-byteexact.json`. Branch: `feat/newgame-sequence-byteexact` (RE foundation already committed `b539af7`).

**This REWORKS the shipped first pass** (entry-sequence.ts FSM, narration-strip.ts, MazeView narration, maze-entry-narration-parity.test.ts). Reconcile/replace those — don't leave dead/duplicate paths.

---

## Pre-flight (read first)
- The spec + `docs/re/findings/maze-newgame-byteexact.json` (the per-frame table, the black-strip rect y144–199, the ui_window mechanism, the gy positions: title=117, narration=118, walk=119/120, bump=121).
- Committed fixtures `tools/parity/fixtures/engine/newgame-seq-{00..06}.{idx.gz,png}` + states `test-fixtures/states/newgame-seq-*.state.gz` + recipes `tools/dosbox/state-catalog.ts` `NEWGAME_SEQ_RECIPES`.
- Shipped code to rework: `packages/parser/src/maze/{entry-sequence,narration-strip}.ts`, `packages/viewer/src/pages/game/{MazeView.tsx,compose-maze-frame.ts,party-panel-render.ts}`, `packages/viewer/src/game/game-session-store.ts`, `packages/data/src/maze/level-schema.ts`, `packages/parser/tests/maze/maze-entry-narration-parity.test.ts`, `packages/viewer/e2e/faithful-start-new-game.spec.ts`.
- How the castle renders the live party panel (`party-panel-render.ts` + its caller) + how the active party is read (`ActivePartyStore`/roster) + the COMPOSED palette (idx 0 black, 1 blue, 5 yellow, 8 gray).
- `@wiz6/parser` stays isomorphic. Schema = source of truth.

---

## Task 1 — Pin the per-ENTER sequence; extend the FSM + config (🔬+⌨️)
**Files:** `packages/data/src/maze/level-schema.ts`, `packages/cli/src/extractors/maze-level.ts` (+ re-extract `level-0.json`), `packages/parser/src/maze/entry-sequence.ts` (+ test), `packages/viewer/src/game/game-session-store.ts` (+ test).
- [ ] **Pin the transitions** against the fixtures + a live drive (you own the harness): from the scripted start, exactly which ENTER moves to which gy and which bottom-strip content. Established positions: title=gy117, narration=gy118, walk=gy119/120, bump=gy121. Determine whether title→narration is a forward step (117→118) and whether narration→walk is a step (118→119) or a dismiss-then-step. Document the exact `entryMode`+gy per ENTER in a finding note (`docs/re/findings/maze-newgame-byteexact.json` addendum or a new small finding) — anchor with live deltas.
- [ ] **Schema/config:** extend `ScriptedEntrySchema` with `titleMsgIds: number[]` (=[1212,1213]) (keep `narrationMsgIds`=[10010,10011,10012], `bumpMsgId`=10020). Set level-0 `scriptedEntry.start` to the TRUE start (gy=117, facing 0) and `steps` to the pinned count. Re-extract `level-0.json`; confirm `entrance` (gy=121) unchanged.
- [ ] **FSM:** extend `entryMode` to `'title'|'narration'|'gate-walk'|'bump'|'free'`. `advanceEntry` (ENTER): `title→narration` (+step if pinned), `narration→gate-walk` (per pin), `gate-walk` forced-steps until the bump position → `'bump'`, `bump→free`. Forced march (unconditional `step`, as today). Pure/isomorphic. `initGameSession` seeds `entryMode:'title'` at the start. Bump `GameSessionSchema` schemaVersion (discard old).
- [ ] Tests: the full FSM walk (title→…→free) reaches gy121; each transition's gy + entryMode; arrows inert in all scripted modes. Schema round-trips `titleMsgIds`. Commit.

## Task 2 — Framebuffer-oracle viewport (⌨️)
**Files:** a new extractor (`tools/parity/` or cli) to slice the viewport; committed browser assets `extracted/maze/newgame-vp-{02..06}.idx.gz` (or a single keyed asset); `packages/viewer/src/data-loader.ts` (loader); `packages/parser/src/maze/` (a pure compositor helper if needed).
- [ ] Extract each scripted frame's `MAZE_VIEWPORT` rect (x72–247, y32–143 = 176×112) from `newgame-seq-{02..06}.idx.gz` → commit a per-frame viewport asset, browser-served via `extracted/` (mirror `wall-spans.json`/`assets.json`). Key it by entry sub-mode/gy.
- [ ] Browser loader (`loadNewgameViewports()` → fetch) + a pure compositor that, given the entry sub-mode/gy, returns the right 176×112 index buffer to blit into `MAZE_VIEWPORT`. Parser stays isomorphic. Verify the extracted bytes == the fixture's viewport region.
- [ ] Test: the oracle returns the correct viewport per frame (bytes match the fixture region). Commit.

## Task 3 — Live party panel in MazeView (the party bug fix) (⌨️)
**Files:** `packages/viewer/src/pages/game/{MazeView.tsx,compose-maze-frame.ts,party-panel-render.ts}`.
- [ ] Replace the **static baked party-panel regions** (x0–71, x248–319) in `composeMazeFrame()` with a **live render** via `party-panel-render.ts` driven by the **active party** (read the `ActivePartyStore`/roster — the same source the castle MASTER OPTIONS panel uses). Keep the top chrome (y0–31) static. The 6 slots: even→left (8,40), odd→right (256,40), 32px stride (per RE; reuse the castle layout verbatim — it's pixel-identical).
- [ ] MazeView reads the active party + threads it into the compose. Handle <6 members (empty slots render as the engine does — match the castle panel's empty-slot behavior).
- [ ] Manual sanity: the dungeon panel now shows YOUR party, not THESUS/LYSANDR/TEMPEST. Test (mock active party → panel pixels reflect it). Commit.

## Task 4 — Per-frame bottom-strip render (⌨️)
**Files:** `packages/parser/src/maze/narration-strip.ts` (extend), `packages/viewer/src/pages/game/MazeView.tsx`.
- [ ] Bottom strip (y144–199) per `entryMode`:
  - `title` → gray widget (idx 8) background + **blue (idx 1)** title text (msg 1212 "ENTERING" centered y161, 1213 "BANE OF THE COSMIC FORGE" centered y169). Match the fixture's exact x-centering.
  - `narration` → **clean black (idx 0)** y144–199 + yellow (idx 5) 3 lines (y153/161/169, x=8).
  - `gate-walk` → the normal gray OPTIONS/TURN widget (existing free-roam strip), no message.
  - `bump` → clean black + yellow "HMMMM…" (msg 10020) y153.
  - `free` → existing gray OPTIONS/TURN widget.
- [ ] The "clean black" must blank the gray widget (the shipped bug: narration drawn OVER the widget). Reuse/extend the gated `narration-strip` helper as the single draw path. Decode title/narration/bump text from `msg.json`. Commit.

## Task 5 — Full-screen per-frame byte-exact parity (⌨️)
**Files:** `packages/viewer/tests/game/newgame-sequence-parity.test.ts` (or parser if pure); reconcile/replace `maze-entry-narration-parity.test.ts`.
- [ ] For frames 02–06: seed the committed 6-member roster (the fixtures' party — `test-fixtures/original/pcfile.dbs` slots 0–5; commit a roster fixture or seed the store), compose (chrome + live panel + oracle viewport + bottom strip) per the frame's `entryMode`, compare the **full 320×200** to `newgame-seq-0N.idx.gz` at **tolerance 0**. All 5 = 100%.
- [ ] Document in the test which regions are rendered (chrome/panel/strip) vs oracle (viewport). Replace the old narration-text-band-only gate (superseded by the full-screen gate). Commit.

## Task 6 — e2e + cleanup (⌨️)
**Files:** `packages/viewer/e2e/faithful-start-new-game.spec.ts` (rework), remove dead paths.
- [ ] e2e: create/seed a party → START NEW GAME → assert each frame (title text → narration → walk → HMMMM) → ENTER through → free control (arrow turns the view). Pixel-assert against the fixtures where practical.
- [ ] Remove any dead code from the shipped first pass (the narration-over-chrome path, the band-only gate if replaced). No duplicate compose paths. Commit.

---

## Final verification
- [ ] `pnpm -r run typecheck` clean; `@wiz6/parser` isomorphic. All suites green incl. the 5 full-screen per-frame gates + the FSM tests; e2e passes.
- [ ] **Manual:** `pnpm dev:viewer` → create YOUR party → START NEW GAME → title card → narration on black → ENTER-walk (gate recedes) → HMMMM → free; the panel shows YOUR party; the viewport shows the gate (not black); the narration is on clean black.
- [ ] Update `TODO.md` (#078) + the spec/plan Outcome.

---

## Outcome (2026-06-05)

**Shipped** on `feat/newgame-sequence-byteexact` — byte-exact full-screen per-frame entry sequence + the 3 reported bugs fixed.

- **Task 1 — FSM/config:** `entryMode` `title|narration|gate-walk|bump|free` (`entry-sequence.ts`), forced-march; level-0 `scriptedEntry` (titleMsgIds 1212/1213, narrationMsgIds 10010-12, bumpMsgId 10020). Per-gy: 117 title, 118 narration, 119 walk, 120 bump, 121 bump.
- **Task 2 — oracle viewport:** `newgame-oracle.ts` + committed `extracted/maze/newgame-viewports.json` (per-gy byte-slice of the fixture viewport) — the gate renders (was black).
- **Task 3 — live party panel:** shared `party-panel-compose.ts` (castle + maze), from the active party — fixes the "3 wrong characters" bug.
- **Task 4 — bottom strip:** `drawEntryStrip` per mode — clean black for narration/bump (the "solid black" fix), gray widget + blue title, black no-text walk.
- **Task 5 — parity:** `newgame-sequence-parity.test.ts` — 5 frames full-screen tol 0 (narration excludes a documented 49px non-deterministic mouse-cursor rect), 6-member roster seeded from `pcfile.dbs` slots 0-5. Removed the superseded band-only gates.

**RE note (painful but resolved):** several RE passes mislabeled msg IDs / mis-phased fixtures (the message text isn't in the libretro serialized framebuffer — it redraws ~30 frames post-unserialize; fixed via `remintStep`). Ground truth re-verified directly against `msg.json` + each frame's PNG. The correct IDs (1212/1213, 10010-12, 10020) are in the code + the corrected finding.

Final review: **APPROVE-WITH-NITS** (finding self-contradiction + cursor px-count, both fixed). Deferred: OPTIONS menu, gate-open, the ENTRANCE CHAMBER room message (#078).
