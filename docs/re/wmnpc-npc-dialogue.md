# wmnpc.ovr — Named Functions (NPC Dialogue Engine)

Human-readable index of function names applied to `wmnpc.ovr` in the Ghidra project at `tools/ghidra/wiz6.gpr`. Generated from the comprehensive naming pass on the NPC dialogue / encounter overlay; structured source with per-function evidence is `docs/re/findings/wmnpc-naming-pass.json`.

**Status:** 116 of 121 functions named (96% coverage).

## Structural overview — wmnpc is a callable library (like wpcmk)

wmnpc dispatches **no** `*0x363a` state values. Confirmed by exhaustive byte-grep: zero `83 3e 3a 36` (cmp word [0x363a]) instructions anywhere in the overlay. wmnpc is invoked by **wmaze** when the party initiates an NPC encounter, runs synchronously, and returns control to wmaze when the player leaves the conversation (or combat starts).

This is the second library-overlay pattern in Wiz6, alongside `wpcmk.ovr` (character creation, called from wbase main menu). Both libraries have entry points that other overlays call directly through the BSS function-pointer thunks.

Five external entry points:

| File offset | Name                       | Purpose                                                |
| ----------- | -------------------------- | ------------------------------------------------------ |
| `0x088b`    | `wmnpc_load_npc_sprite`    | Huffman-load MON*.PIC for the NPC portrait              |
| `0x0fa4`    | `wmnpc_load_npc_record`    | Load NPC stat data + dialogue keyword refs              |
| `0x737a`    | `wmnpc_encounter_init`     | Open dialogue UI, init reaction state. Writes `*0x363a = 5` to keep wmaze active in the background |
| `0x749c`    | `wmnpc_encounter_cleanup`  | Close UI; restore wmaze state                           |
| `0x6de0`    | `wmnpc_dialogue_main_loop` | The main TALK/GIVE/TAKE/ATTACK loop                     |

Internal write `*0x363a = 10` from within `wmnpc_charm_npc_attempt` is how a critical-failed charm transitions out of dialogue into combat (state 10 = `wmele.ovr` init-combat).

## Subsystem prefixes

| Prefix                | Subsystem |
| --------------------- | --------- |
| `wmnpc_encounter_*`   | Init / cleanup; reaction-state setup |
| `wmnpc_dialogue_*`    | Main loop + trigger-check |
| `wmnpc_keyword_*`     | The synonym-expansion parser (see below) |
| `wmnpc_load_*`        | NPC sprite + record + keyword-table loaders |
| `wmnpc_render_3d_*`   | Embedded copy of wmaze's 3D wall rendering |
| `wmnpc_render_sprite_*` | NPC portrait composition into the dialogue panel |
| `wmnpc_charm_*`       | Charisma + skill + level → reaction roll |
| `wmnpc_action_*`      | TALK / GIVE / TAKE / ATTACK / SHOW / READ handlers |
| `wmnpc_inventory_*`   | Item transfer between party + NPC |
| `ui_widget_*`         | Reused widgets (keyword picker, response renderer) |

## The dialogue keyword parser (`wmnpc_keyword_normalize` at 0x7d5b)

Wiz6's NPC dialogue parser is more sophisticated than the casual player assumes. A **38-entry × 50-byte** keyword table lives at runtime BSS `0x6316`, populated from `MSG.DBS` by `wmnpc_load_keyword_tables` at `0x8d6f`. Each entry is a slash-delimited list of synonyms ending in a canonical form:

```
"GET/TAKE/GRAB/PICK UP/TAKE"
"HELLO/HI/GREETINGS/HELLO"
"DRAGON/WYRM/SERPENT/DRAGON"
(... 35 more)
```

When the player types a word, the parser iterates through every entry, extracts each slash-delimited token, and `strncmp`s against the input. On hit, it copies the *last* token of the entry over the input. So GET / TAKE / GRAB all normalize to TAKE before the dialogue logic looks anything up.

What this means in practice:

- **Synonyms work.** Players don't need to type the exact NPC keyword.
- **Typos do not.** "TAEK" never matches anything — the parser handles canonical alternatives, not edit-distance.
- **The keyword space is bounded.** 38 entries split between verb table (`*0x6a9e` count) and noun table (`*0x60a8` count). All dialogue across all NPCs draws from this finite vocabulary.

## The cumulative-gold bribery accumulator (`wmnpc_dialogue_trigger_check` at 0x3a12)

NPCs **remember** how much gold you've given them across multiple GIVE transactions within an encounter. A 32-bit running total lives at `*0x52cc` (low) / `*0x52ce` (high). Every GIVE-gold action runs a wide `adc` (add-with-carry) into this pair.

A **7-entry threshold table** at `*0x5156` holds gold values. Each time the cumulative-gold counter crosses a threshold, a previously-hidden dialogue option unlocks via a "type-2 trigger." The accumulator is zeroed by `wmnpc_encounter_init`, so the memory is **per-encounter**, not lifetime — you can't drip-feed the same NPC across multiple visits to slowly unlock secrets.

But within one encounter, **multiple small gifts compound into one big bribe.** Players who intuited this and tested it discovered it; players who didn't never saw the unlocked option. The mechanic was never documented.

## The save-scum-resistant charm formula (`wmnpc_charm_npc_attempt` at 0x6ae3)

The base charm score:

```
score = (level - npc_threshold) * 5
      + skill[18] / 2          ; persuasion skill
      + class_bonus
      + CHA
      + reaction / 4
      - 10
score = clamp(score, 0, 95)
```

So far so D&D. The interesting bit is the roll:

```
penalty = *0x5892                ; cumulative penalty for this encounter
penalty += rng(10) + 5           ; +5..14 per attempt, compounding
roll = rng(100) + penalty
*0x5892 = penalty                ; persist back
```

**Each charm attempt in the same encounter is ~10 harder than the previous one.** A player who botches one charm and reloads the save to try again starts from where they left off — the penalty is in volatile state but doesn't reset until `wmnpc_encounter_init` runs again (which happens on a fresh encounter, not on save-load). So save-scumming a charm roll only helps if you can also re-enter the encounter, which most NPCs don't allow.

There's a worse outcome too. The **critical-failure** branch fires when `2 * roll < score` — a hard miss, not just an ordinary failure:

- `reaction -= rng(25) + 25` — the NPC's permanent reaction drops by 25-49 points
- `*0x363a = 10` — **force a transition into combat**

A botched charm can turn a previously-peaceful NPC permanently hostile *and* drop you into combat against them in a single roll. The combination of these two consequences is the engine's most punishing dialogue branch.

## The duplicated 3D wall renderer (`wmnpc_render_3d_walls` at 0xa8ca)

When the dialogue window is open, the NPC stands "in front of" the player in the dungeon corridor. The corridor view stays visible behind the dialogue. To draw that view, wmnpc ships its **own copy** of wmaze's 3D wall-rendering code — 2192 bytes of it.

This copy:

- Reads the same wall-bitmaps at `*0x4faa + 0x43a` and `+0x49a`.
- Applies the same facing-rotation math via the same helper signatures.
- Uses **identical hardcoded pixel coordinates** (`0x48`, `0xf8`, `0x7a`, `0x82`, and others) as wmaze's renderer.

The constants aren't shared via header / data table. If wmaze's wall constants ever got tweaked without an exactly-matching tweak in wmnpc, the encounter view would render slightly different walls than the gameplay view — a continuity glitch in the visual frame.

The original Sir-Tech developers almost certainly noticed this maintenance hazard and never refactored away from it. Our port can do better — share the constants from a single source in `@wiz6/parser` so the duplication can't drift.

## Cross-overlay (thunk) call graph

56 distinct thunks across ~320 call sites:

- **25 of 56 thunks** resolve to wroot functions already named in `docs/re/findings/wroot-naming-pass.json`.
- **18 of 56 thunks** match informal names from prior overlay passes (rng_next, play_sound, ui_window_*, strcpy, etc.).
- **13 of 56 thunks** remain `FUN_xxxx` in wroot — mostly obscure helpers (FUN_3f1e 32-bit multiply, FUN_0a42, FUN_36a0/3694 sprite-blit family).

Notable: thunk `0xee85` (`huffman_load_and_decompress`) is called once from `wmnpc_load_npc_sprite`. NPC portraits use the same MON*.PIC Huffman format as monster sprites — they're literally the same on disk; the only difference is which record the engine loads them under.

Full per-thunk listing in `findings/wmnpc-naming-pass.json` § `thunk_usage`.

## Remaining unnamed functions

5 of 121 still labeled `FUN_xxxx`. All are 45-50 byte 3D wall-render micro-stubs in the `0xa700` range, called only from `wmnpc_render_3d_walls`. Effectively inlined helpers; naming them individually requires a dynamic trace correlating each to a visible wall segment.

See `unresolved` + `next_steps` in `docs/re/findings/wmnpc-naming-pass.json`.

## See also

- [`docs/re/findings/wmnpc-naming-pass.json`](findings/wmnpc-naming-pass.json) — structured source with per-function evidence.
- [`docs/re/wmaze-functions.md`](wmaze-functions.md) — sister overlay; wmaze invokes wmnpc on NPC encounters; the duplicated 3D wall renderer here shadows wmaze's original.
- [`docs/re/wmele-combat.md`](wmele-combat.md) — wmnpc transitions to wmele state 0x0a via `*0x363a = 10` on critical charm failure.
- [`docs/re/wpcmk-character-creation.md`](wpcmk-character-creation.md) — sister library overlay (different pattern — wpcmk has a state stub that no-ops; wmnpc has no `*0x363a` references at all).
- [`tools/ghidra/scripts/apply_wmnpc_names.py`](../../tools/ghidra/scripts/apply_wmnpc_names.py) — idempotent replay script.
