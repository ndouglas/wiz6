/**
 * Wiz6 main-menu ("MASTER OPTIONS") — pure logic for option visibility +
 * destination routing. Mirrors `wbase_state4_main_menu` @ wbase 0x2b36
 * (see docs/re/wbase-main-menu.md).
 *
 * The engine maintains a 9-slot option array, applies enable predicates
 * based on the current party state, and dispatches to per-slot handlers
 * that transition the global `*0x363a` state variable. We model the same
 * 9 slots + same enable rules; the viewer renders the visible subset and
 * routes click events to destinations.
 */

/** Engine slot index. Stable across party states; used as the jump-table key. */
export type MainMenuSlot = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Destination semantics for each option — what happens after the user selects it.
 *
 * - `loop`: returns to the menu (e.g. add-party-member, character-menu)
 * - `state-N`: transitions the engine state variable to N
 *   - `state-1`  → re-enter winit's title sequence
 *   - `state-3`  → QUIT
 *   - `state-6`  → enter dungeon gameplay
 *   - `state-0x10` → WPCMK (character creation)
 *   - `state-0x11` → WPCVW (character view)
 *   - `state-0x18` → config submenu (handled in wbase)
 */
export type MainMenuDestination =
  | 'loop'
  | 'state-1'
  | 'state-3'
  | 'state-6'
  | 'state-0x10'
  | 'state-0x11'
  | 'state-0x18';

export interface MainMenuOption {
  /** Engine slot (0..8). */
  slot: MainMenuSlot;
  /** Display label (verified from the original game's screenshot). */
  label: string;
  /** MSG.DBS string ID (per RE — outside our currently-extracted msg range). */
  msgId: number;
  /** Where selecting this option takes the engine state machine. */
  destination: MainMenuDestination;
}

/**
 * Read-only spec of all 9 main-menu slots. Order matches the engine's array.
 * Labels are verbatim from `extracted/messages/msg.json` ids 0x3ea..0x3f2 —
 * not context-dependent. The earlier doc speculation that slot 5 might
 * sometimes render as "MAKE CHARACTER" was wrong; verified vs the engine.
 */
export const MAIN_MENU_OPTIONS: readonly MainMenuOption[] = [
  { slot: 0, label: 'ADD PARTY MEMBER',   msgId: 0x3ea, destination: 'loop' },
  { slot: 1, label: 'REVIEW MEMBER',      msgId: 0x3eb, destination: 'state-0x11' },
  { slot: 2, label: 'DISMISS MEMBER',     msgId: 0x3ec, destination: 'loop' },
  { slot: 3, label: 'START NEW GAME',     msgId: 0x3ed, destination: 'state-6' },
  { slot: 4, label: 'RESUME SAVED GAME',  msgId: 0x3ee, destination: 'state-6' },
  { slot: 5, label: 'CHARACTER MENU',     msgId: 0x3ef, destination: 'state-0x10' },
  { slot: 6, label: 'GAME CONFIGURATION', msgId: 0x3f0, destination: 'state-0x18' },
  { slot: 7, label: 'SHOW TITLE PAGE',    msgId: 0x3f1, destination: 'state-1' },
  { slot: 8, label: 'QUIT GAME',          msgId: 0x3f2, destination: 'state-3' },
];

/**
 * Game-state inputs that affect which menu options are enabled.
 * From the RE findings (wbase.ovr DGROUP):
 *   - partySize @ 0x43ce: number of party members loaded (0..6)
 *   - pcFileHasUnloadedChars: scan of `*0x4fd8[0..*0x4fd2]` for any byte == 1
 */
export interface MainMenuContext {
  /** Number of party members currently loaded (0..6). */
  partySize: number;
  /** Whether PCFILE.DBS has any "available" characters not in the party. */
  pcFileHasUnloadedChars: boolean;
}

/**
 * Per-slot enable predicate. Sourced directly from the engine's option-filter
 * pass at wbase 0x2b36..0x2bc0 (see docs/re/wbase-main-menu.md "Option enable
 * rules"):
 *
 *   Slot 0: pcFileHasUnloadedChars && partySize < 6
 *   Slot 1: partySize >= 1
 *   Slot 2: partySize >= 1
 *   Slot 3: partySize >= 2
 *   Slot 4: partySize < 1   (only enabled when no party loaded)
 *   Slot 5-8: always enabled
 */
export function isOptionEnabled(slot: MainMenuSlot, ctx: MainMenuContext): boolean {
  switch (slot) {
    case 0:
      return ctx.pcFileHasUnloadedChars && ctx.partySize < 6;
    case 1:
      return ctx.partySize >= 1;
    case 2:
      return ctx.partySize >= 1;
    case 3:
      return ctx.partySize >= 2;
    case 4:
      return ctx.partySize < 1;
    case 5:
    case 6:
    case 7:
    case 8:
      return true;
  }
}

/**
 * Filter MAIN_MENU_OPTIONS to the subset currently visible for the given
 * party/PCFILE state. Order preserved.
 *
 * For first-launch (`partySize=0, pcFileHasUnloadedChars=true`) this returns
 * slots {0, 4, 5, 6, 7, 8} — matching the 6 options in the user-supplied
 * screenshot.
 */
export function visibleMenuOptions(ctx: MainMenuContext): MainMenuOption[] {
  return MAIN_MENU_OPTIONS.filter((opt) => isOptionEnabled(opt.slot, ctx));
}
