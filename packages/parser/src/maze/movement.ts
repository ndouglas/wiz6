/**
 * movement.ts — discrete dungeon movement (turn + wall-collision step).
 *
 * Operates on GLOBAL cell coords `{gx, gy, z, facing}` (= MazeParty, @wiz6/data).
 *
 * Engine reference: maze_can_step_in_facing (wmaze 0x3244).
 *   - left / right: turn facing ∓/± 1 mod 4. No coord change.
 *   - forward (up): check the forward edge of the party's current cell; if SOLID
 *     (non-zero), no-op; else advance (gx,gy) by the per-facing forward delta.
 *   - back-step (down): NOT IMPLEMENTED — Wiz6 has no back-step.
 *
 * Geometry (forward-edge selector + step deltas) is imported from maze-geometry.ts,
 * which is the same code that backs the byte-exact classify pass. No duplication.
 */

import type { MazeBlock, MazeParty } from '@wiz6/data';
import { isSolid, step, forwardEdge } from './maze-geometry.js';

/**
 * turn — rotate the party's facing left or right by 1 step (mod 4).
 *   left  = (facing + 3) % 4  (≡ facing − 1)
 *   right = (facing + 1) % 4
 * Returns a new MazeParty with the updated facing; gx/gy/z are unchanged.
 */
export function turn(party: MazeParty, dir: 'left' | 'right'): MazeParty {
  const delta = dir === 'left' ? 3 : 1;
  return { ...party, facing: (party.facing + delta) % 4 };
}

/** Engine forward-step verdict for a (cell,facing): open = walkable, blocked = wall,
 *  encounter = walkable-but-triggers-combat (treated as a no-op until combat lands). */
export type ForwardVerdict = 'open' | 'blocked' | 'encounter';

/** Options for tryStepForward. */
export interface MovementOpts {
  /** Captured engine forward-passability keyed by passabilityKey(party). When a key is
   *  present it is AUTHORITATIVE (the faithful-level-0 gate); absent → wall-model fallback. */
  passability?: Map<string, ForwardVerdict>;
}

/** Stable key for the passability map: "gx,gy,facing". */
export function passabilityKey(p: { gx: number; gy: number; facing: number }): string {
  return `${p.gx},${p.gy},${p.facing}`;
}

/** Build the runtime passability map from a committed passability table (shared by the
 *  viewer loader and the tests so both decode identically). */
export function passabilityFromTable(
  table: { cells: Array<{ gx: number; gy: number; facing: number; forward: ForwardVerdict }> },
): Map<string, ForwardVerdict> {
  const m = new Map<string, ForwardVerdict>();
  for (const c of table.cells) m.set(passabilityKey(c), c.forward);
  return m;
}

/**
 * tryStepForward — advance the party one cell in the current facing IFF forward is open.
 *
 * FAITHFUL GATE: if `opts.passability` has a verdict for this (cell,facing), it is
 * authoritative — 'open' steps, 'blocked'/'encounter' are no-ops (encounter is kept
 * distinct so combat can hook it later). Otherwise falls back to the wall model
 * (isSolid(forwardEdge), wmaze 0x3828/0x36dd/0x3742) + the per-facing step (0x37a7).
 * Pure + total: a missing/malformed map never throws.
 */
export function tryStepForward(party: MazeParty, block: MazeBlock, opts?: MovementOpts): MazeParty {
  const { gx, gy, facing } = party;
  const verdict = opts?.passability?.get(passabilityKey(party));
  const open = verdict !== undefined ? verdict === 'open' : !isSolid(forwardEdge(block, gx, gy, facing));
  if (!open) return party;
  const [ngx, ngy] = step(gx, gy, facing, 0, 1);
  return { ...party, gx: ngx, gy: ngy };
}
