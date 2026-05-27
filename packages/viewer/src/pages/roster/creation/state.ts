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
 *  16 save/committing      — non-interactive (commit; transitions to done)
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
 */

import {
  WichmannHill,
  rollBonus,
  computeDerivedStats,
  rollKarmaWith,
  rollSkillBudget,
  getRaceBaseStats,
  meetsClassRequirements,
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
 */
export type ScreenId =
  | 'name'           // screen-00-pre-entry: name input
  | 'race'           // screen-02-race: pick race (11 options)
  | 'sex'            // screen-03-sex: pick MALE/FEMALE
  | 'class'          // screen-05-class: pick class (qualification-gated)
  | 'bonusAllocator' // screen-06-bonus-allocator: distribute bonus pool
  | 'personality'    // screen-08-personality: karma roll loop (RETURN to accept)
  | 'portrait'       // screen-10-portrait: pick portrait (0..41)
  | 'skillTrain'     // screen-13-skill-training (conditional: skillBudget > 0)
  | 'spellPick'      // screen-14-spell-picking (conditional: classIsCaster)
  | 'confirm'        // screen-15-confirm: KEEP or DISCARD
  | 'committing'     // screen-16-save: write record (caller handles async I/O)
  | 'done'           // after successful save
  | 'cancelled';     // DISCARD or escape/empty-name exit

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
    age: number;
    hpInitial: number;
    stamina: number;
    encumbranceMin: number;
    encumbranceMax: number;
    goldInitial: number;
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
}

// ---------------------------------------------------------------------------
// CreationEvent — all events the reducer handles
// ---------------------------------------------------------------------------

export type CreationEvent =
  | { type: 'SET_NAME'; name: string }         // screen-00: confirm name (empty → no-op; non-empty → init+race)
  | { type: 'PICK_RACE'; index: number }       // screen-02: choose race 0..10
  | { type: 'PICK_SEX'; index: number }        // screen-03: choose sex 0..1
  | { type: 'PICK_CLASS'; index: number }      // screen-05: choose class 0..13 (must be qualified)
  | { type: 'ALLOC_ADJUST'; attr: number; delta: number }  // screen-06: +1 or -1 to attr 0..6
  | { type: 'ALLOC_CONFIRM' }                  // screen-06: confirm allocation (only if pool==0)
  | { type: 'ACCEPT_PERSONALITY' }             // screen-08: player accepts karma roll
  | { type: 'PICK_PORTRAIT'; index: number }   // screen-10: confirm portrait 0..41
  | { type: 'TRAIN_SKILL'; slot: number }      // screen-13: spend 1 skill point on slot
  | { type: 'SKILLS_DONE' }                    // screen-13: player done (budget exhausted or explicit)
  | { type: 'PICK_SPELL'; entry: number }      // screen-14: select a spell entry index
  | { type: 'SPELLS_DONE' }                    // screen-14: player done with spell picks
  | { type: 'CONFIRM'; keep: boolean }         // screen-15: KEEP (true) or DISCARD (false)
  | { type: 'CANCEL' };                        // any screen: abandon creation

// ---------------------------------------------------------------------------
// initialCreationState
// ---------------------------------------------------------------------------

/** Initial zero-skill array: 30 slots, all 0. */
function zeroSkills(): number[] {
  return new Array(30).fill(0) as number[];
}

/**
 * Create the initial creation state for a new character.
 *
 * @param rng  A WichmannHill instance (carried in state; will be advanced as rolls fire).
 */
export function initialCreationState(rng: WichmannHill): CreationState {
  return {
    screen: 'name',
    rng,
    draft: {
      name: '',
      race: null,
      sex: null,
      class: null,
      attributes: { str: 0, int: 0, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0 },
      bonusPool: 0,
      skillBudget: 0,
      skills: zeroSkills(),
      portrait: 0,
      spellPicks: [],
      derived: {},
    },
    cursor: 0,
    scratch: {},
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Attribute slot 0..6 index → key in DraftState.attributes. KAR (index 7) is NOT allocatable. */
const ATTR_KEYS = ['str', 'int', 'pie', 'vit', 'dex', 'spd', 'per'] as const;
type AllocAttrKey = typeof ATTR_KEYS[number];

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
  const bonus = rollBonus(state.rng);
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
        hpInitial: derived.hpInitial,
        stamina: derived.stamina,
        encumbranceMin: derived.encumbranceMin,
        encumbranceMax: derived.encumbranceMax,
        goldInitial: derived.goldInitial,
        level: derived.level,
        xp: derived.xp,
      },
    },
  };
}

/**
 * Non-interactive: fire karma roll (screen-08 personality accept).
 * Called at ACCEPT_PERSONALITY.
 * §1/§8: karma = rng(19) + optional +1 if player actively confirms.
 * personalityConfirmed = true because player pressed RETURN to confirm.
 */
function fireKarmaRoll(state: CreationState, personalityConfirmed: boolean): CreationState {
  const kar = rollKarmaWith(state.rng, personalityConfirmed);
  return {
    ...state,
    draft: {
      ...state.draft,
      attributes: { ...state.draft.attributes, kar },
    },
  };
}

/**
 * Non-interactive: fire skill-budget roll.
 * Called when transitioning OUT of char-sheet-redraw → conditional.
 * §1/§5: skillBudget = rollSkillBudget(rng, classIdx, attrs), stored at DGROUP 0x5618.
 * Conditional: screen-13 only runs if *0x5618 > 0.
 */
function fireSkillBudget(state: CreationState): CreationState {
  const { draft } = state;
  if (draft.class === null) return state;
  const budget = rollSkillBudget(state.rng, draft.class, draft.attributes);
  return {
    ...state,
    draft: { ...draft, skillBudget: budget },
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
 */
export function creationReducer(state: CreationState, event: CreationEvent): CreationState {
  // Global: CANCEL terminates from any screen
  if (event.type === 'CANCEL') {
    return { ...state, screen: 'cancelled' };
  }

  switch (state.screen) {
    // -----------------------------------------------------------------------
    case 'name': {
      if (event.type === 'SET_NAME') {
        if (event.name.trim() === '') {
          // Empty name → no transition (caller may show error or stay on screen)
          return state;
        }
        // screen-00 confirms → screen-01-init fires immediately → screen-02-race
        // screen-01-init: zeroes record (handled by initialCreationState already)
        return {
          ...state,
          screen: 'race',
          draft: { ...state.draft, name: event.name },
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
        // Qualification check: class must be qualified by current attributes
        // §1: "menu picker §7, qualification-gated"
        // §7: "Disabled entries (enabled[i] == 0) are skipped during the init loop"
        // We enforce qualification silently (ignore unqualified picks).
        if (!meetsClassRequirements(state.draft.attributes, event.index)) {
          return state; // not qualified — no transition
        }
        return {
          ...state,
          screen: 'bonusAllocator',
          draft: { ...state.draft, class: event.index },
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
        // §8: karma rolled via rollKarmaWith on player confirm
        // personalityConfirmed = true (player actively confirmed)
        let s: CreationState = { ...state, screen: 'portrait' };
        // Fire karma roll
        s = fireKarmaRoll(s, true);
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
        // Determine next screen based on already-rolled skill budget
        const nextScreen = screenAfterCharSheet(s);
        return { ...s, screen: nextScreen };
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'skillTrain': {
      if (event.type === 'TRAIN_SKILL') {
        // Decrement skill budget and increment the skill slot
        if (state.draft.skillBudget <= 0) return state;
        const skills = [...state.draft.skills];
        skills[event.slot] = (skills[event.slot] ?? 0) + 1;
        const newBudget = state.draft.skillBudget - 1;
        const newDraft = { ...state.draft, skills, skillBudget: newBudget };

        // If budget exhausted, auto-advance to next screen
        if (newBudget <= 0) {
          const nextScreen = screenAfterSkillTrain({ ...state, draft: newDraft });
          return { ...state, screen: nextScreen, draft: newDraft };
        }
        return { ...state, draft: newDraft };
      }

      if (event.type === 'SKILLS_DONE') {
        // Player signals done with skill training (budget may still have points — but
        // per §1 loop condition "until skill pool exhausted", we respect explicit done)
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
          // KEEP → committing (caller handles actual disk write)
          return { ...state, screen: 'committing' };
        } else {
          // DISCARD → cancelled
          return { ...state, screen: 'cancelled' };
        }
      }
      return state;
    }

    // -----------------------------------------------------------------------
    case 'committing': {
      // Caller drives this screen (async I/O). The reducer exposes 'done' as the
      // terminal success state; 'committing' → 'done' transition is caller-initiated.
      // No events handled here by the reducer itself.
      return state;
    }

    // -----------------------------------------------------------------------
    case 'done':
    case 'cancelled': {
      // Terminal states — no further transitions
      return state;
    }

    default: {
      // Exhaustive check — TypeScript narrows 'never' here if all cases covered
      return state;
    }
  }
}
