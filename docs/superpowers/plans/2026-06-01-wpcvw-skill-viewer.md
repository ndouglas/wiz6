# Plan: Port the WPCVW camp SKILL action (read-only skill-level viewer) — #032

**RE source of truth:** `docs/re/findings/wpcvw-skill-action.json` (full static RE, 2026-06-01).
**Sibling pattern:** ASSAY (`docs/re/findings/wpcvw-assay-action.json`) — the just-shipped read-only inspect; reuse its popup + read-only-proof shape.
**Layout cousin:** the wpcmk character-creation SKILL-TRAIN screen (`packages/viewer/src/pages/roster/creation/ega/skill-train-frame.ts`) — SAME 4-category taxonomy + slot ranges; the camp viewer is its read-only sibling.

## What SKILL is

Camp character-view main-menu option 8 (enabled in the camp mask). Handler wpcvw `0x6b4e` → `wpcvw_skill_viewer @ 0x4d36`:
- Opens a 20×16 popup (x=0x14, y=4, w=0x14, h=0x10, attr=0x19).
- Runs a **category-tab picker** (`ui_menu_picker_grid`, msg base 600): WEAPONRY(600)/PHYSICAL(601)/PERSONAL(602)/ACADEMIA(603)/EXIT(604), 2-col grid.
- For the selected category, renders one row per **visible** skill slot: skill NAME (col 1) + LEVEL (col 0x10), then a trailing **skill-points** line at row 0xe.
- Loops until EXIT (tab 4); **READ-ONLY** (proven: no record store, no RNG, no skill check).

Category slot ranges (== the `[10,7,5,8]` availability bit-groups): **WEAPONRY 0..9, PHYSICAL 10..16, PERSONAL 17..21, ACADEMIA 22..29.**
Row visible iff `classCanTrainSkill(class, slot) || skills[slot] > 0` (engine `0x982f`).
Level = `record +0x451c+slot` (our `member.skills[slot]`, cap 50). Skill points = `record +0x4590` (struct +0x1a8) — **new schema field**.

## Stages

### Stage 1 — Data layer + skill-name correction (TDD, no fixtures) — Status: COMPLETE
Done: `SKILL_SLOT_NAMES` corrected to the engine map + docstrings/comments + test; `pcfile.ts` index-map comment fixed; new `packages/data/src/character-view/skill-viewer.ts` (`SKILL_CATEGORIES`, `skillRowVisible`, `skillViewerRows`) + tests, exported from `@wiz6/data`. All 578 data tests green. (Skill-points `+0x1a8` field surfacing deferred to Stage 3 wiring — value is 0 for the stock party; the skill-train screen already renders correct names via `skillName(db, slot)`, so no shipped UI changed.)
**RE resolved 2026-06-01** (`docs/re/findings/wpcvw-skill-names.json`, binary-anchored HIGH):
- Skill name for slot N = **msg(5500 + N), 1:1** (render does `add ax,0x157c`). Authoritative 30-slot map dumped — see the finding. This **CORRECTS** the speculative `SKILL_SLOT_NAMES` in `class-skill-availability.ts` + the index-map comment in `pcfile.ts` (WEAPONRY 0-9 reordered; slots 10/17-21 are real skills SWIMMING/DEFENSE/SPEED/MOVEMENT/AIM/POWER, not holes; slot 22 = ARTIFACTS).
- Trailing line = msg 0x159a "SKILL POINTS" + value `+0x4590`. The byte at **+0x1a8/0x4590 is already modeled** as `spells_to_learn` — DO NOT add a duplicate field; reconcile the label (likely a shared level-up bonus pool; "SKILL POINTS" is the screen label). Confirm semantic in Stage 6.

**Goal:** authoritative skill-name data + pure row-enumeration logic in `@wiz6/data`.
- **Fix `SKILL_SLOT_NAMES`** to the engine map (msg 5500+slot); update the `pcfile.ts` skills index-map comment. Re-run the skill-train (#022) + any roster skill display tests — labels may change; update expectations (engine-faithful). Surface the correction to Nate (Engineering-Notes candidate).
- New `packages/data/src/character-view/skill-viewer.ts`:
  - `SKILL_CATEGORIES` = 4 ranges `[{start,end}]` (0..9 / 10..16 / 17..21 / 22..29) + EXIT.
  - `skillViewerRows(member, category) → { slot, level, name }[]` — visible rows for the category, in slot order, visible iff `classCanTrainSkill(member.class, slot) || member.skills[slot] > 0`; `name` from the corrected map; `level` from `member.skills[slot]`.
  - Expose skill-points via the existing `spells_to_learn` field (no new field).
**Tests:** corrected name map (slot 0 WAND&DAGGER, slot 17 DEFENSE, slot 22 ARTIFACTS); visible-row set per class (fighter WEAPONRY, thief incl. SKULDUGGERY@15); level read; category bounds; empty category.
**Success:** `pnpm --filter @wiz6/data test` green (incl. updated skill-train expectations); new tests cover row visibility + the corrected names.

### Stage 2 — Composer (cell-grid + pixel-targeted) — Status: Not Started
**Goal:** `packages/viewer/src/pages/castle/compose-skill-viewer.ts` → `TileWindow[]`.
- 20×16 popup at (20,4) attr 0x19 + chrome (mirror `compose-assay-display`).
- Category title; per-row name (col 1, from msg id — reuse SkillTrainScreen's name source / message DB) + level (col 0x10); trailing skill-points line at row 0xe.
- The category-tab picker bar (reuse the action-menu/inventory-picker rendering idiom).
- Resolve the skill-name msg-id table (`0x157c+slot`) against the message DB / `skill-names.json` (msg = slot + 0xfa0; holes at 10,17-21).
**Tests:** cell-grid placement (diagnostic) for one category; name/level columns.

### Stage 3 — Reducer + page wiring — Status: Not Started
**Goal:** wire SKILL into `character-view-reducer.ts` + `CharacterViewPage.tsx`.
- New state `{ kind: 'skill-viewer'; category: number; tabCursor: number }`.
- action-menu ENTER on 'SKILL' → `skill-viewer` (initial category + tabCursor per the engine fixture; default WEAPONRY 0).
- Tab nav: arrows move `tabCursor` over the 5-tab 2-col grid (reuse `nextActionCursor`-style geometry); ENTER on a category sets `category=tabCursor` (re-render); ENTER on EXIT (4) or ESC → action-menu.
- Page renders `compose-skill-viewer` overlay using `skillViewerRows(member, category)`.
**Tests:** reducer transitions (enter, tab move, pick category, exit); page key handling.

### Stage 4 — Engine fixture + pixel-parity (GATE) — Status: Not Started
**Goal:** lock the layout against engine ground truth.
- Drive DOSBox (camp → REVIEW → SKILL) via MCP / `build-saves` to capture the viewer framebuffer for ≥1 category on a real char (fighter WEAPONRY). Watch for chord flakiness (#070 note: fresh-boot path, save slots 0-9).
- `gen-fixture` → commit `.idx.gz` + `.png` under `tools/parity/fixtures/engine/`.
- `skill-viewer-parity.test.ts` at 100% floor. Fix composer/reducer initial-state to match.
**Success:** pixel-parity 100% vs the engine fixture.

### Stage 5 — e2e + manual smoke — Status: Not Started
- Playwright e2e: char-view → SKILL → tab through categories → `expectCanvasMatchesFixture`.
- `pnpm dev:viewer` manual click-through.

### Stage 6 — Verify MEDIUM bits (DOSBox) — Status: Not Started
- Confirm `+0x4590` semantics across stock chars (unspent skill-bonus pool?).
- Confirm the `0x157c` per-slot msg-id name table + per-class availability strings vs `class-skill-availability.ts`.
- Confirm initial category/tabCursor on view entry.

## Notes
- Read-only ⇒ no `commit-*` intent needed; `skill-viewer` is purely presentational (like `assay-display`), ESC/EXIT → action-menu.
- Promote the 3 recommended function renames (0x4d36/0x9dfb/0x982f) into `docs/re/wpcvw-*.md` after the port lands.
