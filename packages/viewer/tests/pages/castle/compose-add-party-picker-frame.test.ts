/**
 * compose-add-party-picker-frame.test.ts — unit tests for synthetic states
 * (cursor position, panel split, scrolling) that complement the byte-exact
 * parity test against save/1.sav.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageDbSchema } from '@wiz6/data';
import type { Character, MessageDb } from '@wiz6/data';
import { composeAddPartyPickerFrame } from '../../../src/pages/castle/compose-add-party-picker-frame.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');

function mainRoot(): string {
  try {
    const g = readFileSync(join(REPO_ROOT, '.git'), 'utf-8');
    const m = /gitdir:\s*(.+)/.exec(g);
    if (m) return resolve(m[1]!.trim().replace(/\/worktrees\/[^/]+$/, ''), '..');
  } catch {
    /* not a worktree */
  }
  return REPO_ROOT;
}

function resolveAsset(...rel: string[]): string {
  const inWorktree = join(REPO_ROOT, ...rel);
  if (existsSync(inWorktree)) return inWorktree;
  return join(mainRoot(), ...rel);
}

function loadMsgDb(): MessageDb {
  const path = resolveAsset('extracted', 'messages', 'msg.json');
  return MessageDbSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
}

function makeChar(id: string, name: string, race = 0, cls = 0, sex: 0 | 1 = 0): Character {
  return {
    id,
    name,
    race,
    class: cls,
    sex,
    level: 1,
    xp: 0,
    gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false,
    paralyzed: false,
    attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0,
    reaction: 0,
  };
}

interface CellWindow {
  widthCells: number;
  heightCells: number;
  cells: Uint8Array;
}

/** Collect (row, col) for every cell carrying the highlight attr 0x50. */
function findHighlightCells(w: CellWindow): Array<{ row: number; col: number }> {
  const out: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < w.heightCells; r++) {
    for (let c = 0; c < w.widthCells; c++) {
      const attr = w.cells[(r * w.widthCells + c) * 2 + 1]!;
      if (attr === 0x50) out.push({ row: r, col: c });
    }
  }
  return out;
}

/** Extract the printable chars of row `r` (used for finding NAME content). */
function rowChars(w: CellWindow, r: number): string {
  let s = '';
  for (let c = 0; c < w.widthCells; c++) {
    const ch = w.cells[(r * w.widthCells + c) * 2]!;
    s += ch >= 0x20 && ch < 0x7f ? String.fromCharCode(ch) : '.';
  }
  return s;
}

describe('composeAddPartyPickerFrame', () => {
  const db = loadMsgDb();

  it('highlights the cursor row in right panel when not on cancel', () => {
    const view = {
      candidates: [makeChar('a', 'ALPHA'), makeChar('b', 'BETA'), makeChar('c', 'GAMMA')],
      cursorIdx: 1,
      onCancel: false,
    };
    const [left, right] = composeAddPartyPickerFrame(view, db);
    expect(findHighlightCells(right!).length).toBeGreaterThan(0);
    expect(findHighlightCells(left!).length).toBe(0);
  });

  it('moves highlight to CANCEL when onCancel=true', () => {
    const view = {
      candidates: [makeChar('a', 'ALPHA')],
      cursorIdx: 0,
      onCancel: true,
    };
    const [left, right] = composeAddPartyPickerFrame(view, db);
    expect(findHighlightCells(left!).length).toBeGreaterThan(0);
    expect(findHighlightCells(right!).length).toBe(0);
  });

  it('renders fewer content rows than 5 when candidates.length < 5', () => {
    const view = {
      candidates: [makeChar('a', 'SOLO')],
      cursorIdx: 0,
      onCancel: false,
    };
    const [, right] = composeAddPartyPickerFrame(view, db);
    // With 1 candidate, only the center row should contain any uppercase NAME chars.
    let contentRows = 0;
    for (let r = 0; r < right!.heightCells; r++) {
      // Only inspect cols 0..NAME_WIDTH-1 (the name field) — the scrollbar at
      // col 19 carries 'G'/'F' which are uppercase letters too.
      let hasLetter = false;
      for (let c = 0; c < 6; c++) {
        const ch = right!.cells[(r * right!.widthCells + c) * 2]!;
        if (ch >= 0x41 && ch <= 0x5a) {
          hasLetter = true;
          break;
        }
      }
      if (hasLetter) contentRows++;
    }
    expect(contentRows).toBe(1);
  });

  it('cursor row stays centered when scrolled', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => makeChar(`id${i}`, `NM${i}`));
    const view = { candidates, cursorIdx: 7, onCancel: false };
    const [, right] = composeAddPartyPickerFrame(view, db);
    const hl = findHighlightCells(right!);
    expect(hl.length).toBeGreaterThan(0);
    // The highlighted row should be the center row of the 5-row panel.
    const centerRow = Math.floor(right!.heightCells / 2);
    expect(hl[0]!.row).toBe(centerRow);
    // Sanity check: the highlighted row should contain "NM7" (cursorIdx=7).
    expect(rowChars(right!, centerRow).startsWith('NM7')).toBe(true);
  });
});
