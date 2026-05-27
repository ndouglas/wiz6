# wpcmk Screens — Consolidated RE Reference

Single source of truth for the wpcmk character-creation overlay, promoted from parent-reviewed findings under `docs/re/findings/wpcmk-*.json`. This document feeds the Phase 2 port plan.

**Source spec:** `docs/superpowers/specs/2026-05-26-wpcmk-byte-perfect-design.md`
**Source plan:** `docs/superpowers/plans/2026-05-26-wpcmk-re-sweep.md`

**Status: Phase 1 RE sweep COMPLETE** (2026-05-26). All 12 investigations promoted; 76/76 wpcmk functions named. Ready to feed the Phase 2 port plan. Remaining uncertainties are listed under "Open questions for Phase 2" at the end.

---

## Coverage summary

Per-screen coverage across the RE dimensions. ✓ = documented; — = N/A (non-interactive / no such element).

| Screen | Flow §1 | Window §2 | Strings §3 | Keys §8 | Special |
|--------|:------:|:--------:|:---------:|:------:|---------|
| 00 name entry | ✓ | ✓ (`*0x56ca`) | ✓ | ✓ (raw, not 1-5) | text input editor |
| 01 init | ✓ | ✓ (3 persistent) | — | — | `wpcmk_entry_and_roster_menu` creates windows |
| 02 race | ✓ | ✓ | ✓ | ✓ | menu picker §7 |
| 03 **sex** | ✓ | ✓ | ✓ | ✓ | menu picker §7 (was mislabeled "alignment") |
| 04 bonus roll | ✓ | — | — | — | `5+rng(6)`, +8 on each of two 1/20 rolls → 5..26 |
| 05 class | ✓ | ✓ | ✓ | ✓ | menu picker §7, qualification-gated |
| 06 bonus allocator | ✓ | ✓ | ✓ | ✓ | §4 |
| 07 derived stats | ✓ | — | — | — | non-interactive |
| 08 personality | ✓ | ✓ | ✓ | ✓ (CR-only) | reroll loop |
| 09 skill init | ✓ | — | — | — | combat-speed mods |
| 10 portrait | ✓ | ✓ | ✓ | ✓ | §6, no filter, 42 portraits |
| 11 starter items | ✓ | — | — | — | 14 class tables |
| 12 char sheet | ✓ | ✓ (`*0x546e`) | ✓ | — | redraw |
| 13 **skill training** | ✓ | ✓ (temp) | ✓ | ✓ | §5 (was mislabeled "spell-school") |
| 14 **spell picking** | ✓ | ✓ (2 temp) | ✓ | ✓ | §5, §9 (was mislabeled "skill-training") |
| 15 confirm | ✓ | ✓ | ✓ | ✓ | KEEP/DISCARD |
| 16 save | ✓ | — | — | — | §10, no slot picker; error msgs (dup-name 0x44e) belong to screen-00 |

RNG seed (§12) and post-commit (§10) cover the cross-cutting concerns.

---

## 1. Screen-flow map

The wpcmk character-creation overlay is invoked as a cross-overlay call from wbase's main-menu slot 5. Two entry wrappers (`wpcmk_create_via_empty_slot` at 0x50f2 and a sibling) handle name input and dispatch into the master orchestrator `wpcmk_create_character_master` at 0x4e47. **Total: 17 screens** (one pre-entry, 16 inside the master).

### Screen sequence

| # | Screen ID | Driver (file offset) | Interactive | One-line |
|---|-----------|---------------------|-------------|----------|
| 0 | `screen-00-pre-entry` | `wpcmk_create_via_empty_slot` 0x50f2 | yes | Name entry (≤14 chars, ASCII, unique) |
| 1 | `screen-01-init` | master entry 0x4e47 | no | Zero 432-byte record + create UI windows |
| 2 | `screen-02-race` | `wpcmk_pick_race_menu` 0x308d | yes | Pick 1 of **11 races** (all enabled) |
| 3 | `screen-03-sex` | `wpcmk_pick_sex_menu` 0x31a6 (was mislabeled `_alignment`) | yes | Pick MALE or FEMALE (**exactly 2 options**) — see §3 |
| 4 | `screen-04-bonus-roller` | `stat_roller_bonus` 0x4e81 | no | Inline bonus-pool roll (5..26) |
| 5 | `screen-05-class` | `wpcmk_pick_class_menu` 0x32e1 | yes | Pick 1 of **14 classes** (qualification-gated) |
| 6 | `screen-06-bonus-allocator` | `wpcmk_bonus_point_allocator_ui` 0x3405 | yes | Distribute bonus pool across STR/INT/PIE/VIT/DEX/SPD/PER |
| 7 | `screen-07-derived-stats` | `creation_init_derived_stats` 0x4ddd | no | Age, encumbrance, HP, level=1, XP=1 |
| 8 | `screen-08-personality` | `wpcmk_personality_reroll_loop` 0x3837 | yes | Rolling-dice anim until RETURN or click |
| 9 | `screen-09-skill-init` | `skill_init_all_32_slots` 0x392e | no | 32 skill-slot defaults |
| 10 | `screen-10-portrait` | `wpcmk_pick_portrait_loop` 0x4bad | yes | 42-cycle portrait picker (keys 1/3/5) |
| 11 | `screen-11-class-starter-items` | `FUN_3c49` 0x3c49 | no | Class-specific starter inventory (14 tables) |
| 12 | `screen-12-char-sheet-redraw` | `ui_redraw_character_sheet` 0x0df7 | no | Full character-sheet redraw |
| 13 | `screen-13-skill-training` | `ui_welcome_animation` 0x1ae9 | yes | **SKILL** allocation (weaponry/physical/personal/academia); conditional on `*0x5618 > 0` — see §5 |
| 14 | `screen-14-spell-picking` | `wpcmk_train_skill_pillar` 0x28d4 | yes | **SPELL** selection for casters (FIRE/WATER/AIR/EARTH/MENTAL/MAGIC) — see §5, §9 |
| 15 | `screen-15-confirm` | menu picker (msg 0x44f/0x45a) | yes | KEEP or DISCARD |
| 16 | `screen-16-save` | `roster_io_one_record` 0x001b (mode=1) | no | Write 432 bytes to PCFILE.DBS slot |

### Transitions

| From | Trigger | To |
|------|---------|-----|
| screen-00-pre-entry | CR after non-empty, unique name | screen-01-init |
| screen-00-pre-entry | empty name OR escape | **EXIT** → wbase state 4 |
| screen-00-pre-entry | duplicate name | modal error → re-prompt |
| screen-01-init | (immediate) | screen-02-race |
| screen-02-race | player selects race (any of 11) | screen-03-sex |
| screen-03-sex | player selects sex (MALE/FEMALE) | screen-04-bonus-roller |
| screen-04-bonus-roller | (immediate) | screen-05-class |
| screen-05-class | player selects a qualified class | screen-06-bonus-allocator |
| screen-06-bonus-allocator | key 5 while `pool==0` | screen-07-derived-stats |
| screen-07-derived-stats | (immediate) | screen-08-personality |
| screen-08-personality | RETURN or click | screen-09-skill-init |
| screen-09-skill-init | (immediate) | screen-10-portrait |
| screen-10-portrait | key 5 (confirm portrait) | screen-11-class-starter-items |
| screen-11-class-starter-items | (immediate) | screen-12-char-sheet-redraw |
| screen-12-char-sheet-redraw | (immediate) | screen-13 (if skill pts) **OR** screen-14 |
| screen-13-skill-training | skill pool `*0x5618` exhausted | screen-14-spell-picking |
| screen-14-spell-picking | all caster pillars trained | screen-15-confirm |
| screen-14-spell-picking | picker returns −1 (cancel) | loop until non-cancel |
| screen-15-confirm | choice == 0 (KEEP) | screen-16-save |
| screen-15-confirm | choice != 0 (DISCARD) | **EXIT** → wbase (no save) |
| screen-16-save | save completes | **EXIT** → wbase state 4 |

### Buffer writes (within the 432-byte record at DGROUP `*0x5470`)

| Screen | Record offset | Bytes | Meaning |
|--------|--------------:|-----:|---------|
| screen-00-pre-entry | 0x00..0x07 | 8 | character name (8-char padded) |
| screen-01-init | 0x00..0x1af | 432 | entire record zeroed |
| screen-01-init | DGROUP 0x56ac | 2 | `bonus_points_remaining = 0xffff` sentinel |
| screen-02-race | 0x19d | 1 | `chosen_race` (0..10) |
| screen-02-race | 0x12c..0x133 | 8 | base stats (STR/INT/PIE/VIT/DEX/SPD/PER/KAR) bumped to race floors |
| screen-03-sex | **0x1a1** | 1 | sex index (0=Male, 1=Female) — verified vs 6 stock chars (A7 round-trip). NOTE: 0x19e is **alignment** (separate field), not sex. |
| screen-03-sex | 0x12e | 1 | PIE possibly adjusted by `race_faerie_personality_mod` |
| screen-04-bonus-roller | DGROUP 0x56ac | 2 | `bonus_points_remaining = 5..26` (or 21 if debug override) |
| screen-05-class | 0x19f | 1 | class index, canonical `@wiz6/data` order: 0=Fighter…9=Bishop,10=Lord,11=Samurai,12=Monk,**13=Ninja** (verified: NUG class byte 13 = Ninja) |
| screen-05-class | DGROUP 0x56ae[14] | 28 | `class_qualification_flags[14]` |
| screen-06-bonus-allocator | 0x12c..0x131 | 6 | STR/INT/PIE/VIT/DEX/SPD ↑ via spent points (cap 18) |
| screen-06-bonus-allocator | 0x132 | 1 | PER also modifiable |
| screen-06-bonus-allocator | DGROUP 0x56ac | 2 | `bonus_points_remaining` → 0 |
| screen-07-derived-stats | 0x008..0x00b | 4 | age (`rng(1000) + 0x19aa`) |
| screen-07-derived-stats | 0x018..0x01f | 8 | encumbrance min/max + weight min/max |
| screen-07-derived-stats | 0x022..0x023 | 2 | **gold** = `(STR*2+VIT)*3*15` (÷3 for Faerie) — verified vs 6 stock chars. (RE #1 mislabeled this "hp_initial".) |
| screen-07-derived-stats | (stamina field, pcfile+0x1c) | 2 | **stamina** = `(VIT*2+STR)*3 + (VIT if VIT≥16) + (VIT if VIT≥18)` — verified vs 6 stock chars AND vs NUG's on-screen STM 108. (A5 mislabeled this `hpInitial`; it's STAMINA.) |
| screen-07-derived-stats | (hp field, pcfile+0x18/0x1a) | 2 | real **HP** = the per-class dispatch roll `rng(range)+offset` + VIT adjustments (VIT<8 −1, ≥16 +1, ≥18 +1) — same roll as encumbrance base. Verified: NUG=6 (Ninja rng(5)+4) + all 6 stock chars. See `derived-stats.ts`. |
| screen-07-derived-stats | 0x024..0x025 | 2 | `level = 1` |
| screen-07-derived-stats | 0x026..0x027 | 2 | `xp = 1` |
| screen-07-derived-stats | 0x1ac | 1 | `inventory_count = 0` |
| screen-07-derived-stats | 0x1ae | 1 | unknown = 100 |
| screen-07-derived-stats | 0x110..0x11f | 16 | combat stats init array |
| screen-08-personality | 0x133 | 1 | KAR (karma) = `rng(19)` → 0..18, +1 if player actively confirms (DGROUP 0x55a3). **NOT** `rng(9)+10` — that's the skill budget at 0x1a8. Cross-validated against stock chars (NOBAL=4, TREON=3) which are impossible under rng(9)+10. Matches existing `@wiz6/data/character-creation/karma-roll.ts`. |
| screen-09-skill-init | 0x19c | 1 | `portrait_idx_prev_cache = 0` (not a true record field) |
| screen-10-portrait | 0x19c | 1 | `portrait_index_final` (0..41) |
| screen-11-class-starter-items | 0x040..0x10f | up to 40 | up to 5 starter inventory slots (8 bytes each) |
| screen-13-skill-training | 0x134..0x141 | 14 | **skills[14]** — actual skill-level values incremented per pick (the PRIMARY skill write) |
| screen-13-skill-training | 0x1a8 | 1 | `skill_growth_budget` (= `rng(9)+10` − class tier2, DGROUP 0x5618); decremented to 0 as points are spent. Final disk value 0. (RE #1's "has_spells flag" was wrong.) |
| screen-14-spell-picking | 0x028..0x03f | 24 | **school mana** cur+max — 12 interleaved u16s for the 6 governing attributes (`add [0x5498],ax` / `add [0x549a],ax`). (RE #1's "skill pools" label was wrong; matches v2 record map.) |
| screen-14-spell-picking | 0x118..0x11b | 4 | per-pillar spell-training counters (initialized by screen-07's race handler, **drained to 0** here as spells are picked) |
| screen-16-save | disk + DGROUP 0x4fd8[slot] | 432 + 1 | full record → PCFILE.DBS slot, occupancy flag set |

> ✅ The screen-13/14 buffer-write attribution above was resolved by a dedicated re-trace (RE #1 had swapped/mislabeled them). Corrections: `0x028..0x03f` = school mana (screen-14, not skills); `0x1a8` = skill_growth_budget (screen-13, not a has-spells flag); `0x118..0x11b` = spell-pillar counters drained by screen-14; the old `0x068..0x07f` "spell mana" row was a **misidentification** — that range is inventory slots 5-7, zeroed at screen-01 init and never touched by 13/14. The primary screen-13 write (`skills[14]` at 0x134..0x141) was missing entirely from the RE #1 table. Caster detection is by checking pillar counters `0x5588..0x558b` directly, not a flag. Source: `docs/re/findings/wpcmk-screen-13-14-buffer-writes.json`.

### Conditional branches

- **screen-13 (SKILL training) is conditional on `*0x5618 > 0`** — `*0x5618` is the skill-points pool (`rng(9)+10` minus class tier2), NOT a "caster flag". When tier2 drives it to 0 (e.g. Fighter), screen-13 is skipped. See §5. (Screen-13's record writes — `skills[14]` at 0x134 and the `skill_growth_budget` at 0x1a8 — are now resolved in the buffer-writes table above.)
- **screen-14 (SPELL picking) loops via `while (*(0x5588+pillar) > 1)`** over the 4 spell-school pillars (MAGIC/FAITH/PHYSICAL/MENTAL at DGROUP `0x5588..0x558b`). Only 5 caster classes have nonzero pillar budgets; all others skip screen-14. See §5, §9.
- **screen-15 (confirm) → screen-16 only if `choice == 0` (KEEP).** DISCARD exits to wbase without disk write; the record buffer is discarded.
- **screen-00 (name entry) escape OR empty name exits wpcmk entirely.** Duplicate name shows modal error then re-prompts.

### Known corrections to prior RE

- **`wpcmk-naming-pass.json` overstated entry counts.** Race picker = 11 options (not 10), alignment picker = 2 options (not 10), class picker = 14 options (not 10). Verified via `cmp ax, 1; jng loop` at 0x31b4 for alignment and equivalent patterns for race/class.
- **`wpcmk-state-machine-trace.json` step labels are misaligned.** Step 3 = alignment (0x31a6), Step 5 = class (0x32e1); the address 0x392e is `skill_init`, not alignment.
- **Buffer offset `0x19c`** is confirmed as `portrait_idx` (was `still_tbd` in `character-record-extended-map-v2.json`).

Source: `docs/re/findings/wpcmk-screen-flow.json`

## 1a. Character roster menu options (wpcmk_entry_and_roster_menu §59e0)

`wpcmk_entry_and_roster_menu` (file 0x59e0) is the top-level wpcmk entry. Before dispatching to `wpcmk_create_via_empty_slot` and siblings, it displays the CHARACTER menu with a roster-state-dependent option set.

**Max roster slots: 16** (value at DGROUP 0x4fd2, loaded from pcfile.dbs header +0x02; confirmed from save-state memory reads).

### Option enable rules (from disassembly at 0x5a6e–0x5ad1)

| Option | Index | Msg ID | Enabled when |
|--------|-------|--------|--------------|
| CREATE PC | 0 | 0x046a | `roster_find_first_empty_slot() != -1` (roster has room) |
| REVIEW PC | 1 | 0x046b | any slot `*(0x4fd8+i) == 1` (has characters) |
| DELETE PC | 2 | 0x046c | any slot occupied |
| RENAME PC | 3 | 0x046d | any slot occupied |
| PORTRAIT  | 4 | 0x046e | any slot occupied |
| EXIT      | 5 | (literal) | **always** |

### States

| State | Condition | Visible options |
|-------|-----------|-----------------|
| EMPTY | 0 characters | CREATE PC, EXIT |
| PARTIAL | 1–15 characters | all 6 |
| FULL | 16 characters | REVIEW PC, DELETE PC, RENAME PC, PORTRAIT, EXIT |

**Evidence:** `docs/re/findings/wpcmk-character-menu-options.json` (RE date 2026-05-27). Confirmed against save states 1 (7 chars), 2 (0 chars), 3 (16 chars) via dosbox_read_memory at physical 0x1d020 (DGROUP+0x4fd8).

### Option placement (verified pixel-exact vs engine fixtures, 2026-05-27)

The visible options are laid out **column-major, 2 rows per column**, in the
bottomBar window. Column N's text starts at bottomBar-local cell **x = [18, 30, 2]**
(fill order = center, right, left); the two rows are bottomBar-local **y = 3 & 4**
(screen rows 23 & 24). Option index `i` → column `⌊i/2⌋`, row `i mod 2`.

- **EMPTY**: `[CREATE, EXIT]` → both in the center column (x18), rows 3 & 4.
- **PARTIAL**: CREATE/REVIEW @ x18 · DELETE/RENAME @ x30 · PORTRAIT/EXIT @ x2.

The bottom option list renders as **plain white text** — the engine does NOT
highlight the selected option here. The black-on-yellow cursor highlight
(`menu-cursor-render-path.json`, attr −5 → palette[5] yellow) is reflected in the
**top status bar** (the highlighted string at screen rows 1–2), not the bottom list.

**OPEN QUESTION — FULL layout unverified.** The EMPTY and PARTIAL states match
the column-major model pixel-exactly, but the FULL (16-char) fixture does **not**
fit it (observed text cells: EXIT @ x2/row3, RENAME @ x30/row3, a `_ PC` option
@ x18/row4, PORTRAIT @ x30/row4 — inconsistent with any simple fill rule). The
full save may not be a clean full-roster state, or FULL uses a different
placement. The port currently applies the column-major rule to FULL too (so its
grid→dispatch navigation is well-defined) but its pixel layout is **not** verified.
To close: re-capture a clean 16-char roster save, or decompile the placement loop
in `wpcmk_entry_and_roster_menu` (0x59e0).

## 2. Window layouts

Cross-overlay thunk: wpcmk file `0xbbb6` → `ui_window_create` at wroot image `0x011a`. Exactly **6 calls** to that thunk in the entire wpcmk binary: 3 persistent windows created early by an unnamed entry function `FUN_59e0` (called from wbase before the creation master runs), and 3 temporary windows created by individual screens.

### Persistent windows

Created once by `FUN_59e0` at the start of the creation flow. Most screens REUSE these.

| Handle | Created at | Cells (col × row) | Pixels (w × h) | Position (x, y) | Attr | Role |
|--------|-----------:|------------------:|---------------:|----------------:|-----:|------|
| `*0x546e` | wpcmk 0x5a0b | 40 × 20 | 320 × 160 | (0, 0) | 0x14 | Full top area — stat panel, char-sheet redraw |
| `*0x56ca` | wpcmk 0x5a31 | 40 × 5 | 320 × 40 | (0, 160) | 0x13 | Bottom status bar — picker headers, text input, personality roller |
| `*0x56cc` | wpcmk 0x5a57 | 19 × 13 | 152 × 104 | (168, 56) | 0x15 | Right-side menu panel — race/alignment/class/portrait picker lists |

Coordinate system: **screen-absolute** (320×200 EGA). Cells are 8×8 px tiles via wfont rendering.

### Per-screen window usage

| Screen | Windows used | Notes |
|--------|-------------|-------|
| screen-00-pre-entry | `*0x56ca` only | Text-input prompt in bottom bar |
| screen-01-init | persistent + redraw call | Master entry; reuses all 3 persistent windows |
| screen-02-race | `*0x56ca` (prompt) + `*0x56cc` (11-entry list) | |
| screen-03-sex | `*0x56ca` + `*0x56cc` (2-entry list) | |
| screen-04-bonus-roller | `*0x546e` (stat panel update — no new window) | Non-interactive inline code |
| screen-05-class | `*0x56ca` + `*0x56cc` (14-entry list, qualification-gated) | |
| screen-06-bonus-allocator | `*0x56ca` exclusively | Direct stat input via bottom bar |
| screen-07-derived-stats | `*0x546e` (panel update) | Non-interactive |
| screen-08-personality | `*0x56ca` | Rolling-dice animation in bottom bar |
| screen-09-skill-init | none | Non-interactive (32 skill-slot defaults) |
| screen-10-portrait | `*0x56cc` (image area) + `*0x56ca` (prompt) | 42-cycle picker, keys 1/3/5 |
| screen-11-class-starter-items | none | Non-interactive |
| screen-12-char-sheet-redraw | `*0x546e` | Full panel redraw |
| screen-13-skill-training | **NEW window at 0x1b28** | Temporary overlay, see below |
| screen-14-spell-picking | **2 NEW windows at 0x22bf + 0x22e5** | Temporary, see below |
| screen-15-confirm | `*0x56ca` (menu picker via `ui_menu_picker_vertical`) | medium confidence — needs verification |
| screen-16-save | none | Roster I/O, no UI windows |

### Temporary (screen-specific) windows

Three additional windows opened transiently:

| Screen | Driver | Call site | Cells | Pixels | Position | Attr | Purpose |
|--------|--------|-----------|-------|--------|----------|-----:|---------|
| screen-13 (skill training) | `wpcmk_skill_training_loop` 0x1ae9 | wpcmk 0x1b28 | 20 × 16 | 160 × 128 | (160, 32) | 0x19 | Skill-training overlay (stack-local) |
| screen-14 outer (spell pick) | `ui_train_attribute_picker_grid` 0x229c | wpcmk 0x22bf | 20 × 16 | 160 × 128 | (160, 32) | 0x16 | Spell-picking panel |
| screen-14 inner (spell pick) | (same driver) | wpcmk 0x22e5 | 19 × 8 | 152 × 64 | (168, 56) | 0x17 | 6-cell spell-pick grid (nested) |

### Notes

- `FUN_59e0` is an unnamed top-level wpcmk function called from wbase **before** `wpcmk_create_character_master` runs. Earlier RE assumed `creation_ui_init` (0x0d13) created the persistent windows, but it does not — it only calls existing windows. This is a correction worth recording (and a candidate name in the Task 12 cleanup pass: `creation_ui_setup_persistent_windows`).
- Attribute bytes (0x14, 0x13, 0x15, 0x16, 0x17, 0x19) encode wfont color/border style — see `docs/re/findings/wfont-tile-system.json` for the bit meanings.
- `screen-04-bonus-roller`, `screen-07-derived-stats`, `screen-09-skill-init`, `screen-11-class-starter-items`, `screen-16-save` are all non-interactive — they update the record buffer (and sometimes redraw the stat panel via `*0x546e`) but don't open new windows.

Source: `docs/re/findings/wpcmk-window-layouts.json`

### Window chrome (black fill + gray frame) — tile codes

A window's black interior + gray double-line frame is drawn entirely from **wfont1** (attr `0x01`), NOT a struct-level border. `ui_setup_creation_windows` (wpcmk 0x5093) clears each window to `(char 0x00, attr 0x01)` then `FUN_06af` writes the frame chars cell-by-cell (only the char byte; attr stays 0x01 from the fill).

| Piece | char | font/attr |
|-------|-----:|-----------|
| black-fill interior | `0x00` | wfont1, attr `0x01` (solid black 8×8) |
| top-left corner | `0x01` | wfont1, `0x01` |
| horizontal edge (top/bottom) | `0x02` / `0x07` | wfont1, `0x01` |
| top-right corner | `0x03` | wfont1, `0x01` |
| left / right vertical edge | `0x04` / `0x05` | wfont1, `0x01` |
| bottom-left / bottom-right corner | `0x06` / `0x08` | wfont1, `0x01` |
| double-line separators (interior) | `0x0c` (horiz) / `0x0d` (vert) | wfont1, `0x01` |

Frame line = palette color 9 (RGB 170,170,170, light gray); fill = color 0 (black); screen bg = attr 8 (dim gray). Verified via live save-1 cell dump (phys 0x1f47e), ndisasm of `FUN_06af`, and wfont1 glyph renders. **Text content** drawn into a window (e.g. "CHARACTER NAME >") uses its own attr (e.g. wfont3 = attr 0x13) via `puts`, layered over the chrome.

**Port note:** Stage-B `createPersistentWindows` wrongly filled with `(0x20, 0x14)` → wfont4 glyph 0x20 = a graphic tile ("ring sprites"). Correct: fill `(0x00, 0x01)` + frame chars `0x01–0x08` from wfont1.

Source: `docs/re/findings/wpcmk-window-chrome.json`

## 3. msg.dbs string IDs per screen

wpcmk holds no string literals (except 4 filenames). All on-screen text comes via `ui_window_write_msg_by_id` (thunk wpcmk `0xc2db` → wroot image `0x083f`) and `load_msg_into_buf` (thunk `0xc1f7`), each taking a msg.dbs ID. 30 + 16 call sites resolve to **56 strings**. Calling convention: `push col_or_attr; push window_handle; push msg_id; call thunk` (cdecl, 6-byte cleanup).

### ⚠ Corrections to section 1 (screen-flow) from authoritative string text

- **`screen-03` is the SEX picker, NOT alignment.** msg `0x0451` = "SELECT CHARACTER SEX", title `0x045d` = "CHARACTER SEX", options MALE (`0x8c`) / FEMALE (`0x8d`). The 2-option count Task 2 found is correct, but the "Good/Evil alignment" label was a wrong guess. Function `wpcmk_pick_alignment_menu` (0x31a6) should be renamed `wpcmk_pick_sex_menu` (flag for Task 12). Wiz6 has no Good/Evil alignment picker in creation. **Section 1 has been corrected accordingly.**
- **`screen-05` class prompt is "SELECT CHARACTER PROFESSION" / title "PROFESSION"** — Wiz6 calls classes "professions" on-screen.
- **screen-13 / screen-14 were swapped in Task 2 — now RESOLVED (see §5).** screen-13 (`wpcmk_skill_training_loop` 0x1ae9) = SKILL training (WEAPONRY/PHYSICAL/PERSONAL/ACADEMIA, "SKILL POINTS"); screen-14 (`wpcmk_pick_spell` 0x28d4) = SPELL picking ("SPELLS"/"COST"/spell names). Task 4's strings were correct; Task 2's labels were swapped.

### Per-screen strings

| Screen | Role | Msg ID | Text |
|--------|------|-------:|------|
| screen-00-pre-entry | prompt | 0x044c | `CHARACTER NAME >` |
| screen-00-pre-entry | error | 0x044e | `* CHARACTER ALREADY EXISTS *` |
| screen-02-race | prompt | 0x0450 | `SELECT CHARACTER RACE` |
| screen-02-race | title | 0x045c | `CHARACTER RACE` |
| screen-02-race | option_names | 0x0064..0x006e | HUMAN / ELF / DWARF / GNOME / HOBBIT / FAERIE / LIZARDMAN / DRACON / FELPURR / RAWULF / MOOK |
| screen-03-**sex** | prompt | 0x0451 | `SELECT CHARACTER SEX` |
| screen-03-**sex** | title | 0x045d | `CHARACTER SEX` |
| screen-03-**sex** | option_names | 0x008c..0x008d | MALE / FEMALE |
| screen-05-class | prompt | 0x0452 | `SELECT CHARACTER PROFESSION` |
| screen-05-class | title | 0x045e | `PROFESSION` |
| screen-05-class | option_names | 0x0078..0x0085 | FIGHTER / MAGE / PRIEST / THIEF / RANGER / ALCHEMIST / … (14 total) |
| screen-06-bonus-allocator | title | 0x0460 | `ASSIGN ABILITY SCORE BONUS` |
| screen-06-bonus-allocator | label | 0x0454 | `↑↓ ADJUSTS ABILITY` (`\x11\x12` arrow glyphs) |
| screen-06-bonus-allocator | label | 0x0455 | `←→ SELECTS ABILITY` (`\x13\x14` arrow glyphs) |
| screen-06-bonus-allocator | label | 0x0453 | `BONUS` |
| screen-08-personality | label | 0x0457 | `CASTING KARMA - PRESS \x15` |
| screen-10-portrait | label | 0x0458 | `↑↓ TO REVIEW PORTRAITS` |
| screen-10-portrait | label | 0x0459 | `PRESS \x15 TO SELECT` |
| screen-12-char-sheet | labels | 0x00c8.. | LVL / RNK / EXP / STR / INT / PIE / VIT / DEX / SPD / PER / KAR |
| screen-13 (skill training) | labels | 0x0258..0x025d | WEAPONRY / PHYSICAL / PERSONAL / ACADEMIA / … |
| screen-13 (skill training) | label | 0x159a | `SKILL POINTS` |
| screen-14 (spell picking) | title | 0x02bc | `      SPELLS      ` |
| screen-14 (spell picking) | label | 0x0f75 | `COST` |
| screen-14 (spell picking) | option_names | 0x0fa0.. | ENERGY BLAST / BLINDING FLASH / FIREBALL / … |
| screen-15-confirm | prompt | 0x044f | `SAVE THIS CHARACTER?` |
| screen-15-confirm | option | 0x045a | `YES` (/ NO) |

Note: race/class/skill/spell names use **dynamic msg-id computation** (base + runtime index), e.g. race names at `0x0064 + race_idx`.

### Adjacent roster-picker UI (wbase-side, outside creation)

The subagent also resolved the roster-picker menu strings (msg `0x0464`–`0x046b`): `CANCEL`, `CREATE PC`, `REVIEW PC`, `DELETE THIS CHARACTER?`, `PRESS \x15 TO EXIT`. These belong to wbase's slot-5 entry (out of scope per spec) but are useful context for Phase 2's entry-point wiring.

### Inline (non-msg.dbs) strings

Only 4, all filenames: `PCFILE.DBS` (roster), `WPORT1.EGA` / `WPORT1.CGA` / `WPORT1.T16` (portraits, selected by video-mode flag `*0x4fc6`). Confirms `wpcmk-character-creation-trace.md`.

### Unused

msg `0x044d` = `* ROSTER FULL *` has no `push` reference anywhere in wpcmk — apparently dead/unused in this build.

Source: `docs/re/findings/wpcmk-msg-strings.json`

## 4. Bonus-allocator UI loop (screen-06)

`wpcmk_bonus_point_allocator_ui` (0x3405) distributes the rolled pool (`*0x56ac`, 5..26) across 7 attribute slots at `*0x559c`: STR=0, INT=1, PIE=2, VIT=3, DEX=4, SPD=5, **PER=6** (KAR/index 7 is NOT adjustable here). Renders in the bottom status bar window `*0x56ca`.

### Key handlers (asm comparison values)

| Key | Action | Detail |
|----:|--------|--------|
| 1 (DECREASE) | `if undo[cursor] > 0: attr[cursor]--, undo[cursor]--, pool++` else play_sound | `CMP AX,1` @ 0x37c7 |
| 2 (PREV_ATTR) | clear highlight; `cursor = cursor<=0 ? 6 : cursor-1` (wraps 0→6) | `CMP AX,2` @ 0x37cf |
| 3 (INCREASE) | `if attr[cursor]<18 && pool>0: attr[cursor]++, undo[cursor]++, pool--` else play_sound | `CMP AX,3` @ 0x37d7 |
| 4 (NEXT_ATTR) | clear highlight; `cursor = cursor>=6 ? 0 : cursor+1` (wraps 6→0) | `CMP AX,4` @ 0x37df |
| 5 (CONFIRM) | `if pool<=0: exit` else play_sound + continue | `CMP [BP-2],5` @ 0x37e4/0x37f9 |

Caps: attr ≤ 18 (`CMP byte [cursor+0x559c],0x12` @ 0x3732). Confirm gated on `pool <= 0` — **player must spend the entire pool** to leave.

### Mouse (5-button table @ file 0x3678)

If `*0x4fc4 == 1` (mouse mode): button0→key1, button1→key3, button2→key2, button3→key4, button4→key5. *(Correction: a prior pass claimed only 3 buttons mapped to key1/3/5 — the real table has 5.)*

### Lower-bound rule

The decrease guard checks `undo[cursor] > 0` (`CMP word [BX-0x14],0` @ 0x369e), **not** the race floor directly. `undo[]` starts at 0, so the player can only refund points spent *this session* — net effect: an attribute can't drop below its pre-allocator (racial-minimum) value. The race floor is never re-compared in this loop.

### Structural notes

- **`cursor` (`[BP-4]`) and `undo[]` (`[BP-0x14]`, 7 words) are stack-locals**, not DGROUP globals. `undo[]` is memset to 0 on entry. There is no persistent per-attribute spend counter in DGROUP.
- When `pool != 0`, the pool-value display runs a **busy-loop count-up animation** (`ui_window_putchar` until `win.field[6] >= 38`) each loop iteration.

State machine: 13 states / 20 transitions — full detail in the findings JSON.

Source: `docs/re/findings/wpcmk-bonus-allocator.json`

## 5. Skill-train UI loop (screen-13) + screen-13/14 resolution

### ⚠ Screen-13 and screen-14 were SWAPPED in Task 2's labels

Definitively resolved by decompile (RE #5) + cross-checked against msg strings (RE #3):

- **screen-13** (`ui_welcome_animation` 0x1ae9 → `creation_stage_dispatcher_by_step` 0x15d7) = **SKILL training**, NOT "spell-school animation". Displays skill-category headers (WEAPONRY `0x258` / PHYSICAL `0x259` / PERSONAL `0x25a` / ACADEMIA `0x25b`) and individual skill names (WAND&DAGGER `0x157c`, SWORD, AXE, …) and "SKILL POINTS" (`0x159a`).
- **screen-14** (`wpcmk_train_skill_pillar` 0x28d4) = **SPELL picking**, NOT "skill training". Displays "SPELLS" title (`0x2bc`), "SELECT A NEW SPELL FOR YOUR SPELLBOOK" (`0x2bf`), "COST" (`0xf75`), spell-school names FIRE/WATER/AIR/EARTH/MENTAL/MAGIC (base `0xf6e`), spell names (base `0xfa0`: ENERGY BLAST, FIREBALL, …).

These are two orthogonal systems. **Section 1's screen-sequence table and transitions have been corrected; the buffer-writes and conditional-branches subsections retain provisional labels pending the Task 14 cross-check.**

### Starter skill-points pool — `0x5618` = `rng(9) + 10` (10..18), NOT fixed 10

The spec's placeholder of `10` is only the minimum. Pool is seeded by `personality_roll_static_10_to_18` (0x4222 — name is a misnomer; it actually rolls the skill pool):
```asm
4261:  b8 09 00 50 e8 XX XX   ; push 9; call rng_thunk(0xc47e) → 0..8
       59 80 c0 0a            ; pop; add al, 10            → 10..18
       a2 18 56               ; mov [0x5618], al
```
Then a class-specific handler (jump table at file `0x4545`, runtime `0x8aa9`) may **subtract an attribute-derived "tier2" adjustment**:

| Classes | tier2 behavior |
|---------|----------------|
| Mage, Priest, Thief, Alchemist, Bard, Psionic, Valkyrie, Lord, Samurai | no adjustment — keep full `rng(9)+10` |
| Fighter, Ranger, Bishop, Monk, Ninja | subtract `tier2 = (attr / div) + base` (per-class `div`/`base`); Fighter caps at 0 (`result = max(0, pool − tier2)`) |

This reconciles the "screen-13 skipped" behavior: when the tier2 subtraction drives `0x5618` to 0 (e.g. Fighter), the skill-training loop never runs. So screen-13's condition is **`0x5618 > 0`** (has skill points to spend), not "is a caster" as Task 2 framed it.

### Skill-training loop (screen-13)

`ui_welcome_animation` (0x1ae9) creates a temporary window (20×16 @ (160,32), attr 0x19) then loops:
```
do {
  creation_stage_dispatcher_by_step(window, party, step)   // shows a skill category + names
  ui_class_menu_with_qualification(party, window)
  step = (step + 1) % 4                                    // cycle WEAPONRY→PHYSICAL→PERSONAL→ACADEMIA
  if (step == 2 && <no personal skills>) step = 3          // skip PERSONAL category when N/A
} while (*0x5618 != 0)                                      // until skill pool exhausted
```
Player spends points from the `0x5618` pool across the 4 skill categories; the loop ends when the pool hits 0. Key codes 1/2/3/4/5 (the same input scheme used throughout wpcmk).

### Other notes

- `skill_init_all_32_slots` (0x392e, screen-09) does NOT allocate a skill pool — it initializes per-skill **combat-speed modifiers** at DGROUP `0x55d8+idx` via `speed = -4 × |KAR − 9| + 40`. The name is misleading (rename candidate for Task 12).
- Spell training (screen-14) uses a separate per-pillar point budget at DGROUP `0x5588..0x558b` (MAGIC/FAITH/PHYSICAL/MENTAL), covered in section 9 (spell-names) — only Mage (MAGIC=2), Priest (FAITH=2), Alchemist (PHYSICAL=2), Psionic (MENTAL=2), Bishop (MAGIC=1+FAITH=1) reach it.

Source: `docs/re/findings/wpcmk-skill-train.json`

## 6. Portrait picker UI loop (screen-10)

`wpcmk_pick_portrait_loop` (0x4bad) + `portrait_load_from_disk` (0x4a9a). Renders the image in window `*0x56cc`, prompt in `*0x56ca`.

### No race/sex/class filter

**Surprise: the picker cycles ALL 42 portraits unconditionally.** The loop body at 0x4bad contains zero comparisons against race (`*0x560d`), sex (`*0x560e`), or class (`*0x560f`). Any character can have any of the 42 portraits. This contradicts the spec's assumption of a race+sex-filtered pool — there is no filter.

### Keys & navigation

- Key 1 / Key 3 = cycle portrait left / right (review). On-screen: "↑↓ TO REVIEW PORTRAITS" (msg 0x458).
- Key 5 = select/confirm. On-screen: "PRESS \x15 TO SELECT" (msg 0x459).
- 42 portraits total (0x2a); index wraps.

### Default index

For **new** character creation: `wpcmk_create_character_master` executes `mov byte [0x560c], 0` (`c6 06 0c 56 00`) at file 0x4ed0 just before the loop, so the picker starts at portrait 0 (cache sentinel `0xffff` forces load of portrait 0 on first display). For **edit** (`wpcmk_change_portrait` 0x5422), it starts at the character's existing portrait from the roster record.

### Record field

Selected portrait index (0..41) → record offset `0x19c` (DGROUP `*0x560c`).

### Portrait file layout

`seek_offset = (idx % 14) * stride * 9`, where stride = 32 (EGA) / 16 (CGA). Yields 288-byte EGA / 144-byte CGA descriptors. File chosen by video-mode flag `*0x4fc6`: `WPORT1.EGA` / `WPORT1.CGA` / `WPORT1.T16`.

### ⚠ Corrections / conflicts to resolve

- **`portrait-pools.json` "portrait_refs" are actually starter ITEM IDs, not portraits.** Verified: Fighter `portrait_refs` `[141,130,132,135,8]` is set-equal to the screen-flow Fighter starter items `[0x08,0x87,0x84,0x82,0x8d]`. Address 0x3c49 is the starter-item dispatcher, not a portrait table. **`portrait-pools.json` should be corrected/retired** (flag for follow-up).
- **Default-index conflict (open).** This pass found the new-character default is portrait 0, with an SPD+1-derived value written to a *different* field, record `+0x1ab` (`*0x561b`, computed at 0x4ded). But `portrait-pools.json` also validated that stock characters' `+0x19c` portrait index equals `SPD + 1` (e.g. THESUS spd=9 → portraitIndex=10). Either stock chars were authored with SPD+1 portraits, or the default logic is subtler than "0". **Left as an open question for Task 14 / a follow-up pass** — the Phase 2 port should not assume SPD+1 for the picker default until resolved.

Source: `docs/re/findings/wpcmk-portrait-picker.json`

## 7. Generic menu-picker widget

`ui_menu_picker_vertical` at **wpcmk file `0x029c`** (a real function, not a thunk — entry `55 8b ec`). Drives race (screen-02), sex (screen-03), and class (screen-05). All three pass identical nav params: `col_stride=10, num_rows=11, highlight_attr=5`.

### Keys (grid navigation, no wrap)

| Key | Action |
|----:|--------|
| 1 | prev column (cursor − num_rows) |
| 2 | prev row (cursor − 1) |
| 3 | next column (cursor + num_rows) |
| 4 | next row (cursor + 1) |
| 5 | confirm selection |

**No wrap** — each direction has a hard bounds guard; a blocked move is a silent no-op. Mouse click sets the cursor directly and forces key=5. **No cancel/escape** — the picker is mandatory (always returns a valid selection).

### Disabled entries: pre-filtered

Disabled entries (`enabled[i] == 0`) are skipped during the init loop and **never assigned a cursor slot** — the cursor can only land on enabled entries (no land-and-reject). Evidence: `cmp word [bx+si],0x1; jnz skip` @ file 0x02c0. For the class picker, `FUN_2d10` populates the `*0x56ae[14]` qualification flags first; unqualified classes simply don't appear.

### Return value

The **original index** into the caller's full option array (not the enabled-subset index). No −1 cancel path.

### No letter shortcuts

The key-dispatch chain (file 0x05d2..) handles only codes 1–5. No ASCII-letter hotkeys.

### Selection storage

Low byte written to: `*0x560d` (race), `*0x560e` (sex), `*0x560f` (class).

Source: `docs/re/findings/wpcmk-menu-picker.json`

## 8. Keyboard input model + filter masks

### The "1-5 codes" are arrow keys + Return (critical for Phase 2)

Throughout wpcmk, interactive screens dispatch on action codes 1–5. **These are NOT literal digit keys.** `input_poll_key_or_mouse` (using `strchr_index`, wroot thunk `0xedec`) looks up the raw key byte in a 6-entry runtime table at wroot DGROUP `0x541e` = `[ESC, Left, Up, Right, Down, Return]`; the 0-based position is the action code:

| Action code | Key | Raw byte (from save state) |
|------------:|-----|---------------------------:|
| 0 | ESC | 0x1b (silently ignored by all creation callers) |
| 1 | **Left** | 0x08 |
| 2 | **Up** | 0x09 |
| 3 | **Right** | 0x0a |
| 4 | **Down** | 0x0b |
| 5 | **Return** | 0x0d |

So the per-screen mappings documented elsewhere translate as:
- **Menu picker** (§7): Left=prev col, Up=prev row, Right=next col, Down=next row, Return=confirm.
- **Bonus allocator** (§4): Left=decrease, Up=prev attr, Right=increase, Down=next attr, Return=confirm.
- **Portrait picker** (§6): Left/Right=cycle, Return=select.

The key table at `0x541e` is BSS (zero in the binary, populated by winit at startup) — verified via DOSBox save state showing `1b 08 09 0a 0b 0d 00`.

### `kbd_check_with_filter` param is a 3-way discriminant, not a bitmask

Decompiling wroot `0x2643` shows the parameter is not a bit-mask:

| Value | Behavior |
|------:|----------|
| 0 | accept any key |
| 2 | digits only |
| other (incl. 1) | broad printable |

All wpcmk creation calls pass `1` → broad filter.

### Per-screen input

| Screen | Input path |
|--------|-----------|
| screen-00 name entry | `ui_text_input_editor` — bypasses the 1-5 system, works on **raw key bytes** |
| screen-02 race / -03 sex / -05 class | menu picker via `input_poll_key_or_mouse` (arrow codes) |
| screen-06 bonus allocator | `input_poll_key_or_mouse` (arrow codes) |
| screen-08 personality | direct `kbd_check_with_filter` (0xe0df) — **CR-only**, bypasses 1-5 |
| screen-10 portrait | `input_poll_key_or_mouse` |
| screen-13 skill training | `input_poll_key_or_mouse` (2 call sites) |
| screen-14 spell picking | `input_poll_key_or_mouse` |
| screen-15 confirm | `input_poll_key_or_mouse` |

Source: `docs/re/findings/wpcmk-kbd-filter-masks.json`

## 9. Spell-name resolution

### Labeling scheme: `msg_id = 0xFA0 + entry_idx`

Flat base-offset indexing. The label renderer at wpcmk `0x21db` loads the spell's `entry_idx` from the filtered display array, adds `0xFA0`, and calls the msg-display thunk `0xc2db`:
```asm
2248:  05 a0 0f   ; ADD AX, 0x0FA0   (entry_idx → msg_id)
```
Called from both spell-picker display sites (`0x2509`, `0x275f`).

### 82-entry spell table

Names resolve to msg `0xfa0`..`0xff1`. The full table (name + school + level + bookmask) is in `docs/re/findings/wpcmk-spell-names.json`. Book counts match `spell-school-assignment.json` exactly: **Mage 33, Priest 33, Alchemist 32, Psionic 25** (spells appear in multiple books via the `byte5` bitmask).

Sample:

| Idx | Msg | Name | School | Lvl |
|----:|----:|------|--------|----:|
| 0 | 0xfa0 | ENERGY BLAST | FIRE | 1 |
| 1 | 0xfa1 | BLINDING FLASH | FIRE | 2 |
| 2 | 0xfa2 | FIREBALL | FIRE | 3 |
| … | … | … | … | … |
| 78 | 0xfee | DEATH WISH | DIVINE | 7 |
| 79 | 0xfef | HOLY WATER | DIVINE | 0 |
| 80 | 0xff0 | HELPFOOD | DIVINE | 0 |
| 81 | 0xff1 | MAGICFOOD | DIVINE | 0 |

### Non-learnable entries

Entries 79–81 (HOLY WATER, HELPFOOD, MAGICFOOD) have msg names but `byte5 = 0` and `level = 0` — unreachable through the picker's bitmask filter (`byte5 & book_mask == 0`). Likely item/event-only spells, not selectable at creation.

### Phase 2 note

This resolves the spec's "spell names" placeholder. The Phase 2 spell picker (screen-14) should label entries via `0xFA0 + entry_idx` against the extracted msg.dbs, filtered by the active pillar's book mask.

Source: `docs/re/findings/wpcmk-spell-names.json`

## 10. Post-commit return path

### Slot resolution: **no UI picker**

`wpcmk_create_via_empty_slot` (0x50f2) calls `roster_find_first_empty_slot` (0x4ff4), which performs a linear scan over the in-memory occupancy array at DGROUP `*0x4fd8` and returns the first index where the byte is 0. There is **no overwrite prompt, no occupancy menu, no "which slot?" UI** anywhere in wpcmk. The slot is guaranteed empty by the entry wrapper.

### Commit sequence (7 steps)

| Step | Action | Details |
|------|--------|---------|
| 1 | Confirmation menu | `ui_menu_picker_vertical` with msg `0x44f` header + msg `0x45a` options. Choice 0 = KEEP, any other choice = DISCARD (exit without writing). |
| 2 | Write character record | `roster_io_one_record(mode=1, slot_idx, buf=0x5470)` — opens PCFILE.DBS, seeks to `slot × 0x1b0 + header`, writes 432 bytes. |
| 3 | Mark slot occupied | `*(0x4fd8 + slot_idx) := 1` — updates in-memory occupancy array (the byte that `roster_find_first_empty_slot` scans). |
| 4 | Sync roster header to disk | Build filename via `boot_build_prompt_message` (0xc772 source 0x53fe), then rewrite the roster header so the new slot's occupancy persists. |
| 5 | `wpcmk_create_character_master` returns | Standard epilogue. Control flows back through `wpcmk_create_via_empty_slot`, which also returns. |
| 6 | Dispatch stub writes `*0x363a = 4` | wpcmk's dispatch entry at file `0x0010` runs: `59 c7 06 3a 36 04 00 b8 00 00 c3` = `pop cx; mov word [0x363a], 4; mov ax, 0; ret`. **This is the ONLY write to `*0x363a` anywhere in wpcmk.** |
| 7 | wroot loads wbase | `ovl_install_table` sees state=4, dispatches to the wbase state-4 handler (main menu). |

### State transition mechanism

Full overlay flow at commit time:
```
wbase slot-5 writes *0x363a = 0x10
    ↓
wroot ovl_install_table loads wpcmk.ovr
    ↓
wpcmk entry (file 0x10) → wpcmk_create_via_empty_slot → creation subroutines
    ↓
creation completes; subroutines return up the stack
    ↓
wpcmk dispatch stub writes *0x363a = 4
    ↓
returns to wroot loop
    ↓
wroot loads wbase.ovr → main menu
```

The creation subroutines themselves (`wpcmk_create_character_master`, `roster_io_one_record`, etc.) **never** touch `*0x363a`. State transition is fully deferred to the dispatch-stub epilogue.

### Confirmation menu strings

| Msg ID | Role | Call site (wpcmk.ovr) |
|-------:|------|-----------------------|
| `0x44f` | Confirmation header (likely "Are you satisfied with this character?") | file 0x4f66 |
| `0x45a` | Confirmation option list (YES / NO) | passed to `ui_menu_picker_vertical` at master commit path |
| `0x44e` | Duplicate-name error (shown pre-creation in `wpcmk_create_via_empty_slot`) | file 0x51a5 |

Actual string text requires msg.dbs decode (resolved in RE #3 / section 3).

### DISCARD path

If the user picks any option other than 0 at the confirmation menu (step 1), `wpcmk_create_character_master` returns immediately without touching the disk. The 432-byte record buffer at `*0x5470` is discarded; the slot remains empty in `*0x4fd8`; no roster header sync. Control returns to wbase via the same dispatch-stub epilogue (`*0x363a = 4`).

### Open question

The wpcmk overlay header at file `0x04-0x05` holds `0x5c9b`, which is likely a function-pointer table used by wroot's overlay loader to invoke the creation entry point. The exact loader-side mechanism (wroot `FUN_36dc` / `FUN_1462`) wasn't traced in this pass — flagged for follow-up if Phase 2 needs it.

Source: `docs/re/findings/wpcmk-post-commit.json`

## 11. Remaining wpcmk functions (naming completion)

wpcmk is now **76/76 named**. The final 10 (merged into `wpcmk-naming-pass.json`):

| Addr | Name | Role |
|------|------|------|
| 0x2d10 | `class_qualification_check_all_14` | iterate-all 0..13 class qualification check (jump table at runtime 0x73ae / file 0x2e4a) |
| 0x2e85 | `class_post_select_stat_bump` | raise stats to meet picked class requirements |
| 0x2fbd | `class_post_select_dispatch` | jump-table case |
| 0x2fca | `nop_return_stub` | no-op |
| 0x2fce | `race_post_select_dispatch` | race-specific post-select handler |
| 0x38fb | `combat_speed_for_slot` | per-skill combat-speed calculator (called 32× by combat_speed_modifier_init) |
| 0x3c49 | `class_load_starter_inventory` | dispatches one of 14 class starter-item tables (screen-11) |
| 0x3e17 | `spell_level_adjust_clamped` | clamps spell-level adjustment |
| 0x505b | `ui_show_error_modal` | modal error display (msg_id, row, col) → render + sound + wait-for-key |
| 0x59e0 | `wpcmk_entry_and_roster_menu` | **top-level** wpcmk entry: creates 3 persistent windows AND runs the roster-management menu (CREATE/REVIEW/DELETE/RENAME/PORTRAIT) |

### 5 corrections to existing names (this sweep)

| Addr | Was | Now | Why |
|------|-----|-----|-----|
| 0x31a6 | `wpcmk_pick_alignment_menu` | `wpcmk_pick_sex_menu` | msg "CHARACTER SEX", MALE/FEMALE (§3, §7) |
| 0x4222 | `personality_roll_static_10_to_18` | `skill_pool_roll_and_class_adjust` | rolls skill-points pool (§5), not personality |
| 0x1ae9 | `ui_welcome_animation` | `wpcmk_skill_training_loop` | screen-13 is skill training (§5) |
| 0x28d4 | `wpcmk_train_skill_pillar` | `wpcmk_pick_spell` | screen-14 is spell picking (§5, §9) |
| 0x392e | `skill_init_all_32_slots` | `combat_speed_modifier_init` | inits combat-speed mods, not skills (§5) |

Note: `0x59e0` was not even recognized as a function by Ghidra (the `--only-unnamed` count of 10 missed it). It is the wpcmk overlay's real top-level entry, broader than just window setup.

Source: `docs/re/findings/wpcmk-remaining-functions.json` (corrections merged into `wpcmk-naming-pass.json`).

## 12. Wichmann-Hill seed at creation start

The engine RNG is the 3-stream Wichmann-Hill 1982 Lehmer LCG at `rng_advance` (wroot image `0x125b9`). All three streams live as **CS-relative words inside wroot's code segment** (using explicit `2E` CS-prefix), which is a 16-bit DOS technique: the stream state aliases function code bytes.

### Stream addresses

| Stream | CS offset | Boot value | Constants `(q, a, c)` | Reseed-positive |
|--------|----------:|-----------:|-----------------------|----------------:|
| 1 | `CS:[0x1d3b]` | `0x0bb8` (3000) — code bytes | `(0xb1, 0xab, -2)` | `+0x763d` |
| 2 | `CS:[0x1d3d]` | `BIOS_tick_low + 2` (variable) | `(0xb0, 0xac, -0x23)` | `+0x7663` |
| 3 | `CS:[0x1d3f]` | `0x752f` (29999) — code bytes | `(0xb2, 0xaa, -0x3f)` | `+0x7673` |

### Boot-seeding mechanism

- **Streams 1 and 3 are never explicitly seeded.** Their "initial" value is whatever the wroot image binary holds at those file offsets — which happens to be the raw bytes `b8 0b` and `2f 75` (LE). Binary search confirms zero explicit writes to either address outside `rng_advance`.
- **Stream 2 is seeded once at boot** by the function at wroot image `0x1d41` (file `0x1f41`): reads BIOS timer tick counter from `0000:046c`, adds 2, writes `AX → CS:[0x1d3d]`. Called from init function at wroot image `0x1c1e`. Asm pattern: `push ES; xor ax,ax; mov es,ax; mov bx,0x046c; mov ax,es:[bx]; pop es; add ax,2; mov CS:[0x1d3d],ax; ret`.

### Available DOSBox-X save states

13 saves in `tools/dosbox/save/` (1–13). None are confirmed at `wpcmk_create_character_master` entry. Saves 8–13 have `game_state = 0xffff` and may be mid-creation captures worth investigating during Phase 2 setup. Sample observed stream states:

| Save | Context | stream1 | stream2 | stream3 |
|------|---------|--------:|--------:|--------:|
| 1 | newest | 0x05da | 0x57be | 0x6d4a |
| 2 | title screen | 0x4180 | 0x62d7 | 0x068e |

### Parity strategy for Phase 2

Use a **fixed seed triple** for deterministic unit tests — `(stream1=3000, stream2=1, stream3=29999)`, the static boot values before any timer seeding. Replay the exact sequence of `rng.next()` calls made by each wpcmk sub-function; assert byte-identical outputs against captured DOSBox memory.

For bit-exact regression baselines against the real game, capture a new DOSBox save state at `wpcmk_create_character_master` entry (`game_state == 0xffff` window), read the three `CS:[0x1d3b/3d/3f]` values, and use those as the test seed.

Source: `docs/re/findings/wpcmk-rng-seed-at-creation.json`

---

## Open questions for Phase 2

Aggregated across all RE findings. All resolved or non-blocking for Phase 2.

1. **✅ RESOLVED — buffer-write attribution for screen-13 (skill) / screen-14 (spell).** Re-traced (`docs/re/findings/wpcmk-screen-13-14-buffer-writes.json`): screen-13 writes `skills[14]` at 0x134..0x141 + `skill_growth_budget` at 0x1a8; screen-14 writes school mana at 0x028..0x03f and drains pillar counters at 0x118..0x11b. The old 0x068..0x07f "spell mana" row was a misID (inventory, zeroed at init). See the §1 buffer-writes table.

2b. **✅ RESOLVED — sex = 0x1a1, alignment = 0x19e.** Settled by Stage-A A7's byte-perfect round-trip of all 6 stock characters (`encodeCharacterRecord` ↔ `decodePcfile`): `0x1a1` = sex (all 6 stock = 0/Male), `0x19e` = alignment (TEMPEST = 1/Neutral, rest 0/Good). My Phase 1 §1/§3 was backwards — it claimed the screen-03 sex picker writes 0x19e and that there's no alignment. Reality: the screen-03 sex picker (confirmed by msg strings) writes **0x1a1**, and `0x19e` is a separate **alignment** field (set elsewhere — Wiz6 *does* have alignment; minor remaining question is where it's assigned). Stage-A A6 mapped schema `sex`→0x1a1 correctly. **The Phase-2 sex picker must write 0x1a1.**

2. **⚠ CONFLICT (settle via parity harness) — skill-budget tier2 details.** Two asm reads disagree about `skill_pool_roll_and_class_adjust` (0x4222): §5 / `wpcmk-skill-train.json` say `tier2 = floor(attr/div)+base` and **Fighter clamps to 0**; the Stage-A A3 implementer's read says `tier2 = rng(3) + floor(attr/div) + 2`, **Fighter does NOT clamp** (tier2=0, keeps rng(9)+10), and Ranger/Bishop/Monk/Ninja have an additional *second* epilogue subtraction not yet modeled. The Stage-A `rollSkillBudget` implemented the A3 read (with `rng(3)`) but skipped the second subtraction for those 4 classes. **Do not treat either read as truth** — resolve by capturing a DOSBox save at creation for a Fighter + a Bishop and comparing the engine's `*0x5618` value to `rollSkillBudget` output (parity harness, Task A8). This also affects RNG-sequence parity (tier2's `rng(3)` consumes draws). Affected: skill budget for Fighter/Ranger/Bishop/Monk/Ninja only.
2. **Portrait default-index conflict.** RE #6 found new-character default = portrait 0, with SPD+1 written to a *different* field (+0x1ab). But `portrait-pools.json` shows stock characters' +0x19c portrait == SPD+1. Resolve whether the picker default is truly 0 or SPD-derived before relying on it.
3. **`portrait-pools.json` is mislabeled** — its `portrait_refs` are starter ITEM IDs, not portraits. Correct or retire that findings file.
4. **Class tier2 skill-pool adjustment formula** (§5) — per-class `div`/`base` constants for Fighter/Ranger/Bishop/Monk/Ninja not fully enumerated. Needed for exact starter-skill-points parity.
5. **wpcmk overlay loader mechanism** (§10) — the header pointer at file 0x04-0x05 (`0x5c9b`) and wroot's `FUN_36dc`/`FUN_1462` loader path weren't traced. Only matters if Phase 2 needs to emulate the overlay-load handshake (it likely doesn't — the SPA calls creation directly).
6. **Confirmation-menu entry-count formula** (§10) and exact KEEP/DISCARD option text — msg 0x44f/0x45a resolved as "SAVE THIS CHARACTER?" / "YES"(/NO); verify the option list rendering.
7. **screen-15 confirm window** — RE #2 marked the confirm window as medium-confidence (`ui_menu_picker_vertical(*0x56ca,...)`); verify against a live screen.
8. **Personality vs karma split** — `0x55a2` (PER) vs `0x55a3` (KAR) and the faerie racial +1 adjustment; the two "personality" attributes' exact semantics could use one more pass.

