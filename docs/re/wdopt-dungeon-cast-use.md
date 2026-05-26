# wdopt.ovr — Named Functions (Dungeon Cast-Spell / Use-Item)

Human-readable index of function names applied to `wdopt.ovr` in the Ghidra project at `tools/ghidra/wiz6.gpr`. Generated from the comprehensive naming pass; structured source with per-function evidence is `docs/re/findings/wdopt-naming-pass.json`.

**Status:** 69 of 68 functions named (100% coverage; +1 dispatcher Ghidra missed).

## Structural overview — not the options dialog, the out-of-combat caster

The wmexe pass's speculation that wdopt was a "two-stage options or save/load dialog" was **wrong**. wdopt is actually the **out-of-combat cast-spell / use-item handler** — the per-character action menu the player invokes between fights, from inside the dungeon. It owns two `*0x363a` states:

| State | Decimal | Handler                              | Purpose                                             |
| ----- | ------- | ------------------------------------ | --------------------------------------------------- |
| 0x13  | 19      | `wdopt_state_13_cast_spell` (0x39cc) | Cast a spell in the dungeon (not in combat)         |
| 0x14  | 20      | `wdopt_state_14_use_item` (0x32fc)   | Use an item in the dungeon (potions, scrolls, keys) |

Invoked from `wmaze` at file offsets `0x28f7` and `0x293d` with the selected character index in `*0x43cc`. Both handlers transition back to `wmaze` (state `0x05`) on completion.

This means **all combat-vs-dungeon caster logic forks**: in combat, the picker lives in `wpops` (state 0x0c) and effect resolution lives in `wmexe` (state 0x0d); in dungeon, both live in `wdopt`. The wpops + wdopt spell-school pickers are independent copies that have drifted slightly.

## Subsystem prefixes

| Prefix                 | Subsystem                                                        |
| ---------------------- | ---------------------------------------------------------------- |
| `wdopt_state_*`        | The two state-handler entries                                    |
| `wdopt_dungeon_*`      | Cell trigger validators (the items-as-keys mechanic)             |
| `wdopt_spell_effect_*` | Per-spell effect dispatch + 20-entry jumptable at 0x64f6         |
| `wdopt_cell_effect_*`  | Per-cell scripted-event dispatch (via 14-handler jumptables)     |
| `wdopt_render_3d_*`    | **Seventh** embedded copy of the 3D wall renderer                |
| `wdopt_char_state_*`   | Per-character HP/SP/status mutation during cast/use              |
| `wdopt_ui_*`           | Spell-school picker, item picker, target-selection cursor        |
| `disk_io_*`            | Asset load for spell-effect / item-icon graphics (NOT save-game) |

## The silver-key mechanic (`wdopt_dungeon_item_trigger_check` at 0x1ffd)

Wiz6 items have **no global "use" action**. You can't drink a healing potion at the door of a dungeon when nothing requires it; you can't use a silver key when there's no silver-key-shaped lock. Items only do something at **scripted dungeon-cell triggers**.

The handler:

```
for each entry in current_cell's spell-cell trigger table:
    if entry.type == 0x13 and entry.item_id == selected_item_id:
        setbit(*0x363c * 10 + 0x4eec, entry.bit)    ; fire cell effect
        play_sound(entry.sound_id)
        return SUCCESS
return NO_EFFECT
```

So the silver key only works at the silver-locked door. The healing potion at full HP does nothing visible. The scroll of identify only triggers when you're standing on a square with type-0x13 cell metadata matching its item ID.

The activation bitmap at `*0x363c * 10 + 0x4eec` is per-scenario-zone (the multiplication by 10 keys it to the current zone index). Once a trigger fires, the bit is set — re-using the same item on the same cell does nothing. The silver key opens the door once, then becomes inert.

## The two copies of the spell-school picker

Two **independently-drifted copies** of the spell-school picker live in the Wiz6 binary:

- `wpops_ui_picker_spell` at `0x1ee6` — used in combat
- `wdopt_ui_picker_spell` at `0x2699` — used in dungeon

They look like they descend from a common ancestor. Both present the six schools (Fire / Water / Air / Earth / Mental / Divine), both filter against the caster's known-spells bitmap, both gate selection on power level. But the two implementations have diverged: the combat picker has slightly different rendering order, different exit semantics, and the cancel option lives at a different grid slot. Maintaining both was clearly the path of least resistance.

The port can collapse them into one shared widget — but the small behavior differences would need reconciling first (or preserving as two separate UIs if the differences turn out to be intentional).

## The dungeon overcast backfire (`wdopt_state_13_cast_spell` at 0x39cc)

When you cast a spell in the dungeon, the engine deducts HP cost from the caster (some Wiz6 spells cost HP, not just MP). If that HP cost would drop the caster **below zero**, instead of preventing the cast or killing the caster, the engine:

```
char.status (+0x450c) = 6 + rng(6)    ; 6..11
```

Sets a **dungeon-only fizzle status** in the range 6..11 (the exact status code is unmapped but likely paralysis / confusion / stun). The caster survives but is temporarily incapacitated.

This penalty is **absent in combat** (wpops + wmexe handle MP/HP cost differently — see the spell-picker card). So:

- **In combat**: overcast a spell with insufficient MP → silently fizzles, mana goes negative due to the underflow bug (see Notes card "The Spell Picker Shows Spells You Can't Afford").
- **In dungeon**: overcast a spell with insufficient HP → caster is afflicted with a random status effect.

The asymmetry is intentional — dungeon overcasts are riskier; combat overcasts are wasteful but safe.

## The split-inventory model

Each character has **20 inventory slots** divided into two halves:

- **Main inventory** (count at `+0x4594`, slots 0..9 at `+0x4428` stride 8)
- **Secondary inventory** (count at `+0x4595`, slots 10..19 at `+0x4478` stride 8)

The picker UI displays them as a unified 20-slot list. The internal split is invisible to the player but probably hard-coded for layout / memory reasons in the original. The wpcvw character-sheet view shows the same model.

## The seventh-overlay 3D wall renderer (`wdopt_render_3d_scene` at 0x508f)

Yes, **another copy**. 2192 bytes identical to wpops's `0x5c65`. Same camera state (`*0x4fa0..*0x4fa6`), same wall-bitmap base (`*0x4faa + 0x43a`), same scene_sub_state dispatch (`*0x363c` with values {0, 4, 5}), same five satellite per-direction clear helpers.

Full inventory of duplicated wall renderers, now seven copies:

| Overlay         | Purpose                                    |
| --------------- | ------------------------------------------ |
| `wmaze.ovr`     | The original — dungeon corridor            |
| `wmnpc.ovr`     | NPC dialogue backdrop                      |
| `wtrea.ovr`     | Chest UI backdrop                          |
| `wmele.ovr`     | Combat-round backdrop                      |
| `wmexe.ovr`     | Combat-action-execution backdrop           |
| `wpops.ovr`     | Combat-action-selection backdrop           |
| **`wdopt.ovr`** | **Dungeon cast-spell / use-item backdrop** |

Seven hand-synchronized copies. The port can collapse them all into one.

## Cross-overlay (thunk) call graph

50 distinct thunks, ~343 callsites. UI-heavy:

- `ui_window_set_cursor` 30×, `mouse_status_set_field` 18×, `sprite_render_at_screen_pos` 14×, `getbit_chunk` 26×, `getbit_test` 9×.
- Disk I/O present but minimal (2× `crt_open`, 2× `crt_dos_close`, 1× `huffman_load_and_decompress`, 1× `file_read`) — **all for spell-effect / item-icon graphics, NOT save-game**.
- Only 4× `rng_next` (spell HP-cost variance + fizzle-status roll).
- 44 of 50 thunks resolve to named wroot functions; 6 remain `FUN_xxxx` (same set unresolved across multiple prior passes).

## Remaining unnamed work

- 20-entry spell-effect jumptable at `0x64f6` (used by `wdopt_spell_effect_dispatch` 0x1af0): handler pointers aren't enumerated. Mapping each to a spell name would be a separate pass.
- Cell-effect dispatch family (`wdopt_cell_effect_dispatch_a/b/c` at 0x3de0/0x41c9/0x4386): dispatches via jumptable at `-0x7b1c` indexed by `*0x363c`; 14 cell-effect handlers per scene sub-state aren't enumerated.

## See also

- [`docs/re/findings/wdopt-naming-pass.json`](findings/wdopt-naming-pass.json) — structured source with per-function evidence.
- [`docs/re/wmaze-functions.md`](wmaze-functions.md) — owns state 0x05; invokes wdopt from `0x28f7` (cast) / `0x293d` (use).
- [`docs/re/wpops-action-selection.md`](wpops-action-selection.md) — in-combat counterpart; ships the independently-drifted second copy of the spell-school picker.
- [`tools/ghidra/scripts/apply_wdopt_names.py`](../../tools/ghidra/scripts/apply_wdopt_names.py) — idempotent replay script.
