/**
 * door-open.ts — pure FORCE/PICK door-open logic for the in-dungeon OPTIONS → OPEN flow.
 *
 * All functions are pure (no I/O). RNG is injected via the Rng interface so callers
 * and parity tests can supply a scripted stream that exactly replays the engine's draw
 * sequence. CRITICAL: the RNG draw order and count must match the engine exactly — a
 * later parity test (Stage 4) replays the real engine RNG stream. Do NOT short-circuit
 * loops that the engine runs fully.
 *
 * Reference: wmaze.ovr disassembly, docs/re/findings/maze-open-door-menu.json.
 */

import { DOOR_ROLL, type Rng, type DoorRecord } from '@wiz6/data';

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ForceMember {
  str: number;
  spCur: number;
  spMax: number;
  level: number;
  skulduggery: number;
  class: number;
}

export interface PickMember {
  level: number;
  skulduggery: number;
  class: number;
}

export interface PartyPos {
  gx: number;
  gy: number;
  facing: number;
}

export type DoorOutcome = 'success' | 'failure' | 'jammed';

// ---------------------------------------------------------------------------
// Function 1 — strainBarLength
// ---------------------------------------------------------------------------

/**
 * Engine strain-bar length: clamp(18 - STR + 2*lock, 1, 18); 18 if welded.
 * (wmaze 0x8b6c..0x8ba7.)
 */
export function strainBarLength(
  str: number,
  lock: number,
  welded: boolean,
): number {
  if (welded) return DOOR_ROLL.strainMax;
  return clamp(DOOR_ROLL.strainMax - str + 2 * lock, 1, DOOR_ROLL.strainMax);
}

// ---------------------------------------------------------------------------
// Function 2 — forceAttempt
// ---------------------------------------------------------------------------

/**
 * Roll a FORCE attempt against the door and return the outcome.
 *
 * RNG draw order (must match engine exactly):
 *   1. ONE rng.uniform(50) — fatigue draw. Consumed to keep the stream aligned.
 *      The SP-drain/collapse side-effect is deferred to the caller (Stage 4).
 *   2. FOUR rng.uniform(max(1, effSTR)) — strength contribution rolls.
 *
 * effSTR = spMax > 0 ? floor(str * spCur / spMax) : 0
 * progress = clamp(floor(sum / 4), 1, 18)
 * success iff progress >= strainBarLength(str, lock, welded)
 * welded door always returns 'jammed' (after consuming all draws).
 */
export function forceAttempt(
  m: ForceMember,
  lock: number,
  welded: boolean,
  rng: Rng,
): DoorOutcome {
  // Draw 1: fatigue roll — consumed to keep RNG stream aligned with engine.
  rng.uniform(DOOR_ROLL.fatigueOdds);

  // Effective STR reduced proportionally by current SP.
  const effSTR = m.spMax > 0 ? Math.floor((m.str * m.spCur) / m.spMax) : 0;
  const bound = Math.max(1, effSTR);

  // Draw 2..5: four strength rolls.
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    sum += rng.uniform(bound);
  }

  const progress = clamp(Math.floor(sum / 4), 1, DOOR_ROLL.strainMax);
  const strainLen = strainBarLength(m.str, lock, welded);

  if (welded) return 'jammed';
  return progress >= strainLen ? 'success' : 'failure';
}

// ---------------------------------------------------------------------------
// Function 3 — pickAttempt
// ---------------------------------------------------------------------------

/**
 * Roll a PICK attempt against the door and return the outcome.
 *
 * skill = clamp(level + skulduggery, 0, 95)
 * tumblers = clamp(floor(lock / 3) + 1, 1, 6)
 *
 * Loop tumblers times: draw rng.uniform(skill); if <= 0 mark fail.
 * ALL tumblers are consumed (no short-circuit) to match engine draw count.
 *
 * success iff all tumblers pass; welded door always returns 'jammed'
 * (after consuming all draws).
 */
export function pickAttempt(
  m: PickMember,
  lock: number,
  welded: boolean,
  rng: Rng,
): DoorOutcome {
  const skill = clamp(
    m.level + m.skulduggery,
    0,
    DOOR_ROLL.skillCap,
  );
  const tumblers = clamp(
    Math.floor(lock / 3) + 1,
    1,
    DOOR_ROLL.maxTumblers,
  );

  let allPass = true;
  for (let i = 0; i < tumblers; i++) {
    const roll = rng.uniform(skill);
    if (roll <= 0) allPass = false;
  }

  if (welded) return 'jammed';
  return allPass ? 'success' : 'failure';
}

// ---------------------------------------------------------------------------
// Function 4 — detectDoorAtParty
// ---------------------------------------------------------------------------

/**
 * Return the door record at the party's current grid cell + facing, or null.
 * Matching is exact on gx, gy, and facing.
 */
export function detectDoorAtParty(
  doors: readonly DoorRecord[],
  party: PartyPos,
): DoorRecord | null {
  return (
    doors.find(
      (d) => d.gx === party.gx && d.gy === party.gy && d.facing === party.facing,
    ) ?? null
  );
}
