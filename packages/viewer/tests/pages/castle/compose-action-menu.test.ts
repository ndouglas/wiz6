import { describe, it, expect } from 'vitest';
import { composeActionMenu } from '../../../src/pages/castle/compose-action-menu.js';
import type { MessageDb } from '@wiz6/data';

function fakeDb(messages: Record<number, string>): MessageDb {
  return {
    indexedMessages: Object.entries(messages).map(([id, decodedText]) => ({
      id: Number(id),
      decodedText,
    })),
  } as unknown as MessageDb;
}

function actionDb(): MessageDb {
  return fakeDb({
    301: 'EQUIP',  302: 'SPELL', 303: 'TRADE', 304: 'ASSAY',
    305: 'SWAG',   306: 'MERGE', 307: 'USE',   308: 'DROP',
    309: 'SKILL',  310: 'EDIT',  311: 'REVIEW',
    312: 'EXIT',
  });
}

function rowString(win: { cells: Uint8Array; widthCells: number }, row: number): string {
  let s = '';
  for (let x = 0; x < win.widthCells; x++) {
    s += String.fromCharCode(win.cells[(row * win.widthCells + x) * 2]!);
  }
  return s;
}

describe('composeActionMenu', () => {
  it('returns a 40×5 TileWindow at screen (0, 160)', () => {
    const win = composeActionMenu({ cursorIdx: 5, db: actionDb() });
    expect(win.widthCells).toBe(40);
    // 5 cell rows: 4 for action labels + 1 for the engine's chrome bottom-border
    // row (wfont3 glyph 0x1e = 7 px gray + 1 px black baseline).
    expect(win.heightCells).toBe(5);
    expect(win.screenX).toBe(0);
    expect(win.screenY).toBe(160);
  });

  it('fills the last cell row with the chrome bottom-border glyph (0x1e @ attr 0x03)', () => {
    const win = composeActionMenu({ cursorIdx: 5, db: actionDb() });
    for (let cx = 0; cx < win.widthCells; cx++) {
      const idx = (4 * win.widthCells + cx) * 2;
      expect(win.cells[idx]).toBe(0x1e);
      expect(win.cells[idx + 1]).toBe(0x03);
    }
  });

  it('renders the camp-mask subset: EQUIP/SPELL/ASSAY/SWAG/SKILL/EXIT only', () => {
    const win = composeActionMenu({ cursorIdx: 5, db: actionDb() });
    const text = rowString(win, 1) + rowString(win, 2);
    for (const label of ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL', 'EXIT']) {
      expect(text).toContain(label);
    }
    for (const hidden of ['TRADE', 'MERGE', 'USE', 'DROP', 'EDIT', 'REVIEW']) {
      expect(text).not.toContain(hidden);
    }
  });

  it('places actions in 3×2 column-major grid (row 1 = top, row 2 = bottom)', () => {
    const win = composeActionMenu({ cursorIdx: 5, db: actionDb() });
    // From the engine save 2 dump:
    //   row 1: "  EQUIP ASSAY SKILL"
    //   row 2: "  SPELL SWAG  EXIT"
    expect(rowString(win, 1).slice(0, 19)).toBe('  EQUIP ASSAY SKILL');
    expect(rowString(win, 2).slice(0, 18)).toBe('  SPELL SWAG  EXIT');
  });

  it('highlights EXIT at attr 0x50 when cursorIdx=5', () => {
    const win = composeActionMenu({ cursorIdx: 5, db: actionDb() });
    // EXIT starts at row 2, col 14 (after "  SPELL SWAG  ").
    const i = (2 * win.widthCells + 14) * 2;
    expect(win.cells[i]).toBe(0x45); // 'E'
    expect(win.cells[i + 1]).toBe(0x50); // highlight attr
  });

  it('does NOT highlight EXIT when cursor is on a different action', () => {
    const win = composeActionMenu({ cursorIdx: 0, db: actionDb() });
    const i = (2 * win.widthCells + 14) * 2;
    expect(win.cells[i]).toBe(0x45); // 'E' still rendered
    expect(win.cells[i + 1]).toBe(0x03); // plain attr
  });
});

const stubDb = {
  indexedMessages: [
    { id: 301, decodedText: 'EQUIP' },
    { id: 302, decodedText: 'SPELL' },
    { id: 304, decodedText: 'ASSAY' },
    { id: 305, decodedText: 'SWAG' },
    { id: 309, decodedText: 'SKILL' },
    { id: 310, decodedText: 'EDIT' },
    { id: 312, decodedText: 'EXIT' },
  ],
} as unknown as MessageDb;

function charsAt(cells: Uint8Array, w: number, col: number, row: number, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += String.fromCharCode(cells[(row * w + col + i) * 2] ?? 0);
  return out;
}

describe('composeActionMenu — includeEditFromCamp', () => {
  it('does NOT include EDIT by default', () => {
    const w = composeActionMenu({ cursorIdx: 0, db: stubDb });
    let bigBlob = '';
    for (let r = 0; r < w.heightCells; r++) {
      bigBlob += charsAt(w.cells, w.widthCells, 0, r, w.widthCells) + '\n';
    }
    expect(bigBlob).not.toContain('EDIT');
  });

  it('includes EDIT when includeEditFromCamp=true', () => {
    const w = composeActionMenu({ cursorIdx: 0, db: stubDb, includeEditFromCamp: true });
    let bigBlob = '';
    for (let r = 0; r < w.heightCells; r++) {
      bigBlob += charsAt(w.cells, w.widthCells, 0, r, w.widthCells) + '\n';
    }
    expect(bigBlob).toContain('EDIT');
  });
});
