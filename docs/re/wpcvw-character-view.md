# wpcvw.ovr — Named Functions (Character View + Level-Up)

Human-readable index of function names applied to `wpcvw.ovr` in the Ghidra project at `tools/ghidra/wiz6.gpr`. Generated from the comprehensive naming pass on the character-view + post-combat-level-up overlay; structured source with per-function evidence is `docs/re/findings/wpcvw-naming-pass.json`.

**Status:** 90 of 97 functions named (93% coverage).

## State machine integration

Unlike `wpcmk.ovr` (which is a callable library), `wpcvw.ovr` is a real state-machine handler. It owns two `*0x363a` states:

| State | Decimal | Handler                                       | Purpose                                                                                        |
| ----- | ------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 0x11  | 17      | `wpcvw_state_11_view` (0x6804)                | Interactive character view; called with the leader slot pushed from `*0x43cc`                  |
| 0x16  | 22      | `wpcvw_state_16_post_combat_levelup` (0xb4ba) | Bulk level-up loop after combat; iterates all party members and applies XP/level/stat/HP gains |

Header layout: 14-byte overlay-link header, plus extra leading bytes before the actual code-dispatch region (the first executable instruction is at file `0x1c`, preceded by an additional 8-byte sub-header that the simpler wbase/wmele dispatch shape doesn't have). The dispatch logic itself matches the standard pattern — back-to-back `cmp word [0x363a], <N>; jnz; call <handler>` blocks.

State 0x11 is unusual in pushing a parameter (`*0x43cc`, the current leader slot) onto the stack before the call. Most state handlers take no parameters and read everything from global state.

## Subsystem prefixes

| Prefix              | Subsystem                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `wpcvw_state_*`     | The two state-handler entry points                                                           |
| `panel_*`           | Character-sheet UI panels (header, stats, inventory grid, spells, conditions)                |
| `inventory_*`       | Equip/unequip, drop, give, identify, use, item-type USE-dispatch table                       |
| `spell_*`           | Per-realm spell-list rendering; known-vs-learnable distinction                               |
| `level_*`           | Level-up flow: XP threshold, HP/SP regen, stat increase, spell learn, class-specific bonuses |
| `class_change_*`    | The class-change tax — XP wipe, level reset, saved-old-level cap                             |
| `derived_*`         | AC computation, HP/SP regen formula, level cap, skill bumps                                  |
| `party_member_ui_*` | Mini-portrait row at the bottom (10-condition tracker, HP/SP bars, equipment icons)          |
| `name_edit_*`       | In-place name editor (used for both creation and rename)                                     |
| `ui_widget_*`       | Reused widgets (yes/no confirm, scrolling list, putchar wrappers)                            |
| `data_util_*`       | strcmp variants, small helpers                                                               |

## The class-change tax (`class_change_apply` at 0x6054)

When a character changes class, the engine takes three actions:

1. **Level reset** — `*0x440c := 1` (current level back to 1).
2. **XP wiped** — `*0x43f4` and `*0x43f6` cleared (XP back to zero).
3. **Old-level cap saved** — `*0x4597 := old_level`.

That third one is the brutal part. Six different derived-stat functions consult `*0x4597`:

- HP/SP regen (`derived_hp_sp_regen` at `0xa7bd`)
- AC recompute (`derived_ac` at `0xaa94`)
- Level-up driver (`level_up_apply` at `0xb220`)
- Skill apply (`skill_apply_growth` at `0x86d2`)
- Skill rolls (`skill_roll_check` at `0xa4c1`)
- Spell-list display (`spell_list_render` at `0x9dfb`)

Each one consults the saved old-level and throttles gains until `current_level` reaches `*0x4597`. So when you change class, you don't just lose your levels — you grind through them a second time with massively reduced stat / HP / skill gains the whole way back up. **This is the real cost of class change.** Wiz6 lets you do it; the engine makes sure you regret it.

## The stat-increase three-try filter (`level_up_roll_attribute` at 0xb004)

On level-up, attribute increases use a deliberately throttled lottery:

```
for k in 0..3:
  i = rng(7)
  if attr[i] < 18 and not seen[i]:
    attr[i] += 1
    seen[i] = true

while rng(2) == 0:
  retry one more attribute
```

Three guaranteed attempts plus a Bernoulli tail with p=0.5 per extra try. Once 6 of 7 attributes are capped at 18, the one remaining gets selected with probability 3/7 ≈ 43% per pull; over 3 pulls, ~82% chance per level of bumping the last stat. So late-game characters with one un-maxed stat see the last attribute creep up most levels but not every level.

## HP/SP regen on level-up (`derived_hp_sp_regen` at 0xa7bd)

```
gain = rng(4) + (STR + VIT) / 6 - level / 3
if DEX >= 16: gain += 1
if DEX >= 18: gain += 1
if DEX < 8:   gain -= 1
```

Applied to BOTH current and max HP/SP. The `level / 3` penalty term is why HP gains slow down at high levels even without class change. The DEX brackets are flat add/subtracts — no smoothing between 17 and 18.

## AC recompute (`derived_ac` at 0xaa94)

Base AC = 10. Modifiers:

- SPD ≥ 16: AC -1
- SPD ≥ 18: AC -1 (additional, so 18+ SPD = -2 total)
- Race = 5 (Faerie): AC -2
- Class = 12 (Monk) or 13 (Ninja): AC -= `level / 2` (scales with level)

Note the lack of any DEX bonus. Wiz6's AC math threads its agility bonus through SPD, not DEX, which is non-obvious.

## The Faerie tax (race index 5)

The Faerie race carries hard-coded penalties in at least three places:

- **HP/SP regen**: not just stat-derived; a separate Faerie check applies a flat negative modifier.
- **AC**: -2 (which is *good* for AC; this is the Faerie's compensation).
- **Level cap**: -1 (Faeries max out one level lower than other races in the same class).

Cumulative: Faeries get small AC win, smaller HP pool, and lower level cap. Their other strengths (raw stats, agility scaling) have to compensate.

## Item flag 0x40 ("class/alignment locked")

The full item-flag matrix for the equipment slots:

- `+0x442f` bits 0x01 | 0x02 | 0x40 → all block UNEQUIP with a beep.
- `+0x442f` bits 0x01 | 0x02 → block GIVE; 0x40 does NOT.
- DROP doesn't check any of these — it's the only escape from a cursed item.

The 0x40 carve-out is interesting: a Knight can give a Cleric's mace TO a Cleric without the giving-character's class-lock blocking it (because the lock only checks 0x01|0x02). But once received, the receiving character's class is independently checked against the item's flags.

## Character record layout (BSS at 0x43e8, stride 0x1b0)

Each character slot is 432 bytes. Base address `0x43e8`, slot N at `0x43e8 + N*0x1b0`. 40+ named fields including:

- Name, XP (32-bit at +0xc/+0xe), gold (32-bit), level, HP/SP (current and max), 22-slot inventory, 8 equip slots, 10-condition tracker, 6 base attributes, 14 skill levels, race / class / sex / saved-old-level.

Full field map in `docs/re/findings/wpcvw-naming-pass.json` § character record.

## Spell-learn loop (`spell_learn_on_levelup` at 0xa3be)

When a character reaches a level granting a spell, `*0x4590` is set to `rng(6) + 5` (the number of spells they'll try to learn this level). The loop cycles through 4 schools, displays each candidate, and prompts YES/NO confirm. There's randomness in *which* spells are offered — the same character at the same level can learn different sets on different runs.

## Cross-overlay (thunk) call graph

51 distinct thunks across ~344 call sites:

- **22 of 51 thunks** resolve to wroot functions already named in `docs/re/findings/wroot-naming-pass.json`.
- **29 of 51 thunks** resolve to functions still named `FUN_xxxx` in wroot. **12** of those have informal names from prior wmaze/wmele/wbase/wpcmk passes — `load_msg_into_buf`, `rng_next`, `play_sound`, `getbit_test`, `setbit`, `ui_window_put_char_repeat`, `ui_window_write_chars`, `memset`, `strcpy`, `strlen`, `crt_read/lseek/memmove`. Promoting those into wroot-naming-pass.json would lift wpcvw's named ratio from 22/51 to ~34/51 — same recurring theme as wmele/wpcmk passes.

Full per-thunk listing in `findings/wpcvw-naming-pass.json` § `thunk_usage`.

## Remaining unnamed functions

7 of 97 still labeled `FUN_xxxx`. They cluster around orphaned helpers (no callers in the function call graph — possibly dead code or jump-table fragments Ghidra couldn't resolve) and 7 sets of 14-entry inline class-dispatch sub-stubs that live in wpcvw's data segment and weren't promoted to standalone functions.

See `unresolved` + `next_steps` in `docs/re/findings/wpcvw-naming-pass.json`.

## See also

- [`docs/re/findings/wpcvw-naming-pass.json`](findings/wpcvw-naming-pass.json) — structured source with per-function evidence.
- [`docs/re/wpcmk-character-creation.md`](wpcmk-character-creation.md) — sister overlay; shares character-record BSS layout (0x43e8 / 0x1b0 stride).
- [`docs/re/wmele-combat.md`](wmele-combat.md) — sister overlay; combat handoff to wpcvw state 0x16 for post-combat level-up.
- [`tools/ghidra/scripts/apply_wpcvw_names.py`](../../tools/ghidra/scripts/apply_wpcvw_names.py) — idempotent replay script.
