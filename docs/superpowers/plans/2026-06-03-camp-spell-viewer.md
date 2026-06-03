# Plan: Camp WPCVW SPELL — read-only spellbook viewer (#073)

Port the camp/character-view SPELL action: a **read-only** two-level picker showing a
character's KNOWN spells. NO cast, NO SP/HP change (the cast path is the dungeon
state-0x13 sibling — out of scope). Same UI shape as the character-creation spell
picker — reuse/adapt it.

## Background (already done)
- **Data model (shipped, commit 30268d9):** learned spells = a per-spell-id BITSET at
  record +0x188, surfaced as `Character.spellSlotsKnown` (carried through the bridge).
  `@wiz6/data` `character-view/known-spells.ts`: `knownSpells(member)`,
  `knownSpellsBySchool(member)` (6 arrays, index = school 0..5), `isSpellKnown`,
  cost = spell-table `b2`. Verified vs pinned roster (TREON {0,48}, PENTAG {9,37},
  NOBAL {50,64}). RE: `docs/re/findings/wpcvw-known-spells.json` +
  `docs/re/findings/wpcvw-spell-action.json`.
- **Reusable UI:** the creation spell picker — `packages/viewer/src/pages/roster/creation/ega/compose-spell-panel.ts` (the spellInner/spellOuter detail panel), the 3×2 school grid, and `compose-school-cursor.ts`. The camp viewer is the same shape but READ-ONLY and lists KNOWN (not creation-available) spells.
- **Reducer stub:** `character-view-reducer.ts` SPELL action currently `return state // SPELL handler is SP3`.
- **Engine nav:** char-view action menu is 7-entry column-major 2-row (EQUIP idx0/SPELL idx1 col0; ASSAY2/SWAG3 col1; SKILL4/REVIEW5 col2; EXIT6). From EXIT: `left left left down` → SPELL. SPELL → school grid (3×2: FIRE/WATER/AIR top, EARTH/MENTAL/DIVINE bottom; left/right ±3, up/down ±1, clamped — same algebra as the creation picker / `nextActionCursor`). ENTER on a school → that school's known-spell sublist (up/down move spell cursor). ESC backs out (sublist→grid, grid→action-menu).

## Conventions
- Work on branch `camp-spell-viewer` in the main checkout (NO worktree — DOSBox MCP is cwd-bound). Merge to main when done.
- TDD; pixel-parity at tolerance 0 is the gate. Reuse existing helpers. `.js` ESM imports.
- The pinned roster already has casters — TREON (Mage, slot 4, knows Fire-L1+Mental-L1), NOBAL (Priest, slot 3, knows Mental-L1+Divine-L1). No new roster needed.

## Stage 1 — Capture the camp SPELL engine fixture(s)
**Goal:** committed engine fixtures of the camp SPELL screen for a caster.
**Work:** Add recipe(s) to `tools/dosbox/state-catalog.ts` that boot the pinned roster, form a party including a caster, REVIEW → pick the caster → char-view → SPELL (`left left left down enter`) → the school grid; and a second waypoint that ENTERs a known school → the spell sublist. Mint via `build-state.ts` (the pcfileFixture-replay + recipe pattern is in place; see `review-twink-shuriken`). Pick the caster + party size by driving the live harness to confirm the exact nav, then encode it.
**Deliverable:** `tools/parity/fixtures/engine/spellbook-*.{idx.gz,png}` (≥1 grid frame + ≥1 sublist frame) + recipe(s) + the `.state`. Document which caster/school in the recipe comment.
**Success:** the fixtures decode + visually show the school grid and a known-spell sublist for the caster.

## Stage 2 — Spellbook composer (pixel-parity)
**Goal:** a pure composer that renders the camp SPELL screen, gated 100% vs Stage 1.
**Work:** `packages/viewer/src/pages/castle/compose-spellbook.ts` (or similar) rendering the school grid + (when a school is selected) the spell sublist, fed by `knownSpellsBySchool(member)` + spell names (msg id+0xfa0) + cost (`KnownSpell.cost`). Reuse `compose-spell-panel` / school grid / `compose-school-cursor` from creation. Add a `tools/parity` parity case rendering the composer for the caster (loaded from the pinned roster via the bridge, like `review-twink-shuriken`) vs the Stage 1 fixtures.
**Success:** parity test 100% for each fixture; data sourced from the bridge (not hardcoded).

## Stage 3 — Reducer sub-states + page wiring
**Goal:** SPELL action opens the viewer; nav works; read-only.
**Work:** `character-view-reducer.ts` — add `spell-grid` (school cursor 0..5) + `spell-sublist` (school + spell cursor) states; SPELL → `spell-grid` (cursor 0); grid nav (left/right ±3, up/down ±1, clamped); ENTER on a school → `spell-sublist` (cursor 0); sublist up/down; ESC: sublist→grid, grid→action-menu; ENTER in sublist is a no-op or back (read-only — confirm vs engine). `CharacterViewPage.tsx` renders the composer overlay for these states (pass `knownSpellsBySchool(member)`). Unit tests for the reducer nav.
**Success:** reducer unit tests green; page renders the viewer; full viewer suite green.

## Stage 4 — e2e
**Goal:** drive the real app to the camp SPELL viewer + pixel-assert.
**Work:** an e2e spec (or extend review-member-flow) that seeds a caster party, REVIEW → SPELL → school grid → drill into a known school, asserting the canvas vs the Stage 1 fixtures.
**Success:** e2e green; full gate (packages + parity + e2e) green.
