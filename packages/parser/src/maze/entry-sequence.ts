/**
 * entry-sequence.ts — pure FSM reducer for the START-NEW-GAME scripted entry.
 *
 * The engine drives a two-phase entry before handing the player free control:
 *   narration  — the bottom strip shows narration lines; ENTER dismisses them.
 *   gate-walk  — ENTER steps the party forward N times (scripted walk through gate).
 *   free       — normal dungeon movement; this reducer is not involved.
 *
 * Engine reference: wmaze state 5/6/23 (see CLAUDE.md overlay state table).
 * Pure — no I/O, no Date, no random, no node:* imports.
 */

import type { MazeBlock, MazeParty } from '@wiz6/data';
import type { MessageDb } from '@wiz6/data';
import { step } from './maze-geometry.js';

export interface EntryState {
  party: MazeParty;
  entryMode: 'narration' | 'gate-walk' | 'free';
  stepsRemaining: number;
}

/**
 * advanceEntry — ENTER pressed during the scripted entry.
 * Returns the next EntryState (always a new object; never mutates).
 *
 * narration  → gate-walk  (party + stepsRemaining unchanged)
 * gate-walk  → step forward; decrement stepsRemaining;
 *              if stepsRemaining hits 0 → free
 * free       → no-op (returns s unchanged)
 */
export function advanceEntry(s: EntryState, block: MazeBlock): EntryState {
  switch (s.entryMode) {
    case 'narration':
      return { ...s, entryMode: 'gate-walk' };

    case 'gate-walk': {
      // Forced march: advance one cell forward IGNORING walls (the START-NEW-GAME
      // scripted gate-walk crosses a one-way gate that tryStepForward would block).
      // Use the bare geometry step — same forward delta as tryStepForward, minus the
      // isSolid collision guard.
      const { gx, gy, facing } = s.party;
      const [ngx, ngy] = step(gx, gy, facing, 0, 1);
      const party2: MazeParty = { ...s.party, gx: ngx, gy: ngy };
      const steps = s.stepsRemaining - 1;
      if (steps <= 0) {
        return { party: party2, entryMode: 'free', stepsRemaining: 0 };
      }
      return { party: party2, entryMode: 'gate-walk', stepsRemaining: steps };
    }

    case 'free':
      return s;
  }
}

/**
 * decodeNarrationLines — resolve entry-narration message IDs to display strings.
 *
 * Looks up each id in msgDb.indexedMessages. Strips a single leading `^` if
 * present (anchored-x format code used by the engine). Missing IDs → ''.
 */
export function decodeNarrationLines(msgDb: MessageDb, ids: number[]): string[] {
  return ids.map((id) => {
    const entry = msgDb.indexedMessages.find((m) => m.id === id);
    if (entry === undefined) return '';
    const text = entry.decodedText;
    return text.startsWith('^') ? text.slice(1) : text;
  });
}
