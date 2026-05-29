import { describe, it, expect } from 'vitest';
import { composeMainPanel } from '../../../src/pages/castle/compose-main-panel.js';
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
    301: 'EQUIP', 302: 'SPELL', 303: 'TRADE', 304: 'ASSAY',
    305: 'SWAG', 306: 'MERGE', 307: 'USE', 308: 'DROP',
    309: 'SKILL', 310: 'EDIT', 311: 'REVIEW', 312: 'EXIT',
  });
}

function cellsAsString(win: { cells: Uint8Array; widthCells: number; heightCells: number }): string {
  let s = '';
  for (let y = 0; y < win.heightCells; y++) {
    for (let x = 0; x < win.widthCells; x++) {
      const charByte = win.cells[(y * win.widthCells + x) * 2]!;
      s += String.fromCharCode(charByte);
    }
    s += '\n';
  }
  return s;
}

describe('composeMainPanel', () => {
  it('returns a 40×20 TileWindow at screen (0, 0)', () => {
    const win = composeMainPanel({ cursorIdx: 11, db: actionDb() });
    expect(win.widthCells).toBe(40);
    expect(win.heightCells).toBe(20);
    expect(win.screenX).toBe(0);
    expect(win.screenY).toBe(0);
  });

  it('renders all 12 action labels including EXIT', () => {
    const win = composeMainPanel({ cursorIdx: 11, db: actionDb() });
    const text = cellsAsString(win);
    for (const label of ['EQUIP', 'SPELL', 'TRADE', 'ASSAY', 'SWAG', 'MERGE',
                          'USE', 'DROP', 'SKILL', 'EDIT', 'REVIEW', 'EXIT']) {
      expect(text).toContain(label);
    }
  });

  it('highlights the EXIT entry when cursorIdx=11', () => {
    const win = composeMainPanel({ cursorIdx: 11, db: actionDb() });
    // EXIT contains 'E' as first char. Scan cells for an 'E' at attr 0x50 (highlight).
    let foundHighlight = false;
    for (let i = 0; i < win.cells.length; i += 2) {
      const ch = win.cells[i]!;
      const attr = win.cells[i + 1]!;
      if (ch === 0x45 /* 'E' */ && attr === 0x50) {
        foundHighlight = true;
        break;
      }
    }
    expect(foundHighlight).toBe(true);
  });
});
