/**
 * entry-sequence.test.ts — gate for the START-NEW-GAME cutscene FSM (tickEntry +
 * advanceEntry + isAnimationMode) + decodeNarrationLines.
 *
 * The entry is a TIMED AUTO-PUSH CUTSCENE (8 beats): the party advances ~1 cell
 * every couple of seconds on a timer (tickEntry), pausing at text beats, while TWO
 * portcullis gates lift open. ENTER (advanceEntry) skips the current beat.
 *
 * Beat order + gy progression:
 *   door-open(117) → title(117) → approach1(118) → gate1-open(118) → walk(119) →
 *   approach2(120) → gate2-open(120) → free(121)
 *
 * Uses a hand-built open-corridor MazeBlock + the REAL level-0 block to prove the
 * forced march crosses the two solid gate walls free-roam collision would block.
 *
 * Engine reference: docs/re/findings/maze-gate-open-animation.json (the two
 * viewport gate animations + auto-push + gate sounds).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  advanceEntry,
  tickEntry,
  isAnimationMode,
  ANIM_LAST,
  TITLE_HOLD,
  TEXT_HOLD,
  WALK_HOLD,
  type EntryState,
} from '../../src/maze/entry-sequence.js';
import { decodeNarrationLines } from '../../src/maze/entry-sequence.js';
import { tryStepForward } from '../../src/maze/movement.js';
import type { MazeBlock, MazeParty, MessageDb } from '@wiz6/data';

// Real level-0 MazeBlock loaded from extracted/maze/level-0.json (fs is fine in tests).
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
const REAL_LEVEL_0 = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'extracted', 'maze', 'level-0.json'), 'utf8'),
) as { mazeBlock: MazeBlock };
const REAL_BLOCK: MazeBlock = REAL_LEVEL_0.mazeBlock;

// ---------------------------------------------------------------------------
// MazeBlock helper — open corridor along facing 0 (north) at gx=127,gy=117+.
// ---------------------------------------------------------------------------
function makeOpenBlock(gxBase: number, gyBase: number): MazeBlock {
  const cells = Array.from({ length: 64 }, () => ({
    north: 0,
    west: 0,
    special4: 0,
    orient2: 0,
    pit: 0,
  }));
  return { gxBase: [gxBase], gyBase: [gyBase], regions: [cells] };
}

// Party at the level-0 scriptedEntry start position (the ENTERING title card).
const START_PARTY: MazeParty = { gx: 127, gy: 117, z: 0, facing: 0 };
// Open block covering gx 127..134, gy 117..124 — all north walls open.
const OPEN_BLOCK: MazeBlock = makeOpenBlock(127, 117);

/** Build an EntryState concisely. */
function st(mode: EntryState['entryMode'], gy: number, animFrame = 0, holdTicks = 0): EntryState {
  return { party: { ...START_PARTY, gy }, entryMode: mode, animFrame, holdTicks };
}

// ---------------------------------------------------------------------------
// isAnimationMode
// ---------------------------------------------------------------------------
describe('isAnimationMode', () => {
  it('true for the three viewport-animation modes', () => {
    expect(isAnimationMode('door-open')).toBe(true);
    expect(isAnimationMode('gate1-open')).toBe(true);
    expect(isAnimationMode('gate2-open')).toBe(true);
  });
  it('false for the hold / still / free modes', () => {
    for (const m of ['title', 'approach1', 'walk', 'approach2', 'free'] as const) {
      expect(isAnimationMode(m)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// tickEntry — the cutscene driver (one call per tick), drives the WHOLE thing.
// ---------------------------------------------------------------------------
describe('tickEntry — animation modes advance one frame per tick', () => {
  it('ANIM_LAST is 7 (8 frames, 0..7)', () => {
    expect(ANIM_LAST).toBe(7);
  });

  it('door-open: ticks animFrame 0→7 (gy stays 117), then → title (no move)', () => {
    let s = st('door-open', 117, 0);
    for (let f = 0; f < ANIM_LAST; f++) {
      s = tickEntry(s);
      expect(s.entryMode).toBe('door-open');
      expect(s.animFrame).toBe(f + 1);
      expect(s.party.gy).toBe(117);
    }
    // animFrame===ANIM_LAST: next tick transitions.
    s = tickEntry(s);
    expect(s.entryMode).toBe('title');
    expect(s.animFrame).toBe(0);
    expect(s.party.gy).toBe(117);
    expect(s.holdTicks).toBe(0);
  });

  it('gate1-open: ticks animFrame 0→7 (gy stays 118), then → walk + forcedStep (gy 118→119)', () => {
    let s = st('gate1-open', 118, 0);
    for (let f = 0; f < ANIM_LAST; f++) {
      s = tickEntry(s);
      expect(s.entryMode).toBe('gate1-open');
      expect(s.animFrame).toBe(f + 1);
      expect(s.party.gy).toBe(118);
    }
    s = tickEntry(s);
    expect(s.entryMode).toBe('walk');
    expect(s.animFrame).toBe(0);
    expect(s.party.gy).toBe(119);
  });

  it('gate2-open: ticks animFrame 0→7 (gy stays 120), then → free + forcedStep (gy 120→121)', () => {
    let s = st('gate2-open', 120, 0);
    for (let f = 0; f < ANIM_LAST; f++) {
      s = tickEntry(s);
      expect(s.entryMode).toBe('gate2-open');
      expect(s.animFrame).toBe(f + 1);
      expect(s.party.gy).toBe(120);
    }
    s = tickEntry(s);
    expect(s.entryMode).toBe('free');
    expect(s.animFrame).toBe(0);
    expect(s.party.gy).toBe(121);
  });
});

describe('tickEntry — hold modes accumulate ticks then auto-push', () => {
  it('title: holds TITLE_HOLD ticks then → approach1 + forcedStep (gy 117→118)', () => {
    let s = st('title', 117, 0, 0);
    for (let t = 0; t < TITLE_HOLD; t++) {
      s = tickEntry(s);
      expect(s.entryMode).toBe('title');
      expect(s.holdTicks).toBe(t + 1);
      expect(s.party.gy).toBe(117);
    }
    s = tickEntry(s);
    expect(s.entryMode).toBe('approach1');
    expect(s.party.gy).toBe(118);
    expect(s.holdTicks).toBe(0);
  });

  it('approach1: INERT in tickEntry — WAITS for ENTER (no auto-advance)', () => {
    // The APPROACHING beat is the one interactive pause; tickEntry must NOT
    // advance it regardless of how many ticks elapse — only ENTER (advanceEntry)
    // starts the first portcullis lift.
    let s = st('approach1', 118, 0, 0);
    for (let t = 0; t < TEXT_HOLD + 5; t++) {
      s = tickEntry(s);
      expect(s.entryMode).toBe('approach1');
      expect(s.party.gy).toBe(118);
    }
    const next = advanceEntry(s, OPEN_BLOCK);
    expect(next.entryMode).toBe('gate1-open');
    expect(next.animFrame).toBe(0);
    expect(next.party.gy).toBe(118); // no move
  });

  it('walk: holds WALK_HOLD ticks then → approach2 + forcedStep (gy 119→120)', () => {
    let s = st('walk', 119, 0, 0);
    for (let t = 0; t < WALK_HOLD; t++) {
      s = tickEntry(s);
      expect(s.entryMode).toBe('walk');
      expect(s.holdTicks).toBe(t + 1);
    }
    s = tickEntry(s);
    expect(s.entryMode).toBe('approach2');
    expect(s.party.gy).toBe(120);
    expect(s.holdTicks).toBe(0);
  });

  it('approach2: holds TEXT_HOLD ticks then → gate2-open (no move)', () => {
    let s = st('approach2', 120, 0, 0);
    for (let t = 0; t < TEXT_HOLD; t++) {
      s = tickEntry(s);
      expect(s.entryMode).toBe('approach2');
      expect(s.holdTicks).toBe(t + 1);
    }
    s = tickEntry(s);
    expect(s.entryMode).toBe('gate2-open');
    expect(s.animFrame).toBe(0);
    expect(s.party.gy).toBe(120); // no move
  });

  it('free: inert (returns the SAME reference)', () => {
    const s = st('free', 121);
    expect(tickEntry(s)).toBe(s);
  });
});

describe('tickEntry — full cutscene drives door-open → free with the gy progression', () => {
  it('walks 117,117,118,118,119,120,120,121 (auto-push; ONE ENTER at the APPROACHING beat)', () => {
    let s = st('door-open', 117, 0, 0);
    // Tick until 'free' (cap iterations so a bug can't hang the test). approach1
    // is the one interactive beat — tickEntry stalls there, so ENTER (advanceEntry)
    // advances it; every other beat auto-pushes on the timer.
    const seen: { mode: string; gy: number }[] = [];
    let prevMode = s.entryMode;
    seen.push({ mode: s.entryMode, gy: s.party.gy });
    for (let i = 0; i < 1000 && s.entryMode !== 'free'; i++) {
      s = s.entryMode === 'approach1' ? advanceEntry(s, OPEN_BLOCK) : tickEntry(s);
      if (s.entryMode !== prevMode) {
        seen.push({ mode: s.entryMode, gy: s.party.gy });
        prevMode = s.entryMode;
      }
    }
    expect(s.entryMode).toBe('free');
    expect(seen.map((x) => x.mode)).toEqual([
      'door-open',
      'title',
      'approach1',
      'gate1-open',
      'walk',
      'approach2',
      'gate2-open',
      'free',
    ]);
    expect(seen.map((x) => x.gy)).toEqual([117, 117, 118, 118, 119, 120, 120, 121]);
  });
});

// ---------------------------------------------------------------------------
// advanceEntry — ENTER skips each beat (fast-forward what tickEntry would do).
// ---------------------------------------------------------------------------
describe('advanceEntry — ENTER skips each beat', () => {
  it('door-open → title (no party move)', () => {
    const next = advanceEntry(st('door-open', 117, 3), OPEN_BLOCK);
    expect(next.entryMode).toBe('title');
    expect(next.animFrame).toBe(0);
    expect(next.party.gy).toBe(117);
  });

  it('title → approach1 (+1 forward step gy 117→118)', () => {
    const next = advanceEntry(st('title', 117), OPEN_BLOCK);
    expect(next.entryMode).toBe('approach1');
    expect(next.party.gy).toBe(118);
    expect(next.party.gx).toBe(127);
    expect(next.party.facing).toBe(0);
  });

  it('approach1 → gate1-open (no move, animFrame 0)', () => {
    const next = advanceEntry(st('approach1', 118), OPEN_BLOCK);
    expect(next.entryMode).toBe('gate1-open');
    expect(next.animFrame).toBe(0);
    expect(next.party.gy).toBe(118);
  });

  it('gate1-open → walk (+1 forward step gy 118→119, skips the lift)', () => {
    const next = advanceEntry(st('gate1-open', 118, 4), OPEN_BLOCK);
    expect(next.entryMode).toBe('walk');
    expect(next.animFrame).toBe(0);
    expect(next.party.gy).toBe(119);
  });

  it('walk → approach2 (+1 forward step gy 119→120)', () => {
    const next = advanceEntry(st('walk', 119), OPEN_BLOCK);
    expect(next.entryMode).toBe('approach2');
    expect(next.party.gy).toBe(120);
  });

  it('approach2 → gate2-open (no move, animFrame 0)', () => {
    const next = advanceEntry(st('approach2', 120), OPEN_BLOCK);
    expect(next.entryMode).toBe('gate2-open');
    expect(next.animFrame).toBe(0);
    expect(next.party.gy).toBe(120);
  });

  it('gate2-open → free (+1 forward step gy 120→121, skips the lift)', () => {
    const next = advanceEntry(st('gate2-open', 120, 4), OPEN_BLOCK);
    expect(next.entryMode).toBe('free');
    expect(next.animFrame).toBe(0);
    expect(next.party.gy).toBe(121);
  });

  it('free is inert: ENTER returns the SAME reference', () => {
    const s = st('free', 121);
    expect(advanceEntry(s, OPEN_BLOCK)).toBe(s);
  });

  it('full skip sequence on open block: door-open → free, gy 117→121', () => {
    let s = st('door-open', 117, 0, 0);
    const modes: string[] = [];
    for (let i = 0; i < 100 && s.entryMode !== 'free'; i++) {
      s = advanceEntry(s, OPEN_BLOCK);
      modes.push(s.entryMode);
    }
    expect(modes).toEqual([
      'title',
      'approach1',
      'gate1-open',
      'walk',
      'approach2',
      'gate2-open',
      'free',
    ]);
    expect(s.party.gy).toBe(121);
  });
});

// ---------------------------------------------------------------------------
// Real level-0 block — forced-march regression guard
//
// The level-0 cells at gx=127:
//   gy=117: north=2 (solid wall)  → tryStepForward BLOCKS
//   gy=118: north=2 (solid wall)  → tryStepForward BLOCKS
//   gy=119: north=0 (open)
//   gy=120: north=3 (door/gate)   → tryStepForward BLOCKS
//   gy=121: north=0 (open) — the free-control position
//
// advanceEntry (and tickEntry) MUST advance through every blocked edge.
// ---------------------------------------------------------------------------
describe('cutscene — real level-0 block (forced march through both gates)', () => {
  const TITLE_START: MazeParty = { gx: 127, gy: 117, z: 0, facing: 0 };

  it('tryStepForward on the REAL block at gy=117 returns party UNCHANGED (edge solid)', () => {
    expect(tryStepForward(TITLE_START, REAL_BLOCK)).toEqual(TITLE_START);
  });

  it('tryStepForward on the REAL block at gy=120 returns party UNCHANGED (door blocks)', () => {
    const at120: MazeParty = { ...TITLE_START, gy: 120 };
    expect(tryStepForward(at120, REAL_BLOCK).gy).toBe(120);
  });

  it('full ENTER-skip forced march on real block: door-open → free, gy 117→121', () => {
    let s: EntryState = { party: TITLE_START, entryMode: 'door-open', animFrame: 0, holdTicks: 0 };
    s = advanceEntry(s, REAL_BLOCK); // door-open → title
    expect(s.party.gy).toBe(117);
    s = advanceEntry(s, REAL_BLOCK); // title → approach1, crosses north=2 @ gy117
    expect(s.entryMode).toBe('approach1');
    expect(s.party.gy).toBe(118);
    s = advanceEntry(s, REAL_BLOCK); // approach1 → gate1-open (no move)
    expect(s.party.gy).toBe(118);
    s = advanceEntry(s, REAL_BLOCK); // gate1-open → walk, crosses north=2 @ gy118
    expect(s.entryMode).toBe('walk');
    expect(s.party.gy).toBe(119);
    s = advanceEntry(s, REAL_BLOCK); // walk → approach2, open north=0 @ gy119
    expect(s.party.gy).toBe(120);
    s = advanceEntry(s, REAL_BLOCK); // approach2 → gate2-open (no move)
    expect(s.party.gy).toBe(120);
    s = advanceEntry(s, REAL_BLOCK); // gate2-open → free, crosses door north=3 @ gy120
    expect(s.entryMode).toBe('free');
    expect(s.party.gy).toBe(121);
    expect(s.party.gx).toBe(127);
    expect(s.party.facing).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// decodeNarrationLines
// ---------------------------------------------------------------------------

/** Minimal MessageDb fixture with the three level-0 entry narration messages. */
function makeNarrationDb(): MessageDb {
  return {
    id: 'test',
    sourceFile: 'msg.dbs',
    treeSourceFile: 'msg.hdr',
    indexSourceFile: 'msg.hdr',
    recordCount: 0,
    records: [],
    indexedCount: 3,
    indexedMessages: [
      {
        id: 10010,
        rangeIndex: 0,
        bank: 0,
        offset: 0,
        recordPos: 0,
        decodedText: 'APPROACHING THE GATE WITH CONFIDENCE,',
      },
      {
        id: 10011,
        rangeIndex: 0,
        bank: 0,
        offset: 0,
        recordPos: 0,
        decodedText: 'YOU KNOW IF THINGS GET TOO HAIRY YOU ',
      },
      {
        id: 10012,
        rangeIndex: 0,
        bank: 0,
        offset: 0,
        recordPos: 0,
        decodedText: '^CAN ALWAYS TURN AND RUN BACK OUT...',
      },
    ],
  };
}

describe('decodeNarrationLines', () => {
  it('resolves all three narration IDs', () => {
    const lines = decodeNarrationLines(makeNarrationDb(), [10010, 10011, 10012]);
    expect(lines).toHaveLength(3);
  });

  it('10010: no leading ^, returns text verbatim', () => {
    const [line] = decodeNarrationLines(makeNarrationDb(), [10010]);
    expect(line).toBe('APPROACHING THE GATE WITH CONFIDENCE,');
  });

  it('10012: leading ^ stripped → "CAN ALWAYS TURN AND RUN BACK OUT..."', () => {
    const [line] = decodeNarrationLines(makeNarrationDb(), [10012]);
    expect(line).toBe('CAN ALWAYS TURN AND RUN BACK OUT...');
  });

  it('strips only the leading ^, not interior ^', () => {
    const db: MessageDb = {
      id: 'test',
      sourceFile: 'x',
      treeSourceFile: 'x',
      indexSourceFile: 'x',
      recordCount: 0,
      records: [],
      indexedCount: 1,
      indexedMessages: [
        { id: 9999, rangeIndex: 0, bank: 0, offset: 0, recordPos: 0, decodedText: '^HELLO ^WORLD' },
      ],
    };
    const [line] = decodeNarrationLines(db, [9999]);
    expect(line).toBe('HELLO ^WORLD');
  });

  it('missing ID → empty string', () => {
    expect(decodeNarrationLines(makeNarrationDb(), [99999])).toEqual(['']);
  });

  it('mixed present + missing IDs', () => {
    const lines = decodeNarrationLines(makeNarrationDb(), [10010, 99999, 10012]);
    expect(lines[0]).toBe('APPROACHING THE GATE WITH CONFIDENCE,');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('CAN ALWAYS TURN AND RUN BACK OUT...');
  });
});
