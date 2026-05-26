# wpops.ovr — Named Functions (Combat Action Selection)

Human-readable index of function names applied to `wpops.ovr` in the Ghidra project at `tools/ghidra/wiz6.gpr`. Generated from the comprehensive naming pass; structured source with per-function evidence is `docs/re/findings/wpops-naming-pass.json`.

**Status:** 57 of 56 functions named (100% coverage; +1 dispatcher Ghidra missed at file `0x000e`).

## Structural overview — the missing middle of the combat round

wpops owns state `0x0c` (decimal 12) — the **action selection** step between wmele's round-start (state 0x0b) and wmexe's action resolution (state 0x0d). The complete four-overlay combat round, now fully mapped:

```
0x0a  →  wmele   (init encounter)
0x0b  →  wmele   (round start: redraw + monster intent)
0x0c  →  wpops   ← action SELECTION (this overlay)
0x0d  →  wmexe   ← action RESOLUTION
0x0e  →  wmele   (end-of-round → loop back to 0x0b)
```

wpops is structurally the dual of wmexe: where wmexe runs the deterministic resolution math (95 `rng_next` calls — RNG-heavy), wpops runs the UI-heavy selection layer (only 8 `rng_next` calls — mostly UI/window thunks). The two together implement Wiz6's combat round.

## State-handler shape

- 14-byte header (matches wbase/wmele/wmnpc/wtrea/wmexe).
- **Dispatcher at file `0x000e`** — Ghidra missed it; the replay script auto-creates it.
- 3-phase loop inside the state-0x0c handler:
  1. **Party action picker** — for each conscious party member, present the action menu.
  2. **Monster AI selection** — for each monster, pick action + target deterministically (or with a small `rng_next` tap for tie-breaking).
  3. **Transition to wmexe** — set `*0x363a = 0x0d` and return.

## Subsystem prefixes

| Prefix                  | Subsystem                                                             |
| ----------------------- | --------------------------------------------------------------------- |
| `wpops_action_picker_*` | Per-character action menu (ATTACK / SPELL / USE / PARRY / RUN / etc.) |
| `wpops_ui_picker_*`     | Sub-pickers (spell-school grid, item list, target-group selector)     |
| `wpops_ui_panel_*`      | Combat-pane composition (party row, monster row, status badges)       |
| `wpops_monster_ai_*`    | Deterministic monster-side action + target choice                     |
| `wpops_render_3d_*`     | Embedded 3D wall renderer (**sixth** copy — see Notes)                |
| `wpops_animation_*`     | Action-confirmation animations (cursor flicker, target highlight)     |
| `data_util_*`           | Small helpers (strncmp, putchar, etc.)                                |

## The BACK / RESET action navigator (`wpops_action_picker_main` at 0x???)

The action-picker is **not** a one-shot per-character menu. The engine pushes each character's pick onto a stack, and the navigator supports going BACK (undo the previous character's choice) and RESET (clear the entire round's picks). Until every character has confirmed their action, the player can revise earlier picks at any time.

This is **uncommon UX for a 1990 CRPG.** Most contemporaries (Bard's Tale, Might & Magic, even Wizardry I-IV) committed each pick irreversibly and forced you to live with mis-clicks. Wiz6 lets you walk back the entire round. The cost is a small piece of state — a per-character stack-frame indexed by character slot — but the player-experience consequence is significant: no rage-quitting because you accidentally hit the wrong action key on character #3.

## The spell picker shows under-funded spells (`wpops_ui_picker_spell` at 0x???)

When a caster selects SPELL, the picker shows **every spell the character knows** — not just the ones they have enough mana for. Spells the caster can't afford are **rendered greyed out** but **remain selectable**. Picking a greyed spell triggers a cost check at action-execution time and silently fails (or pops up an error) if mana is insufficient.

This is designed pedagogy: **the player learns what spells exist by seeing them in the picker, even when they can't cast them yet.** A new Bishop can see "oh, I'll get Tiltowait at higher levels" because Tiltowait is right there in the picker, greyed out. Hiding unaffordable spells would have been simpler and cheaper — but worse for player progression awareness.

(Note: the cast-time mana check itself has the underflow bug documented in the wmexe note — but the picker's display layer is innocent of that bug.)

## The 3-byte monster prejudice table (`wpops_target_pick_random_with_prejudice` at 0x3ed7)

Each monster type has a 3-byte "prejudice" table at `monster_type + 0x80..+0x82`. Each byte identifies a monster type (or zero) that this monster considers a target. The picker:

1. Rolls `rng(3)` to select one of the three prejudice slots.
2. If the picked slot is non-zero, finds the first present group whose monster type matches and targets it.
3. If the picked slot is zero, targets the party.

Consequences:

- **Some monsters can fight each other.** When a Wiz6 encounter spawns multiple monster types and at least one type's prejudice table references another present type, those monsters will attack each other rather than the party. Players who've seen the dragon turn on the rogues, or the orcs gang up on the demon, were watching the prejudice table at work.
- **Soft infinite-loop risk.** If all 3 prejudice slots are zero, the loop runs without termination guarantee — though normal data avoids this. (Documented as `confidence: medium` in the findings; should be verified against the actual shipped monster_type data.)

## The sixth copy of the 3D wall renderer (`wpops_render_3d_scene` at 0x5c65)

wpops ships its own **2192-byte copy** of the dungeon-corridor renderer. Sixth confirmed copy. Full inventory:

| Overlay     | Function                                  |
| ----------- | ----------------------------------------- |
| `wmaze.ovr` | The original — dungeon traversal corridor |
| `wmnpc.ovr` | Mirror — NPC dialogue backdrop            |
| `wtrea.ovr` | Mirror — chest UI backdrop                |
| `wmele.ovr` | Mirror — combat round backdrop            |
| `wmexe.ovr` | Mirror — combat action-execution backdrop |
| `wpops.ovr` | Mirror — combat action-selection backdrop |

Six identical copies, all reading the same wall-bitmap memory, all using the same hardcoded pixel constants, all hand-copied. The port can collapse all six into a single function in `@wiz6/parser`.

## The 6-dimensional action availability gating

For each character, the action picker filters available actions through six independent gates:

- **Status**: dead / paralyzed / asleep → skip turn entirely.
- **Charm**: charmed characters' actions are picked by the engine, not the player.
- **Class**: only certain classes get certain actions (Hide for Ninja / Thief / Bard; specific cast permissions).
- **Inventory**: USE-item requires at least one combat-usable item.
- **Weapon**: SHOOT requires a ranged weapon equipped; the cast helps determine attack-form availability.
- **Rank**: melee from back rank is restricted; some actions are front-rank only.

Each gate is implemented as an independent check, all six combined before the picker renders. Hidden complexity: a back-rank Bishop who's charmed and out of arrows can't pick SHOOT for a half-dozen overlapping reasons.

## Cross-overlay (thunk) call graph

39 distinct thunks across ~167 call sites. UI-heavy:

- **35 thunks** resolve to named wroot / overlay functions (`ui_window_*` family dominates: 16 distinct, >100 callsites).
- **4 thunks** remain `FUN_xxxx` in wroot (FUN_0a42, FUN_2858, FUN_3694, FUN_36a0). All four are also unresolved in prior overlay passes.
- Only **8 `rng_next` calls** — confirms wpops is the selection layer (deterministic UI), not the resolution layer.

## See also

- [`docs/re/findings/wpops-naming-pass.json`](findings/wpops-naming-pass.json) — structured source with per-function evidence.
- [`docs/re/wmele-combat.md`](wmele-combat.md) — owner of the round entry (state 0x0b) before wpops.
- [`docs/re/wmexe-action-execution.md`](wmexe-action-execution.md) — owner of the action resolution (state 0x0d) after wpops.
- [`tools/ghidra/scripts/apply_wpops_names.py`](../../tools/ghidra/scripts/apply_wpops_names.py) — idempotent replay script (auto-creates the missed dispatcher at 0x000e).
