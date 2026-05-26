# wpcmk RE Sweep (Phase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce exhaustive, parent-reviewed RE artifacts for `wpcmk.ovr` covering every screen, every UI loop, every keyboard filter, every msg.dbs string, the spell-name resolution, the post-commit return path, and the engine RNG seed source — sufficient to unblock a byte-perfect screen-accurate port in a follow-up Phase 2 plan.

**Architecture:** 12 parallel-dispatchable RE subagent investigations, each producing one `docs/re/findings/wpcmk-*.json` per the existing findings schema. Parent reviews each, spot-checks 2-3 high-confidence claims against the binary, and promotes verified prose into a new consolidated reference document at `docs/re/wpcmk-screens.md`. Final cross-check task verifies coverage against the screen-flow map.

**Tech Stack:** Ghidra 12.1 (decompiler) at `tools/ghidra/wiz6.gpr`; DOSBox-X MCP tools at `mcp__wiz6__dosbox_*` (read_memory, read_struct, find_pattern, resolve_symbol); Python + xxd for byte-pattern queries; PyGhidra scripts in `tools/ghidra/scripts/`. No code is written in the viewer or any TS package during this plan.

**Spec:** `docs/superpowers/specs/2026-05-26-wpcmk-byte-perfect-design.md`

---

## Conventions for every task

- **Subagent dispatch deliverable:** every RE subagent MUST write to `docs/re/findings/wpcmk-<topic>.json` per the schema in `docs/re/findings/README.md`. Subagents MUST NOT modify `docs/re/wpcmk-character-creation.md` or `docs/re/wpcmk-screens.md` directly. Parent promotes verified prose only.
- **Cross-overlay thunks:** any wroot function called from wpcmk via `E8 rel16` lands in a BSS thunk at `0xBA9C + image_offset`. To resolve a thunk target, subtract `0xBA9C` to get the wroot image offset, add `0x200` for the file offset (MZ header). See CLAUDE.md "Cross-overlay calls: the thunk-delta law".
- **wpcmk runtime delta:** to translate a CS-relative offset seen in a live disassembly to a file offset in `original/wpcmk.ovr`, subtract `0x4564` (the wpcmk overlay delta). See CLAUDE.md "Overlay relocation".
- **Existing artifacts to reference (do not duplicate):**
  - `docs/re/findings/wpcmk-naming-pass.json` — 66/76 functions named, addresses + categories. Subagents should grep this first.
  - `docs/re/findings/wpcmk-state-machine-trace.json` — high-level flow already traced.
  - `docs/re/wpcmk-character-creation.md` and `docs/re/wpcmk-character-creation-trace.md` — prose summaries (read-only for subagents).
  - `docs/re/findings/character-record-*.json` — the 432-byte buffer layout. Used by RE #10 (post-commit).
  - `docs/re/findings/wroot-naming-pass.json` — every wroot thunk target.
- **Findings JSON shape:** `{ topic, findings: [{ id, claim, evidence: {type, details}, confidence, ... }], rename_proposals?, open_questions?, dependencies? }`. See `docs/re/findings/README.md` for the canonical schema.
- **Confidence levels:** `high` (asm + verified against memory or behavior); `medium` (asm only, consistent with pattern); `low` (inferred, needs verification).
- **Verification spot-check:** for each finding marked `high`, parent picks 2 random claims and verifies independently before promoting prose.
- **wpcmk-screens.md grows incrementally** — Task 1 creates the skeleton; each subsequent task appends its promoted section after parent review.
- **Commit per task.** Each task commits its findings JSON AND any wpcmk-screens.md updates in one commit. Commit message format: `re(wpcmk): <topic> findings + screens.md promotion`.

---

## Task 1: Bootstrap — skeleton wpcmk-screens.md + TODO entries

**Files:**
- Create: `docs/re/wpcmk-screens.md`
- Modify: `TODO.md`

**Goal:** Stand up the consolidated reference document with section placeholders for every Phase 1 investigation, and add TODO entries so progress is trackable.

- [ ] **Step 1: Create skeleton wpcmk-screens.md**

Write the following to `docs/re/wpcmk-screens.md`:

```markdown
# wpcmk Screens — Consolidated RE Reference

Single source of truth for the wpcmk character-creation overlay, promoted from parent-reviewed findings under `docs/re/findings/wpcmk-*.json`. This document feeds the Phase 2 port plan.

**Status:** Section-by-section, populated as each Phase 1 RE task completes. Sections marked "TBD" are not yet investigated.

**Source spec:** `docs/superpowers/specs/2026-05-26-wpcmk-byte-perfect-design.md`
**Source plan:** `docs/superpowers/plans/2026-05-26-wpcmk-re-sweep.md`

---

## 1. Screen-flow map
TBD (RE #1)

## 2. Window layouts
TBD (RE #2)

## 3. msg.dbs string IDs per screen
TBD (RE #3)

## 4. Bonus-allocator UI loop
TBD (RE #4)

## 5. Skill-train UI loop
TBD (RE #5)

## 6. Portrait picker UI loop
TBD (RE #6)

## 7. Generic menu picker widget
TBD (RE #7)

## 8. Keyboard filter masks per screen
TBD (RE #8)

## 9. Spell-name resolution
TBD (RE #9)

## 10. Post-commit return path
TBD (RE #10)

## 11. Remaining wpcmk functions (naming completion)
TBD (RE #11)

## 12. Wichmann-Hill seed at creation start
TBD (sub-investigation)
```

- [ ] **Step 2: Append TODO entries**

Open `TODO.md`, locate the "Open" section, and append (using the next free ID — assume #018, but verify the "Next free ID" line at the top of TODO.md and use whatever's there):

```markdown
- #018 [open] — wpcmk RE Sweep (Phase 1)
  - Plan: [`docs/superpowers/plans/2026-05-26-wpcmk-re-sweep.md`](docs/superpowers/plans/2026-05-26-wpcmk-re-sweep.md).
  - Spec: [`docs/superpowers/specs/2026-05-26-wpcmk-byte-perfect-design.md`](docs/superpowers/specs/2026-05-26-wpcmk-byte-perfect-design.md).
  - 12 parallel RE investigations + final promotion. Output: `docs/re/wpcmk-screens.md` + 12 `docs/re/findings/wpcmk-*.json`.
  - Unblocks Phase 2 (port) plan.
```

Then update the "Next free ID:" line at the top of TODO.md to **#019**.

- [ ] **Step 3: Verify**

Run: `grep -c "^## " docs/re/wpcmk-screens.md`
Expected: `12` (one section header per RE topic).

Run: `grep "Next free ID" TODO.md`
Expected: `Next free ID: **#019**`.

- [ ] **Step 4: Commit**

```bash
git add docs/re/wpcmk-screens.md TODO.md
git commit -m "re(wpcmk): bootstrap consolidated screens.md + TODO #018"
```

---

## Task 2: RE #1 — Screen-flow map

**Files:**
- Create: `docs/re/findings/wpcmk-screen-flow.json`
- Modify: `docs/re/wpcmk-screens.md` (section 1)

**Goal:** Identify every distinct screen state in the wpcmk creation flow, the order they appear in, the conditional branches, and the on-buffer side effects of each. This is the foundational map that downstream RE tasks reference.

- [ ] **Step 1: Dispatch the RE subagent**

Use the Agent tool with `subagent_type: "general-purpose"`. Prompt:

> **Task:** Map the screen-flow of the `wpcmk.ovr` character-creation overlay.
>
> **Context:** `wpcmk.ovr` is a library overlay invoked from `wbase.ovr` (main-menu slot 5). Its master orchestrator `wpcmk_create_character_master` at file offset `0x4e47` runs the full creation flow synchronously. Existing high-level trace is in `docs/re/wpcmk-character-creation-trace.md` and `docs/re/findings/wpcmk-state-machine-trace.json`. Function naming pass is in `docs/re/findings/wpcmk-naming-pass.json` (66 of 76 functions named — grep for "creation_", "stat_roller_", "race_", "class_", "alignment_", "portrait_", "bonus_allocator_", "skill_train_", "creation_ui_", "ui_widget_").
>
> **Walk `wpcmk_create_character_master` top-to-bottom in Ghidra at `tools/ghidra/wiz6.gpr`** (binary: wpcmk.ovr). For each function call or branch that displays a UI element, identify: (a) the screen's role (name input / race menu / class menu / bonus roll / attribute distribute / etc.), (b) entry condition, (c) exit condition (next screen or cancel-to), (d) what bytes of the 432-byte creation buffer at DGROUP `0x5470` it writes.
>
> **Tooling:** PyGhidra scripts in `tools/ghidra/scripts/` for headless queries. The Ghidra GUI must be closed while running headless scripts. For runtime verification, use DOSBox-X MCP tools (`mcp__wiz6__dosbox_*`) against save states in `tools/dosbox/save/`. Cross-overlay calls follow the thunk-delta law (subtract `0xBA9C`, see CLAUDE.md).
>
> **Deliverable:** Write findings to `docs/re/findings/wpcmk-screen-flow.json` per the schema in `docs/re/findings/README.md`. The file MUST contain:
> - `topic`: "wpcmk-screen-flow"
> - `findings`: an ordered array, one finding per screen, each with:
>   - `id` (e.g., "screen-01-name-input")
>   - `claim` (one-line description)
>   - `evidence` with `type: "decompile"` and `details` citing the wpcmk file offset that drives the screen
>   - `screen_metadata`: `{ entry_condition, exit_conditions: [{ key/event, next_screen_id }], buffer_writes: [{ offset_in_record, bytes, meaning }] }`
>   - `confidence`
> - `open_questions`: anything ambiguous, e.g., "is screen X always shown or conditional on byte Y?"
>
> Include conditional branches (e.g., spell picker skipped for non-casters — note the byte / register checked).
>
> **DO NOT modify** `docs/re/wpcmk-character-creation.md`, `docs/re/wpcmk-character-creation-trace.md`, or `docs/re/wpcmk-screens.md`. Parent will promote verified prose after review.

- [ ] **Step 2: Review returned findings JSON**

Run: `cat docs/re/findings/wpcmk-screen-flow.json | python3 -m json.tool | head -80`
Expected: valid JSON, ordered findings array, each finding has the schema fields.

Run: `python3 -c "import json; d=json.load(open('docs/re/findings/wpcmk-screen-flow.json')); print(len(d['findings']), 'screens identified')"`
Expected: at least 8 screens, likely 10-15.

- [ ] **Step 3: Spot-check 2 high-confidence claims**

Pick 2 findings with `confidence: high`. For each:
- Open Ghidra at `tools/ghidra/wiz6.gpr`, navigate to the cited wpcmk file offset.
- Verify the decompile actually shows what the claim says (e.g., the function called, the branch, the buffer write).
- If a claim references a DGROUP buffer write, also verify with `mcp__wiz6__dosbox_read_memory` against a save state mid-creation (`tools/dosbox/save/N.sav`).

If a high-confidence claim doesn't hold up, either downgrade it to medium/low in the JSON, or send the subagent back with the discrepancy noted. Do not promote unverified claims.

- [ ] **Step 4: Promote verified prose to wpcmk-screens.md**

Replace `## 1. Screen-flow map\nTBD (RE #1)` in `docs/re/wpcmk-screens.md` with a prose section containing:
- A numbered list of screens in order with one-line descriptions
- A "Transitions" table (from → key/event → to)
- A "Buffer writes per screen" table
- A "Conditional branches" subsection
- A trailing "Source: `docs/re/findings/wpcmk-screen-flow.json`" line

Use the existing wpcmk-character-creation.md style for tables.

- [ ] **Step 5: Commit**

```bash
git add docs/re/findings/wpcmk-screen-flow.json docs/re/wpcmk-screens.md
git commit -m "re(wpcmk): screen-flow map findings + screens.md section 1"
```

---

## Task 3: RE #2 — Window layouts

**Depends on Task 2** (uses `wpcmk-screen-flow.json` as input). Do not start this task until Task 2 has been committed.

**Files:**
- Create: `docs/re/findings/wpcmk-window-layouts.json`
- Modify: `docs/re/wpcmk-screens.md` (section 2)

**Goal:** Per-screen window geometry — coordinates, dimensions, frame style, fg/bg colors — for every screen identified in Task 2.

- [ ] **Step 1: Dispatch the RE subagent**

Agent prompt:

> **Task:** Decode the `ui_window_create` call sites within `wpcmk.ovr` to produce per-screen window-geometry data.
>
> **Context:** `ui_window_create` is a wroot function (image offset `0x011a`), invoked from wpcmk via the cross-overlay thunk at `0xbbb6` (file offset within wpcmk). Look up the thunk in `docs/re/findings/wpcmk-naming-pass.json` and `docs/re/findings/wroot-naming-pass.json`. The window struct layout is in `docs/re/findings/wroot-ui-window-struct.json` and `docs/re/findings/wroot-window-heap-allocator.json`.
>
> **For each screen identified in `docs/re/findings/wpcmk-screen-flow.json`** (which should exist by the time you run — if not, request it from the parent), find the `ui_window_create` call site driving that screen and decode the call arguments: `{ x, y, w, h, frame_style, fg_color, bg_color }`. Coordinates may be screen-absolute pixels (320x200 or 640x350 in EGA), or window-relative — note which.
>
> **Tooling:** Ghidra to decompile the wpcmk functions; the `ui_window_create` signature is in `docs/re/findings/wroot-ui-window-struct.json`.
>
> **Deliverable:** `docs/re/findings/wpcmk-window-layouts.json`. Schema:
> - `topic`: "wpcmk-window-layouts"
> - `findings`: one per screen, with `screen_id` matching the IDs from `wpcmk-screen-flow.json`, `geometry: { x, y, w, h, frame_style, fg, bg }`, `coord_system: "screen_abs" | "window_rel"`, `wpcmk_offset`, `confidence`.
>
> If a screen opens multiple windows (e.g., a title bar + main panel + cursor area), list each in the same finding under a `windows` array.
>
> **DO NOT modify** `docs/re/wpcmk-screens.md` or any other prose docs.

- [ ] **Step 2: Review returned JSON**

Run: `python3 -c "import json; d=json.load(open('docs/re/findings/wpcmk-window-layouts.json')); print(len(d['findings']), 'screens covered')"`
Expected: matches the screen count from Task 2's output.

- [ ] **Step 3: Spot-check 2 claims**

Pick 2 findings. For each:
- Verify the wpcmk file offset disassembles to a call into the `ui_window_create` thunk at `0xbbb6`.
- If the screen is reachable in a save state, verify visually via `mcp__wiz6__dosbox_screenshot` and pixel-pick coordinates.

- [ ] **Step 4: Promote prose to wpcmk-screens.md**

Replace section 2's TBD with a table: `| screen_id | x | y | w | h | frame | fg | bg | source offset |`. One row per window. Note the coord system in the section header.

- [ ] **Step 5: Commit**

```bash
git add docs/re/findings/wpcmk-window-layouts.json docs/re/wpcmk-screens.md
git commit -m "re(wpcmk): window layouts findings + screens.md section 2"
```

---

## Task 4: RE #3 — msg.dbs string IDs per screen

**Depends on Task 2** (uses `wpcmk-screen-flow.json` as input). Do not start this task until Task 2 has been committed.

**Files:**
- Create: `docs/re/findings/wpcmk-msg-strings.json`
- Modify: `docs/re/wpcmk-screens.md` (section 3)

**Goal:** Resolve every `ui_window_putstring*` call argument in wpcmk to its `msg.dbs` ID, per screen.

- [ ] **Step 1: Dispatch the RE subagent**

Agent prompt:

> **Task:** Decode every string-display call inside `wpcmk.ovr` and resolve each one to a `msg.dbs` message ID.
>
> **Context:** wpcmk does not contain string literals — it calls `ui_window_putstring*` (wroot image `0x24E9`, per-char at `0x22B7`) with a numeric msg-id argument that indexes into the decoded `msg.dbs`. The msg.dbs decoder lives at `packages/parser/src/formats/msg.ts`; the extracted JSON is at `extracted/msg.dbs.json` (regenerate via `pnpm --filter @wiz6/cli run extract` if stale). Bank-structured format per martydill's reference, 1KB banks — see commit `0d40607` and `docs/re/msg-dbs-format.md` if present.
>
> **For each screen in `wpcmk-screen-flow.json`,** identify all `ui_window_putstring*` calls reachable from that screen's driving function, extract the msg-id argument (a `push imm16` immediately before the call), and look up the string in the extracted msg.dbs JSON. Distinguish titles, prompts, button labels, and error strings by call context.
>
> **Tooling:** Ghidra for the call-site decode + PyGhidra script `tools/ghidra/scripts/find_string_xrefs.py` as a starting point. Python to query `extracted/msg.dbs.json`.
>
> **Deliverable:** `docs/re/findings/wpcmk-msg-strings.json`. Schema:
> - `topic`: "wpcmk-msg-strings"
> - `findings`: one per (screen_id, role) pair, e.g., `{ screen_id: "screen-02-race-menu", role: "title", msg_id: 1135, text_preview: "Choose a race", wpcmk_call_site: 0x4f12, confidence: "high" }`
> - `open_questions`: any unresolved msg-ids (e.g., out-of-range / not in extracted JSON)
>
> If wpcmk also displays strings from local data tables (not msg.dbs), note them in a separate `inline_strings` array. wpcmk-character-creation-trace.md says no inline strings exist beyond filenames — confirm or refute.
>
> **DO NOT modify** prose docs.

- [ ] **Step 2: Review returned JSON**

Run: `python3 -c "import json; d=json.load(open('docs/re/findings/wpcmk-msg-strings.json')); print(len(d['findings']), 'string slots resolved')"`
Expected: at least 30 (titles + prompts + buttons across ~10 screens).

- [ ] **Step 3: Spot-check 2 msg-ids**

Pick 2 high-confidence findings. For each:
- Open `extracted/msg.dbs.json` and confirm the msg-id resolves to a string that matches `text_preview`.
- Open Ghidra at the cited `wpcmk_call_site` and confirm the `push imm16` immediately preceding the call matches the `msg_id`.

- [ ] **Step 4: Promote prose to wpcmk-screens.md**

Replace section 3's TBD with a table grouped by screen: `| screen_id | role | msg_id | text |`. Add a footnote linking to `extracted/msg.dbs.json` for the source-of-truth string values.

- [ ] **Step 5: Commit**

```bash
git add docs/re/findings/wpcmk-msg-strings.json docs/re/wpcmk-screens.md
git commit -m "re(wpcmk): msg.dbs string IDs findings + screens.md section 3"
```

---

## Task 5: RE #4 — Bonus-allocator UI loop

**Files:**
- Create: `docs/re/findings/wpcmk-bonus-allocator.json`
- Modify: `docs/re/wpcmk-screens.md` (section 4)

**Goal:** Decompile the `bonus_allocator_*` family to a state machine + key-handling pseudocode. Cursor mechanics, +/- handling, pool tracking, edge cases (can't go below race floor, can't exceed 18).

- [ ] **Step 1: Dispatch the RE subagent**

Agent prompt:

> **Task:** Decompile the `bonus_allocator_*` function family in `wpcmk.ovr` and produce a state machine + key-handling pseudocode for the bonus-point distribution screen.
>
> **Context:** After `stat_roller_bonus` rolls the bonus pool (at wpcmk `0x4e81`, formula verified in `docs/re/wpcmk-character-creation.md`), wpcmk enters a UI loop letting the player distribute points across STR/IQ/PIE/VIT/DEX/SPD. The driver functions live under the `bonus_allocator_*` prefix — find them in `docs/re/findings/wpcmk-naming-pass.json`.
>
> **Decode:**
> - Cursor navigation (up/down between attributes — which keys?)
> - +/- handling (which keys add or remove a point?)
> - Pool counter location (DGROUP offset; the pool starts at the rolled value, decrements as points are spent)
> - Per-attribute lower bound (race floor — look up `RACE_BASE_STATS` in `docs/re/findings/race-base-stats.json`)
> - Per-attribute upper bound (Wiz6 cap, typically 18)
> - Acceptance condition (pool must be 0? Or pool ≥ 0?)
> - Cancel/back behavior — which key, what state does it restore?
>
> **Tooling:** Ghidra. For runtime verification, use DOSBox-X MCP and a save state if you can reach the screen.
>
> **Deliverable:** `docs/re/findings/wpcmk-bonus-allocator.json`. Schema:
> - `topic`: "wpcmk-bonus-allocator"
> - `findings`: one per mechanic (cursor, +/-, pool, bounds, accept, cancel), each with claim + evidence (cite the wpcmk offset of the function + the asm snippet) + confidence
> - `state_machine`: a `states` + `transitions` summary in JSON
> - `key_handlers`: `{ key_code, key_name, action }` table — which key codes the engine reads via `kbd_check_with_filter` thunk and what each does
> - `dgroup_addresses`: pool counter offset, cursor index offset, etc.
>
> **DO NOT modify** prose docs.

- [ ] **Step 2: Review returned JSON**

Run: `python3 -c "import json; d=json.load(open('docs/re/findings/wpcmk-bonus-allocator.json')); print('states:', len(d['state_machine']['states']), 'transitions:', len(d['state_machine']['transitions']), 'key_handlers:', len(d['key_handlers']))"`
Expected: ≥3 states, ≥6 transitions, ≥5 key handlers.

- [ ] **Step 3: Spot-check the cursor + +/- logic**

In Ghidra, navigate to the bonus_allocator main-loop offset cited in the findings. Verify:
- A `kbd_check_with_filter` thunk call exists in the loop.
- A `cmp` against the up/down key codes (likely arrow keys, scan codes 0x48/0x50) is present.
- A `dec word [<pool>]` / `inc word [<attribute>]` pattern matches the +/- claim.

- [ ] **Step 4: Promote prose to wpcmk-screens.md**

Replace section 4's TBD with: a state-machine diagram (table or ASCII), a key-handler table, the DGROUP addresses involved, and edge-case notes (race floor, cap=18). Cite the findings JSON.

- [ ] **Step 5: Commit**

```bash
git add docs/re/findings/wpcmk-bonus-allocator.json docs/re/wpcmk-screens.md
git commit -m "re(wpcmk): bonus-allocator UI loop findings + screens.md section 4"
```

---

## Task 6: RE #5 — Skill-train UI loop

**Files:**
- Create: `docs/re/findings/wpcmk-skill-train.json`
- Modify: `docs/re/wpcmk-screens.md` (section 5)

**Goal:** Decompile the `skill_train_*` family. 4-pillar (MAGIC/FAITH/PHYSICAL/MENTAL) → 82-entry skill table mapping, starter-pool value, point-spending rules.

- [ ] **Step 1: Dispatch the RE subagent**

Agent prompt:

> **Task:** Decompile the `skill_train_*` function family in `wpcmk.ovr` and produce a state machine + the actual starter-pool integer.
>
> **Context:** The 4-pillar skill system (MAGIC / FAITH / PHYSICAL / MENTAL) maps player choices to the 82-entry skill table. Class-specific availability is in `docs/re/findings/skill-names.json` and the class skill table is in `@wiz6/data/src/schemas/classes.ts`. The starter skill-points pool is currently a placeholder (10) in the existing wizard — your task is to find the real value.
>
> **Decode:**
> - Function under the `skill_train_*` prefix (find in `wpcmk-naming-pass.json`)
> - Starter pool value at level 1 — look for a constant push or a DGROUP load right before the loop entry
> - 4-pillar → 82-entry mapping logic (likely a base-skill-id + offset per pillar choice)
> - Cursor / +/- mechanics (similar to bonus allocator)
> - Acceptance condition (all points spent? Or any nonneg total OK?)
> - Class restrictions — which skills can a given class actually train in (cross-reference `docs/re/findings/skill-names.json`)
> - Cancel/back behavior
>
> **Tooling:** Ghidra. Run `mcp__wiz6__dosbox_read_memory` against a save state mid-skill-train if you can reach one (the buffer at `0x5470` will show partial allocation).
>
> **Deliverable:** `docs/re/findings/wpcmk-skill-train.json`. Schema:
> - `topic`: "wpcmk-skill-train"
> - `findings`: one per mechanic
> - `starter_pool`: the integer value, with the evidence (wpcmk offset + asm) embedded
> - `pillar_mapping`: 4-entry table or function
> - `state_machine`: like bonus allocator
> - `key_handlers`: key code table
>
> **DO NOT modify** prose docs.

- [ ] **Step 2: Review returned JSON**

Run: `python3 -c "import json; d=json.load(open('docs/re/findings/wpcmk-skill-train.json')); print('starter_pool:', d.get('starter_pool'))"`
Expected: an integer (likely 5-20 range).

- [ ] **Step 3: Spot-check starter pool + mapping**

In Ghidra at the cited offset, verify the constant push or DGROUP load matches the claimed starter pool. Cross-reference `docs/re/findings/skill-names.json` for any pillar→skill mapping claim.

- [ ] **Step 4: Promote prose to wpcmk-screens.md**

Replace section 5's TBD with: starter pool value (highlighted — this is one of the spec's headline unknowns), 4-pillar mapping table, state machine, key-handler table, per-class allowed-skill notes.

- [ ] **Step 5: Commit**

```bash
git add docs/re/findings/wpcmk-skill-train.json docs/re/wpcmk-screens.md
git commit -m "re(wpcmk): skill-train UI + starter-pool findings + screens.md section 5"
```

---

## Task 7: RE #6 — Portrait picker UI loop

**Files:**
- Create: `docs/re/findings/wpcmk-portrait-picker.json`
- Modify: `docs/re/wpcmk-screens.md` (section 6)

**Goal:** Decompile the `portrait_*` family. Left/right cursor through WPORT*.EGA, race+sex filter, default index, accept/cancel.

- [ ] **Step 1: Dispatch the RE subagent**

Agent prompt:

> **Task:** Decompile the `portrait_*` function family in `wpcmk.ovr` and document the portrait-selection screen.
>
> **Context:** Portraits live in `WPORT1.EGA` / `WPORT1.CGA` / `WPORT1.T16` (filenames at wpcmk offsets `0x608d`, `0x6098`, `0x60ae`). Portrait pools per race/sex are in `docs/re/findings/portrait-pools.json`. The existing wizard uses a `SPD + 1` shortcut for portrait index — the real engine lets the player browse via left/right cursor.
>
> **Decode:**
> - The picker entry function (under `portrait_*` prefix in `wpcmk-naming-pass.json`)
> - Left/right key codes
> - Race+sex filter (which portraits are shown for which combinations)
> - Default index when entering the screen (do they start at a random valid portrait? At index 0? At the previously-selected portrait?)
> - Accept/cancel key codes + behavior
> - Where the chosen portrait is written into the character record at `0x5470` (cross-reference `docs/re/findings/character-record-*.json`)
>
> **Tooling:** Ghidra. Use DOSBox-X save states to capture the screen in action — load `tools/dosbox/save/N.sav` if any saves are mid-portrait-pick, otherwise note this as an open question.
>
> **Deliverable:** `docs/re/findings/wpcmk-portrait-picker.json`. Schema:
> - `topic`: "wpcmk-portrait-picker"
> - `findings`: one per mechanic
> - `filter_formula`: the (race, sex) → eligible-portrait-set function
> - `state_machine`: states + transitions
> - `key_handlers`: key code table
> - `record_offset`: byte offset within the 432-byte record where portrait index is written
>
> **DO NOT modify** prose docs.

- [ ] **Step 2: Review returned JSON**

Run: `python3 -c "import json; d=json.load(open('docs/re/findings/wpcmk-portrait-picker.json')); print('filter:', d.get('filter_formula'), 'record_offset:', d.get('record_offset'))"`
Expected: a formula description and an integer offset (probably under 432).

- [ ] **Step 3: Spot-check the filter**

Cross-reference the filter against `docs/re/findings/portrait-pools.json`. If portrait-pools.json says "Human male: portraits 0-7" and the filter formula derives "race=0 sex=0 → range(0, 8)", they should agree. If not, the discrepancy is data to discuss with the parent before promoting.

- [ ] **Step 4: Promote prose to wpcmk-screens.md**

Replace section 6's TBD with: filter formula, state machine, key-handler table, record offset, default-index logic, and a note pointing at `portrait-pools.json` as the data source.

- [ ] **Step 5: Commit**

```bash
git add docs/re/findings/wpcmk-portrait-picker.json docs/re/wpcmk-screens.md
git commit -m "re(wpcmk): portrait-picker UI loop findings + screens.md section 6"
```

---

## Task 8: RE #7 — Generic menu-picker widget

**Files:**
- Create: `docs/re/findings/wpcmk-menu-picker.json`
- Modify: `docs/re/wpcmk-screens.md` (section 7)

**Goal:** Decompile the reusable menu-picker widget under `ui_widget_*` that drives race / class / alignment screens. Cursor wrap, disabled-entry handling, letter shortcuts.

- [ ] **Step 1: Dispatch the RE subagent**

Agent prompt:

> **Task:** Decompile the generic menu-picker widget in `wpcmk.ovr` (or wherever it's actually defined — likely in wpcmk under `ui_widget_*`, possibly in wroot if it's shared).
>
> **Context:** Race (11 entries), class (14 entries), and alignment (3 entries) screens all share a vertical-list picker widget. Class entries may be disabled (greyed) when the candidate doesn't meet requirements. Some entries may have letter shortcuts (e.g., R/E/A for menu choices) — to be confirmed.
>
> **Decode:**
> - The picker function (search `wpcmk-naming-pass.json` for `ui_widget_*` or `menu_*`)
> - Cursor up/down/wrap behavior (does the cursor wrap at top/bottom?)
> - Disabled-entry handling (does the cursor skip disabled entries, or land on them and reject Accept?)
> - Letter shortcut handling (is there a `cmp` against ASCII letter codes per entry?)
> - Accept/cancel key codes
> - Return value (selected index? Or the entry struct?)
>
> Cross-reference `docs/re/findings/menu-cursor-render-path.json` — the menu cursor rendering is already documented; you're adding the input-handling layer.
>
> **Tooling:** Ghidra. For the race-menu specifically, you can verify against existing RE in `docs/re/findings/race-base-stats.json` (data) + `docs/re/findings/class-tables.json` (data).
>
> **Deliverable:** `docs/re/findings/wpcmk-menu-picker.json`. Schema:
> - `topic`: "wpcmk-menu-picker"
> - `findings`: one per mechanic
> - `state_machine`: states + transitions
> - `key_handlers`: key code table including letter shortcuts (if any)
> - `disabled_handling`: prose description with evidence
>
> **DO NOT modify** prose docs.

- [ ] **Step 2: Review returned JSON**

Run: `python3 -c "import json; d=json.load(open('docs/re/findings/wpcmk-menu-picker.json')); print('handlers:', len(d['key_handlers']))"`
Expected: ≥4 (up, down, accept, cancel, plus any letters).

- [ ] **Step 3: Spot-check cursor wrap + disabled-handling**

In Ghidra at the cited offset, verify:
- A `cmp` and conditional jump implementing wrap (e.g., `cmp cursor, 0; jge ...; mov cursor, max-1`).
- A check against a per-entry "enabled" flag, or a class-qualification call (`class_qualification_check_and_bump` per the existing wpcmk doc).

- [ ] **Step 4: Promote prose to wpcmk-screens.md**

Replace section 7's TBD with: state machine, key-handler table, wrap rules, disabled-entry rules, and a note that this widget drives race/class/alignment.

- [ ] **Step 5: Commit**

```bash
git add docs/re/findings/wpcmk-menu-picker.json docs/re/wpcmk-screens.md
git commit -m "re(wpcmk): generic menu-picker findings + screens.md section 7"
```

---

## Task 9: RE #8 — Keyboard filter masks per screen

**Depends on Task 2** (uses `wpcmk-screen-flow.json` as input). Do not start this task until Task 2 has been committed.

**Files:**
- Create: `docs/re/findings/wpcmk-kbd-filter-masks.json`
- Modify: `docs/re/wpcmk-screens.md` (section 8)

**Goal:** Per-screen mask passed to `kbd_check_with_filter` (wroot image `0x2643`) — which keys are valid where.

- [ ] **Step 1: Dispatch the RE subagent**

Agent prompt:

> **Task:** For each screen identified in `wpcmk-screen-flow.json`, find the `kbd_check_with_filter` call and decode its filter-mask argument.
>
> **Context:** `kbd_check_with_filter` is at wroot image `0x2643` (named in `docs/re/findings/wroot-naming-pass.json`). The function takes a bit-mask saying which key categories are valid (e.g., letters, digits, cursors, function keys, ESC). The mask shape is currently undocumented — you may need to decompile the wroot function to determine which bit means what before mapping the per-screen calls.
>
> **Decode:**
> - The bit-meaning of each flag in the mask (cursor / letters / digits / function / ESC / Enter / etc.)
> - For each screen in `wpcmk-screen-flow.json`, find its `kbd_check_with_filter` thunk call and the mask immediate
> - Cross-reference against per-screen key-handler findings from Tasks 5-8
>
> **Tooling:** Ghidra (start by decompiling wroot `0x2643`); then walk wpcmk call sites.
>
> **Deliverable:** `docs/re/findings/wpcmk-kbd-filter-masks.json`. Schema:
> - `topic`: "wpcmk-kbd-filter-masks"
> - `bit_meanings`: array of `{ bit, name, description }`
> - `findings`: per-screen, `{ screen_id, mask_value, decoded_flags: ["CURSOR", "ESC", "ENTER"], call_site, confidence }`
>
> **DO NOT modify** prose docs.

- [ ] **Step 2: Review returned JSON**

Run: `python3 -c "import json; d=json.load(open('docs/re/findings/wpcmk-kbd-filter-masks.json')); print('bits decoded:', len(d['bit_meanings']), 'screens covered:', len(d['findings']))"`
Expected: ≥4 bit meanings, screens matching screen-flow.json count.

- [ ] **Step 3: Spot-check 1 mask + the bit decode**

Pick one screen with `confidence: high`. Verify the mask value in Ghidra at the cited offset, then confirm the decoded flags are consistent with the per-screen key-handler findings from earlier tasks.

- [ ] **Step 4: Promote prose to wpcmk-screens.md**

Replace section 8's TBD with: bit-meaning table, per-screen mask table.

- [ ] **Step 5: Commit**

```bash
git add docs/re/findings/wpcmk-kbd-filter-masks.json docs/re/wpcmk-screens.md
git commit -m "re(wpcmk): kbd_check_with_filter masks findings + screens.md section 8"
```

---

## Task 10: RE #9 — Spell-name resolution

**Files:**
- Create: `docs/re/findings/wpcmk-spell-names.json`
- Modify: `docs/re/wpcmk-screens.md` (section 9)

**Goal:** Find how the 82-entry spell table is labelled in the spell-picker screen — msg.dbs IDs or procedural labels.

- [ ] **Step 1: Dispatch the RE subagent**

Agent prompt:

> **Task:** Determine how the spell-picker screen in `wpcmk.ovr` labels each entry of the 82-entry spell table.
>
> **Context:** The 82-entry spell table contains school/level/byte5 (bookmask) per entry; see `docs/re/findings/spell-school-assignment.json` and `docs/re/findings/starter-spells.json`. The existing wizard uses procedural labels ("School L3 #2"). Real engine likely uses msg.dbs IDs (a parallel 82-entry table, or a base-id + per-entry offset).
>
> **Decode:**
> - Find the spell-picker screen function in wpcmk (cross-reference `wpcmk-screen-flow.json` once Task 2 has run)
> - Identify how it labels each entry — look for:
>   - A 82-entry array of msg-ids loaded from somewhere (wpcmk DGROUP / wroot DGROUP / msg.dbs itself)
>   - A base-msg-id + per-entry offset (e.g., msg 2000+entry_idx)
>   - A procedural format string (less likely for Wiz6)
> - If msg-ids resolve, dump them via the extracted `msg.dbs` JSON
>
> **Tooling:** Ghidra. Python to query `extracted/msg.dbs.json`.
>
> **Deliverable:** `docs/re/findings/wpcmk-spell-names.json`. Schema:
> - `topic`: "wpcmk-spell-names"
> - `findings`: a single overarching finding describing the labeling scheme
> - `spell_name_table`: if msg-ids resolve, a 82-entry array `[{ entry_idx, msg_id, name }]`
> - `open_questions`: any names that don't resolve
>
> **DO NOT modify** prose docs.

- [ ] **Step 2: Review returned JSON**

Run: `python3 -c "import json; d=json.load(open('docs/re/findings/wpcmk-spell-names.json')); print('scheme:', d['findings'][0]['claim'][:80])"`
Expected: a one-line description of the labeling scheme.

If `spell_name_table` was produced: `python3 -c "import json; d=json.load(open('docs/re/findings/wpcmk-spell-names.json')); print(len(d.get('spell_name_table', [])), 'spell names resolved')"`
Expected: 82 entries.

- [ ] **Step 3: Spot-check 3 spell names**

If a table was produced, pick 3 entries and verify the msg-ids resolve in `extracted/msg.dbs.json` to plausible spell names. Cross-reference at least one against `docs/re/findings/starter-spells.json` if it contains spell-name hints.

- [ ] **Step 4: Promote prose to wpcmk-screens.md**

Replace section 9's TBD with: scheme description + (if applicable) a collapsible spell-name table. If unresolved, document as an open question with the lead the subagent found.

- [ ] **Step 5: Commit**

```bash
git add docs/re/findings/wpcmk-spell-names.json docs/re/wpcmk-screens.md
git commit -m "re(wpcmk): spell-name resolution findings + screens.md section 9"
```

---

## Task 11: RE #10 — Post-commit return path

**Files:**
- Create: `docs/re/findings/wpcmk-post-commit.json`
- Modify: `docs/re/wpcmk-screens.md` (section 10)

**Goal:** Disk write to `pcfile.dbs`, slot resolution/occupancy, transition back to wbase state 4. Resolves the slot-picker ambiguity.

- [ ] **Step 1: Dispatch the RE subagent**

Agent prompt:

> **Task:** Decompile the post-commit phase of `wpcmk_create_character_master`: how the new character record at `*0x5470` is written to disk, how the slot is resolved, and how control returns to wbase.
>
> **Context:** The creation buffer at DGROUP `*0x5470` is 432 bytes. On commit, it's written to a slot in `pcfile.dbs` (file format in `docs/re/findings/pcfile-dbs.json`). `wpcmk` has a `roster_*` function family in `wpcmk-naming-pass.json` — slot picker, occupancy check, find-empty-slot. The spec calls out an open question: does wpcmk have its own slot-picker UI screen, or is the slot always passed in from wbase? Resolve this.
>
> **Decode:**
> - The commit function (look at `creation_master_flow` 0x4e47 tail end + `roster_*` functions)
> - Slot resolution: is there a UI step ("which slot?") or is it find-empty-slot + auto-overwrite?
> - Occupancy check + overwrite prompt (if any) — which msg.dbs IDs? Cross-reference Task 4 output.
> - The actual disk write — which wroot function (probably a file-I/O thunk)
> - Transition to wbase state 4: the entry-stub `mov word [0x363a], 4` is in wpcmk's dispatch stub; does the commit also write `*0x363a`, or does it just return to wbase which handles the transition?
>
> **Cross-reference** `docs/re/findings/character-record-extended-map-v2.json` to ensure the 432-byte layout matches what's written.
>
> **Tooling:** Ghidra + DOSBox-X save states. If you can reach pcfile.dbs on disk after a creation run, compare bytes to the buffer.
>
> **Deliverable:** `docs/re/findings/wpcmk-post-commit.json`. Schema:
> - `topic`: "wpcmk-post-commit"
> - `findings`: one per concern (slot resolution, occupancy, disk write, state transition)
> - `slot_picker_in_wpcmk`: boolean + evidence — definitively answer "is there a slot-picker UI in wpcmk?"
> - `commit_sequence`: ordered steps from "user accepts review" → "main menu visible"
> - `overwrite_msg_ids`: any prompts shown (cross-referenced to Task 4 output)
>
> **DO NOT modify** prose docs.

- [ ] **Step 2: Review returned JSON**

Run: `python3 -c "import json; d=json.load(open('docs/re/findings/wpcmk-post-commit.json')); print('slot_picker_in_wpcmk:', d.get('slot_picker_in_wpcmk'), 'commit_steps:', len(d.get('commit_sequence', [])))"`
Expected: boolean + ≥3 steps.

- [ ] **Step 3: Spot-check the disk write + state transition**

In Ghidra:
- Verify the cited disk-write call lands in a wroot file-I/O thunk (cross-reference `docs/re/findings/wroot-naming-pass.json`).
- Verify the `0x363a` write (if claimed) or the absence of one (if it's wbase's responsibility).

- [ ] **Step 4: Promote prose to wpcmk-screens.md**

Replace section 10's TBD with: the commit sequence, the slot-picker resolution (definitive answer), any overwrite prompt, the disk-write function, and the state-transition mechanism.

- [ ] **Step 5: Commit**

```bash
git add docs/re/findings/wpcmk-post-commit.json docs/re/wpcmk-screens.md
git commit -m "re(wpcmk): post-commit return path findings + screens.md section 10"
```

---

## Task 12: RE #11 — Remaining unnamed wpcmk functions

**Files:**
- Create: `docs/re/findings/wpcmk-remaining-functions.json`
- Modify: `docs/re/findings/wpcmk-naming-pass.json` (append new rename proposals)
- Modify: `docs/re/wpcmk-screens.md` (section 11)

**Goal:** Name the 10 of 76 wpcmk functions still unnamed in `wpcmk-naming-pass.json`. Some may turn out to be relevant to earlier tasks.

- [ ] **Step 1: Dispatch the RE subagent**

Agent prompt:

> **Task:** Identify and name the remaining ~10 unnamed functions in `wpcmk.ovr`.
>
> **Context:** `docs/re/findings/wpcmk-naming-pass.json` covers 66 of 76 functions. The remainder are listed in that file's `unnamed_functions` array (or you can identify them via `tools/ghidra/scripts/list_functions.py --binary wpcmk.ovr --only-unnamed`). Each may turn out to be a helper, a stub, or something relevant to an earlier task (e.g., a UI subroutine missed in the bonus-allocator pass).
>
> **For each unnamed function:**
> - Decompile in Ghidra
> - Classify (`creation_*`, `ui_widget_*`, `data_util_*`, `roster_*`, etc., matching existing prefixes in wpcmk-character-creation.md)
> - Propose a `applied_name`
> - Cite evidence (asm pattern, callers, callees)
>
> If a function turns out to be central to an earlier task (e.g., it's THE bonus-allocator key handler that the Task 5 subagent missed), flag it in `cross_task_relevance`.
>
> **Tooling:** Ghidra + PyGhidra scripts.
>
> **Deliverable:** `docs/re/findings/wpcmk-remaining-functions.json`. Schema:
> - `topic`: "wpcmk-remaining-functions"
> - `findings`: one per function
> - `rename_proposals`: array suitable for merging into `wpcmk-naming-pass.json`
> - `cross_task_relevance`: array of `{ function_addr, related_task: "RE #5", reason }`
>
> **DO NOT modify** `docs/re/wpcmk-character-creation.md` or `docs/re/wpcmk-screens.md`. Parent merges rename proposals into `wpcmk-naming-pass.json` after review.

- [ ] **Step 2: Review returned JSON**

Run: `python3 -c "import json; d=json.load(open('docs/re/findings/wpcmk-remaining-functions.json')); print('named:', len(d['findings']), 'cross-task:', len(d.get('cross_task_relevance', [])))"`
Expected: ~10 findings, 0+ cross-task flags.

- [ ] **Step 3: Spot-check 2 namings**

Pick 2 high-confidence rename proposals. In Ghidra, verify the proposed name reflects what the function actually does (callers + callees + asm shape consistent with the claim).

- [ ] **Step 4: Merge rename proposals into wpcmk-naming-pass.json**

Open `docs/re/findings/wpcmk-naming-pass.json` and append the new entries to the `rename_proposals` array. Update the file's coverage statistic (was 66/76; should now be 76/76 if all named).

If any cross-task relevance was flagged, also append a follow-up note under that task's findings JSON (e.g., add a finding to `wpcmk-bonus-allocator.json` referencing the newly-named function).

- [ ] **Step 5: Promote prose to wpcmk-screens.md**

Replace section 11's TBD with: a one-paragraph summary of what each newly-named function does, grouped by prefix.

- [ ] **Step 6: Commit**

```bash
git add docs/re/findings/wpcmk-remaining-functions.json docs/re/findings/wpcmk-naming-pass.json docs/re/wpcmk-screens.md
git commit -m "re(wpcmk): remaining functions named (76/76) + screens.md section 11"
```

---

## Task 13: Sub-investigation — Wichmann-Hill seed at creation start

**Files:**
- Create: `docs/re/findings/wpcmk-rng-seed-at-creation.json`
- Modify: `docs/re/wpcmk-screens.md` (section 12)

**Goal:** Determine the Wichmann-Hill 3-stream LCG seed value(s) at the moment `wpcmk_create_character_master` is invoked. Required for full-flow parity testing in Phase 2.

- [ ] **Step 1: Dispatch the RE subagent**

Agent prompt:

> **Task:** Determine the Wichmann-Hill RNG seed state at the moment character creation begins.
>
> **Context:** The engine RNG is a 3-stream Wichmann-Hill 1982 Lehmer LCG at wroot image `0x125b9` (named `rng_advance`, see `docs/re/findings/wroot-naming-pass.json`). The 3 stream states live in wroot DGROUP at addresses you need to identify. The RNG is seeded somewhere at boot (winit state 0 or 1?) — find:
>
> - The DGROUP addresses of the 3 stream states
> - How they're seeded at game boot (constant? timer? CPU tick? something else?)
> - Their values at the moment wbase dispatches into wpcmk (slot 5 "Make a character") — this is the seed needed for parity testing
> - Whether intermediate UI activity between boot and creation start advances the RNG (likely yes — credits scroll, main menu cursor blink, etc.)
>
> **Tooling:** Ghidra + DOSBox-X MCP. Use save states in `tools/dosbox/save/` — read the 3 stream-state DGROUP addresses via `mcp__wiz6__dosbox_read_memory` from saves taken (a) at boot, (b) at main menu, (c) at start of creation. Compare.
>
> **Deliverable:** `docs/re/findings/wpcmk-rng-seed-at-creation.json`. Schema:
> - `topic`: "wpcmk-rng-seed-at-creation"
> - `findings`: per stream state, the DGROUP address + the seeding mechanism
> - `stream_addresses`: `[{ stream: 1, dgroup_offset: 0x...., size: 2 }, ...]`
> - `boot_seed`: `{ stream_1, stream_2, stream_3 }` (if constant) or a description of the dynamic seed source
> - `creation_start_observation`: the values observed in DOSBox saves at the dispatch into wpcmk slot 5
> - `parity_strategy`: a short recommendation for how Phase 2 should reproduce the seed (constant? capture from a save? user-provided?)
>
> **DO NOT modify** prose docs.

- [ ] **Step 2: Review returned JSON**

Run: `python3 -c "import json; d=json.load(open('docs/re/findings/wpcmk-rng-seed-at-creation.json')); print('streams:', len(d['stream_addresses']), 'boot_seed:', d.get('boot_seed'), 'parity_strategy:', d.get('parity_strategy', '')[:120])"`
Expected: 3 streams documented, boot seed mechanism described, parity strategy proposed.

- [ ] **Step 3: Spot-check stream addresses against a save**

For one of the cited stream addresses, use `mcp__wiz6__dosbox_read_memory` on a save state and confirm the value matches the finding's `creation_start_observation`. (If the saves don't include a creation-start checkpoint, capture one as part of this task or document as an open question for follow-up.)

- [ ] **Step 4: Promote prose to wpcmk-screens.md**

Replace section 12's TBD with: stream addresses, boot-seed mechanism, parity-strategy recommendation, and any open questions for Phase 2.

- [ ] **Step 5: Commit**

```bash
git add docs/re/findings/wpcmk-rng-seed-at-creation.json docs/re/wpcmk-screens.md
git commit -m "re(wpcmk): RNG seed-at-creation sub-investigation + screens.md section 12"
```

---

## Task 14: Final cross-check & coverage review

**Files:**
- Modify: `docs/re/wpcmk-screens.md` (cross-references, gaps section)
- Modify: `docs/re/findings/wpcmk-screen-flow.json` (only if the cross-check reveals missing screens — otherwise read-only)

**Goal:** With all 12 RE tasks promoted, re-read `wpcmk-screens.md` end-to-end and verify the sections are internally consistent + the screen-flow map's screen list is fully covered by sections 2-3 (per-screen window layouts and msg IDs).

- [ ] **Step 1: Read wpcmk-screens.md end-to-end and check internal consistency**

For each screen listed in section 1 (screen-flow map):
- Does section 2 have a window-layout entry for it? If not, flag as a gap.
- Does section 3 have a msg-string entry for it? If not, flag as a gap.
- Does section 8 have a kbd-filter entry for it? If not, flag.

Cross-reference all `wpcmk-*.json` findings — every `screen_id` referenced should be defined in `wpcmk-screen-flow.json`.

- [ ] **Step 2: If gaps found, dispatch a follow-up subagent to fill them**

Use the Agent tool to fix any gaps identified. Embed a focused prompt naming the specific gap (e.g., "screen-XX-foo has no window-layout entry — decompile wpcmk at offset YYYY and produce a finding").

- [ ] **Step 3: Add a "Coverage summary" section at the top of wpcmk-screens.md**

Insert below the YAML/preamble:

```markdown
## Coverage summary

| Screen ID | Window layout | msg strings | kbd filter | Special handling |
|-----------|---------------|-------------|-----------|------------------|
| (one row per screen, ✓ or "see RE #N" per column) |
```

This becomes the at-a-glance index Phase 2 reads against.

- [ ] **Step 4: Add an "Open questions for Phase 2" section at the bottom**

Aggregate any `open_questions` across all `wpcmk-*.json` findings into a single bulleted list with cross-references.

- [ ] **Step 5: Commit**

```bash
git add docs/re/wpcmk-screens.md
git commit -m "re(wpcmk): final cross-check + coverage matrix in screens.md"
```

If a follow-up subagent ran in Step 2, also commit the new/updated findings:

```bash
git add docs/re/findings/wpcmk-*.json
git commit -m "re(wpcmk): fill coverage gaps from Task 14 cross-check"
```

---

## Task 15: Close out & queue Phase 2

**Files:**
- Modify: `TODO.md`

**Goal:** Mark Phase 1 done in TODO.md and add a new entry for the Phase 2 plan-writing follow-up.

- [ ] **Step 1: Remove TODO #018 (Phase 1)**

Per CLAUDE.md convention, closed items are deleted from TODO.md (git log preserves history). Remove the `#018 wpcmk RE Sweep (Phase 1)` entry added in Task 1.

- [ ] **Step 2: Add new TODO entry for Phase 2 plan-writing**

Use the next free ID (likely #019). Append:

```markdown
- #019 [open] — wpcmk Phase 2 — write port plan
  - Phase 1 RE sweep complete (`docs/re/wpcmk-screens.md`). Use `superpowers:writing-plans` to draft `docs/superpowers/plans/2026-05-26-wpcmk-port.md` against `docs/superpowers/specs/2026-05-26-wpcmk-byte-perfect-design.md`.
  - Plan scope: Wichmann-Hill RNG, character-record serializer, EGA primitives, per-screen components, integration + parity tests, deletion of existing /roster/new wizard.
```

Update "Next free ID:" line accordingly.

- [ ] **Step 3: Commit**

```bash
git add TODO.md
git commit -m "todo: close wpcmk Phase 1, queue Phase 2 plan-writing"
```

---

## Plan self-review notes (parent only — do not include in execution)

**Spec coverage:** Spec Phase 1 enumerates 11 items + 1 sub-investigation; plan has Tasks 2-13 mapping 1:1 (Task 2 = RE #1, Task 3 = RE #2, ... Task 13 = sub-investigation). Spec also says "Final promotion + cross-check" → Task 14. Spec deliverable summary mentions `docs/re/wpcmk-screens.md` → Tasks 1 and 14.

**Placeholder scan:** All RE subagent prompts contain self-contained context — no "TBD" references that require parent intervention. The Task 4 prompt depends on Task 2 (screen flow) being done first if possible; this is noted but not blocking (subagent has fallback to use `wpcmk-naming-pass.json`). Same for Tasks 5-7 / 9.

**Type consistency:** `screen_id` field used consistently across `wpcmk-screen-flow.json`, `wpcmk-window-layouts.json`, `wpcmk-msg-strings.json`, `wpcmk-kbd-filter-masks.json`. `dgroup_offset` used consistently for memory addresses. `wpcmk_offset` / `wpcmk_call_site` used for in-file offsets.

**Execution recommendation:** Tasks 2, 5, 12, 13 are foundational and ideally run first (sequentially or in parallel — they're independent). Tasks 3, 4, 9 benefit from Task 2's screen-flow map being available. Tasks 6, 7, 8, 10, 11 are independent of each other but need their related screens defined. Task 14 is gated on 2-13 completing.
