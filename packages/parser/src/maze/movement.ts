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

/**
 * tryStepForward — advance the party one cell in the current facing IFF the
 * forward edge of the party's current cell is OPEN (wall field = 0).
 *
 * Uses the same corrected forward-edge selector as classify.ts
 * (wmaze 0x3828 / 0x36dd / 0x3742) and the same per-facing view-step law
 * (wmaze 0x37a7), both imported from maze-geometry.ts.
 *
 * Solid wall (field ≥ 1, including doors at code 3): returns party unchanged.
 * Open (field = 0): returns party with (gx, gy) advanced by the facing delta.
 */
export function tryStepForward(party: MazeParty, block: MazeBlock): MazeParty {
  const { gx, gy, facing } = party;
  const edge = forwardEdge(block, gx, gy, facing);
  if (isSolid(edge)) {
    return party;
  }
  // Advance one cell forward: lateral=0, forward=1
  const [ngx, ngy] = step(gx, gy, facing, 0, 1);
  return { ...party, gx: ngx, gy: ngy };
}
