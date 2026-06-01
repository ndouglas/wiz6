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

### Stage 4a — Engine fixtures CAPTURED (2026-06-01) — Status: COMPLETE
Drove DOSBox camp → REVIEW MEMBER (THESUS) → SKILL via MCP; committed 3 fixtures
(`tools/parity/fixtures/engine/skill-viewer-{weaponry,physical,academia}.{idx.gz,png}`).
**Corrected model (vs my pre-capture assumptions):**
- **It's a RIGHT-HALF panel**, not a centered popup: window at col 20 / row 4, 20w × 16h, attr 0x19 (RE x=0x14,y=4,w=0x14,h=0x10). The left stats panel stays; the panel replaces the inventory list region.
- **Layout:** top row = category title (e.g. "WEAPONRY") centered, flanked by 2 wfont icons (per-category icon). Skill rows below: NAME at col 1, LEVEL right-aligned at the right edge. Trailing "SKILL POINTS" + value line near the bottom (window row ~14, after a chrome separator).
- **Per-category name colors:** WEAPONRY blue, PHYSICAL green, ACADEMIA magenta (RE nameAttr low-nibble 2/0xe/0xc/0xb — pixel-pick exact from the fixtures).
- **Tab picker is DYNAMIC** (bottom-left, replaces the action-menu strip), 2-col grid: it shows the available categories **MINUS the current one**, plus EXIT. PERSONAL is hidden unless the char has personal skills (THESUS doesn't). Observed: WEAPONRY view → {PHYSICAL,ACADEMIA,EXIT}; PHYSICAL view → {WEAPONRY,ACADEMIA,EXIT}; ACADEMIA → {WEAPONRY,PHYSICAL,EXIT}.
- Row visibility within a category matches `skillViewerRows` (THESUS WEAPONRY shows only SWORD=10/SHIELD=2 + the 0-level trainable ones; PHYSICAL only SCOUTING; ACADEMIA ARTIFACTS/MYTHOLOGY/SCRIBE).
- PERSONAL category panel NOT captured (no class in the test party trains it) — defer to Stage 6.

### Stage 2 — Composer (pixel-targeted to the captured fixtures) — Status: COMPLETE
Extracted `composeSkillPanelWindow` from `composeSkillTrainFrame` (the shared 20×16 skill panel; creation parity unchanged) and built `compose-skill-viewer.ts`: the panel (reused) + a dynamic tab-picker strip (categories-minus-current + EXIT, x_step 10, inverse highlight). `composeMainPanel` underneath. **All 3 fixtures pass at 100% pixel-parity** (`skill-viewer-{weaponry,physical,academia}` in `screen-parity.test.ts`) — first run, no iteration needed (reuse + corrected names/colors lined up). 885 viewer + 79 parity tests green; tsc clean.

(original Stage 2 plan:)
**Goal:** `packages/viewer/src/pages/castle/compose-skill-viewer.ts` → `TileWindow[]`.
- The 20×16 right-half panel at (col 20, row 4) attr 0x19 + chrome (mirror `compose-assay-display`'s chrome scaffold; this window is taller).
- Category title row (centered + flank icons); per-row NAME (col 1, per-category color) + LEVEL (right-aligned); "SKILL POINTS" + value line.
- The dynamic category-tab picker strip at bottom-left (categories-minus-current + EXIT, 2-col grid, highlight the cursor).
- Names via `skillName(db, slot)` (= msg 5500+slot, already correct); rows via `skillViewerRows`.
**Pixel gate (Stage 4b):** `skill-viewer-parity.test.ts` renders explicit (category, tabCursor) states matching each fixture and asserts tolerance-0:
- weaponry: category 0, picker [PHYSICAL,ACADEMIA,EXIT] cursor on PHYSICAL.
- physical: category 1, picker [WEAPONRY,ACADEMIA,EXIT] cursor on ACADEMIA.
- academia: category 3, picker [WEAPONRY,PHYSICAL,EXIT] cursor on EXIT.
Iterate composer to 0-diff vs all three. Don't lower tolerance.

### Stage 3 — Reducer (dynamic-tab REDESIGN) + page wiring — Status: PARTIAL (reducer v1 committed; needs redesign)
**Committed v1 (ac550e6/commit):** `{ kind:'skill-viewer'; category; tabCursor }` + `nextSkillTab` over a FIXED 5-tab grid + reducer tests. **This model is WRONG per the capture** — the engine's tab picker is DYNAMIC (categories-minus-current + EXIT; PERSONAL gated). The v1 is inert (not wired to the page yet). **Redesign needed:**
- The picker entries = `[WEAPONRY,PHYSICAL,(PERSONAL if hasPersonalSkills),ACADEMIA].filter(c !== current)` ++ `[EXIT]`, in category order. So the reducer needs a `SkillInfo { hasPersonalSkills: boolean }` param (like `AssayInfo`) — `hasPersonalSkills` = any `member.skills[17..21] > 0` OR class-can-train a personal slot (verify; THESUS=false).
- State holds `category` (displayed) + a cursor over the DYNAMIC entry list. Arrows move within the 2-col entry grid; ENTER on a category → `category = thatCategory` (rebuild entries; pick a sensible cursor — engine's exact post-switch cursor-init is a cosmetic, not gated); ENTER on EXIT / ESC → action-menu.
- Replace `nextSkillTab`'s fixed-grid assumption with entry-list navigation.
**Page wiring (`CharacterViewPage.tsx`):** action-menu ENTER 'SKILL' (already routed) → `skill-viewer`; render `composeSkillViewer({ category, entries, cursor, rows: skillViewerRows(member, category), skillPoints, db })`. Surface `+0x1a8` skill-points (currently 0 for stock party — read via the struct's `spells_to_learn`/raw or add a `skillPoints` Character field).
**Tests:** reducer transitions over the dynamic entry list (incl. PERSONAL hidden); page key handling.

### Stage 4 — Engine fixture + pixel-parity (GATE) — Status: Not Started
**Goal:** lock the layout against engine ground truth.
- Drive DOSBox (camp → REVIEW → SKILL) via MCP / `build-saves` to capture the viewer framebuffer for ≥1 category on a real char (fighter WEAPONRY). Watch for chord flakiness (#070 note: fresh-boot path, save slots 0-9).
- `gen-fixture` → commit `.idx.gz` + `.png` under `tools/parity/fixtures/engine/`.
- `skill-viewer-parity.test.ts` at 100% floor. Fix composer/reducer initial-state to match.
**Success:** pixel-parity 100% vs the engine fixture.

### Stage 5 — e2e + manual smoke — Status: COMPLETE
Playwright e2e in `review-member-flow.spec.ts`: REVIEW MEMBER → SKILL → drive WEAPONRY/PHYSICAL/ACADEMIA (with the extra arrow to reach each fixture's captured cursor) + EXIT, each `expectCanvasMatchesFixture`. 6/6 e2e pass — the mounted-app pixel parity IS the driving-based smoke (a human eyeball via `pnpm dev:viewer` is still nice-to-have but the pixel match is strong).

### Stage 6 — Verify MEDIUM bits — Status: Partial
- **PERSONAL fixture: WON'T DO** — Nate confirmed (2026-06-01) NO class exposes the PERSONAL category, so `skills[17..21]` is never > 0 and the `hasPersonalSkills` gate never opens. The PERSONAL tab is unreachable in practice; our handling is engine-faithful dormant code (mirrors `composeSkillTrainFrame`). No capture possible/needed.
- Confirm `+0x4590` semantics across stock chars (unspent skill-bonus pool? reconcile `spells_to_learn` vs "SKILL POINTS") + surface the field on `ActivePartyMember`.
- Promote the 3 function renames (0x4d36/0x9dfb/0x982f) into `docs/re/wpcvw-*.md`.
- Confirm the engine's exact post-switch tab cursor-init (cosmetic; reducer resets to 0).

## Notes
- Read-only ⇒ no `commit-*` intent needed; `skill-viewer` is purely presentational (like `assay-display`), ESC/EXIT → action-menu.
- Promote the 3 recommended function renames (0x4d36/0x9dfb/0x982f) into `docs/re/wpcvw-*.md` after the port lands.
