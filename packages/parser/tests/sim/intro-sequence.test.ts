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
  PHASE_FRAMES_BRADLEY_SPLASH,
  PHASE_FRAMES_PAUSE_BETWEEN_SPLASHES,
  PHASE_FRAMES_PAUSE_PRE_SCROLL,
  PHASE_FRAMES_PAUSE_PRE_SIRTECH,
  PHASE_FRAMES_POST_SCROLL,
  PHASE_FRAMES_SIRTECH_SPLASH,
} from '../../src/sim/intro-constants.js';

function runFrames(initial = initialIntroState(), frames = 1, inputs = {}) {
  let s = initial;
  for (let i = 0; i < frames; i++) s = stepIntro(s, 1, inputs);
  return s;
}

describe('initialIntroState', () => {
  it('starts in pause-pre-sirtech with full hold', () => {
    const s = initialIntroState();
    expect(s.phase).toBe('pause-pre-sirtech');
    expect(s.holdFramesRemaining).toBe(PHASE_FRAMES_PAUSE_PRE_SIRTECH);
    expect(s.scrollPos).toBe(0);
    expect(s.skipLatch).toBe(false);
  });
});

describe('stepIntro: phase progression', () => {
  it('walks through every pre-scroll phase in order', () => {
    let s = initialIntroState();
    s = runFrames(s, PHASE_FRAMES_PAUSE_PRE_SIRTECH);
    expect(s.phase).toBe('sirtech-splash');
    s = runFrames(s, PHASE_FRAMES_SIRTECH_SPLASH);
    expect(s.phase).toBe('pause-between');
    s = runFrames(s, PHASE_FRAMES_PAUSE_BETWEEN_SPLASHES);
    expect(s.phase).toBe('bradley-splash');
    s = runFrames(s, PHASE_FRAMES_BRADLEY_SPLASH);
    expect(s.phase).toBe('pause-pre-scroll');
    s = runFrames(s, PHASE_FRAMES_PAUSE_PRE_SCROLL);
    expect(s.phase).toBe('scroll');
    expect(s.scrollPos).toBe(0);
  });

  it('scroll terminates and enters post-scroll, then done', () => {
    let s = initialIntroState();
    const preScrollFrames =
      PHASE_FRAMES_PAUSE_PRE_SIRTECH +
      PHASE_FRAMES_SIRTECH_SPLASH +
      PHASE_FRAMES_PAUSE_BETWEEN_SPLASHES +
      PHASE_FRAMES_BRADLEY_SPLASH +
      PHASE_FRAMES_PAUSE_PRE_SCROLL;
    s = runFrames(s, preScrollFrames);
    expect(s.phase).toBe('scroll');
    // 126 frames at +=2 → scrollPos = 252 (> 251 = terminal)
    s = runFrames(s, 126);
    expect(s.phase).toBe('post-scroll');
    expect(s.scrollPos).toBeGreaterThan(SCROLL_TERMINAL_POS);
    s = runFrames(s, PHASE_FRAMES_POST_SCROLL);
    expect(s.phase).toBe('done');
  });

  it('scroll advances scrollPos by 2 per frame', () => {
    let s = initialIntroState();
    const preScrollFrames =
      PHASE_FRAMES_PAUSE_PRE_SIRTECH +
      PHASE_FRAMES_SIRTECH_SPLASH +
      PHASE_FRAMES_PAUSE_BETWEEN_SPLASHES +
      PHASE_FRAMES_BRADLEY_SPLASH +
      PHASE_FRAMES_PAUSE_PRE_SCROLL;
    s = runFrames(s, preScrollFrames);
    expect(s.phase).toBe('scroll');
    s = stepIntro(s);
    expect(s.scrollPos).toBe(SCROLL_STEP_PER_FRAME);
    s = stepIntro(s);
    expect(s.scrollPos).toBe(SCROLL_STEP_PER_FRAME * 2);
  });

  it('done is a fixed point', () => {
    let s = { ...initialIntroState(), phase: 'done' as const };
    const before = { ...s };
    s = stepIntro(s, 100);
    expect(s).toEqual(before);
  });
});

describe('stepIntro: skip semantics', () => {
  it('skip in pause-pre-sirtech latches and cascades to scroll', () => {
    // step 1 (skip): hold drops to 0 in same call → transitions to sirtech-splash with hold=0
    let s = stepIntro(initialIntroState(), 1, { skipPressed: true });
    expect(s.phase).toBe('sirtech-splash');
    expect(s.skipLatch).toBe(true);
    expect(s.holdFramesRemaining).toBe(0);
    // Each subsequent step cascades through one phase (each hold is 0 due to latch).
    s = stepIntro(s);
    expect(s.phase).toBe('pause-between');
    s = stepIntro(s);
    expect(s.phase).toBe('bradley-splash');
    s = stepIntro(s);
    expect(s.phase).toBe('pause-pre-scroll');
    s = stepIntro(s);
    expect(s.phase).toBe('scroll');
    // Skip latch fast-forwards past scroll too.
    expect(s.scrollPos).toBeGreaterThan(SCROLL_TERMINAL_POS);
  });

  it('skip during scroll terminates immediately', () => {
    let s = initialIntroState();
    const preScrollFrames =
      PHASE_FRAMES_PAUSE_PRE_SIRTECH +
      PHASE_FRAMES_SIRTECH_SPLASH +
      PHASE_FRAMES_PAUSE_BETWEEN_SPLASHES +
      PHASE_FRAMES_BRADLEY_SPLASH +
      PHASE_FRAMES_PAUSE_PRE_SCROLL;
    s = runFrames(s, preScrollFrames);
    s = stepIntro(s); // scrollPos = 2
    expect(s.phase).toBe('scroll');
    s = stepIntro(s, 1, { skipPressed: true });
    expect(s.phase).toBe('post-scroll');
  });

  it('skip during post-scroll ends sequence', () => {
    let s = initialIntroState();
    const preScrollFrames =
      PHASE_FRAMES_PAUSE_PRE_SIRTECH +
      PHASE_FRAMES_SIRTECH_SPLASH +
      PHASE_FRAMES_PAUSE_BETWEEN_SPLASHES +
      PHASE_FRAMES_BRADLEY_SPLASH +
      PHASE_FRAMES_PAUSE_PRE_SCROLL;
    s = runFrames(s, preScrollFrames);
    s = runFrames(s, 126);
    expect(s.phase).toBe('post-scroll');
    s = stepIntro(s, 1, { skipPressed: true });
    expect(s.phase).toBe('done');
  });
});

describe('visibleScrollEntries: per-frame layout', () => {
  it('entries 0/1/2 visible at scrollPos=0', () => {
    const visible = visibleScrollEntries(0);
    const indices = visible.map((v) => v.entryIndex).sort((a, b) => a - b);
    expect(indices).toEqual([0, 1, 2]);
  });

  it('entry 3 becomes visible at scrollPos >= 4', () => {
    expect(visibleScrollEntries(3).some((v) => v.entryIndex === 3)).toBe(false);
    expect(visibleScrollEntries(4).some((v) => v.entryIndex === 3)).toBe(true);
  });

  it('clamped entry (i<3) slides to cap then rests there forever', () => {
    // Entry 0: appear=0, fieldB=0x43, cap=3.
    expect(visibleScrollEntries(0).find((v) => v.entryIndex === 0)!.y).toBe(0x43);
    expect(visibleScrollEntries(10).find((v) => v.entryIndex === 0)!.y).toBe(0x43 - 10);
    // Past clamp threshold: y stays at cap.
    expect(visibleScrollEntries(0x80).find((v) => v.entryIndex === 0)!.y).toBe(3);
    expect(visibleScrollEntries(0x200).find((v) => v.entryIndex === 0)!.y).toBe(3);
  });

  it('credit panel (i in 3..7) slides from fieldB and culls at y < cap', () => {
    // Entry 3: appear=4, fieldB=0x90=144, cap=0x0d=13.
    // Visible while y >= cap=13. Once delta > 144-13 = 131 (scrollPos > 135), cull.
    expect(visibleScrollEntries(4).find((v) => v.entryIndex === 3)!.y).toBe(0x90);
    expect(visibleScrollEntries(50).find((v) => v.entryIndex === 3)!.y).toBe(0x90 - 46);
    // Still visible at cap (y == cap exactly).
    expect(visibleScrollEntries(4 + 131).find((v) => v.entryIndex === 3)!.y).toBe(0x0d);
    // Past cap: culled (doesn't peek above the logo area).
    expect(visibleScrollEntries(4 + 132).some((v) => v.entryIndex === 3)).toBe(false);
    expect(visibleScrollEntries(200).some((v) => v.entryIndex === 3)).toBe(false);
  });

  it('entry 8 (copyright finale) clamps at cap and persists', () => {
    // Entry 8: appear=152, fieldB=0x50=80, cap=0x50=80. Static at y=80 forever.
    expect(visibleScrollEntries(152).find((v) => v.entryIndex === 8)!.y).toBe(0x50);
    expect(visibleScrollEntries(200).find((v) => v.entryIndex === 8)!.y).toBe(0x50);
    expect(visibleScrollEntries(0xff).find((v) => v.entryIndex === 8)!.y).toBe(0x50);
  });

  it('renders in back-to-front order (high index first)', () => {
    const visible = visibleScrollEntries(200);
    const indices = visible.map((v) => v.entryIndex);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i - 1]!).toBeGreaterThan(indices[i]!);
    }
  });

  it('descriptorIndex is token - 1 (1-indexed → 0-indexed)', () => {
    // Entry 0: token=7 → desc 6 (Wizardry logo top)
    const e0 = visibleScrollEntries(0).find((v) => v.entryIndex === 0)!;
    expect(e0.descriptorIndex).toBe(6);
    // Entry 1: token=8 → desc 7
    const e1 = visibleScrollEntries(0).find((v) => v.entryIndex === 1)!;
    expect(e1.descriptorIndex).toBe(7);
    // Entry 8: token=6 → desc 5 (copyright notice)
    const e8 = visibleScrollEntries(152).find((v) => v.entryIndex === 8)!;
    expect(e8.descriptorIndex).toBe(5);
  });
});

describe('CREDITS_SCROLL_ENTRIES table integrity', () => {
  it('has exactly 9 entries', () => {
    expect(CREDITS_SCROLL_ENTRIES).toHaveLength(9);
  });

  it("entry[8]'s appear matches the engine table (152)", () => {
    expect(CREDITS_SCROLL_ENTRIES[8]!.appear).toBe(152);
  });

  it('all descriptor tokens are in credits.pic range (0..12)', () => {
    for (const e of CREDITS_SCROLL_ENTRIES) {
      expect(e.token).toBeGreaterThanOrEqual(0);
      expect(e.token).toBeLessThanOrEqual(12);
    }
  });
});
