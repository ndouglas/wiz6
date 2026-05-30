/**
 * wpcmk creation-flow state machine
 *
 * Authoritative spec: docs/re/wpcmk-screens.md §1
 *
 * ## Screen sequence (17 steps, 0-indexed per wpcmk-screens.md)
 *
 *  00 name-entry (pre)     — interactive
 *  01 init                 — non-interactive (immediate on name confirm)
 *  02 race                 — interactive
 *  03 sex                  — interactive
 *  04 bonus-roll           — non-interactive (rollBonus fires here; immediate after sex)
 *  05 class                — interactive (qualification-gated)
 *  06 bonus-allocator      — interactive (must spend full pool)
 *  07 derived-stats        — non-interactive (computeDerivedStats fires here)
 *  08 personality          — interactive (karma roll fires on ACCEPT_PERSONALITY)
 *  09 skill-init           — non-interactive (immediate after personality)
 *  10 portrait             — interactive
 *  11 starter-items        — non-interactive (immediate after portrait)
 *  12 char-sheet-redraw    — non-interactive (immediate after starter-items)
 *  13 skill-train          — interactive (CONDITIONAL: only if skillBudget > 0)
 *  14 spell-pick           — interactive (CONDITIONAL: only if classIsCaster)
 *  15 confirm              — interactive (KEEP / DISCARD)
 *  16 save/committing      — non-interactive (commit; caller dispatches COMMIT_DONE when done)
 *
 * ## Non-interactive roll placement (per §1 transitions table):
 *  - bonus-roll  → fires when transitioning OUT of sex (entering class screen)
 *  - derived-stats → fires when transitioning OUT of bonus-allocator (entering personality)
 *  - karma → fires when transitioning OUT of personality (entering skill-init/portrait)
 *  - skill-init → fires immediately after personality (no RNG; combat-speed mods)
 *  - skill-budget roll → fires when transitioning OUT of bonus-allocator (entering personality)
 *    RATIONALE: Both class+attrs are finalized at ALLOC_CONFIRM time. rollSkillBudget requires
 *    class + attributes, both available by this point. Firing here (not at char-sheet) lets tests
 *    inject a zero budget before the portrait screen. §5 says skill pool is rolled by
 *    `skill_pool_roll_and_class_adjust` (0x4222) — the exact call site in the orchestrator is
 *    after derived-stats; we fire it here alongside derived-stats for simplicity. The result
 *    (stored at DGROUP 0x5618) is checked at screen-13 entry.
 *  - starter-items → fires when transitioning OUT of portrait (no RNG modeled here)
 *  - char-sheet-redraw → fires immediately after starter-items (no RNG)
 *
 * ## Page contract for committing → COMMIT_DONE:
 *  The reducer transitions to 'committing' on CONFIRM{keep:true}. The page is responsible
 *  for calling buildCharacterFromDraft + addCharacter (I/O), then dispatching COMMIT_DONE
 *  to signal completion. The reducer responds to COMMIT_DONE by resetting the draft and
 *  returning to 'characterMenu' so the user can create another character.
 *  The page should watch for 'exit' (from MENU_EXIT) and navigate to the castle/MASTER OPTIONS.
 *
 * NOTE for E5 (CreationPage redesign):
 *  - 'cancelled' is no longer a navigate-away terminal (it returns to characterMenu).
 *  - 'exit' is the only terminal that leaves to the castle (/castle or /roster equivalent).
 *  - 'committing' signals page to do I/O; page dispatches COMMIT_DONE when done.
 *  - 'done' is removed; COMMIT_DONE → characterMenu replaces the committing→done→navigate path.
 */

import {
  WichmannHill,
  rollBonus,
  MAX_BONUS_POINTS,
  computeDerivedStats,
  rollKarmaWith,
  rollSkillBudget,
  applyClassSkillGrants,
  getRaceBaseStats,
  classOffered,
  getClassRequirements,
  classIsCaster,
} from '@wiz6/data';

// ---------------------------------------------------------------------------
// ScreenId — logical screens the reducer can be in
// ---------------------------------------------------------------------------

/**
 * Logical screen identifiers for the creation state machine.
 *
 * Non-interactive engine steps (init, bonus-roll, derived-stats, skill-init,
 * starter-items, char-sheet-redraw) are collapsed into their adjacent interactive
 * transitions — the reducer fires their logic automatically and advances state.
 * They do not appear as resting ScreenIds.
 *
 * ## Flow entry and exit:
 *  - 'characterMenu' is the ENTRY point. The user sees the character roster menu
 *    with options: Create, Review, Delete, Rename, Portrait, Exit.
 *  - 'exit' is the only TERMINAL that navigates away to the castle (MASTER OPTIONS).
 *    The page watches for 'exit' and calls navigate('/castle') or equivalent.
 *  - All other "done" paths return to 'characterMenu' (create another, discard, cancel).
 */
export type ScreenId =
  | 'characterMenu'  // entry: character roster menu (Create / Review / Delete / Rename / Portrait / Exit)
  | 'name'           // screen-00-pre-entry: name input
  | 'race'           // screen-02-race: pick race (11 options)
  | 'sex'            // screen-03-sex: pick MALE/FEMALE
  | 'class'          // screen-05-class: pick class (qualification-gated)
  | 'bonusAllocator' // screen-06-bonus-allocator: distribute bonus pool
  | 'personality'    // screen-08-personality: karma roll loop (RETURN to accept)
  | 'portrait'       // screen-10-portrait: pick portrait (0..41)
  | 'skillTrain'     // screen-13-skill-training (conditional: skillBudget > 0)
  | 'spellPick'      // screen-14-spell-picking (conditional: classIsCaster)
  | 'reviewPicker'   // REVIEW PC: pick a roster character to review
  | 'review'         // REVIEW PC: render the selected character (read-only)
  | 'deletePicker'   // DELETE PC: pick a roster character to delete
  | 'deleteConfirm'  // DELETE PC: confirm before deletion (NO default-selected)
  | 'renamePicker'   // RENAME PC: pick a roster character to rename
  | 'renameInput'    // RENAME PC: type a new name for the selected character
  | 'portraitPicker' // PORTRAIT PC: pick a roster character to re-portrait
  | 'portraitChange' // PORTRAIT PC: cycle portraits for the selected character
  | 'portraitDone'   // PORTRAIT PC: post-confirm preview ("PRESS ▶ TO EXIT")
  | 'confirm'        // screen-15-confirm: KEEP or DISCARD
  | 'committing'     // screen-16-save: page performs I/O then dispatches COMMIT_DONE
  | 'cancelled'      // internal alias — folds back to characterMenu (not a navigate-away terminal)
  | 'exit'           // terminal: leave to castle/MASTER OPTIONS (only 'exit' navigates away)
  | 'done';          // kept for backward compat (CreationPage currently watches for this; E5 removes it)

// ---------------------------------------------------------------------------
// CreationState
// ---------------------------------------------------------------------------

/** Character draft accumulated across creation screens. */
export interface DraftState {
  name: string;
  race: number | null;       // 0..10
  sex: number | null;        // 0=Male, 1=Female (record +0x1a1)
  class: number | null;      // 0..13
  attributes: {
    str: number;
    int: number;
    pie: number;
    vit: number;
    dex: number;
    spd: number;
    per: number;
    kar: number;  // rolled at personality screen
  };
  bonusPool: number;         // remaining points to allocate (5..26 rolled at sex→class transition)
  skillBudget: number;       // remaining skill points (rolled at char-sheet→conditional transition)
  skills: number[];          // 30-element array, skill slot values
  portrait: number;          // 0..41
  spellPicks: number[];      // entry indices chosen at spell-pick screen
  derived: Partial<{
    /** Age in DAYS — divide by 365 for the displayed value. Engine *0x5478. */
    age: number;
    /**
     * Secondary age counter (purpose unverified; engine *0x5496 16-bit).
     * Observed = 0 pre-derived, = 1 post-derived/skill-init. Displayed at
     * char-sheet row 3 col 5..7 attr 0xc.
     */
    secondAge: number;
    hpInitial: number;
    stamina: number;
    encumbranceMin: number;
    encumbranceMax: number;
    /** Max carrying capacity (record +0x22). Previously mislabeled goldInitial. */
    carryCapacityMax: number;
    level: number;
    xp: number;
  }>;
}

/** Full creation state carried through the reducer. */
export interface CreationState {
  screen: ScreenId;
  rng: WichmannHill;  // mutable; advancing it is intentional (deterministic for fixed seed)
  draft: DraftState;
  /** Cursor for attribute selection in bonus allocator (0..6 → STR..PER). */
  cursor: number;
  /** Per-session undo counters for the bonus allocator (7 values, one per attr). */
  scratch: Record<string, unknown>;
  /**
   * House rule (read once at creation start): when true, the bonus-roll step
   * pins the pool to MAX_BONUS_POINTS instead of the random roll — skipping the
   * elite-class grind. See HOUSE_RULES_META.pinMaxBonusRoll.
   */
  pinMaxBonusRoll: boolean;
  /**
   * Roster index being reviewed (for `screen === 'review'`). Set by PICK_REVIEW
   * and cleared on EXIT_REVIEW. Null on all non-review screens.
   */
  rosterIndex: number | null;
  /**
   * Snapshotted skill values at skillTrain screen entry. `UNTRAIN_SKILL`
   * cannot decrement a slot below `skillFloors[slot]` — the floor is the
   * baseline the player walked in with (race/class init + any prior
   * skill-init grants). Empty (zeroed) on non-skillTrain screens.
   */
  skillFloors: number[];
  /**
   * When set, the active screen renders an engine-style error-modal overlay.
   * Value is the msg.dbs id to display (e.g. 0x044e = "* CHARACTER ALREADY
   * EXISTS *"). Cleared on `MODAL_DISMISS`.
   */
  modalErrorMsgId?: number;
}

// ---------------------------------------------------------------------------
// CreationEvent — all events the reducer handles
// ---------------------------------------------------------------------------

export type CreationEvent =
  | { type: 'MENU_CREATE' }                // characterMenu: begin new character creation (resets draft → name)
  | { type: 'MENU_EXIT' }                  // characterMenu: leave to castle (→ exit terminal)
  | { type: 'MENU_REVIEW' }                // characterMenu: review character (→ reviewPicker if roster non-empty)
  | { type: 'PICK_REVIEW'; index: number } // reviewPicker: selected roster index → review screen
  | { type: 'EXIT_REVIEW' }                // review: Enter pressed → back to characterMenu
  | { type: 'CANCEL_REVIEW' }              // reviewPicker: ESC / CANCEL → back to characterMenu
  | { type: 'PICK_DELETE'; index: number } // deletePicker: selected roster index → deleteConfirm
  | { type: 'CONFIRM_DELETE'; delete: boolean } // deleteConfirm: YES=delete / NO=cancel; either way → characterMenu
  | { type: 'CANCEL_DELETE' }              // deletePicker / deleteConfirm: back to characterMenu without deleting
  | { type: 'PICK_RENAME'; index: number } // renamePicker: selected roster index → renameInput
  | { type: 'CONFIRM_RENAME'; name: string } // renameInput: submit a non-empty new name → characterMenu
  | { type: 'CANCEL_RENAME' }              // renamePicker / renameInput: back to characterMenu without renaming
  | { type: 'PICK_PORTRAIT_FOR'; index: number } // portraitPicker: selected roster index → portraitChange
  | { type: 'CONFIRM_PORTRAIT_CHANGE' }    // portraitChange: portrait actually changed → portraitDone (preview)
  | { type: 'EXIT_PORTRAIT_CHANGE' }       // portraitDone: Enter → characterMenu
  | { type: 'CANCEL_PORTRAIT_CHANGE' }     // portraitPicker / portraitChange: ESC or unchanged → characterMenu
  | { type: 'MENU_DELETE' }               // characterMenu: delete character (STUB — no-op, future work)
  | { type: 'MENU_RENAME' }               // characterMenu: rename character (STUB — no-op, future work)
  | { type: 'MENU_PORTRAIT' }             // characterMenu: change portrait (STUB — no-op, future work)
  | { type: 'SET_NAME'; name: string }    // screen-00: confirm name (empty → no-op; non-empty → init+race)
  | { type: 'PICK_RACE'; index: number }  // screen-02: choose race 0..10
  | { type: 'PICK_SEX'; index: number }   // screen-03: choose sex 0..1
  | { type: 'PICK_CLASS'; index: number } // screen-05: choose class 0..13 (must be qualified)
  | { type: 'ALLOC_ADJUST'; attr: number; delta: number }  // screen-06: +1 or -1 to attr 0..6
  | { type: 'ALLOC_CONFIRM' }             // screen-06: confirm allocation (only if pool==0)
  | { type: 'ACCEPT_PERSONALITY' }        // screen-08: player accepts karma roll
  | { type: 'PICK_PORTRAIT'; index: number }  // screen-10: confirm portrait 0..41
  | { type: 'TRAIN_SKILL'; slot: number } // screen-13: spend 1 skill point on slot
  | { type: 'UNTRAIN_SKILL'; slot: number }   // screen-13: refund 1 skill point from slot (floor-gated)
  | { type: 'SKILLS_DONE' }              // screen-13: player done (budget exhausted or explicit)
  | { type: 'SHOW_DUP_NAME_MODAL' }            // any screen: open the dup-name modal
  | { type: 'MODAL_DISMISS' }                 // any screen: dismiss modalErrorMsgId
  | { type: 'PICK_SPELL'; entry: number } // screen-14: select a spell entry index
  | { type: 'SPELLS_DONE' }             // screen-14: player done with spell picks
  | { type: 'CONFIRM'; keep: boolean }   // screen-15: KEEP (true) or DISCARD (false)
  | { type: 'COMMIT_DONE' }             // screen-16: page has finished I/O; return to characterMenu
  | { type: 'CANCEL' };                  // any screen: abandon creation (return to characterMenu)

// ---------------------------------------------------------------------------
// initialCreationState
// ---------------------------------------------------------------------------

/** Initial zero-skill array: 30 slots, all 0. */
function zeroSkills(): number[] {
  return new Array(30).fill(0) as number[];
}

/**
 * Returns a fresh blank DraftState. Used by MENU_CREATE and CANCEL to reset
 * the draft when returning to the character menu.
 *
 * Exported so tests can verify the shape of a reset draft.
 */
export function blankDraft(): DraftState {
  return {
    name: '',
    race: null,
    sex: null,
    class: null,
    attributes: { str: 0, int: 0, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0 },
    // -1 = bonus not yet rolled (mirrors the engine's *0x56ac sentinel). fireBonus
    // sets it 0..26 at sex→class. The char-sheet BONUS row shows only when >= 0,
    // so it's hidden on race/sex but shown (even "BONUS 0") from the class screen on.
    bonusPool: -1,
    skillBudget: 0,
    skills: zeroSkills(),
    portrait: 0,
    spellPicks: [],
    derived: {},
  };
}

/**
 * Create the initial creation state for a new character.
 *
 * Starts at 'characterMenu' — the entry point of the creation flow.
 * The player must dispatch MENU_CREATE to begin character creation.
 *
 * @param rng  A WichmannHill instance (carried in state; will be advanced as rolls fire).
 * @param opts.pinMaxBonusRoll  House rule: pin the bonus pool to its max (default false).
 */
export function initialCreationState(
  rng: WichmannHill,
  opts?: { pinMaxBonusRoll?: boolean },
): CreationState {
  return {
    screen: 'characterMenu',
    rng,
    draft: blankDraft(),
    cursor: 0,
    scratch: {},
    pinMaxBonusRoll: opts?.pinMaxBonusRoll ?? false,
    rosterIndex: null,
    skillFloors: new Array(30).fill(0) as number[],
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Attribute slot 0..6 index → key in DraftState.attributes. KAR (index 7) is NOT allocatable. */
const ATTR_KEYS = ['str', 'int', 'pie', 'vit', 'dex', 'spd', 'per'] as const;

/** Race floor for a given attribute after a race was selected. */
function raceFlorFor(state: CreationState, attrIdx: number): number {
  if (state.draft.race === null) return 0;
  const base = getRaceBaseStats(state.draft.race);
  const key = ATTR_KEYS[attrIdx];
  if (!key) return 0;
  return base[key];
}

/**
 * Non-interactive: fire screen-04 bonus-roll.
 * Called when transitioning OUT of sex → class.
 * §1: "screen-04 bonus-roller: 5+rng(6), +8 on each of two 1/20 rolls → 5..26"
 */
function fireBonus(state: CreationState): CreationState {
  // Always roll (advancing the rng) so later rolls stay identical whether or
  // not the pin is on; the pin only overrides the resulting pool value.
  const rolled = rollBonus(state.rng);
  const bonus = state.pinMaxBonusRoll ? MAX_BONUS_POINTS : rolled;
  return {
    ...state,
    draft: { ...state.draft, bonusPool: bonus },
  };
}

/**
 * Non-interactive: fire screen-07 derived-stats computation.
 * Called when transitioning OUT of bonus-allocator → personality.
 * §1: "screen-07-derived-stats: non-interactive: computeDerivedStats + karma via rollKarmaWith"
 * NOTE: §1 places karma at screen-08 (personality), not screen-07 (derived-stats).
 * We fire computeDerivedStats here but NOT karma — karma fires at ACCEPT_PERSONALITY.
 */
function fireDerivedStats(state: CreationState): CreationState {
  const { draft } = state;
  if (draft.class === null || draft.race === null) return state;
  const derived = computeDerivedStats(
    state.rng,
    draft.class,
    draft.race,
    draft.attributes,
  );
  return {
    ...state,
    draft: {
      ...draft,
      derived: {
        age: derived.age,
        // secondAge transitions 0→1 at skill-init time in the engine; we
        // set it = 1 alongside the first derived-stats pass so all
        // post-allocation screens (personality, portrait, skillTrain,
        // confirm) show "  1" matching the engine cells.
        secondAge: 1,
        hpInitial: derived.hpInitial,
        stamina: derived.stamina,
        encumbranceMin: derived.encumbranceMin,
        encumbranceMax: derived.encumbranceMax,
        carryCapacityMax: derived.carryCapacityMax,
        level: derived.level,
        xp: derived.xp,
      },
    },
  };
}

/**
 * Non-interactive: fire karma roll (screen-08 personality accept).
 * Called at ACCEPT_PERSONALITY.
 *
 * §1/§8 + asm (wpcmk 0x3884): karma = rng(19); if sex == female (`[0x560e]==1`),
 * karma += 1. Nate RE'd the +1 as female-only (it's NOT a "player-confirms"
 * bonus — the earlier model was wrong). Males get 0..18; females get 1..19.
 */
function fireKarmaRoll(state: CreationState): CreationState {
  const isFemale = state.draft.sex === 1;
  const kar = rollKarmaWith(state.rng, isFemale);
  return {
    ...state,
    draft: {
      ...state.draft,
      attributes: { ...state.draft.attributes, kar },
    },
  };
}

/**
 * Non-interactive: fire skill-budget roll AND per-class pre-grants.
 *
 * Engine equivalent: `skill_pool_roll_and_class_adjust` (wpcmk file 0x4222).
 * The engine rolls `rng(9) + 10` into *0x5618 (budget), then dispatches to a
 * per-class routine that grants 1..2 skill values and deducts each grant
 * from the budget. Fighter (class 0) grants nothing.
 *
 * Examples (verified vs DOSBox saves):
 *   - Samurai (class 11): SWORD = rng(4) + (DEX+SPD)/6 + 3, ~7..10
 *   - Bishop (class 9): THAUMATURGY + THEOLOGY (2 grants from a shared pool)
 *
 * Stored at: draft.skillBudget (number) + draft.skills[slot] (per-class).
 * Final budget is clamped at 0 (engine post-dispatch tail at 0x4576..0x4580).
 */
function fireSkillBudget(state: CreationState): CreationState {
  const { draft } = state;
  if (draft.class === null) return state;
  const budget = rollSkillBudget(state.rng, draft.class, draft.attributes);
  const { grants, budgetDeduction } = applyClassSkillGrants(
    state.rng,
    draft.class,
    draft.attributes,
  );
  const skills = [...draft.skills];
  for (const { slot, value } of grants) skills[slot] = value;
  const remaining = Math.max(0, budget - budgetDeduction);
  return {
    ...state,
    draft: { ...draft, skillBudget: remaining, skills },
  };
}

/**
 * Determine the next interactive screen after char-sheet-redraw.
 * Checks: skillBudget > 0 → skillTrain; classIsCaster(classIdx) → spellPick; else confirm.
 */
function screenAfterCharSheet(state: CreationState): ScreenId {
  if (state.draft.skillBudget > 0) return 'skillTrain';
  if (state.draft.class !== null && classIsCaster(state.draft.class)) return 'spellPick';
  return 'confirm';
}

/**
 * Determine the next interactive screen after skill training.
 * If caster: spellPick; else: confirm.
 */
function screenAfterSkillTrain(state: CreationState): ScreenId {
  if (state.draft.class !== null && classIsCaster(state.draft.class)) return 'spellPick';
  return 'confirm';
}

/**
 * Return to characterMenu with a reset draft.
 * Used by CANCEL, CONFIRM{keep:false}, and COMMIT_DONE.
 * The RNG is NOT reset — it persists across creates so repeated creations keep advancing the RNG.
 */
function returnToMenu(state: CreationState): CreationState {
  return {
    ...state,
    screen: 'characterMenu',
    draft: blankDraft(),
    cursor: 0,
    scratch: {},
    rosterIndex: null,
    modalErrorMsgId: undefined,
  };
}

// ---------------------------------------------------------------------------
// creationReducer
// ---------------------------------------------------------------------------

/**
 * Pure creation flow reducer.
 *
 * Note: `state.rng` is a mutable WichmannHill; advancing it is intentional and
 * deterministic for a fixed seed. The reducer mutates the rng in-place when
 * it fires non-interactive rolls. This matches the engine's approach and is
 * safe because: (a) the rng is owned by state, (b) the caller never snapshots
 * rng between events, (c) same seed + same event sequence always produces the
 * same result (determinism test in state.test.ts).
 *
 * ## Page contract (updated in Stage E):
 *  - CANCEL / CONFIRM{keep:false}: returns to 'characterMenu' (draft reset, no navigate).
 *  - CONFIRM{keep:true}: goes to 'committing'. Page does I/O, then dispatches COMMIT_DONE.
 *  - COMMIT_DONE: returns to 'characterMenu' (draft reset, no navigate).
 *  - MENU_EXIT: goes to 'exit'. Page watches for 'exit' and navigates to castle.
 *  - 'cancelled' and 'done' are retained in ScreenId for backward compat but are NOT
 *    resting states anymore — 'cancelled' is an alias handled as return-to-menu.
 */
export function creationReducer(state: CreationState, event: CreationEvent): CreationState {
  // Show dup-name modal is screen-agnostic — set modalErrorMsgId to the
  // "* CHARACTER ALREADY EXISTS *" message id (0x044e) and return.
  if (event.type === 'SHOW_DUP_NAME_MODAL') {
    return { ...state, modalErrorMsgId: 0x044e };
  }

  // Modal dismiss is screen-agnostic — clear modalErrorMsgId and return.
  if (event.type === 'MODAL_DISMISS') {
    if (state.modalErrorMsgId === undefined) return state;
    return { ...state, modalErrorMsgId: undefined };
  }

  // Global: CANCEL returns to characterMenu from any non-terminal screen
  if (event.type === 'CANCEL') {
    // From exit terminal, CANCEL has no effect (already exited)
    if (state.screen === 'exit') return state;
    return returnToMenu(state);
  }

  switch (state.screen) {
    // -----------------------------------------------------------------------
    case 'characterMenu': {
      if (event.type === 'MENU_CREATE') {
        // Reset draft to blank, advance to name screen
        // RNG is NOT reset — it persists across creates
        return { ...returnToMenu(state), screen: 'name' };
      }
      if (event.type === 'MENU_EXIT') {
        return { ...state, screen: 'exit' };
      }
      if (event.type === 'MENU_REVIEW') {
        // Engine flow: wpcmk_view_character routes through a roster picker
        // (`wpcmk_show_roster_picker`) that lists existing characters. If the
        // roster is empty the engine grays out REVIEW PC (we don't render the
        // option for an empty roster — see CharacterMenuScreen), so reaching
        // here always implies at least one entry.
        return { ...state, screen: 'reviewPicker' };
      }
      if (event.type === 'MENU_DELETE') {
        // Same picker layout as REVIEW PC but with the DELETE WHO? title and
        // a confirmation step before destruction. Engine path:
        // wpcmk_show_roster_picker → wpcmk_load_and_draw_character →
        // delete-confirm modal. DELETE PC is also hidden in CharacterMenuScreen
        // when roster is empty.
        return { ...state, screen: 'deletePicker' };
      }
      if (event.type === 'MENU_RENAME') {
        // Engine path: wpcmk_show_roster_picker (with "RENAME WHO?" title) →
        // wpcmk_load_and_draw_character → "NEW NAME >" text input on the same
        // char-sheet view. Hidden in CharacterMenuScreen when roster is empty.
        return { ...state, screen: 'renamePicker' };
      }
      if (event.type === 'MENU_PORTRAIT') {
        // Engine path: wpcmk_show_roster_picker (with "PORTRAIT FOR WHOM?") →
        // wpcmk_change_portrait → wpcmk_pick_portrait_loop → if changed, write
        // record + wait-for-enter exit screen. Hidden in CharacterMenuScreen
        // when roster is empty.
        return { ...state, screen: 'portraitPicker' };
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'reviewPicker': {
      // CANCEL is handled by the global handler at the top of the reducer
      // (returns to characterMenu via returnToMenu, which also clears
      // rosterIndex). CANCEL_REVIEW is the picker-specific alias.
      if (event.type === 'PICK_REVIEW') {
        return { ...state, screen: 'review', rosterIndex: event.index };
      }
      if (event.type === 'CANCEL_REVIEW') {
        return { ...state, screen: 'characterMenu', rosterIndex: null };
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'review': {
      if (event.type === 'EXIT_REVIEW') {
        return { ...state, screen: 'characterMenu', rosterIndex: null };
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'deletePicker': {
      if (event.type === 'PICK_DELETE') {
        return { ...state, screen: 'deleteConfirm', rosterIndex: event.index };
      }
      if (event.type === 'CANCEL_DELETE') {
        return { ...state, screen: 'characterMenu', rosterIndex: null };
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'deleteConfirm': {
      if (event.type === 'CONFIRM_DELETE') {
        // The reducer doesn't touch localStorage — DeleteConfirmScreen is
        // responsible for calling removeCharacter(id) on the YES path before
        // dispatching this event. The reducer just transitions state.
        return { ...state, screen: 'characterMenu', rosterIndex: null };
      }
      if (event.type === 'CANCEL_DELETE') {
        return { ...state, screen: 'characterMenu', rosterIndex: null };
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'renamePicker': {
      if (event.type === 'PICK_RENAME') {
        return { ...state, screen: 'renameInput', rosterIndex: event.index };
      }
      if (event.type === 'CANCEL_RENAME') {
        return { ...state, screen: 'characterMenu', rosterIndex: null };
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'renameInput': {
      if (event.type === 'CONFIRM_RENAME') {
        // RenameInputScreen owns the updateCharacter(...) call (same I/O
        // policy as DeleteConfirmScreen / commit path).
        return { ...state, screen: 'characterMenu', rosterIndex: null };
      }
      if (event.type === 'CANCEL_RENAME') {
        return { ...state, screen: 'characterMenu', rosterIndex: null };
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'portraitPicker': {
      if (event.type === 'PICK_PORTRAIT_FOR') {
        return { ...state, screen: 'portraitChange', rosterIndex: event.index };
      }
      if (event.type === 'CANCEL_PORTRAIT_CHANGE') {
        return { ...state, screen: 'characterMenu', rosterIndex: null };
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'portraitChange': {
      if (event.type === 'CONFIRM_PORTRAIT_CHANGE') {
        // Portrait changed — PortraitChangeScreen has already written the
        // updateCharacter() call before dispatching this event. Transition to
        // the "PRESS ▶ TO EXIT" preview screen.
        return { ...state, screen: 'portraitDone' };
      }
      if (event.type === 'CANCEL_PORTRAIT_CHANGE') {
        // User picked the same portrait OR pressed Escape — engine skips the
        // EXIT preview and returns to the menu silently.
        return { ...state, screen: 'characterMenu', rosterIndex: null };
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'portraitDone': {
      if (event.type === 'EXIT_PORTRAIT_CHANGE') {
        return { ...state, screen: 'characterMenu', rosterIndex: null };
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'name': {
      if (event.type === 'SET_NAME') {
        if (event.name.trim() === '') {
          // Empty name → no transition (caller may show error or stay on screen)
          return state;
        }
        // screen-00 confirms → screen-01-init fires immediately → screen-02-race
        // screen-01-init: zeroes record (handled by initialCreationState already)
        // Force uppercase: the engine uppercases on input and stores the name
        // as uppercase in cells. wfont0/wfont3 only carry uppercase letters at
        // ASCII 65-90 — lowercase 97-122 land on cursor/symbol sprites (+32
        // indices = +2 rows in the 16-per-row sheet).
        return {
          ...state,
          screen: 'race',
          draft: { ...state.draft, name: event.name.toUpperCase() },
        };
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'race': {
      if (event.type === 'PICK_RACE') {
        // screen-02: seed attributes from RACE_BASE_STATS[index]
        // §1: "On PICK_RACE: seed attributes from RACE_BASE_STATS[index]"
        const base = getRaceBaseStats(event.index);
        return {
          ...state,
          screen: 'sex',
          draft: {
            ...state.draft,
            race: event.index,
            attributes: {
              str: base.str,
              int: base.int,
              pie: base.pie,
              vit: base.vit,
              dex: base.dex,
              spd: base.spd,
              per: base.per,
              kar: 0,  // karma always starts 0 before personality roll
            },
          },
        };
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'sex': {
      if (event.type === 'PICK_SEX') {
        // screen-03 → screen-04 (bonus-roll, non-interactive) → screen-05 (class)
        // §1: "screen-04 bonus-roller: (immediate)" → fires here
        // NOTE: PIE possibly adjusted by race_faerie_personality_mod at screen-03.
        // We do not model that adjustment here (marked for Phase 3 parity pass).
        let s: CreationState = {
          ...state,
          screen: 'class',
          draft: { ...state.draft, sex: event.index },
        };
        // Non-interactive: fire bonus roll
        s = fireBonus(s);
        return s;
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'class': {
      if (event.type === 'PICK_CLASS') {
        // Qualification check: same `classOffered` predicate the picker uses
        // (pool-aware + sex-aware). At this screen the bonus pool isn't yet
        // allocated, so raw attributes rarely meet the minimums — what matters
        // is whether the pool CAN cover the deficit, AND the sex restriction
        // (Valkyrie female-only). The picker filters via classOffered already;
        // re-check defensively here, ignore unqualified picks silently.
        if (!classOffered(state.draft.attributes, state.draft.bonusPool, state.draft.sex ?? 0, event.index)) {
          return state; // not offered — no transition
        }
        // Auto-fill: bring each attribute up to the class minimum, spending
        // from the bonus pool. RE'd from wpcmk: `wpcmk_pick_class_menu` calls
        // FUN_2e85 → FUN_2fbd at exit, dispatching via the 14-entry jump
        // table at 0x7505 to the per-class auto-fill routine; each routine
        // animates the attr ramps. End-state formula (verified vs save 1 for
        // Samurai + Human base → final attrs 12,11,8,9,12,14,8 / pool 17→2):
        //   for each attr: new = max(race_base, class_min); pool -= deficit.
        // The bonus-allocator screen then enters with the auto-filled stats +
        // remaining pool — the player adjusts the leftovers freely.
        const req = getClassRequirements(event.index);
        const a = state.draft.attributes;
        const filled = {
          str: Math.max(a.str, req.str),
          int: Math.max(a.int, req.int),
          pie: Math.max(a.pie, req.pie),
          vit: Math.max(a.vit, req.vit),
          dex: Math.max(a.dex, req.dex),
          spd: Math.max(a.spd, req.spd),
          per: Math.max(a.per, req.per),
          kar: a.kar,
        };
        const spent = (filled.str - a.str) + (filled.int - a.int) + (filled.pie - a.pie)
                    + (filled.vit - a.vit) + (filled.dex - a.dex) + (filled.spd - a.spd)
                    + (filled.per - a.per);
        return {
          ...state,
          screen: 'bonusAllocator',
          draft: {
            ...state.draft,
            class: event.index,
            attributes: filled,
            bonusPool: state.draft.bonusPool - spent,
          },
          // Reset undo counters (7 values, one per attr slot)
          scratch: { undo: new Array(7).fill(0) as number[] },
        };
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'bonusAllocator': {
      if (event.type === 'ALLOC_ADJUST') {
        // §4: attr indices 0..6 = STR..PER (KAR not adjustable)
        const attrIdx = event.attr;
        if (attrIdx < 0 || attrIdx > 6) return state;
        const key = ATTR_KEYS[attrIdx];
        if (!key) return state;

        const attrs = state.draft.attributes;
        const current = attrs[key];
        const floor = raceFlorFor(state, attrIdx);
        const undo = (state.scratch['undo'] as number[]) ?? new Array(7).fill(0) as number[];

        if (event.delta > 0) {
          // Increase: cap at 18, requires pool > 0
          if (current >= 18 || state.draft.bonusPool <= 0) return state;
          const newUndo = [...undo];
          newUndo[attrIdx] = (newUndo[attrIdx] ?? 0) + 1;
          return {
            ...state,
            draft: {
              ...state.draft,
              attributes: { ...attrs, [key]: current + 1 },
              bonusPool: state.draft.bonusPool - 1,
            },
            scratch: { ...state.scratch, undo: newUndo },
          };
        } else if (event.delta < 0) {
          // Decrease: only if undo[cursor] > 0 (can only refund points spent this session)
          // §4: "undo[cursor] > 0" check guards decrease; can't go below race floor
          const undoCount = undo[attrIdx] ?? 0;
          if (undoCount <= 0 || current <= floor) return state;
          const newUndo = [...undo];
          newUndo[attrIdx] = undoCount - 1;
          return {
            ...state,
            draft: {
              ...state.draft,
              attributes: { ...attrs, [key]: current - 1 },
              bonusPool: state.draft.bonusPool + 1,
            },
            scratch: { ...state.scratch, undo: newUndo },
          };
        }
        return state;
      }

      if (event.type === 'ALLOC_CONFIRM') {
        // §4: "if pool <= 0: exit" — player must spend the entire pool
        if (state.draft.bonusPool > 0) return state; // still points left → no transition

        // screen-06 → screen-07 (derived-stats, non-interactive) → screen-08 (personality)
        let s: CreationState = { ...state, screen: 'personality' };
        // Non-interactive: fire derived stats computation
        s = fireDerivedStats(s);
        // Fire skill budget roll here (class + attrs finalized; result stored in draft.skillBudget).
        // §5: rollSkillBudget(rng, classIdx, attrs) → DGROUP 0x5618. Fired alongside derived-stats
        // since both have all required inputs available at ALLOC_CONFIRM time.
        s = fireSkillBudget(s);
        return s;
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'personality': {
      if (event.type === 'ACCEPT_PERSONALITY') {
        // screen-08 → screen-09 (skill-init, non-interactive) → screen-10 (portrait)
        // §8 + asm (wpcmk 0x3884): karma = rng(19) + (sex==female ? 1 : 0).
        // The +1 bonus is FEMALE-only — Nate caught the prior "player-confirms"
        // interpretation as wrong; `*0x560e` is the sex byte, not a confirm flag.
        let s: CreationState = { ...state, screen: 'portrait' };
        s = fireKarmaRoll(s);
        // screen-09: skill-init (combat-speed modifiers) — no RNG modeled here
        // (the port models this as a no-op since we don't track per-slot combat speed at creation)
        return s;
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'portrait': {
      if (event.type === 'PICK_PORTRAIT') {
        // screen-10 → screen-11 (starter-items, non-interactive)
        //           → screen-12 (char-sheet-redraw, non-interactive)
        //           → conditional: skillTrain | spellPick | confirm
        //
        // skillBudget roll fires here (at char-sheet → conditional transition)
        // §1/§5: budget = rollSkillBudget(rng, classIdx, attrs)
        // skillBudget was already rolled at ALLOC_CONFIRM time — just read draft.skillBudget.
        const s: CreationState = {
          ...state,
          draft: { ...state.draft, portrait: event.index },
        };
        const nextScreen = screenAfterCharSheet(s);
        // Snapshot the entry-time skill values as the untrain floor at the
        // moment we enter skillTrain. The user can train UP and back DOWN to
        // these floors, but not below — they represent baseline grants from
        // race/class init that pre-date this allocation phase.
        const skillFloors =
          nextScreen === 'skillTrain' ? [...s.draft.skills] : s.skillFloors;
        return { ...s, screen: nextScreen, skillFloors };
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'skillTrain': {
      if (event.type === 'TRAIN_SKILL') {
        // Decrement skill budget and increment the skill slot. The engine does
        // NOT auto-advance when the budget reaches 0 — the player must press
        // the EXIT key (Enter, with the bottomBar prompt toggled to "PRESS ▶ TO
        // EXIT"). Verified vs slot 1: budget=0, screen still skillTrain,
        // prompt = MSG.skillExit. So just update the draft and stay on screen.
        if (state.draft.skillBudget <= 0) return state;
        const skills = [...state.draft.skills];
        skills[event.slot] = (skills[event.slot] ?? 0) + 1;
        const newBudget = state.draft.skillBudget - 1;
        return {
          ...state,
          draft: { ...state.draft, skills, skillBudget: newBudget },
        };
      }

      if (event.type === 'UNTRAIN_SKILL') {
        // Floor = skillFloors[slot] (snapshotted at skillTrain entry).
        // Refund 1 point if above the floor; no-op (identical state) otherwise.
        // The screen plays the invalid-action beep on the no-op path via
        // `canUntrainSkill` BEFORE dispatching, so the reducer stays pure.
        const slot = event.slot;
        const cur = state.draft.skills[slot] ?? 0;
        const floor = state.skillFloors[slot] ?? 0;
        if (cur <= floor) return state;
        const skills = [...state.draft.skills];
        skills[slot] = cur - 1;
        return {
          ...state,
          draft: { ...state.draft, skills, skillBudget: state.draft.skillBudget + 1 },
        };
      }

      if (event.type === 'SKILLS_DONE') {
        // Player explicitly exited the screen (Enter while budget=0, or "done"
        // even with points remaining — engine allows this per §1).
        const nextScreen = screenAfterSkillTrain(state);
        return { ...state, screen: nextScreen };
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'spellPick': {
      if (event.type === 'PICK_SPELL') {
        const spellPicks = [...state.draft.spellPicks, event.entry];
        return { ...state, draft: { ...state.draft, spellPicks } };
      }
      if (event.type === 'SPELLS_DONE') {
        return { ...state, screen: 'confirm' };
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'confirm': {
      if (event.type === 'CONFIRM') {
        if (event.keep) {
          // KEEP → committing (page handles actual disk write, then dispatches COMMIT_DONE)
          return { ...state, screen: 'committing' };
        } else {
          // DISCARD → reset draft, return to characterMenu (not a navigate-away terminal)
          return returnToMenu(state);
        }
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'committing': {
      // Page drives this screen (async I/O). When the page finishes persisting
      // the character it dispatches COMMIT_DONE, which resets the draft and
      // returns to characterMenu so the user can create another.
      if (event.type === 'COMMIT_DONE') {
        return returnToMenu(state);
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'exit': {
      // Terminal state — no further transitions.
      // The page watches for 'exit' and calls navigate('/castle') or equivalent.
      return state;
    }

    // -----------------------------------------------------------------------
    case 'done':
    case 'cancelled': {
      // These are no longer resting states in Stage E — they fold back to
      // characterMenu immediately via returnToMenu in the global CANCEL handler.
      // But if we somehow land here (e.g. old saved state), stay put.
      return state;
    }

    default: {
      // Exhaustive check — TypeScript narrows 'never' here if all cases covered
      return state;
    }
  }
}

// ---------------------------------------------------------------------------
// Pure predicates for screens to check before dispatching.
// Screens use these to decide whether to play the invalid-action beep — the
// reducer can't because it must stay pure (no I/O).
// ---------------------------------------------------------------------------

/** Returns true if UNTRAIN_SKILL on `slot` would actually decrement.
 *  Screens beep on false. */
export function canUntrainSkill(state: CreationState, slot: number): boolean {
  const cur = state.draft.skills[slot] ?? 0;
  const floor = state.skillFloors[slot] ?? 0;
  return cur > floor;
}

/** Returns true if ALLOC_ADJUST{attr, delta} would actually mutate state.
 *  Screens beep on false. Mirrors the gate logic in the bonusAllocator case. */
export function canAdjustBonus(state: CreationState, attr: number, delta: number): boolean {
  if (attr < 0 || attr > 6) return false;
  const key = ATTR_KEYS[attr];
  if (!key) return false;
  const current = state.draft.attributes[key];
  if (delta > 0) {
    if (current >= 18) return false;
    if (state.draft.bonusPool <= 0) return false;
    return true;
  }
  if (delta < 0) {
    const undo = (state.scratch['undo'] as number[] | undefined) ?? new Array(7).fill(0) as number[];
    const undoCount = undo[attr] ?? 0;
    const floor = raceFlorFor(state, attr);
    if (undoCount <= 0 || current <= floor) return false;
    return true;
  }
  return false;
}

/** Returns true if ALLOC_CONFIRM would advance (pool drained). */
export function canConfirmBonus(state: CreationState): boolean {
  return state.draft.bonusPool === 0;
}
