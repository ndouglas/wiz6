/**
 * entry-sequence.ts — pure FSM reducer for the START-NEW-GAME scripted entry.
 *
 * The engine drives the dungeon entry as a TIMED AUTO-PUSH CUTSCENE (copy-protection
 * SKIPPED in the port): the party advances ~1 cell every couple of seconds on a
 * timer (NOT ENTER-stepped), pausing at text beats, while TWO portcullis gates lift
 * open with sound. The 8 cutscene beats:
 *
 *   door-open  — castle doors slide apart in the viewport (door:0→7), gy=117.
 *                Animation mode (animFrame ticks). → title.
 *   title      — "ENTERING / BANE OF THE COSMIC FORGE" card on the gray widget,
 *                gy=117. Held a few seconds, then AUTO-pushes → approach1 (gy 117→118).
 *   approach1  — "APPROACHING THE GATE..." 3-line narration + the FIRST gate (closed)
 *                ahead, gy=118. WAITS for ENTER (the one interactive beat), then →
 *                gate1-open (no move). tickEntry does NOT auto-advance this beat.
 *   gate1-open — the FIRST portcullis lifts (gate1:0→7), gy=118, sound plays.
 *                Animation mode. → walk (gy 118→119).
 *   walk       — transit, clean black strip, gy=119. Held ~2s, then → approach2
 *                (gy 119→120).
 *   approach2  — "HMMM..." + the SECOND gate (closed) ahead, gy=120. Held, then →
 *                gate2-open (no move).
 *   gate2-open — the SECOND portcullis lifts (gate2:0→7), gy=120, sound plays.
 *                Animation mode. → free (gy 120→121).
 *   free       — free-roam begins; this reducer is inert (movement handled elsewhere).
 *
 * The gy progression across the cutscene: 117, 117, 118, 118, 119, 120, 120, 121.
 *
 * Two drive functions:
 *   tickEntry(s)  — the viewer's per-tick cutscene driver. Advances animation
 *                   frames, accumulates hold ticks, and AUTO-pushes the party
 *                   forward at each beat's threshold. Drives the WHOLE cutscene
 *                   without input. 'free' is inert (returns the same ref).
 *   advanceEntry(s, block) — ENTER pressed: SKIP the current beat to its end/next
 *                   (an impatient player fast-forwards what tickEntry would do).
 *
 * Pure — no I/O, no Date, no random, no node:* imports.
 *
 * Engine reference: wmaze state 5/6/23 (CLAUDE.md overlay state table); the two
 * viewport gate animations + auto-push + gate sounds (#4 then #13) are pinned in
 * docs/re/findings/maze-gate-open-animation.json.
 */

import type { MazeBlock, MazeParty } from '@wiz6/data';
import type { MessageDb } from '@wiz6/data';
import { step } from './maze-geometry.js';

export type EntryMode =
  | 'door-open'
  | 'title'
  | 'approach1'
  | 'gate1-open'
  | 'walk'
  | 'approach2'
  | 'gate2-open'
  | 'free';

/** Per-sequence captured-oracle frame counts — each animation uses exactly the
 *  engine's DISTINCT visual states, no more, no fewer (too few skips states;
 *  duplicates make it look like it jumps). The castle doors snap between 6 fixed
 *  slide positions; the first portcullis lifts over 12 frames (its lift spans far
 *  more engine frames); the second over 8. The extractor, parity gate, and viewer
 *  all key off these counts. */
export const ENTRY_ANIM_FRAME_COUNTS = { door: 6, gate1: 12, gate2: 8 } as const;
export type EntryAnimSeq = keyof typeof ENTRY_ANIM_FRAME_COUNTS;

/** Last animation frame index for an animation mode's sequence (count − 1). */
export function animLastForMode(mode: EntryMode): number {
  if (mode === 'door-open') return ENTRY_ANIM_FRAME_COUNTS.door - 1;
  if (mode === 'gate1-open') return ENTRY_ANIM_FRAME_COUNTS.gate1 - 1;
  if (mode === 'gate2-open') return ENTRY_ANIM_FRAME_COUNTS.gate2 - 1;
  return 0;
}

/** Back-compat default (the standard 8-frame sequence length − 1 = gate2's).
 *  Prefer animLastForMode(mode) — per-sequence counts differ. */
export const ANIM_LAST = ENTRY_ANIM_FRAME_COUNTS.gate2 - 1;

/** Hold thresholds, in CUTSCENE ticks (see MazeView CUTSCENE_TICK_MS for the
 *  ms-per-tick). A hold beat advances when holdTicks reaches the threshold.
 *  Text beats hold ~2.5s; the transit cell holds ~2s (a couple seconds/cell). */
export const TITLE_HOLD = 13;
export const TEXT_HOLD = 13;
export const WALK_HOLD = 10;

export interface EntryState {
  party: MazeParty;
  entryMode: EntryMode;
  /** 0-based animation frame index for animation modes ('door-open',
   *  'gate1-open', 'gate2-open'); 0 for non-animation modes. tickEntry advances it. */
  animFrame: number;
  /** Ticks elapsed in the current non-animation HOLD beat (title/approach1/walk/
   *  approach2). 0 in animation modes and reset to 0 on every beat transition. */
  holdTicks: number;
}

/** True iff the mode is one of the three viewport-animation modes (door slide /
 *  first portcullis lift / second portcullis lift). The viewer uses this to pick
 *  the per-frame oracle viewport and to drive the per-frame anim sound/timer. */
export function isAnimationMode(mode: EntryMode): boolean {
  return mode === 'door-open' || mode === 'gate1-open' || mode === 'gate2-open';
}

/** Forced march: advance one cell forward IGNORING walls (the scripted cutscene
 *  crosses one-way gates that free-roam collision would block). Same forward
 *  delta as tryStepForward, minus the isSolid guard. */
function forcedStep(party: MazeParty): MazeParty {
  const { gx, gy, facing } = party;
  const [ngx, ngy] = step(gx, gy, facing, 0, 1);
  return { ...party, gx: ngx, gy: ngy };
}

/**
 * tickEntry — the cutscene driver (one call per CUTSCENE_TICK_MS). Drives the
 * WHOLE auto-push cutscene; the viewer calls it on a timer for every non-free
 * scripted mode and stops once it reaches 'free'.
 *
 * Animation modes advance one captured frame per tick to ANIM_LAST, then
 * transition (some with a forcedStep). Hold modes accumulate holdTicks until the
 * beat threshold, then transition (some with a forcedStep), resetting holdTicks.
 * 'free' returns the SAME reference (inert).
 */
export function tickEntry(s: EntryState): EntryState {
  switch (s.entryMode) {
    case 'door-open':
      // Castle doors slide apart (gy stays 117); finished → ENTERING title.
      if (s.animFrame < animLastForMode(s.entryMode)) return { ...s, animFrame: s.animFrame + 1 };
      return { ...s, entryMode: 'title', animFrame: 0, holdTicks: 0 };

    case 'title':
      // Hold the ENTERING title, then auto-push toward the first gate (gy 117→118).
      if (s.holdTicks < TITLE_HOLD) return { ...s, holdTicks: s.holdTicks + 1 };
      return {
        party: forcedStep(s.party),
        entryMode: 'approach1',
        animFrame: 0,
        holdTicks: 0,
      };

    case 'approach1':
      // The APPROACHING narration in front of the first (closed) gate WAITS for the
      // player to press ENTER (the engine's one interactive beat) — tickEntry does
      // NOT auto-advance it. advanceEntry (ENTER) starts the first portcullis lift.
      return s;

    case 'gate1-open':
      // First portcullis lifts (gy stays 118); finished → walk through (gy 118→119).
      if (s.animFrame < animLastForMode(s.entryMode)) return { ...s, animFrame: s.animFrame + 1 };
      return {
        party: forcedStep(s.party),
        entryMode: 'walk',
        animFrame: 0,
        holdTicks: 0,
      };

    case 'walk':
      // Transit on the clean black strip, then auto-push to the second gate (gy 119→120).
      if (s.holdTicks < WALK_HOLD) return { ...s, holdTicks: s.holdTicks + 1 };
      return {
        party: forcedStep(s.party),
        entryMode: 'approach2',
        animFrame: 0,
        holdTicks: 0,
      };

    case 'approach2':
      // Hold the HMMM... in front of the second (closed) gate, then START the
      // second portcullis lift (no party move — the gate is the cell ahead).
      if (s.holdTicks < TEXT_HOLD) return { ...s, holdTicks: s.holdTicks + 1 };
      return { ...s, entryMode: 'gate2-open', animFrame: 0, holdTicks: 0 };

    case 'gate2-open':
      // Second portcullis lifts (gy stays 120); finished → free-roam (gy 120→121).
      if (s.animFrame < animLastForMode(s.entryMode)) return { ...s, animFrame: s.animFrame + 1 };
      return {
        party: forcedStep(s.party),
        entryMode: 'free',
        animFrame: 0,
        holdTicks: 0,
      };

    case 'free':
      return s;
  }
}

/**
 * advanceEntry — ENTER pressed during the cutscene: SKIP the current beat to its
 * end / next beat (fast-forward exactly what tickEntry would eventually do).
 * Returns a new EntryState (except 'free', which returns the same reference).
 *
 * door-open  → title       (skip the door slide; no party move)
 * title      → approach1   (+1 forward step: gy 117→118)
 * approach1  → gate1-open   (start the first lift; no move)
 * gate1-open → walk         (skip the first lift; +1 forward step: gy 118→119)
 * walk       → approach2    (+1 forward step: gy 119→120)
 * approach2  → gate2-open   (start the second lift; no move)
 * gate2-open → free         (skip the second lift; +1 forward step: gy 120→121)
 * free       → no-op (returns s unchanged)
 */
export function advanceEntry(s: EntryState, _block: MazeBlock): EntryState {
  switch (s.entryMode) {
    case 'door-open':
      return { ...s, entryMode: 'title', animFrame: 0, holdTicks: 0 };

    case 'title':
      return {
        party: forcedStep(s.party),
        entryMode: 'approach1',
        animFrame: 0,
        holdTicks: 0,
      };

    case 'approach1':
      return { ...s, entryMode: 'gate1-open', animFrame: 0, holdTicks: 0 };

    case 'gate1-open':
      return {
        party: forcedStep(s.party),
        entryMode: 'walk',
        animFrame: 0,
        holdTicks: 0,
      };

    case 'walk':
      return {
        party: forcedStep(s.party),
        entryMode: 'approach2',
        animFrame: 0,
        holdTicks: 0,
      };

    case 'approach2':
      return { ...s, entryMode: 'gate2-open', animFrame: 0, holdTicks: 0 };

    case 'gate2-open':
      return {
        party: forcedStep(s.party),
        entryMode: 'free',
        animFrame: 0,
        holdTicks: 0,
      };

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
