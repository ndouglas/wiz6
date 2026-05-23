# wtrea.ovr — Named Functions (Treasure / Chest / Trap Engine)

Human-readable index of function names applied to `wtrea.ovr` in the Ghidra project at `tools/ghidra/wiz6.gpr`. Generated from the comprehensive naming pass on the treasure / chest overlay; structured source with per-function evidence is `docs/re/findings/wtrea-naming-pass.json`.

**Status:** 78 of 77 functions named (100% coverage; +1 dispatch-entry function that Ghidra missed and the replay script auto-creates).

## State machine integration

wtrea is a true state-machine handler (unlike wpcmk and wmnpc, which are library overlays). Owns two states:

| State | Decimal | Handler                                  | Purpose                                       |
| ----- | ------- | ---------------------------------------- | --------------------------------------------- |
| 0x0f  | 15      | `wtrea_state_0f_post_combat_treasure`    | Post-combat loot pickup (rolls treasure, divides gold, awards xp). Transitions to 0x16 on exit. |
| 0x15  | 21      | `wtrea_state_15_chest_encounter`         | In-dungeon chest interaction (open / inspect / disarm / spell / leave). Transitions to 0x16 on exit. |

A TPK during state 0x0f forfeits the treasure and transitions to state 8 (graveyard). See "TPK treasure forfeit" below.

## Subsystem prefixes

| Prefix                | Subsystem |
| --------------------- | --------- |
| `wtrea_state_*`       | The two state-handler entries |
| `wtrea_chest_menu_*`  | The 5-option chest menu (OPEN / INSPECT / DISARM / SPELL / LEAVE) |
| `wtrea_action_*`      | Action handlers (disarm, open, inspect, cast spell) |
| `wtrea_run_loot_*`    | Loot-table rolling + per-character distribution |
| `wtrea_trap_*`        | Trap selection + progressive trap-name reveal |
| `wtrea_render_3d_*`   | Embedded copy of wmaze's 3D wall renderer (yet another duplicate) |
| `wtrea_skill_*`       | Skill-train primitive used by every action attempt |
| `wtrea_inventory_*`   | 22-slot inventory insert + cursed-flag translation |

## The disarm formula (`wtrea_action_disarm_trap` at 0x2582)

When the player chooses DISARM at a chest:

1. **Pick the trap name** from a list of candidates. The candidate list includes decoys; the player has to choose which one is actually present.
2. **If the guess is wrong: return -1 immediately.** This is treated exactly like a critical-fail dice roll — the trap auto-triggers. No formula, no clemency.
3. **If the guess is correct**, compute a score:

```
score = thief_skill / 2
      + dex / 2
      + level
      - dungeon_depth * 2

if class == Thief (3):     score += dex * 3
if class in {Ninja, Bard, Lord}:  score += dex * 2

score = clamp(score, 5, 95)
```

4. **Roll**:

```
roll = rng(100)
if roll < score:                            SUCCESS
if roll > 100 - (100 - score)/3  or roll > 94:  CRITICAL FAIL (trap triggers)
else:                                       MISS (no progress, no trap)
```

The interesting consequence: **misidentifying the trap is treated identically to a botched disarm roll.** A non-Thief who guesses the trap name correctly but rolls a "miss" gets a do-over; the same non-Thief who picks the wrong name gets the trap dropped on them. The penalty for *not knowing the game* is structurally identical to the penalty for *failing the skill check.*

## The progressive trap-name reveal (`wtrea_progressive_trap_reveal` at 0x21c9)

INSPECT (and the Calfo spell, which calls the same routine with a higher skill parameter) does **not** simply tell the player the trap name. It runs a multi-attempt letter-by-letter word-puzzle reveal:

Each invocation walks the display buffer at `*0x51bc` plus the per-slot flag array at `*0x5194`:

- **For each existing slot**: if `rng(100) > 50` AND `rng(100) < skill_param`, try to mark a decoy slot as a real letter (if the real trap name contains that character).
- **For each remaining reveal allowance**: if `rng(100) < skill_param`, add a random character from the real trap name with flag=1 (rendered in **color 6 = white** — a real letter). Otherwise, add a random decoy `rng(26) + 'A'` with flag=0 (**color 12 = dark gray** — looks like a decoy).

The display state persists across multiple INSPECT calls. The player sees a partially-completed word with white and dark letters interleaved, and has to guess the trap from incomplete information. Repeated INSPECTs (or Calfo casts) progressively fill in more real letters and downgrade decoys — but they don't guarantee a clean reveal, and a low-skill character may keep adding decoys faster than the engine surfaces real letters.

**Then the player has to pick the trap name from the candidate list** (see disarm formula above). Guessing wrong even after a multi-attempt INSPECT session = critical fail.

## TPK treasure forfeit (`wtrea_run_loot_rolls` at 0x509d)

After every combat encounter, the engine rolls treasure. The distribution loop:

```python
alive = sum(1 for c in party if c.status[0x4589] == 0)
if alive == 0:
    *0x363a = 8     # graveyard (winit.ovr 0xdf6)
    return          # skip distribution entirely
else:
    divide_gold(party_size_alive)
    award_xp_full(each_alive_character)
    # ... etc
```

If your party wipes mid-combat against the killing blow that drops the last monster, the engine still rolls the loot table — *and then forfeits everything because nobody's alive to claim it.* You go to the graveyard with the same dead party AND with no consolation prize.

The fix for this engine-side: keep at least one party member alive through the kill-the-last-monster moment. The fix for the player who didn't plan for it: nothing.

## The loot-roll table format

At `*0x509d` (loaded from scenario data): 6 entries × 6 bytes each. Per-entry fields:

| Offset | Field             |
| ------ | ----------------- |
| +0     | base (gold / item-base / xp-base) |
| +1     | dice (rng range) |
| +2     | type (1 = gold, 2 = item, 4 = xp) |
| +3     | drop% (probability 0..100) |
| +4–5   | additional / per-type params |

Gold is divided by living party size at distribution time. Item rolls insert into the receiving character's 22-slot inventory via `wtrea_inventory_insert` (which respects the 22-slot cap and translates the cursed-flag bits — bit 0x40 = class-locked / cursed, same flag wpcvw blocks unequip on). XP is awarded in full to each alive member — i.e. the XP grant is per-character, not per-party.

## The chest-spell UI (`wtrea_action_cast_spell` at 0x3406)

When the player chooses SPELL at a chest, a two-stage picker fires:

1. **School picker**, filtered against the casting character's spell-known bitmap at `+0x4570` (82 spells across 6 schools, 1 bit each). The character only sees schools where they know at least one chest-applicable spell.
2. **Spell + power-level picker**: choose a known spell, then a power level from 1..6 — capped at `caster_level - spell_base_level + 1`. So even a known spell can't be cast above a low power if the caster isn't experienced enough.

Mana is **per-school**: a 6-school × 32-bit (4-byte) mana array lives at `character + 0x4410`. Schools spend independent budgets. A character with 100 MP in Fire School and 0 in Water School simply can't cast Water spells regardless of total magical reserves.

The interesting structural consequence: **breadth of spellbook matters more than total spell count.** A character who knows one spell in each of the 6 schools is more useful for chest-cracking than one who knows 10 spells in a single school, because the chest-spell UI filters by school presence first. (Wiz6 doesn't tell you this; you can infer it after enough hours.)

## The triplicated 3D wall renderer (`wtrea_render_3d_walls` at 0x6c8f)

wtrea ships **another 2192-byte copy** of the 3D dungeon-corridor renderer — same `*0x4faa + 0x43a` and `+0x49a` wall-bitmap accesses, same hardcoded pixel coordinates, same facing-rotation math as wmaze. So the original Wiz6 codebase has the wall renderer duplicated *three* times:

| Overlay        | Function                                  |
| -------------- | ----------------------------------------- |
| `wmaze.ovr`    | The original — corridor view during dungeon traversal |
| `wmnpc.ovr`    | Mirror copy — used when NPC dialogue overlays the corridor |
| `wtrea.ovr`    | Yet another mirror — used when a chest-interaction window overlays the corridor |

The constants aren't shared via header or data table. Any tweak to wmaze's wall positions would silently desync the chest-encounter and NPC-encounter views unless someone hand-edited all three copies.

## Cross-overlay (thunk) call graph

45 distinct thunks across ~416 call sites:

- **25 of 45 thunks** resolve to wroot functions already named in `docs/re/findings/wroot-naming-pass.json`.
- **9 of 45 thunks** match informal names from prior passes (load_msg_into_buf, ui_window_write_chars, sprite_blit_short, kbd_*, etc.).
- **11 of 45 thunks** remain `FUN_xxxx` in wroot. Most notable: `FUN_3f1e` is used by gold-divide here and xp-bonus calc — a signed 32-bit math primitive. Should be promoted to wroot-naming-pass.json in a future pass.

Full per-thunk listing in `findings/wtrea-naming-pass.json` § `thunk_usage`.

## Remaining unnamed functions

Zero of 77. The replay script also auto-creates the dispatch-entry function at file 0x0e that Ghidra failed to detect.

## See also

- [`docs/re/findings/wtrea-naming-pass.json`](findings/wtrea-naming-pass.json) — structured source with per-function evidence.
- [`docs/re/wmaze-functions.md`](wmaze-functions.md) — sister overlay; original copy of the 3D wall renderer.
- [`docs/re/wmnpc-npc-dialogue.md`](wmnpc-npc-dialogue.md) — sister library overlay; second copy of the same wall renderer.
- [`docs/re/wpcvw-character-view.md`](wpcvw-character-view.md) — sister overlay; documents the character record at 0x43e8 stride 0x1b0 + the cursed-flag matrix wtrea respects.
- [`tools/ghidra/scripts/apply_wtrea_names.py`](../../tools/ghidra/scripts/apply_wtrea_names.py) — idempotent replay script.
