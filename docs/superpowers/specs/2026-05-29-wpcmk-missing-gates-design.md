# wpcmk Missing Validation Gates — design spec

**Date:** 2026-05-29
**Context:** Per the validation-gate survey ([`docs/re/findings/wpcmk-validation-gate-survey.json`](../../re/findings/wpcmk-validation-gate-survey.json)) plus a user-reported skill-train regression, the wpcmk character-creation port is missing 6 engine-side gates. This spec fixes all six.

## Goal

Close the 5 missing/partial gates from the survey, plus the skill-point-untrain bug surfaced during user testing:

1. `bonus-exit-prompt-toggle` — render "PRESS ▶ TO EXIT" in bottomBar row 3 when bonus pool == 0.
2. `dup-name-modal-create` + `dup-name-modal-rename` — show "* CHARACTER ALREADY EXISTS *" modal when the chosen name collides with an existing roster entry; block the commit until dismissed.
3. `bonus-invalid-action-beep` — play SOUND00.SND on rejected key inputs (decrease at floor, increase at cap, confirm with pool > 0, and dup-name in name-input). Gated by a new house rule.
4. `skill-train-exit-allowed-with-points-remaining` — engine permits Enter to exit with leftover skill points; port is stricter. Add a house rule to relax the port to engine-faithful when desired; default remains stricter.
5. `spell-pick-bookmask-filter` — verify whether `spellsInBook` excludes entries 79-81 (HOLY WATER / HELPFOOD / MAGICFOOD) per the engine's per-pillar byte5 sentinel. Add the filter + test if missing; close as no-op if already correct.
6. **`skill-train-untrain` (new — user-reported)** — points added to a skill via LEFT/RIGHT cannot be subtracted; the port is increment-only. Engine allows decrementing a slot (subject to a floor — likely the racial starting value, NOT zero — to be confirmed during implementation). Mirror the bonus-allocator's bidirectional pattern.

## Scope

In scope:

- One new tile-window composer for engine-style modals (`ega/modal-frame.ts`).
- Reducer state extensions: a transient `modalErrorMsgId` field with auto-dismiss semantics; a `skillFloors` snapshot for the untrain floor.
- New reducer events: `MODAL_DISMISS`, `UNTRAIN_SKILL`.
- `findDuplicateName` helper in `roster-store.ts`.
- Two new house rules (`playInvalidActionBeep`, `engineFaithfulSkillExit`) — schema + defaults + UI metadata.
- A thin audio helper `playInvalidActionBeep()` that lazy-loads SOUND00.SND.
- LEFT-key handler in the skill-train screen for bidirectional adjustment.
- Pixel-parity tests where engine fixtures are available; cell-grid diagnostic tests otherwise.

Out of scope:

- Mouse-click handling beyond what's already in the port (engine has 5 mouse buttons in the bonus allocator; we're keyboard-only by design).
- Other audio expansion (in-game sound effects beyond SOUND00).
- Restructuring the creation reducer or screen-flow state machine.
- Backfilling engine fixtures for screens we haven't captured (we may ship one or two gates without pixel parity if no fixture exists — documented per-gate below).

## Engine references

Pulled from the survey + prior findings:

| Gate | Engine routine | Address | Msg ID | Notes |
|------|----------------|---------|--------|-------|
| Bonus exit prompt | `wpcmk_bonus_point_allocator_ui` | wpcmk.ovr 0x35be (pool==0 branch) | 0x456 ("PRESS \x15 TO EXIT") | Rendered via thunk 0xc2db (write_msg) at bottomBar row 3. Gated by `cmp [0x56ac],0; jnz 0x360c`. |
| Dup-name check | `roster_check_name_unique` | wpcmk.ovr 0x5011 | — | Walks PCFILE slots 0..15, byte-exact 2-byte-step compare via `strcmp_2byte_step`. Returns -1 on collision. |
| Dup-name modal | `FUN_505b(msg_id, row, col)` | wpcmk.ovr 0x505b | 0x44e ("* CHARACTER ALREADY EXISTS *") | Called from `wpcmk_create_via_empty_slot` (0x50f2 → modal at 0x51a5) AND `wpcmk_create_via_name_prompt` (0x5337 → modal at 0x53d7). Modal: set cursor → write msg in status-bar window `*0x56ca` → play SOUND00 → `wait_for_key_or_timeout` (param×10 iterations or ENTER). |
| Invalid-action beep | `play_sound(0)` thunk | wroot 0xc546 | — | Engine plays at: bonus decrease at floor, bonus increase at cap or with pool==0, bonus confirm with pool > 0, dup-name detection. |
| Skill-train exit | `wpcmk_skill_training_ui` | wpcmk.ovr (see existing skill-train findings) | — | Engine: ENTER exits unconditionally. Port: blocks until budget==0. |
| Spell-pick filter | Per-pillar entry list build | (verify location) | — | Engine: byte5 of entries 79-81 is a sentinel that excludes them from pickable list. Verify `spellsInBook` in `@wiz6/data`. |
| Skill untrain | `wpcmk_skill_training_ui` | wpcmk.ovr (TBD — locate during implementation) | — | Engine handles LEFT key as decrement (mirror of bonus allocator). Floor value TBD: probably the racial starting value for that skill, NOT 0. Confirm via DOSBox-X step or finding the skill-array init site. |

## File-level changes

### Create

- `packages/viewer/src/pages/roster/creation/ega/modal-frame.ts` — pure composer producing a TileWindow overlay for engine-style error modals. Takes a `MessageDb`, a `msgId`, and overlay coords; returns a TileWindow positioned over the bottomBar status row.
- (No new screen file — the modal renders as an extra TileWindow appended to the underlying screen's window list.)

### Modify

- `packages/data/src/schemas/house-rules.ts` — extend `HouseRulesSchema` with `playInvalidActionBeep` (default TRUE) + `engineFaithfulSkillExit` (default FALSE). Update `STOCK_HOUSE_RULES`, `DEFAULT_HOUSE_RULES`, `HOUSE_RULES_META`.
- `packages/data/src/character-creation/spells-in-book.ts` (or wherever the pillar pick list is built) — IF verification shows entries 79-81 leak, add the byte5 filter + unit test. If already correct, no change.
- `packages/viewer/src/lib/roster-store.ts` — add `findDuplicateName(name: string, excludeId?: string): Character | undefined`. Byte-exact compare on `Character.name`, matching engine's 2-byte-step semantics (since `Character.name` is the same case-sensitive ASCII bytes the engine stores).
- `packages/viewer/src/lib/audio.ts` — add `playInvalidActionBeep()` that lazy-loads `/sounds/sound00.json` on first call, caches the result, and calls `playSnd()` on subsequent invocations. No-op when `playInvalidActionBeep` house rule is FALSE.
- `packages/viewer/src/pages/roster/creation/messages.ts` — add `MSG.bonusExit` = 0x456, `MSG.charAlreadyExists` = 0x44e.
- `packages/viewer/src/pages/roster/creation/state.ts` — reducer changes:
  - Add `modalErrorMsgId?: number` to creation state.
  - Add `skillFloors: number[]` to creation state (snapshot at `skillTrain` entry — see Gate 6).
  - On `NAME_COMMIT` / `RENAME_COMMIT` events: call `findDuplicateName`; if duplicate, set `modalErrorMsgId = 0x44e`, play beep, do NOT advance.
  - On `MODAL_DISMISS`: clear `modalErrorMsgId`.
  - Add a setTimeout-based auto-clear (~5s) to mirror the engine's `wait_for_key_or_timeout`.
  - Bonus allocator rejected actions (decrease at floor, increase at cap or with empty pool, confirm with pool > 0): call `playInvalidActionBeep()`.
  - On screen transition INTO `skillTrain`: populate `skillFloors` from current `draft.skills` (so the snapshot reflects racial/class baseline).
  - Add `UNTRAIN_SKILL { slot: number }` event handler: if `draft.skills[slot] <= skillFloors[slot]`, play invalid-action beep + no-op; else decrement skill and increment `skillBudget`.
  - Skill-train SKILLS_DONE handler: if `engineFaithfulSkillExit` rule is TRUE, drop the `budget == 0` guard.
- `packages/viewer/src/pages/roster/creation/ega/bonus-allocator-frame.ts` (or equivalent composer) — when `state.draft.bonusPool === 0`, write msg 0x456 centered at bottomBar row 3.
- `packages/viewer/src/pages/roster/creation/screens/NameInputScreen.tsx` — on Enter, dispatch `NAME_COMMIT` (the reducer handles the dup-name check + modal). When `state.modalErrorMsgId !== undefined`, render the modal TileWindow as an overlay (`composeModalFrame(...)`).
- `packages/viewer/src/pages/roster/creation/screens/RenameInputScreen.tsx` — same pattern as NameInputScreen, but uses the existing `RENAME_COMMIT` event. Calls `findDuplicateName(name, currentCharacterId)` — `excludeId` lets a character keep its own name.
- `packages/viewer/src/pages/roster/creation/screens/SkillTrainScreen.tsx` — add LEFT-key dispatch of `UNTRAIN_SKILL { slot: cursorSlot }` mirroring the existing RIGHT-key TRAIN_SKILL dispatch.
- `packages/viewer/src/pages/SettingsPage.tsx` — new house rules automatically appear via `HOUSE_RULES_META`; no code changes needed if the page reads from the meta table (verify).

## Reducer state shape

Extend `CreationState`:

```ts
interface CreationState {
  // ...existing fields...
  /** When set, the current screen renders a modal overlay. Cleared on
   *  any key or after ~5s timeout. The value is the msg ID to display. */
  modalErrorMsgId?: number;
  /** Snapshotted skill values at skill-train screen entry. UNTRAIN_SKILL
   *  cannot decrement below this floor (assumed to be racial/class
   *  baseline — confirm during implementation). */
  skillFloors: number[];
}
```

Using a `modalErrorMsgId` (rather than a boolean) leaves room for future modals (roster-full, save-failed) without another state field. Default: undefined.

Reducer events added:

- `MODAL_DISMISS` — clears `modalErrorMsgId`. Fired by any key in the modal-active state OR by the timeout effect.
- `UNTRAIN_SKILL { slot: number }` — decrements `draft.skills[slot]` and increments `draft.skillBudget`, gated by `skillFloors[slot]`. Below-floor attempts play the invalid-action beep and no-op.

The component (NameInputScreen / RenameInputScreen) intercepts key events when `state.modalErrorMsgId !== undefined` and dispatches `MODAL_DISMISS` instead of forwarding to the underlying input.

## Modal composer

`composeModalFrame(view, db) → TileWindow` — single-window overlay matching the engine's `FUN_505b` rendering:

- Cursor positioned at the status-bar window's `(row, col)` = `(6, 2)` per `FUN_505b(0x44e, 6, 2)`.
- Style 0x12 (translates to wfont3 attr 0x03 via the centeredPuts attr-mapping convention).
- Message text from `MessageDb` by ID.
- Window dimensions: cover the status-bar area (the engine reuses `*0x56ca`, the existing bottomBar/status window — but for our port, simpler to emit a dedicated overlay TileWindow at the same screen coords).

Position: screenY = `(20 + 6) * 8` cells, screenX based on the msg's centered position. Exact dimensions confirmed during implementation (read engine save state if needed).

## Audio plumbing

`playInvalidActionBeep()` is the single entry-point for the rejected-action beep. Sites that call it:

- `BONUS_POINT_DECREASE` when `attrs[cursor] === floor`
- `BONUS_POINT_INCREASE` when `attrs[cursor] === 18` OR `bonusPool === 0`
- `BONUS_CONFIRM` when `bonusPool > 0`
- `NAME_COMMIT` / `RENAME_COMMIT` when duplicate detected
- Possibly more sites surfaced during implementation (the survey will help identify any we missed)

Implementation:

```ts
// audio.ts additions
let cachedBeep: PlayableSnd | null = null;
let beepLoading: Promise<PlayableSnd | null> | null = null;

export async function preloadInvalidActionBeep(): Promise<void> {
  if (cachedBeep || beepLoading) return;
  beepLoading = loadSnd('/sounds/sound00.json').then((s) => {
    cachedBeep = s;
    return s;
  }).catch(() => null);
  await beepLoading;
}

export function playInvalidActionBeep(): void {
  if (!getHouseRules().playInvalidActionBeep) return;
  if (cachedBeep) playSnd(cachedBeep);
  // First-call miss: trigger preload; subsequent calls will play.
  if (!beepLoading) void preloadInvalidActionBeep();
}
```

Preload is triggered on the first call rather than module-load (avoids unnecessary work on screens that don't use the beep).

## House rules

Two new entries in `HouseRulesSchema`:

```ts
playInvalidActionBeep: z.boolean(),  // default TRUE (engine-faithful)
engineFaithfulSkillExit: z.boolean(), // default FALSE (port is stricter — UX-friendlier)
```

`STOCK_HOUSE_RULES`:
- `playInvalidActionBeep: true` (engine plays the beep)
- `engineFaithfulSkillExit: true` (engine allows exit with leftover points)

`DEFAULT_HOUSE_RULES`:
- `playInvalidActionBeep: true` (default ON; users who find it annoying can disable)
- `engineFaithfulSkillExit: false` (default OFF; we keep the stricter port UX)

`HOUSE_RULES_META` entries with appropriate labels + descriptions explaining the engine behavior + why each default is what it is.

## Testing strategy

- **Pure unit tests:**
  - `findDuplicateName`: case sensitivity, exclude-id semantics, multiple slots, empty roster.
  - Bonus-allocator composer: row-3 prompt appears iff `bonusPool === 0`.
  - Modal composer: produces a TileWindow with the correct char/attr cells for msg 0x44e at the correct screen coords.
  - Spell-pick filter: if applicable, entries 79-81 excluded from picker lists.
  - Audio helper: `playInvalidActionBeep` is a no-op when house rule is FALSE; otherwise schedules a play.

- **Reducer tests** (`state.test.ts`):
  - `NAME_COMMIT` with duplicate → sets `modalErrorMsgId = 0x44e`, does NOT advance screen.
  - `RENAME_COMMIT` with duplicate → same; `RENAME_COMMIT` with same-as-self (excludeId) → succeeds.
  - `MODAL_DISMISS` clears the modal and returns to name-input screen.
  - Bonus-allocator: `engineFaithfulSkillExit=true` allows SKILLS_DONE with budget > 0; default blocks.
  - Skill-train entry snapshots `skillFloors` from the entering `draft.skills`.
  - `UNTRAIN_SKILL` below floor is a no-op (returns identical state); above floor decrements skill and increments budget.
  - Round-trip `TRAIN_SKILL` then `UNTRAIN_SKILL` on the same slot returns to the floor (state byte-identical to pre-train).

- **Pixel parity** (where fixtures exist):
  - `creation-bonus-allocator-pool-zero` — capture save 2 as a fixture, assert pool-0 prompt renders pixel-exact.
  - Dup-name modal — ship without pixel-parity for now (no engine fixture); document as TODO.

- **Cell-grid diagnostic** (`.diagnostic.test.ts`):
  - Modal overlay cells match expected `(char, attr)` content if we have a save with the modal visible.

- **Manual smoke** (`pnpm dev:viewer`):
  - Bonus allocator: drain pool → see "PRESS ▶ TO EXIT" appear.
  - Name input: type "NATHAN" (which exists in roster), commit → modal shows + dismiss restores input.
  - Rename: pick a character, type another character's name, commit → modal.
  - Toggle `playInvalidActionBeep` OFF in settings → no beep.
  - Toggle `engineFaithfulSkillExit` ON → can exit skill-train with leftover budget.
  - Skill-train: train STR up several levels, then LEFT to untrain back down — budget restored each step. Attempting to LEFT past the baseline floor → no-op (beep if rule enabled).

## Out-of-scope items spawned by this work

Filed as TODOs at planning time:

- Backfill engine fixture for the dup-name modal (would unlock pixel-parity for this gate).
- Survey *other* overlays' beep behavior (combat-action rejections, dungeon-action rejections — likely similar pattern).
- Audit other places we should check uniqueness (Save game slot names? Active-party member names? Probably not — names already de-facto unique via roster — but worth a sweep.)

## Open questions

- **Modal timeout duration.** Engine uses ~param×10 iterations of a busy-wait poll; on a 486DX/33 that's roughly a few seconds. We'll pick 5000ms as a reasonable approximation; finalize during implementation.
- **Modal dismissal key.** Engine accepts ENTER specifically (per `wait_for_key_or_timeout` pattern). Port should accept ENTER or ESCAPE; pick during implementation.
- **Spell-pick byte5 verification.** Need to actually inspect `spellsInBook` (or whatever builds the picker lists) and trace the byte5 sentinel from the scenario.dbs spell-table data. If `@wiz6/data` already handles it, the gate is a no-op.
- **Skill-train floor model.** Floor probably = racial/class baseline (snapshotted at screen entry), not 0. To confirm: locate the LEFT-key handler in `wpcmk_skill_training_ui`, see what it compares the slot value against, and verify behavior in DOSBox-X by attempting to untrain a slot below its baseline value. If the engine actually allows untraining to 0, simplify by removing `skillFloors` and using a literal 0 floor.
- **Gate 4 (skill-train exit) — does the port actually block?** The reducer's `SKILLS_DONE` handler in `state.ts:857` currently has no budget guard — its inline comment even says "engine allows this." The block (if any) must live in the `SkillTrainScreen.tsx` key handler — likely only dispatching `SKILLS_DONE` when budget==0. Confirm during Plan stage. If the screen-level gate is the only blocker, the house rule simply toggles whether the screen forwards Enter to `SKILLS_DONE` with budget > 0.
