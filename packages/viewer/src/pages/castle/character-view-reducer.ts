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

export type CharacterViewState =
  | { kind: 'action-menu'; cursorIdx: number; campEntries: ReadonlyArray<string> }
  | { kind: 'edit-submenu'; cursorIdx: number }
  | { kind: 'rename'; buffer: string }
  | { kind: 'portrait'; previewIdx: number; originalIdx: number }
  | { kind: 'profession-picker'; cursorIdx: number; eligible: ReadonlyArray<number> }
  | { kind: 'profession-confirm'; newClassId: number; cursorYes: boolean }
  | { kind: 'commit-rename'; name: string }
  | { kind: 'commit-portrait'; portraitIndex: number }
  | { kind: 'commit-class-change'; newClassId: number }
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

export function reduceCharacterView(
  state: CharacterViewState,
  event: CharacterViewEvent,
  flags: EditEnableFlags,
): CharacterViewState {
  switch (state.kind) {
    case 'action-menu': {
      if (event.type === 'ESCAPE') return { kind: 'exit-castle' };
      if (event.type === 'ENTER') {
        const label = state.campEntries[state.cursorIdx];
        if (label === 'EXIT') return { kind: 'exit-castle' };
        if (label === 'EDIT') return { kind: 'edit-submenu', cursorIdx: 0 };
        return state; // EQUIP/SPELL/ASSAY/SWAG/SKILL/REVIEW handlers are SP3
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
    default:
      return state;
  }
}
