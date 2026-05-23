# wpcmk.ovr — Named Functions (Character Creation Overlay)

Human-readable index of function names applied to `wpcmk.ovr` in the Ghidra project at `tools/ghidra/wiz6.gpr`. Generated from the comprehensive naming pass on the player-character-creation overlay; the structured source with per-function evidence is `docs/re/findings/wpcmk-naming-pass.json`.

**Status:** 66 of 76 functions named (87% coverage).

## Structural overview — wpcmk is a library, not a state

Unlike wmaze / wmele / winit, **wpcmk does not own any game-state value**. Its dispatch entry at file offset `0x10` (after a 16-byte header — a third overlay-header size) is a no-op stub: it writes `*0x363a = 4` and returns. The character-creation UI is invoked as a **cross-overlay call** from `wbase.ovr`'s main-menu state 4 (specifically slot 5 — "Make a character" / training option). That slot's wbase handler reaches into wpcmk's top-level subroutines and runs the full creation flow synchronously, then returns to the main menu.

This makes wpcmk a *callable library* rather than a state handler. Header-size families so far:

| Overlay     | Header bytes | Dispatch at | Pattern                            |
| ----------- | ------------ | ----------- | ---------------------------------- |
| winit.ovr   | 12           | 0x0c        | State handler; writes `*0x363a` directly |
| wbase.ovr   | 14           | 0x0e        | State handler; uses `*0x4fce` deferred-transition cache |
| wmele.ovr   | 14           | 0x0e        | State handler; same `*0x4fce` pattern |
| **wpcmk.ovr** | **16**     | **0x10**    | **Library; dispatch stub is a no-op that returns to state 4** |

## Subsystem prefixes

| Prefix                  | Subsystem                                                          |
| ----------------------- | ------------------------------------------------------------------ |
| `creation_*`            | Master orchestrator + flow stages (init, finalize, commit)         |
| `stat_roller_*`         | **Attribute roll, bonus-point roll**, personality roll, age/HP    |
| `bonus_allocator_*`     | UI loop where player distributes bonus points across attributes    |
| `class_qualification_*` | Required-attribute checks; raises stats from pool to meet thresholds |
| `race_*` / `class_*` / `alignment_*` | Race/class/alignment menu pickers, race-specific dispatch tables |
| `attribute_*`           | Per-attribute stat panel render, six-attr label table              |
| `portrait_*`            | Portrait file loader + picker loop                                 |
| `roster_*`              | Disk I/O, slot picker, occupancy check, find-empty-slot            |
| `skill_train_*`         | 4-pillar (MAGIC/FAITH/PHYSICAL/MENTAL) → 82-entry skill table mapper |
| `creation_ui_*`         | Window setup, char-sheet redraw, welcome animation                 |
| `ui_widget_*`           | Reused widgets (menu picker, text input editor, putchar wrappers)  |
| `data_util_*`           | strcmp variants, small helpers                                     |

## The infamous bonus-point roller (`stat_roller_bonus`)

Located at file offset `0x4e81` (inside `creation_master_flow` at `0x4e47`). This is the algorithm players have been re-rolling for hours since 1990:

```
bonus = 5 + rng(6)             ;  5..10 uniform
if rng(20) == 0:  bonus += 8   ;  1/20 chance
if rng(20) == 0:  bonus += 8   ;  another independent 1/20 chance
```

stored at DGROUP `*0x56ac`.

**Distribution** (empirically verified over 10⁷ trials, matches the theoretical math exactly):

| Outcome                  | Range         | Probability     |
| ------------------------ | ------------- | --------------- |
| No bonus (most common)   | 5..10 uniform | (19/20)² = **90.25%** |
| One +8 bonus             | 13..18 uniform | 2·(1/20)·(19/20) = **9.50%** |
| Both +8 bonuses (jackpot)| 21..26 uniform | (1/20)² = **0.25%** |

**P(bonus ≥ 19) = 1/400 ≈ 0.25%** — i.e. ~400 re-roll attempts on average to qualify for the elite classes (Samurai / Lord / Ninja / Bishop). And Wiz6 wants a 6-character party. Combined with raw-attribute prerequisites, this is the math behind the famously cursed grind.

**Note the gaps**: values **11, 12, 19, 20** are *unreachable* due to the +8 quantization sitting on top of a 5..10 base. The distribution has dead zones.

**Hidden override:** a debug/cheat flag check at file `0x4eb6` — `if *0x56ce == 1: bonus = 21`. The clearing-write for `*0x56ce` exists in wpcmk; the setting site is elsewhere (probably a developer cheat code we haven't traced).

### Raw bytes (verified)

```asm
4e81:  B8 06 00 50 E8 F6 75 59 05 05 00 A3 AC 56
       ; mov ax, 6; push; call rng_thunk; pop cx; add ax, 5; mov [0x56ac], ax

4e8f:  B8 14 00 50 E8 E8 75 59 85 C0 75 05 83 06 AC 56 08
       ; mov ax, 20; push; call rng_thunk; pop cx; test ax; jnz skip
       ; add word [0x56ac], 8

4ea4..0x4eb5:  identical second-chance block (independent 1/20 +8 check)

4eb6:  83 3E CE 56 01 75 06 C7 06 AC 56 15 00
       ; cmp word [0x56ce], 1; jnz skip; mov word [0x56ac], 21  (debug override)
```

## Class qualification (`class_qualification_check_and_bump`)

At file `0x2cae`. Per-class requirement strings use ASCII 'A'-relative encoding: character `'A'` = 8, `'B'` = 9, ..., `'O'` = 22. To check whether the rolled stats qualify for a class, the routine iterates the requirement string and either confirms the stat already meets the threshold or drains the bonus pool to bump it up. If the pool can't cover the gap, the class is ineligible.

This is how 19+ bonus points unlocks elite classes: it lets you cover larger required-vs-rolled deltas.

## The 8-attribute layout

At DGROUP `0x559c..0x55a3`:

| Offset | Attribute                        |
| ------ | -------------------------------- |
| +0     | STR                              |
| +1     | INT                              |
| +2     | PIE                              |
| +3     | VIT                              |
| +4     | DEX                              |
| +5     | SPD                              |
| +6     | Personality (or Karma)           |
| +7     | Karma (or Personality)           |

The last two are derived/personality stats; the exact name assignment (which byte is Karma vs Personality) is unverified — both are bumped by the personality reroll loop at `0x3837`.

## Other key features

- **Personality reroll loop** at `0x3837`: a "click to keep watching dice fall" idle loop. Rolls into `*0x55a3` each iteration; exits on mouse-click or RETURN keypress.
- **Bonus-point allocator UI** at `0x3405`: 4-way nav (←/→ for +/-, ↑/↓ for attribute selection, key 5 to confirm). Each attribute caps at 18; confirm gated on `pool == 0`.
- **Portrait system** at `0x4a9a`: 4 video-mode-keyed filename templates × 3 files × 14 portraits each = 42 portraits total.
- **Roster I/O** at `0x001b`: read/write fixed-size records to disk via `*0x4fee` template pointer. `*0x4fd2` = max slots, `*0x4fd8[i]` = occupancy. Multi-page scrollable picker at `0x56a0`.
- **Skill train** at `0x28d4`: maps the 4 pillars (MAGIC/FAITH/PHYSICAL/MENTAL) to 82-entry shared wroot DGROUP skill table at runtime `0x00de`.
- **Spell-school init** at `0x3e51`: 14 schools × per-class allocation. Matches the Wiz6 "Realms" architecture.

## Cross-overlay (thunk) call graph

41 distinct thunks across 213 call sites:

- **20 of 41 thunks** resolve to functions already named in `docs/re/findings/wroot-naming-pass.json`.
- **21 of 41 thunks** resolve to functions still named `FUN_xxxx` in wroot. **11** of those have informal names from prior wmaze/wmele/wbase passes — `rng_next`, `load_msg_into_buf`, `play_sound_entry`, `getbit_test`, etc. Promoting those into the wroot naming pass would lift wpcmk's thunk-named ratio from 20/41 to 31/41.

Full per-thunk listing in `findings/wpcmk-naming-pass.json` → `thunk_usage`.

## Remaining unnamed functions

10 of 76 still labeled `FUN_xxxx`. They cluster around small helpers (≤30 bytes), a few race-table dispatchers we couldn't disambiguate without dynamic traces, and the per-portrait frame helpers.

See `unresolved` + `next_steps` in `docs/re/findings/wpcmk-naming-pass.json`.

## See also

- [`docs/re/findings/wpcmk-naming-pass.json`](findings/wpcmk-naming-pass.json) — structured source with per-function evidence.
- [`docs/re/wbase-main-menu.md`](wbase-main-menu.md) — main-menu state 4; main-menu slot 5 is the entry point into wpcmk's flow.
- [`docs/re/wmele-combat.md`](wmele-combat.md) — sister overlay; same naming-pass methodology, different state-handler pattern.
- [`tools/ghidra/scripts/apply_wpcmk_names.py`](../../tools/ghidra/scripts/apply_wpcmk_names.py) — idempotent replay script.
