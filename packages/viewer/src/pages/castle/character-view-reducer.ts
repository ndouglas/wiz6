/**
 * Character-view local state machine. Pure reducer extracted from
 * CharacterViewPage so it can be unit-tested without React. The page
 * shell handles side effects (navigation, store writes); the reducer
 * only returns transition intents.
 *
 * The reducer emits two kinds of states: presentational (action-menu,
 * edit-submenu, rename, portrait, profession-picker, profession-confirm)
 * and intent (commit-rename, commit-portrait, commit-class-change,
 * exit-castle). The page consumes intents by performing the side effect
 * and computing the next presentational state itself.
 *
 * Spec: docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md
 */

import { nextEquipCursor, nextPopulatedSlot } from './equip-wizard-reducer.js';
import { nextInventoryCursor } from './compose-inventory-picker.js';

export type CharacterViewState =
  | { kind: 'action-menu'; cursorIdx: number; campEntries: ReadonlyArray<string> }
  | { kind: 'edit-submenu'; cursorIdx: number }
  | { kind: 'rename'; buffer: string }
  | { kind: 'portrait'; previewIdx: number; originalIdx: number }
  | { kind: 'profession-picker'; cursorIdx: number; eligible: ReadonlyArray<number> }
  | { kind: 'profession-confirm'; newClassId: number; cursorYes: boolean }
  // EQUIP re-equip wizard: walking body slots 0..7 that have candidates, the
  // user picks (or SKIPs) one candidate per slot. `selections` is indexed by
  // body slot (length 8); each entry is the chosen inventory index or null
  // (NONE/skip). `cursor` is the row-cursor over [candidates, SKIP] where SKIP
  // == candidate count for `slot`. RE: docs/re/findings/wpcvw-equip-action.json.
  | { kind: 'equip-wizard'; slot: number; selections: ReadonlyArray<number | null>; cursor: number }
  // ASSAY (inspect a carried item). Two-step sub-flow:
  //   assay-picker → pick a carried item from [items…, NONE] (cursor over the
  //     vertical carried-item list; NONE == carried count). Initial cursor is on
  //     NONE (matches the engine's assay-picker fixture). Up/Down navigate.
  //   assay-display → read-only inspect popup for the picked item. `itemIdx` is
  //     the member's INVENTORY index (not the picker cursor) so the page can
  //     resolve the item directly. RE: docs/re/findings/wpcvw-assay-action.json.
  | { kind: 'assay-picker'; cursor: number }
  | { kind: 'assay-display'; itemIdx: number }
  // SKILL (read-only skill-level viewer). `category` = the displayed category
  //   (0..3); `cursor` = index into the DYNAMIC tab-picker entry list
  //   (`skillTabEntries(category, hasPersonalSkills)` = available categories
  //   minus the current one, then EXIT). Arrows move `cursor` over the
  //   column-major 2-row entry grid; ENTER on a category re-renders that
  //   category (the list updates only on ENTER); ENTER on EXIT / ESC returns to
  //   the action menu. RE: docs/re/findings/wpcvw-skill-action.json (read-only).
  | { kind: 'skill-viewer'; category: number; cursor: number }
  | { kind: 'commit-rename'; name: string }
  | { kind: 'commit-portrait'; portraitIndex: number }
  | { kind: 'commit-class-change'; newClassId: number }
  | { kind: 'commit-equip'; selections: ReadonlyArray<number | null> }
  | { kind: 'exit-castle' };

export type CharacterViewEvent =
  | { type: 'ARROW_UP' }
  | { type: 'ARROW_DOWN' }
  | { type: 'ARROW_LEFT' }
  | { type: 'ARROW_RIGHT' }
  | { type: 'ENTER' }
  | { type: 'ESCAPE' }
  | { type: 'TYPE'; key: string }
  | { type: 'BACKSPACE' };

export interface EditEnableFlags {
  rename: boolean;
  portrait: boolean;
  profession: boolean;
}

/**
 * Candidate info the EQUIP wizard needs but the reducer can't compute purely
 * (it depends on scenarioDb + member inventory). The page supplies a closure
 * returning the eligible inventory indices for `slot` given the selections so
 * far — `equipCandidates(member, slot, scenarioDb, selections)`. The reducer
 * uses the list LENGTH for cursor clamping (`nextEquipCursor`) and emptiness
 * (`nextPopulatedSlot`), and the list itself to translate cursor → inventory
 * index when recording a selection.
 */
export interface EquipInfo {
  candidatesFor: (slot: number, selections: ReadonlyArray<number | null>) => ReadonlyArray<number>;
}

/**
 * Carried-item info the ASSAY picker needs but the reducer can't compute purely
 * (it depends on the member's inventory). The page supplies `carried`: the
 * member's carried-item INVENTORY indices in PICKER DISPLAY ORDER (the same
 * order the page feeds to composeInventoryPicker's `items`). The reducer uses
 * the list LENGTH for cursor clamping / the NONE position and the list itself
 * to translate the picker cursor → inventory index on commit (`carried[cursor]`).
 *
 * Contract: the i-th element of `carried` is the inventory index of the i-th
 * item shown in the picker. The page MUST build `carried` from the same ordered
 * scan it uses for the picker `items` so cursor → invIdx stays consistent.
 */
export interface AssayInfo {
  carried: ReadonlyArray<number>;
}

const BODY_SLOT_COUNT = 8;

function emptyEquipSelections(): (number | null)[] {
  return Array(BODY_SLOT_COUNT).fill(null);
}

const PORTRAIT_COUNT = 42;
const NAME_MAX_LENGTH = 7;
const REPLACE_INDEX = 3;
const EX_INDEX = 4;

function isPrintableAscii(key: string): boolean {
  if (key.length !== 1) return false;
  const code = key.charCodeAt(0);
  return code >= 0x20 && code <= 0x7e;
}

function enabledSubmenuIndices(flags: EditEnableFlags): number[] {
  const out: number[] = [];
  if (flags.rename) out.push(0);
  if (flags.portrait) out.push(1);
  if (flags.profession) out.push(2);
  // REPLACE (3) is always disabled.
  out.push(EX_INDEX);
  return out;
}

function nextEnabled(idx: number, enabled: ReadonlyArray<number>, dir: 1 | -1): number {
  const i = enabled.indexOf(idx);
  const j = i < 0 ? 0 : Math.max(0, Math.min(enabled.length - 1, i + dir));
  return enabled[j] ?? idx;
}

/**
 * Action-menu navigation. Column-major 2-row grid: entry `idx` at column
 * floor(idx/2), row idx%2. EXIT is the last entry (idx n-1). Verified by live
 * DOSBox capture 2026-06-01.
 */
export function nextActionCursor(idx: number, key: string, n: number): number {
  switch (key) {
    case 'ArrowLeft':  return idx >= 2 ? idx - 2 : idx;
    case 'ArrowRight': return idx + 2 < n ? idx + 2 : idx;
    case 'ArrowUp':    return idx % 2 === 1 ? idx - 1 : idx;
    case 'ArrowDown':  return idx % 2 === 0 && idx + 1 < n ? idx + 1 : idx;
    default:           return idx;
  }
}

/** SKILL viewer category indices (0..3) + the EXIT picker entry sentinel. */
export const SKILL_CATEGORY_COUNT = 4;
export const SKILL_EXIT = 4; // EXIT entry value in the tab picker.

/**
 * Per-member info the SKILL viewer's tab picker needs but the reducer can't
 * compute purely. `hasPersonalSkills` gates the PERSONAL category tab (the
 * engine hides it unless the character has personal skills). Supplied by the
 * page from the member's skill data.
 */
export interface SkillInfo {
  hasPersonalSkills: boolean;
}

/**
 * The DYNAMIC tab-picker entries for the SKILL viewer, in display order: all
 * available categories EXCEPT the currently-displayed one, then EXIT. Available
 * = WEAPONRY/PHYSICAL/ACADEMIA always, PERSONAL only when `hasPersonalSkills`.
 * Verified against the engine captures (WEAPONRY view → [PHYSICAL,ACADEMIA,EXIT]
 * for a no-personal-skills char). RE: docs/re/findings/wpcvw-skill-action.json.
 */
export function skillTabEntries(category: number, hasPersonalSkills: boolean): number[] {
  const available = [0, 1, ...(hasPersonalSkills ? [2] : []), 3];
  return [...available.filter((c) => c !== category), SKILL_EXIT];
}

export function reduceCharacterView(
  state: CharacterViewState,
  event: CharacterViewEvent,
  flags: EditEnableFlags,
  equip?: EquipInfo,
  assay?: AssayInfo,
  skill?: SkillInfo,
): CharacterViewState {
  switch (state.kind) {
    case 'action-menu': {
      if (event.type === 'ESCAPE') return { kind: 'exit-castle' };
      if (event.type === 'ENTER') {
        const label = state.campEntries[state.cursorIdx];
        if (label === 'EXIT') return { kind: 'exit-castle' };
        if (label === 'EDIT') return { kind: 'edit-submenu', cursorIdx: 0 };
        if (label === 'EQUIP' && equip) {
          const selections = emptyEquipSelections();
          const slot = nextPopulatedSlot(-1, (s) => equip.candidatesFor(s, selections).length > 0);
          // No slot has any candidate → nothing to re-equip; commit a no-op so
          // the page returns to the action menu without entering the wizard.
          if (slot === null) return { kind: 'commit-equip', selections };
          return { kind: 'equip-wizard', slot, selections, cursor: 0 };
        }
        if (label === 'ASSAY' && assay) {
          // Engine opens the picker with the cursor on NONE (carried count).
          return { kind: 'assay-picker', cursor: assay.carried.length };
        }
        if (label === 'SKILL') {
          // Open the read-only viewer on WEAPONRY (category 0), cursor on the
          // first picker entry. The page computes the rows + hasPersonalSkills.
          return { kind: 'skill-viewer', category: 0, cursor: 0 };
        }
        return state; // SPELL/SWAG/REVIEW handlers are SP3
      }
      const key =
        event.type === 'ARROW_LEFT' ? 'ArrowLeft' :
        event.type === 'ARROW_RIGHT' ? 'ArrowRight' :
        event.type === 'ARROW_UP' ? 'ArrowUp' :
        event.type === 'ARROW_DOWN' ? 'ArrowDown' : '';
      if (key) {
        return { ...state, cursorIdx: nextActionCursor(state.cursorIdx, key, state.campEntries.length) };
      }
      return state;
    }
    case 'edit-submenu': {
      if (event.type === 'ESCAPE') return { kind: 'action-menu', cursorIdx: 0, campEntries: [] };
      const enabled = enabledSubmenuIndices(flags);
      if (event.type === 'ARROW_DOWN' || event.type === 'ARROW_RIGHT') {
        return { ...state, cursorIdx: nextEnabled(state.cursorIdx, enabled, 1) };
      }
      if (event.type === 'ARROW_UP' || event.type === 'ARROW_LEFT') {
        return { ...state, cursorIdx: nextEnabled(state.cursorIdx, enabled, -1) };
      }
      if (event.type === 'ENTER') {
        if (state.cursorIdx === 0) return { kind: 'rename', buffer: '' };
        if (state.cursorIdx === 1) {
          return { kind: 'portrait', previewIdx: 0, originalIdx: 0 };
        }
        if (state.cursorIdx === 2) {
          return { kind: 'profession-picker', cursorIdx: 0, eligible: [] };
        }
        if (state.cursorIdx === EX_INDEX) {
          return { kind: 'action-menu', cursorIdx: 0, campEntries: [] };
        }
        if (state.cursorIdx === REPLACE_INDEX) return state; // never reachable
      }
      return state;
    }
    case 'rename': {
      if (event.type === 'ESCAPE') return { kind: 'edit-submenu', cursorIdx: 0 };
      if (event.type === 'BACKSPACE') return { kind: 'rename', buffer: state.buffer.slice(0, -1) };
      if (event.type === 'ENTER') {
        if (state.buffer.length === 0) return state;
        return { kind: 'commit-rename', name: state.buffer.toUpperCase() };
      }
      if (event.type === 'TYPE' && isPrintableAscii(event.key) && state.buffer.length < NAME_MAX_LENGTH) {
        return { kind: 'rename', buffer: state.buffer + event.key };
      }
      return state;
    }
    case 'portrait': {
      if (event.type === 'ESCAPE') return { kind: 'edit-submenu', cursorIdx: 1 };
      if (event.type === 'ARROW_LEFT') {
        return { ...state, previewIdx: (state.previewIdx + PORTRAIT_COUNT - 1) % PORTRAIT_COUNT };
      }
      if (event.type === 'ARROW_RIGHT') {
        return { ...state, previewIdx: (state.previewIdx + 1) % PORTRAIT_COUNT };
      }
      if (event.type === 'ENTER') {
        if (state.previewIdx === state.originalIdx) return { kind: 'edit-submenu', cursorIdx: 1 };
        return { kind: 'commit-portrait', portraitIndex: state.previewIdx };
      }
      return state;
    }
    case 'profession-picker': {
      if (event.type === 'ESCAPE') return { kind: 'edit-submenu', cursorIdx: 2 };
      if (event.type === 'ARROW_DOWN' && state.cursorIdx < state.eligible.length - 1) {
        return { ...state, cursorIdx: state.cursorIdx + 1 };
      }
      if (event.type === 'ARROW_UP' && state.cursorIdx > 0) {
        return { ...state, cursorIdx: state.cursorIdx - 1 };
      }
      if (event.type === 'ENTER') {
        const newClassId = state.eligible[state.cursorIdx];
        if (newClassId === undefined) return state;
        return { kind: 'profession-confirm', newClassId, cursorYes: false };
      }
      return state;
    }
    case 'profession-confirm': {
      if (event.type === 'ESCAPE') return { kind: 'profession-picker', cursorIdx: 0, eligible: [] };
      if (event.type === 'TYPE') {
        const k = event.key.toUpperCase();
        if (k === 'Y') return { kind: 'commit-class-change', newClassId: state.newClassId };
        if (k === 'N') return { kind: 'profession-picker', cursorIdx: 0, eligible: [] };
      }
      if (event.type === 'ARROW_LEFT' || event.type === 'ARROW_RIGHT') {
        return { ...state, cursorYes: !state.cursorYes };
      }
      if (event.type === 'ENTER') {
        if (state.cursorYes) return { kind: 'commit-class-change', newClassId: state.newClassId };
        return { kind: 'profession-picker', cursorIdx: 0, eligible: [] };
      }
      return state;
    }
    case 'equip-wizard': {
      // ESC cancels the whole wizard — discard selections, back to the action
      // menu (cursor on EXIT, hydrated by the page's action-menu rehydration).
      if (event.type === 'ESCAPE') return { kind: 'action-menu', cursorIdx: 0, campEntries: [] };
      if (!equip) return state;
      const candidates = equip.candidatesFor(state.slot, state.selections);
      if (event.type === 'ARROW_LEFT' || event.type === 'ARROW_RIGHT') {
        const key = event.type === 'ARROW_LEFT' ? 'ArrowLeft' : 'ArrowRight';
        return { ...state, cursor: nextEquipCursor(state.cursor, key, candidates.length) };
      }
      if (event.type === 'ENTER') {
        // cursor == candidates.length is the SKIP position → null. Otherwise the
        // cursored candidate's INVENTORY index (candidates[cursor]).
        const chosen = state.cursor === candidates.length ? null : (candidates[state.cursor] ?? null);
        const selections = state.selections.slice();
        selections[state.slot] = chosen;
        const slot = nextPopulatedSlot(state.slot, (s) => equip.candidatesFor(s, selections).length > 0);
        if (slot === null) return { kind: 'commit-equip', selections };
        return { kind: 'equip-wizard', slot, selections, cursor: 0 };
      }
      return state;
    }
    case 'assay-picker': {
      // ESC cancels back to the action menu (cursor on EXIT, hydrated by the
      // page's action-menu rehydration).
      if (event.type === 'ESCAPE') return { kind: 'action-menu', cursorIdx: 0, campEntries: [] };
      if (!assay) return state;
      const count = assay.carried.length;
      if (event.type === 'ARROW_UP' || event.type === 'ARROW_DOWN') {
        const key = event.type === 'ARROW_UP' ? 'ArrowUp' : 'ArrowDown';
        return { ...state, cursor: nextInventoryCursor(state.cursor, key, count) };
      }
      if (event.type === 'ENTER') {
        // cursor == count is the NONE position → cancel back to the action menu.
        if (state.cursor === count) return { kind: 'action-menu', cursorIdx: 0, campEntries: [] };
        const itemIdx = assay.carried[state.cursor];
        if (itemIdx === undefined) return state;
        return { kind: 'assay-display', itemIdx };
      }
      return state;
    }
    case 'assay-display': {
      // Read-only inspect popup. ENTER or ESC dismisses back to the action menu.
      if (event.type === 'ENTER' || event.type === 'ESCAPE') {
        return { kind: 'action-menu', cursorIdx: 0, campEntries: [] };
      }
      return state;
    }
    case 'skill-viewer': {
      // ESC exits to the action menu (cursor on EXIT, hydrated by the page).
      if (event.type === 'ESCAPE') return { kind: 'action-menu', cursorIdx: 0, campEntries: [] };
      const entries = skillTabEntries(state.category, skill?.hasPersonalSkills ?? false);
      if (event.type === 'ENTER') {
        // Commit the cursored entry: EXIT leaves; a category re-renders to that
        // category (the displayed list updates only on ENTER), cursor → 0.
        const entry = entries[state.cursor] ?? SKILL_EXIT;
        if (entry === SKILL_EXIT) return { kind: 'action-menu', cursorIdx: 0, campEntries: [] };
        return { kind: 'skill-viewer', category: entry, cursor: 0 };
      }
      const key =
        event.type === 'ARROW_LEFT' ? 'ArrowLeft' :
        event.type === 'ARROW_RIGHT' ? 'ArrowRight' :
        event.type === 'ARROW_UP' ? 'ArrowUp' :
        event.type === 'ARROW_DOWN' ? 'ArrowDown' : '';
      // Entries render column-major 2-row (same geometry as the action menu),
      // so reuse nextActionCursor over the dynamic entry count.
      if (key) return { ...state, cursor: nextActionCursor(state.cursor, key, entries.length) };
      return state;
    }
    default:
      return state;
  }
}
