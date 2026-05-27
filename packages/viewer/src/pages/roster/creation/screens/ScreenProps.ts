/**
 * ScreenProps — shared contract for all wpcmk creation screen components.
 *
 * Every interactive screen component (C3–C10) takes these props:
 *   - `state`    — read-only snapshot of the creation state machine
 *   - `dispatch` — send an event to the reducer (pure; never async)
 *   - `fontSet`  — font glyphs for tile rendering (loaded once at page mount)
 *   - `palette`  — EGA colour palette (typically WIZ6_MAIN)
 *   - `db`       — loaded msg.dbs for string lookups via creationString()
 *
 * Design notes:
 *   - Screens are DUMB components: all business logic lives in the reducer.
 *   - A screen only reads state + maps keys to events. It must not advance
 *     the state machine directly — it dispatches and waits.
 *   - `dispatch` is synchronous; the parent re-renders with the new state.
 *   - This contract is intentionally minimal. Per-screen local state (e.g.
 *     cursor position, animation ticks) lives in the component's useState.
 *
 * `mapKey` implements the §8 key model for all interactive screens:
 *   ArrowLeft→1, ArrowUp→2, ArrowRight→3, ArrowDown→4, Enter→5, else null.
 *
 * Spec: docs/re/wpcmk-screens.md §8
 */

import type { FontSet } from '@wiz6/parser';
import type { Palette, MessageDb } from '@wiz6/data';
import type { CreationState, CreationEvent } from '../state.js';

// ---------------------------------------------------------------------------
// ScreenProps interface
// ---------------------------------------------------------------------------

/**
 * Shared props for all wpcmk creation screen components.
 *
 * Screens read `state` and fire `dispatch` — they never mutate state directly.
 * All screen-specific local state (cursor, animation) is managed via useState.
 */
export interface ScreenProps {
  /** Current creation state snapshot (read-only). */
  state: CreationState;
  /** Dispatch a creation event to the reducer. */
  dispatch: (e: CreationEvent) => void;
  /** Font set for tile glyph rendering — see loadCreationFontSet. */
  fontSet: FontSet;
  /** EGA palette for tile colour rendering — typically WIZ6_MAIN. */
  palette: Palette;
  /** Loaded msg.dbs for all string lookups via creationString(). */
  db: MessageDb;
}

// ---------------------------------------------------------------------------
// mapKey — §8 keyboard model
// ---------------------------------------------------------------------------

/**
 * Map a keyboard event's `key` string to a wpcmk action code.
 *
 * Per §8 of docs/re/wpcmk-screens.md, the engine translates raw key bytes
 * through a 6-entry table at wroot DGROUP `0x541e` = [ESC, Left, Up, Right, Down, Return].
 * The 0-based lookup position is the action code. ESC (code 0) is silently
 * ignored by all creation callers — mapKey returns null for it.
 *
 * Mapping:
 *   ArrowLeft  → 1 (prev column / decrease)
 *   ArrowUp    → 2 (prev row / prev attr)
 *   ArrowRight → 3 (next column / increase)
 *   ArrowDown  → 4 (next row / next attr)
 *   Enter      → 5 (confirm)
 *   Escape     → null (silently ignored per §8)
 *   anything   → null
 *
 * @param e  An object with a `key` string (e.g. a KeyboardEvent).
 * @returns  Action code 1..5, or null if the key is not in the table.
 */
export function mapKey(e: { key: string }): 1 | 2 | 3 | 4 | 5 | null {
  switch (e.key) {
    case 'ArrowLeft':  return 1;
    case 'ArrowUp':    return 2;
    case 'ArrowRight': return 3;
    case 'ArrowDown':  return 4;
    case 'Enter':      return 5;
    default:           return null;
  }
}
