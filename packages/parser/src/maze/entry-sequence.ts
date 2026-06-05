/**
 * entry-sequence.ts — pure FSM reducer for the START-NEW-GAME scripted entry.
 *
 * The engine drives a scripted entry (copy-protection SKIPPED in the port) across
 * five frames before handing the player free control. Each ENTER advances one step:
 *
 *   title      — "ENTERING / BANE OF THE COSMIC FORGE" card (gy=117, blue text on the
 *                gray widget). ENTER → narration + one forward step (gy 117→118).
 *   narration  — 3-line narration on the black strip (gy=118). ENTER dismisses the
 *                text AND steps once → gate-walk (gy 118→119).
 *   gate-walk  — forced march one cell forward per ENTER (crosses the one-way gate
 *                that free-roam collision would block). When the next step lands on
 *                the bump cell (gy>=120) → bump.
 *   bump       — "HMMMM..." front-wall bump. The committed fixtures show HMMMM at
 *                BOTH gy=120 (inner gate, frame 05) and gy=121 (dead-end, frame 06):
 *                ENTER at gy=120 forced-steps to gy=121 and STAYS bump; ENTER at
 *                gy=121 (the dead-end) → free (no move).
 *   free       — normal dungeon movement; this reducer is inert (ENTER handled
 *                elsewhere).
 *
 * The FSM keys on the party's GY TARGET (117→118→119→120→121), not a raw ENTER
 * count, because the engine's accept-ENTER is timer-gated and frame-jittery (the
 * documented non-determinism). Keying on gy makes the port match the committed
 * byte-exact fixtures (newgame-seq-02..06) and cannot drift on that jitter.
 *
 * Per-gy → (entryMode, strip) mapping locked to the fixtures (Task 5):
 *   gy=117 → title      (frame 02: gray widget + blue ENTERING/BANE title)
 *   gy=118 → narration  (frame 03: black + 3-line yellow APPROACHING THE GATE...)
 *   gy=119 → gate-walk  (frame 04: clean black, NO text)
 *   gy=120 → bump       (frame 05: black + yellow HMMMM... — front-wall bump)
 *   gy=121 → bump       (frame 06: black + yellow HMMMM... — dead-end)
 *
 * Engine reference: wmaze state 5/6/23 (CLAUDE.md overlay state table).
 * Pin: docs/re/findings/maze-newgame-byteexact.json (per_enter_pin_addendum).
 * Pure — no I/O, no Date, no random, no node:* imports.
 */

import type { MazeBlock, MazeParty } from '@wiz6/data';
import type { MessageDb } from '@wiz6/data';
import { step } from './maze-geometry.js';

/** The gy at which the HMMMM front-wall bump FIRST shows (inner gate). The bump
 *  persists through gy=121 (the dead-end); see advanceEntry's 'bump' case. */
const BUMP_GY = 120;
/** The final dead-end gy: ENTER here ends the scripted entry → free control. */
const FREE_GY = 121;

export type EntryMode = 'title' | 'narration' | 'gate-walk' | 'bump' | 'free';

export interface EntryState {
  party: MazeParty;
  entryMode: EntryMode;
  /** Forward steps still to take in the scripted walk (informational; the FSM
   *  also keys on the gy target so it can't drift). 0 once the walk is done. */
  stepsRemaining: number;
}

/** Forced march: advance one cell forward IGNORING walls (the scripted gate-walk
 *  crosses a one-way gate that free-roam collision would block). Same forward
 *  delta as tryStepForward, minus the isSolid guard. */
function forcedStep(party: MazeParty): MazeParty {
  const { gx, gy, facing } = party;
  const [ngx, ngy] = step(gx, gy, facing, 0, 1);
  return { ...party, gx: ngx, gy: ngy };
}

/**
 * advanceEntry — ENTER pressed during the scripted entry.
 * Returns the next EntryState (always a new object unless inert; never mutates).
 *
 * title      → narration   (+1 forward step: gy 117→118)
 * narration  → gate-walk   (+1 forward step: gy 118→119; dismisses the text)
 * gate-walk  → +1 forward step; if the new cell is a bump cell (gy>=120) → bump,
 *              else stay gate-walk (gy 119)
 * bump       → if not yet at the dead-end (gy<121): +1 forward step, STAY bump
 *              (gy 120→121, HMMMM persists across the inner gate → dead-end);
 *              else (gy>=121): → free (no move)
 * free       → no-op (returns s unchanged)
 */
export function advanceEntry(s: EntryState, _block: MazeBlock): EntryState {
  switch (s.entryMode) {
    case 'title': {
      const party = forcedStep(s.party);
      return { party, entryMode: 'narration', stepsRemaining: Math.max(0, s.stepsRemaining - 1) };
    }

    case 'narration': {
      const party = forcedStep(s.party);
      const mode: EntryMode = party.gy >= BUMP_GY ? 'bump' : 'gate-walk';
      return { party, entryMode: mode, stepsRemaining: Math.max(0, s.stepsRemaining - 1) };
    }

    case 'gate-walk': {
      const party = forcedStep(s.party);
      const steps = Math.max(0, s.stepsRemaining - 1);
      const mode: EntryMode = party.gy >= BUMP_GY ? 'bump' : 'gate-walk';
      return { party, entryMode: mode, stepsRemaining: steps };
    }

    case 'bump': {
      // HMMMM persists from the inner gate (gy=120) through the dead-end (gy=121).
      // Step forward once more while short of the dead-end, then go free.
      if (s.party.gy < FREE_GY) {
        const party = forcedStep(s.party);
        return { party, entryMode: 'bump', stepsRemaining: Math.max(0, s.stepsRemaining - 1) };
      }
      return { ...s, entryMode: 'free', stepsRemaining: 0 };
    }

    case 'free':
      return s;
  }
}

/**
 * decodeNarrationLines — resolve entry message IDs to display strings.
 *
 * Looks up each id in msgDb.indexedMessages. Strips a single leading `^` if
 * present (anchored-x format code used by the engine). Missing IDs → ''.
 *
 * Used for both titleMsgIds and narrationMsgIds.
 */
export function decodeNarrationLines(msgDb: MessageDb, ids: number[]): string[] {
  return ids.map((id) => {
    const entry = msgDb.indexedMessages.find((m) => m.id === id);
    if (entry === undefined) return '';
    const text = entry.decodedText;
    return text.startsWith('^') ? text.slice(1) : text;
  });
}
