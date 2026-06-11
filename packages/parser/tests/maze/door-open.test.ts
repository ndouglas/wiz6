import { describe, it, expect } from 'vitest';
import {
  strainBarLength,
  forceAttempt,
  pickAttempt,
  detectDoorAtParty,
  type ForceMember,
  type PickMember,
} from '../../src/maze/door-open.js';

// Scripted RNG: returns queued values, asserting the requested bound matches.
function scriptRng(seq: Array<[number, number]>) {
  let i = 0;
  return {
    uniform(n: number) {
      const e = seq[i++];
      if (!e) throw new Error('rng underflow');
      const [bound, val] = e;
      if (bound !== n) throw new Error(`bound ${n}!=${bound}`);
      return val;
    },
  };
}

// ---------------------------------------------------------------------------
// strainBarLength
// ---------------------------------------------------------------------------

describe('strainBarLength', () => {
  it('= clamp(18 - STR + 2*lock, 1, 18)', () => {
    expect(strainBarLength(18, 0, false)).toBe(1);  // 18-18+0=0 -> clamp 1
    expect(strainBarLength(10, 5, false)).toBe(18); // 18-10+10=18
    expect(strainBarLength(15, 2, false)).toBe(7);  // 18-15+4=7
  });
  it('forces 18 when welded', () => {
    expect(strainBarLength(18, 0, true)).toBe(18);
  });
});

// ---------------------------------------------------------------------------
// forceAttempt
// ---------------------------------------------------------------------------

const strong: ForceMember = {
  str: 18,
  spCur: 100,
  spMax: 100,
  level: 1,
  skulduggery: 0,
  class: 0,
};

describe('forceAttempt', () => {
  it('SUCCESS when progress >= strain_len', () => {
    const rng = scriptRng([[50, 7], [18, 17], [18, 17], [18, 17], [18, 17]]);
    expect(forceAttempt(strong, 0, false, rng)).toBe('success'); // strain_len=1, progress=17
  });
  it('FAILURE when progress < strain_len', () => {
    const weak: ForceMember = {
      str: 3,
      spCur: 100,
      spMax: 100,
      level: 1,
      skulduggery: 0,
      class: 0,
    };
    const rng = scriptRng([[50, 7], [3, 0], [3, 0], [3, 0], [3, 0]]); // effSTR=3, progress->1, strain_len=18
    expect(forceAttempt(weak, 10, false, rng)).toBe('failure');
  });
  it('JAMMED when welded', () => {
    const rng = scriptRng([[50, 7], [18, 17], [18, 17], [18, 17], [18, 17]]);
    expect(forceAttempt(strong, 0, true, rng)).toBe('jammed');
  });
});

// ---------------------------------------------------------------------------
// pickAttempt
// ---------------------------------------------------------------------------

const thief: PickMember = { level: 5, skulduggery: 20, class: 3 };

describe('pickAttempt', () => {
  it('SUCCESS iff every tumbler rolls rng(skill) > 0', () => {
    const rng = scriptRng([[25, 10], [25, 5], [25, 3]]); // lock6->3 tumblers, skill25
    expect(pickAttempt(thief, 6, false, rng)).toBe('success');
  });
  it('FAILURE if any tumbler rolls 0 (still consumes all draws)', () => {
    const rng = scriptRng([[25, 10], [25, 0], [25, 3]]);
    expect(pickAttempt(thief, 6, false, rng)).toBe('failure');
  });
  it('JAMMED when welded', () => {
    const rng = scriptRng([[25, 10], [25, 5], [25, 3]]);
    expect(pickAttempt(thief, 6, true, rng)).toBe('jammed');
  });
  it('clamps skill to 95 and tumblers to 6', () => {
    const sup: PickMember = { level: 90, skulduggery: 90, class: 3 };
    const rng = scriptRng([[95, 1], [95, 1], [95, 1], [95, 1], [95, 1], [95, 1]]); // lock30->6 tumblers
    expect(pickAttempt(sup, 30, false, rng)).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// detectDoorAtParty
// ---------------------------------------------------------------------------

describe('detectDoorAtParty', () => {
  const doors = [
    { gx: 128, gy: 131, facing: 1, lockStrength: 12, welded: false },
  ];
  it('returns the door when the party faces it', () => {
    expect(
      detectDoorAtParty(doors, { gx: 128, gy: 131, facing: 1 })?.lockStrength,
    ).toBe(12);
  });
  it('returns null when facing elsewhere or no door', () => {
    expect(
      detectDoorAtParty(doors, { gx: 128, gy: 131, facing: 0 }),
    ).toBeNull();
    expect(
      detectDoorAtParty(doors, { gx: 0, gy: 0, facing: 1 }),
    ).toBeNull();
  });
});
