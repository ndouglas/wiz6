/**
 * entry-sequence.test.ts — gate for advanceEntry (entry FSM) + decodeNarrationLines.
 *
 * Uses a hand-built minimal MazeBlock with an open forward corridor along
 * facing 0 (north), so facing-0 steps advance gy by +1.
 *
 * Also tests against the REAL level-0 MazeBlock (extracted/maze/level-0.json) to
 * prove the forced march walks gy 117→118→119→120→121 even though tryStepForward
 * would block at the gate cells (north=2 wall, north=3 door).
 *
 * Engine reference: wmaze scripted entry (title → narration → gate-walk → bump →
 * free), CLAUDE.md overlay state table + ScriptedEntry schema (Task 1).
 *
 * Pin: docs/re/findings/maze-newgame-byteexact.json (per_enter_pin_addendum).
 * Level-0 scriptedEntry.start: gx=127, gy=117, z=0, facing=0 (the ENTERING title).
 * Per-ENTER: title(117) → narration(118) → gate-walk(119) → gate-walk(120) →
 *            bump(121) → free.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { advanceEntry, type EntryState } from '../../src/maze/entry-sequence.js';
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
// MazeBlock helper — open corridor along facing 0 (north) at gx=127,gy=118+.
//
// MazeBlock maps global coords to cells via gxBase/gyBase per region (8×8).
// Region base (16, 14) covers gx 16..23, gy 14..21 — but the coords in the
// plan (gx127,gy118) are far outside a single 8-cell region; we just need a
// block whose cells are all-open at the coords we'll use.
//
// Simplest approach: use a single region with gxBase=127, gyBase=118 covering
// gx 127..134, gy 118..125. All north walls = 0 (open). 64 cells, all open.
// ---------------------------------------------------------------------------
function makeOpenBlock(gxBase: number, gyBase: number): MazeBlock {
  const cells = Array.from({ length: 64 }, () => ({
    north: 0,
    west: 0,
    special4: 0,
    orient2: 0,
    pit: 0,
  }));
  return {
    gxBase: [gxBase],
    gyBase: [gyBase],
    regions: [cells],
  };
}

// Party at the level-0 scriptedEntry start position — the ENTERING title-card
// (gx=127, gy=117, z=0, facing=0).
const START_PARTY: MazeParty = { gx: 127, gy: 117, z: 0, facing: 0 };

// Open block covering gx 127..134, gy 117..124 — all north walls open.
const OPEN_BLOCK: MazeBlock = makeOpenBlock(127, 117);

// ---------------------------------------------------------------------------
// advanceEntry FSM — title → narration → gate-walk → bump → free
//
// Per-ENTER contract (pin: maze-newgame-byteexact.json per_enter_pin_addendum):
//   title(117)    --ENTER--> narration(118)   (+1 forward step)
//   narration(118)--ENTER--> gate-walk(119)   (+1 forward step; dismisses text)
//   gate-walk(119)--ENTER--> gate-walk(120)   (+1 forward step)
//   gate-walk(120)--ENTER--> bump(121)        (+1 forward step; next cell = bump)
//   bump(121)     --ENTER--> free(121)        (no move)
// ---------------------------------------------------------------------------
describe('advanceEntry', () => {
  it('title → narration: +1 forward step (gy 117→118)', () => {
    const s: EntryState = { party: START_PARTY, entryMode: 'title', stepsRemaining: 4 };
    const next = advanceEntry(s, OPEN_BLOCK);
    expect(next.entryMode).toBe('narration');
    expect(next.party.gy).toBe(118);
    expect(next.party.gx).toBe(127);
    expect(next.party.facing).toBe(0);
    expect(next.stepsRemaining).toBe(3);
  });

  it('narration → gate-walk: +1 forward step (gy 118→119, dismisses text)', () => {
    const s: EntryState = { party: { ...START_PARTY, gy: 118 }, entryMode: 'narration', stepsRemaining: 3 };
    const next = advanceEntry(s, OPEN_BLOCK);
    expect(next.entryMode).toBe('gate-walk');
    expect(next.party.gy).toBe(119);
    expect(next.stepsRemaining).toBe(2);
  });

  it('gate-walk step: gy 119→120, stays gate-walk, stepsRemaining 2→1', () => {
    const s: EntryState = { party: { ...START_PARTY, gy: 119 }, entryMode: 'gate-walk', stepsRemaining: 2 };
    const next = advanceEntry(s, OPEN_BLOCK);
    expect(next.entryMode).toBe('gate-walk');
    expect(next.party.gy).toBe(120);
    expect(next.stepsRemaining).toBe(1);
  });

  it('gate-walk final step: gy 120→121 → bump, stepsRemaining 1→0', () => {
    const s: EntryState = { party: { ...START_PARTY, gy: 120 }, entryMode: 'gate-walk', stepsRemaining: 1 };
    const next = advanceEntry(s, OPEN_BLOCK);
    expect(next.entryMode).toBe('bump');
    expect(next.party.gy).toBe(121);
    expect(next.stepsRemaining).toBe(0);
  });

  it('bump → free: no move (gy stays 121)', () => {
    const s: EntryState = { party: { ...START_PARTY, gy: 121 }, entryMode: 'bump', stepsRemaining: 0 };
    const next = advanceEntry(s, OPEN_BLOCK);
    expect(next.entryMode).toBe('free');
    expect(next.party.gy).toBe(121);
    expect(next.stepsRemaining).toBe(0);
  });

  it('full sequence on open block: title→narration→gate-walk→bump→free, gy 117→121', () => {
    let s: EntryState = { party: START_PARTY, entryMode: 'title', stepsRemaining: 4 };
    s = advanceEntry(s, OPEN_BLOCK);
    expect(s.entryMode).toBe('narration');
    expect(s.party.gy).toBe(118);
    s = advanceEntry(s, OPEN_BLOCK);
    expect(s.entryMode).toBe('gate-walk');
    expect(s.party.gy).toBe(119);
    s = advanceEntry(s, OPEN_BLOCK);
    expect(s.entryMode).toBe('gate-walk');
    expect(s.party.gy).toBe(120);
    s = advanceEntry(s, OPEN_BLOCK);
    expect(s.entryMode).toBe('bump');
    expect(s.party.gy).toBe(121);
    s = advanceEntry(s, OPEN_BLOCK);
    expect(s.entryMode).toBe('free');
    expect(s.party.gy).toBe(121); // bump → free does not move
    expect(s.stepsRemaining).toBe(0);
  });

  it('free is inert: ENTER in free mode returns state unchanged', () => {
    const s: EntryState = {
      party: { ...START_PARTY, gy: 121 },
      entryMode: 'free',
      stepsRemaining: 0,
    };
    const next = advanceEntry(s, OPEN_BLOCK);
    expect(next).toBe(s); // same reference — no allocation
    expect(next.entryMode).toBe('free');
  });
});

// ---------------------------------------------------------------------------
// Real level-0 block — forced-march regression guard
//
// The level-0 cells at gx=127 (re-extracted with the gy=117 start):
//   gy=117: north=2 (solid wall)  → tryStepForward BLOCKS here
//   gy=118: north=2 (solid wall)  → tryStepForward BLOCKS here
//   gy=119: north=0 (open)
//   gy=120: north=3 (door/gate)   → tryStepForward BLOCKS here too
//   gy=121: north=0 (open) — the bump cell / free-control position
//
// advanceEntry MUST advance through every blocked edge — it is a forced march.
// tryStepForward must stay unchanged (collision still guards free-roam).
// ---------------------------------------------------------------------------
describe('advanceEntry — real level-0 block (forced march through gate)', () => {
  const TITLE_START: MazeParty = { gx: 127, gy: 117, z: 0, facing: 0 };

  it('tryStepForward on the REAL block at gy=117 returns party UNCHANGED (proves edge is solid)', () => {
    const result = tryStepForward(TITLE_START, REAL_BLOCK);
    expect(result.gy).toBe(117); // unchanged — north=2 blocks
    expect(result).toEqual(TITLE_START);
  });

  it('tryStepForward on the REAL block at gy=120 returns party UNCHANGED (door blocks)', () => {
    const at120: MazeParty = { ...TITLE_START, gy: 120 };
    const result = tryStepForward(at120, REAL_BLOCK);
    expect(result.gy).toBe(120); // unchanged — north=3 (door) blocks
  });

  it('full forced march on real block: title→narration→gate-walk→bump→free, gy 117→121', () => {
    // The main regression guard: the scripted entry crosses two solid walls
    // (gy=117, gy=118) and a door (gy=120) that free-roam collision would block.
    let s: EntryState = { party: TITLE_START, entryMode: 'title', stepsRemaining: 4 };

    s = advanceEntry(s, REAL_BLOCK); // title → narration, crosses north=2 @ gy117
    expect(s.entryMode).toBe('narration');
    expect(s.party.gy).toBe(118);
    expect(s.stepsRemaining).toBe(3);

    s = advanceEntry(s, REAL_BLOCK); // narration → gate-walk, crosses north=2 @ gy118
    expect(s.entryMode).toBe('gate-walk');
    expect(s.party.gy).toBe(119);
    expect(s.stepsRemaining).toBe(2);

    s = advanceEntry(s, REAL_BLOCK); // gate-walk, open north=0 @ gy119
    expect(s.entryMode).toBe('gate-walk');
    expect(s.party.gy).toBe(120);
    expect(s.stepsRemaining).toBe(1);

    s = advanceEntry(s, REAL_BLOCK); // gate-walk → bump, crosses door north=3 @ gy120
    expect(s.entryMode).toBe('bump');
    expect(s.party.gy).toBe(121);
    expect(s.stepsRemaining).toBe(0);

    s = advanceEntry(s, REAL_BLOCK); // bump → free (no move)
    expect(s.entryMode).toBe('free');
    expect(s.party.gy).toBe(121);
    expect(s.party.gx).toBe(127);
    expect(s.party.facing).toBe(0);
    expect(s.stepsRemaining).toBe(0);
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
    const db = makeNarrationDb();
    const lines = decodeNarrationLines(db, [10010, 10011, 10012]);
    expect(lines).toHaveLength(3);
  });

  it('10010: no leading ^, returns text verbatim', () => {
    const db = makeNarrationDb();
    const [line] = decodeNarrationLines(db, [10010]);
    expect(line).toBe('APPROACHING THE GATE WITH CONFIDENCE,');
  });

  it('10011: no leading ^, returns text verbatim', () => {
    const db = makeNarrationDb();
    const [line] = decodeNarrationLines(db, [10011]);
    expect(line).toBe('YOU KNOW IF THINGS GET TOO HAIRY YOU ');
  });

  it('10012: leading ^ stripped → "CAN ALWAYS TURN AND RUN BACK OUT..."', () => {
    const db = makeNarrationDb();
    const [line] = decodeNarrationLines(db, [10012]);
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
        {
          id: 9999,
          rangeIndex: 0,
          bank: 0,
          offset: 0,
          recordPos: 0,
          decodedText: '^HELLO ^WORLD',
        },
      ],
    };
    const [line] = decodeNarrationLines(db, [9999]);
    expect(line).toBe('HELLO ^WORLD');
  });

  it('missing ID → empty string', () => {
    const db = makeNarrationDb();
    const lines = decodeNarrationLines(db, [99999]);
    expect(lines).toEqual(['']);
  });

  it('mixed present + missing IDs', () => {
    const db = makeNarrationDb();
    const lines = decodeNarrationLines(db, [10010, 99999, 10012]);
    expect(lines[0]).toBe('APPROACHING THE GATE WITH CONFIDENCE,');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('CAN ALWAYS TURN AND RUN BACK OUT...');
  });
});
