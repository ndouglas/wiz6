# wpcmk Screens — Consolidated RE Reference

Single source of truth for the wpcmk character-creation overlay, promoted from parent-reviewed findings under `docs/re/findings/wpcmk-*.json`. This document feeds the Phase 2 port plan.

**Status:** Section-by-section, populated as each Phase 1 RE task completes. Sections marked "TBD" are not yet investigated.

**Source spec:** `docs/superpowers/specs/2026-05-26-wpcmk-byte-perfect-design.md`
**Source plan:** `docs/superpowers/plans/2026-05-26-wpcmk-re-sweep.md`

---

## 1. Screen-flow map

The wpcmk character-creation overlay is invoked as a cross-overlay call from wbase's main-menu slot 5. Two entry wrappers (`wpcmk_create_via_empty_slot` at 0x50f2 and a sibling) handle name input and dispatch into the master orchestrator `wpcmk_create_character_master` at 0x4e47. **Total: 17 screens** (one pre-entry, 16 inside the master).

### Screen sequence

| # | Screen ID | Driver (file offset) | Interactive | One-line |
|---|-----------|---------------------|-------------|----------|
| 0 | `screen-00-pre-entry` | `wpcmk_create_via_empty_slot` 0x50f2 | yes | Name entry (≤14 chars, ASCII, unique) |
| 1 | `screen-01-init` | master entry 0x4e47 | no | Zero 432-byte record + create UI windows |
| 2 | `screen-02-race` | `wpcmk_pick_race_menu` 0x308d | yes | Pick 1 of **11 races** (all enabled) |
| 3 | `screen-03-alignment` | `wpcmk_pick_alignment_menu` 0x31a6 | yes | Pick Good or Evil (**exactly 2 options**) |
| 4 | `screen-04-bonus-roller` | `stat_roller_bonus` 0x4e81 | no | Inline bonus-pool roll (5..26) |
| 5 | `screen-05-class` | `wpcmk_pick_class_menu` 0x32e1 | yes | Pick 1 of **14 classes** (qualification-gated) |
| 6 | `screen-06-bonus-allocator` | `wpcmk_bonus_point_allocator_ui` 0x3405 | yes | Distribute bonus pool across STR/INT/PIE/VIT/DEX/SPD/PER |
| 7 | `screen-07-derived-stats` | `creation_init_derived_stats` 0x4ddd | no | Age, encumbrance, HP, level=1, XP=1 |
| 8 | `screen-08-personality` | `wpcmk_personality_reroll_loop` 0x3837 | yes | Rolling-dice anim until RETURN or click |
| 9 | `screen-09-skill-init` | `skill_init_all_32_slots` 0x392e | no | 32 skill-slot defaults |
| 10 | `screen-10-portrait` | `wpcmk_pick_portrait_loop` 0x4bad | yes | 42-cycle portrait picker (keys 1/3/5) |
| 11 | `screen-11-class-starter-items` | `FUN_3c49` 0x3c49 | no | Class-specific starter inventory (14 tables) |
| 12 | `screen-12-char-sheet-redraw` | `ui_redraw_character_sheet` 0x0df7 | no | Full character-sheet redraw |
| 13 | `screen-13-spell-school-init` | `ui_welcome_animation` 0x1ae9 | no | **Conditional** — runs only if `*(0x5618) != 0` (caster) |
| 14 | `screen-14-skill-training` | `wpcmk_train_skill_pillar` 0x28d4 ×4 | yes | 4 rounds (MAGIC/FAITH/PHYSICAL/MENTAL) grid picker |
| 15 | `screen-15-confirm` | menu picker (msg 0x44f/0x45a) | yes | KEEP or DISCARD |
| 16 | `screen-16-save` | `roster_io_one_record` 0x001b (mode=1) | no | Write 432 bytes to PCFILE.DBS slot |

### Transitions

| From | Trigger | To |
|------|---------|-----|
| screen-00-pre-entry | CR after non-empty, unique name | screen-01-init |
| screen-00-pre-entry | empty name OR escape | **EXIT** → wbase state 4 |
| screen-00-pre-entry | duplicate name | modal error → re-prompt |
| screen-01-init | (immediate) | screen-02-race |
| screen-02-race | player selects race (any of 11) | screen-03-alignment |
| screen-03-alignment | player selects alignment | screen-04-bonus-roller |
| screen-04-bonus-roller | (immediate) | screen-05-class |
| screen-05-class | player selects a qualified class | screen-06-bonus-allocator |
| screen-06-bonus-allocator | key 5 while `pool==0` | screen-07-derived-stats |
| screen-07-derived-stats | (immediate) | screen-08-personality |
| screen-08-personality | RETURN or click | screen-09-skill-init |
| screen-09-skill-init | (immediate) | screen-10-portrait |
| screen-10-portrait | key 5 (confirm portrait) | screen-11-class-starter-items |
| screen-11-class-starter-items | (immediate) | screen-12-char-sheet-redraw |
| screen-12-char-sheet-redraw | (immediate) | screen-13 (caster) **OR** screen-14 (non-caster) |
| screen-13-spell-school-init | animation completes | screen-14-skill-training |
| screen-14-skill-training | all pillars trained | screen-15-confirm |
| screen-14-skill-training | picker returns −1 (cancel) | loop until non-cancel |
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
| screen-03-alignment | 0x19e | 1 | alignment index (0=Good, 1=Evil) |
| screen-03-alignment | 0x12e | 1 | PIE possibly adjusted by `race_faerie_personality_mod` |
| screen-04-bonus-roller | DGROUP 0x56ac | 2 | `bonus_points_remaining = 5..26` (or 21 if debug override) |
| screen-05-class | 0x19f | 1 | class index (0=Fighter..13=Alchemist) |
| screen-05-class | DGROUP 0x56ae[14] | 28 | `class_qualification_flags[14]` |
| screen-06-bonus-allocator | 0x12c..0x131 | 6 | STR/INT/PIE/VIT/DEX/SPD ↑ via spent points (cap 18) |
| screen-06-bonus-allocator | 0x132 | 1 | PER also modifiable |
| screen-06-bonus-allocator | DGROUP 0x56ac | 2 | `bonus_points_remaining` → 0 |
| screen-07-derived-stats | 0x008..0x00b | 4 | age (`rng(1000) + 0x19aa`) |
| screen-07-derived-stats | 0x018..0x01f | 8 | encumbrance min/max + weight min/max |
| screen-07-derived-stats | 0x022..0x023 | 2 | `hp_initial = encumb_max × 15` (×10 for Faerie) |
| screen-07-derived-stats | 0x024..0x025 | 2 | `level = 1` |
| screen-07-derived-stats | 0x026..0x027 | 2 | `xp = 1` |
| screen-07-derived-stats | 0x1ac | 1 | `inventory_count = 0` |
| screen-07-derived-stats | 0x1ae | 1 | unknown = 100 |
| screen-07-derived-stats | 0x110..0x11f | 16 | combat stats init array |
| screen-08-personality | 0x133 | 1 | KAR = personality roll (`rng(9)+10` = 10..18) |
| screen-09-skill-init | 0x19c | 1 | `portrait_idx_prev_cache = 0` (not a true record field) |
| screen-10-portrait | 0x19c | 1 | `portrait_index_final` (0..41) |
| screen-11-class-starter-items | 0x040..0x10f | up to 40 | up to 5 starter inventory slots (8 bytes each) |
| screen-13-spell-school-init | 0x068..0x07f | up to 24 | spell-school cur/max mana per caster class |
| screen-13-spell-school-init | 0x1a8 | 1 | `has_spells` cleared to 0 at animation end |
| screen-14-skill-training | 0x028..0x03f | up to 24 | skill-attribute pools (6 × (cur u16, max u16)) |
| screen-14-skill-training | 0x118..0x11f | 8 | `skill_training_points_per_pillar` decremented |
| screen-16-save | disk + DGROUP 0x4fd8[slot] | 432 + 1 | full record → PCFILE.DBS slot, occupancy flag set |

### Conditional branches

- **screen-13 (spell school animation) is conditional on `*(0x5618) != 0`** — the caster flag, set during screen-11 (class starter items) for spellcasting classes. Non-casters skip directly from screen-12 to screen-14.
- **screen-14 (skill training) loops via `while (*(0x5588+pillar) > 1)`** — most classes get one pick per pillar; classes with more skill points iterate.
- **screen-15 (confirm) → screen-16 only if `choice == 0` (KEEP).** DISCARD exits to wbase without disk write; the record buffer is discarded.
- **screen-00 (name entry) escape OR empty name exits wpcmk entirely.** Duplicate name shows modal error then re-prompts.

### Known corrections to prior RE

- **`wpcmk-naming-pass.json` overstated entry counts.** Race picker = 11 options (not 10), alignment picker = 2 options (not 10), class picker = 14 options (not 10). Verified via `cmp ax, 1; jng loop` at 0x31b4 for alignment and equivalent patterns for race/class.
- **`wpcmk-state-machine-trace.json` step labels are misaligned.** Step 3 = alignment (0x31a6), Step 5 = class (0x32e1); the address 0x392e is `skill_init`, not alignment.
- **Buffer offset `0x19c`** is confirmed as `portrait_idx` (was `still_tbd` in `character-record-extended-map-v2.json`).

Source: `docs/re/findings/wpcmk-screen-flow.json`

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
