# wmexe.ovr — Named Functions (Combat Action Execution Engine)

Human-readable index of function names applied to `wmexe.ovr` in the Ghidra project at `tools/ghidra/wiz6.gpr`. Generated from the comprehensive naming pass; structured source with per-function evidence is `docs/re/findings/wmexe-naming-pass.json`.

**Status:** 97 of 97 functions named (100% coverage; +2 functions Ghidra missed at the dispatcher and wroot-callable entry — the replay script auto-creates them).

## Structural overview — the combat round chain

wmexe is the **combat action execution engine**. It owns state `0x0d` (decimal 13). The full Wiz6 combat round dispatches across **four** overlays in a chain:

```
state 0x0a  →  wmele   (init combat encounter)
state 0x0b  →  wmele   (start of round; redraw + monster intent)
state 0x0c  →  wpops   (action queue / popups — overlay not yet named)
state 0x0d  →  wmexe   (action resolution — this overlay)
state 0x0e  →  wmele   (end-of-round cleanup → loop back to 0x0b)
```

Each round, the engine cycles through these four state handlers in order. The previously-unknown wpops/wmexe step is where Wiz6's actual combat *mechanics* live — initiative ordering, attack rolls, status-effect application, spell effect dispatch.

### Header / dispatch quirks

- 14-byte header (matches wbase/wmele/wmnpc/wtrea).
- **The dispatcher is at file 0x2ccc**, not 0x0e — Ghidra missed it. The wroot-callable entry is at `0xad5e` (also missed by Ghidra). The replay script auto-creates both.
- Dispatcher dispatches state `0x0d` only.

## Subsystem prefixes

| Prefix                  | Subsystem |
| ----------------------- | --------- |
| `wmexe_state_*`         | The state-0x0d entry + main initiative loop |
| `wmexe_action_*`        | Per-action resolvers (33 functions; melee, spells, items, flee, etc.) |
| `wmexe_resolve_*`       | Sub-resolvers for damage / status / hit-or-miss math |
| `wmexe_render_3d_*`     | Embedded copy of wmaze's 3D wall renderer (**fifth** overlay carrying this) |
| `wmexe_animation_*`     | The 12-slot animation queue (and its overflow-crash bug) |
| `wmexe_spell_*`         | Spell-effect dispatch (per-school mana bookkeeping, range-of-effect rolls) |
| `ui_*` / `data_util_*`  | Reused widgets and small helpers |

## The initiative tick loop (`wmexe_state_0d_initiative_round_loop` at 0x8ba5)

Wiz6's combat is **not** a turn queue. The engine doesn't sort combatants by initiative and step through them in order. Instead:

```
counter = 100
while counter > 0:
    for each combatant in all 7 groups × all combat slots:
        if combatant.initiative_byte == counter:
            fire_action(combatant)
    counter -= 1
```

The combatant's "initiative" is a byte at slot offset `+0x25`, computed from class / DEX / encumbrance / status effects. Each combatant has up to **four sub-action queue slots** at `+0x18..+0x1b` with corresponding initiative values at `+0x192..+0x195`. A fast monster (e.g. a dragon with three claw attacks plus a tail swipe) fires four times per round at four different initiative values.

When an action becomes eligible, the engine introduces a **random pause-jitter** by subtracting `rng(10) - 5` from the counter before processing — so the action that "would" fire at init=72 actually fires at init=67..77. This is what gives Wiz6 combat its characteristic staggered, "they're winding up" feeling. It's not turn-based; it's continuous-with-noise.

## The 12-slot animation queue and its crash (`wmexe_animation_queue_push` at 0x1cd5)

Hits, spell effects, and morale visuals get queued for display in a 12-slot array. The push routine has **no overflow guard** — when the queue is full, the function falls into an infinite loop of `play_sound(0)` (which plays nothing audible) and never returns. The same pattern appears in the 30-slot sprite-queue push at `0x9978`.

So Wiz6 has a genuine **hang-on-crowded-combat bug**: a combat round that tries to enqueue more than 12 animations (e.g. a single large AoE spell hitting >12 monsters with elaborate visual effects) hangs the game. The original developers presumably either never triggered it or never noticed because the situations that produce >12 animations are rare in normal play. But the bug is there.

## The asymmetric morale bucket (`wmexe_morale_check` at 0x000e)

Morale rolls return a value from one of two tables:

| Roll result | Party gets | Monster gets |
| ----------- | ---------- | ------------ |
| Common       | 0          | 0           |
| Less common  | 5          | 0           |
| Rare         | 10         | 1           |
| Rarer        | 20         | 2           |
| Rarest       | 40         | 4           |

On the same underlying roll, the party gets up to **10x** the morale boost a monster gets. Combined with the combat pacing, this is a structural party-favoring bias baked into the engine. Monsters never get the morale spikes that turn fights around; PCs do.

## The leader-monster paralysis cascade (`wmexe_check_leader_paralysis` at 0x810a)

Monster type byte `0x97` (the same flag we found in `wmele`'s encounter-setup table) marks a "leader" monster. If a leader gets paralyzed (status flag), `wmexe` triggers a **death-cascade** — the leader dies AND every monster in the same group also dies (or panics, depending on a secondary roll). This explains the "kill the boss and everyone else flees" pattern players notice in encounters with specific leader-flagged monsters.

## The spell-school mana underflow (`wmexe_spell_dispatch` at 0x6ad8)

Casters in Wiz6 have **per-school mana pools** at character offset `+0x4410` (six 32-bit slots, one per school). The cast dispatcher subtracts the spell's cost without clamping:

```
mana[school] -= cost
```

There's no `if (mana[school] >= cost) before` and no `mana[school] = max(0, ...)` after. The 32-bit signed value can go negative. Normal play protects against this because the UI gates spell selection on `mana >= cost`, but any code path that bypasses the UI (item-triggered spells, scripted spells) can corrupt the mana pool into a negative number that subsequent UI-gated checks never recover from.

## The five-overlay 3D wall renderer (`wmexe_render_3d_walls` at 0xa4c2)

wmexe ships **its own** 2192-byte copy of the 3D dungeon-corridor renderer — the fifth confirmed copy in the codebase. Same wall-bitmap accesses at `*0x4faa + 0x43a` and `+0x49a`, same hardcoded pixel constants, same facing-rotation math. Full inventory now:

| Overlay        | Function                                  |
| -------------- | ----------------------------------------- |
| `wmaze.ovr`    | The original — corridor view during dungeon traversal |
| `wmnpc.ovr`    | Mirror — used when NPC dialogue overlays the corridor |
| `wtrea.ovr`    | Mirror — used when a chest UI overlays the corridor |
| `wmele.ovr`    | Mirror — combat backdrop |
| `wmexe.ovr`    | Mirror — combat-action-execution view |

Five identical copies. Tweaking wmaze without touching the other four silently desyncs combat / chest / NPC views.

## Cross-overlay (thunk) call graph

32 distinct thunks across ~432 call sites. RNG-heavy — `rng_next` dominates with 95 callsites, consistent with the action-randomization role.

- **22 of 32 thunks** resolve to wroot functions already named in `docs/re/findings/wroot-naming-pass.json`.
- **9 of 32** match informal names from prior overlay passes.
- **1** fully unresolved (`FUN_03e4` at wroot `0x3e4`, single callsite).

## Newly-discovered overlay state assignments (bonus)

Exhaustive state-machine grep across all binaries during this pass revealed:

- `wpops.ovr` dispatches state `0x0c` (the popup / action-queue step that sits between wmele's per-round redraw and wmexe's action execution).
- `wdopt.ovr` dispatches states `0x13` and `0x14` (likely two-stage options menu or save/load dialog — needs its own naming pass to confirm).

Both overlays are still completely unnamed. Naming passes for either would close out the remaining state-machine gaps.

## See also

- [`docs/re/findings/wmexe-naming-pass.json`](findings/wmexe-naming-pass.json) — structured source with per-function evidence.
- [`docs/re/wmele-combat.md`](wmele-combat.md) — sister overlay; combat loop that drives into wmexe each round.
- [`docs/re/wmaze-functions.md`](wmaze-functions.md) — original copy of the 3D wall renderer.
- [`tools/ghidra/scripts/apply_wmexe_names.py`](../../tools/ghidra/scripts/apply_wmexe_names.py) — idempotent replay script (auto-creates the two missed dispatch functions).
