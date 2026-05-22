import { describe, expect, it } from 'vitest';
import {
  initialIntroState,
  stepIntro,
  visibleScrollEntries,
  CREDITS_SCROLL_ENTRIES,
  SCROLL_STEP_PER_FRAME,
  SCROLL_TERMINAL_POS,
} from '../../src/sim/intro-sequence.js';

import {
  POST_SCROLL_HOLD_FRAMES,
  TITLE_HOLD_FRAMES_LONG,
  TITLE_HOLD_FRAMES_SHORT,
} from '../../src/sim/intro-constants.js';

function runFrames(initial = initialIntroState(), frames = 1, inputs = {}) {
  let s = initial;
  for (let i = 0; i < frames; i++) s = stepIntro(s, 1, inputs);
  return s;
}

describe('initialIntroState', () => {
  it('starts in the short pause with full hold', () => {
    const s = initialIntroState();
    expect(s.phase).toBe('splash-pause-short');
    expect(s.frame).toBe(0);
    expect(s.scrollPos).toBe(0);
    expect(s.holdFramesRemaining).toBe(TITLE_HOLD_FRAMES_SHORT);
    expect(s.skipLatch).toBe(false);
  });
});

describe('stepIntro: phase transitions', () => {
  it('counts down the short pause then advances to splash-display', () => {
    const justBefore = runFrames(initialIntroState(), TITLE_HOLD_FRAMES_SHORT - 1);
    expect(justBefore.phase).toBe('splash-pause-short');
    const transition = stepIntro(justBefore);
    expect(transition.phase).toBe('splash-display');
    expect(transition.holdFramesRemaining).toBe(TITLE_HOLD_FRAMES_LONG);
  });

  it('advances from splash-display to splash-pause-long in one frame', () => {
    let s = initialIntroState();
    s = runFrames(s, TITLE_HOLD_FRAMES_SHORT); // → splash-display
    expect(s.phase).toBe('splash-display');
    s = stepIntro(s);
    expect(s.phase).toBe('splash-pause-long');
  });

  it('counts down the long pause then enters scroll', () => {
    let s = runFrames(initialIntroState(), TITLE_HOLD_FRAMES_SHORT + 1 + TITLE_HOLD_FRAMES_LONG - 1);
    expect(s.phase).toBe('splash-pause-long');
    s = stepIntro(s);
    expect(s.phase).toBe('scroll');
    expect(s.scrollPos).toBe(0);
  });

  it('scroll advances scrollPos by 2 per frame', () => {
    let s = runFrames(initialIntroState(), TITLE_HOLD_FRAMES_SHORT + 1 + TITLE_HOLD_FRAMES_LONG);
    expect(s.phase).toBe('scroll');
    s = stepIntro(s);
    expect(s.scrollPos).toBe(SCROLL_STEP_PER_FRAME);
    s = stepIntro(s);
    expect(s.scrollPos).toBe(SCROLL_STEP_PER_FRAME * 2);
  });

  it('scroll terminates at scrollPos > 251 and enters post-scroll', () => {
    let s = runFrames(initialIntroState(), TITLE_HOLD_FRAMES_SHORT + 1 + TITLE_HOLD_FRAMES_LONG);
    // 126 frames at +=2 = 252 → terminates on the 126th
    for (let i = 0; i < 126; i++) s = stepIntro(s);
    expect(s.phase).toBe('post-scroll');
    expect(s.scrollPos).toBeGreaterThan(SCROLL_TERMINAL_POS);
  });

  it('post-scroll counts down and ends in done', () => {
    let s = runFrames(initialIntroState(), TITLE_HOLD_FRAMES_SHORT + 1 + TITLE_HOLD_FRAMES_LONG);
    for (let i = 0; i < 126; i++) s = stepIntro(s);
    expect(s.phase).toBe('post-scroll');
    for (let i = 0; i < POST_SCROLL_HOLD_FRAMES; i++) s = stepIntro(s);
    expect(s.phase).toBe('done');
  });

  it('done is a fixed point', () => {
    let s = { ...initialIntroState(), phase: 'done' as const };
    const before = { ...s };
    s = stepIntro(s, 100);
    expect(s).toEqual(before);
  });
});

describe('stepIntro: skip semantics', () => {
  it('skip during short pause latches and fast-forwards to scroll', () => {
    // step 1 (skip): short pause exhausted → transition to splash-display with hold=0
    const s = stepIntro(initialIntroState(), 1, { skipPressed: true });
    expect(s.phase).toBe('splash-display');
    expect(s.holdFramesRemaining).toBe(0);
    expect(s.skipLatch).toBe(true);
    // step 2: splash-display → splash-pause-long
    let next = stepIntro(s);
    expect(next.phase).toBe('splash-pause-long');
    expect(next.holdFramesRemaining).toBe(0);
    // step 3: long pause already at 0 → scroll with terminal scrollPos (skip latched)
    next = stepIntro(next);
    expect(next.phase).toBe('scroll');
    expect(next.scrollPos).toBeGreaterThan(SCROLL_TERMINAL_POS);
  });

  it('skip during scroll terminates immediately', () => {
    let s = runFrames(initialIntroState(), TITLE_HOLD_FRAMES_SHORT + 1 + TITLE_HOLD_FRAMES_LONG);
    s = stepIntro(s); // → scrollPos = 2
    expect(s.phase).toBe('scroll');
    s = stepIntro(s, 1, { skipPressed: true });
    expect(s.phase).toBe('post-scroll');
  });

  it('skip during post-scroll ends sequence', () => {
    let s = runFrames(initialIntroState(), TITLE_HOLD_FRAMES_SHORT + 1 + TITLE_HOLD_FRAMES_LONG);
    for (let i = 0; i < 126; i++) s = stepIntro(s);
    expect(s.phase).toBe('post-scroll');
    s = stepIntro(s, 1, { skipPressed: true });
    expect(s.phase).toBe('done');
  });
});

describe('visibleScrollEntries: per-frame layout', () => {
  it('returns entries 0/1/2 visible immediately at scrollPos=0', () => {
    const visible = visibleScrollEntries(0);
    const indices = visible.map((v) => v.entryIndex);
    // Entries 0, 1, 2 all have appear=0; entries 3..8 have appear > 0.
    expect(indices.sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('entry 3 becomes visible exactly when scrollPos >= 4', () => {
    expect(visibleScrollEntries(3).some((v) => v.entryIndex === 3)).toBe(false);
    expect(visibleScrollEntries(4).some((v) => v.entryIndex === 4)).toBe(false); // entry 4 appears at 36
    expect(visibleScrollEntries(4).some((v) => v.entryIndex === 3)).toBe(true);
  });

  it('entry slides from initial fieldB toward cap as scroll advances', () => {
    // Entry 3: appear=4, fieldB=0x90, cap=0x0d. After scrollPos=4 (delta=0), y=0x90.
    const v0 = visibleScrollEntries(4).find((v) => v.entryIndex === 3)!;
    expect(v0.y).toBe(0x90);

    // After scrollPos=10 (delta=6), y = 0x90 - 6 = 0x8a.
    const v1 = visibleScrollEntries(10).find((v) => v.entryIndex === 3)!;
    expect(v1.y).toBe(0x90 - 6);

    // Once delta reaches 0x90 - 0x0d = 0x83, y clamps at cap=0x0d.
    const v2 = visibleScrollEntries(4 + 0x83).find((v) => v.entryIndex === 3)!;
    expect(v2.y).toBe(0x0d);
    const v3 = visibleScrollEntries(4 + 0x90).find((v) => v.entryIndex === 3)!;
    expect(v3.y).toBe(0x0d);
  });

  it('returns descriptor indices for entries currently on-screen', () => {
    // At scrollPos=200, entries with appear <= 200 are visible (entries 0..7).
    // Unclamped entries 0, 1, 2 may have y < 0 by now (entry 0 fieldB=0x43, delta=200 → y=-133).
    const visible = visibleScrollEntries(200);
    const tokens = visible.map((v) => v.descriptorIndex).sort((a, b) => a - b);
    // Clamped entries 3..7 are still visible (resting at cap):
    expect(tokens).toContain(1);
    expect(tokens).toContain(2);
    expect(tokens).toContain(3);
    expect(tokens).toContain(4);
    expect(tokens).toContain(5);
    // Unclamped entries with field_b small enough may have left the screen.
    // Entry 0 (descriptor 7) at scrollPos=200 → y=-133, hidden.
    expect(tokens).not.toContain(7);
  });

  it('renders in back-to-front order (high index first)', () => {
    const visible = visibleScrollEntries(200);
    const indices = visible.map((v) => v.entryIndex);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i - 1]!).toBeGreaterThan(indices[i]!);
    }
  });
});

describe('CREDITS_SCROLL_ENTRIES table integrity', () => {
  it('has exactly 9 entries matching the engine layout', () => {
    expect(CREDITS_SCROLL_ENTRIES).toHaveLength(9);
  });

  it("entry[8]'s appear matches the doc (152)", () => {
    expect(CREDITS_SCROLL_ENTRIES[8]!.appear).toBe(152);
  });

  it('all descriptor tokens are in credits.pic range (0..12)', () => {
    for (const e of CREDITS_SCROLL_ENTRIES) {
      expect(e.token).toBeGreaterThanOrEqual(0);
      expect(e.token).toBeLessThanOrEqual(12);
    }
  });
});
