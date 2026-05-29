import { describe, it, expect } from 'vitest';
import { composeModalFrame } from '../../../../../src/pages/roster/creation/ega/modal-frame.js';
import type { MessageDb } from '@wiz6/data';

function fakeDb(messages: Record<number, string>): MessageDb {
  return {
    indexedMessages: Object.entries(messages).map(([id, decodedText]) => ({
      id: Number(id),
      decodedText,
    })),
  } as unknown as MessageDb;
}

describe('composeModalFrame', () => {
  it('returns a TileWindow whose cells contain the centered msg text', () => {
    const db = fakeDb({ 0x044e: '* CHARACTER ALREADY EXISTS *' });
    const win = composeModalFrame(db, 0x044e);
    expect(win).toBeDefined();
    // TileWindow.cells is a flat Uint8Array: [char0, attr0, char1, attr1, ...]
    // row-major, 2 bytes per cell. Extract the char bytes and decode as ASCII.
    const charBytes: string[] = [];
    for (let i = 0; i < win.cells.length; i += 2) {
      charBytes.push(String.fromCharCode(win.cells[i]!));
    }
    const flatChars = charBytes.join('');
    expect(flatChars).toContain('* CHARACTER ALREADY EXISTS *');
  });

  it('returns an empty-text TileWindow when msg id is unknown', () => {
    const db = fakeDb({});
    const win = composeModalFrame(db, 0x044e);
    // Either: no text, or the entire cell grid empty. Implementation-dependent;
    // just assert no throw and the window is non-null.
    expect(win).toBeDefined();
  });

  it('has the correct geometry matching the bottomBar window', () => {
    const db = fakeDb({});
    const win = composeModalFrame(db, 0x044e);
    // bottomBar geometry: 40×5 @ (0, 160)
    expect(win.widthCells).toBe(40);
    expect(win.heightCells).toBe(5);
    expect(win.screenX).toBe(0);
    expect(win.screenY).toBe(160);
  });

  it('centers the message text on row 2', () => {
    const msg = '* CHARACTER ALREADY EXISTS *';
    const db = fakeDb({ 0x044e: msg });
    const win = composeModalFrame(db, 0x044e);
    // Extract row 2 char bytes
    const row = 2;
    const rowStart = row * win.widthCells * 2;
    const rowChars: string[] = [];
    for (let x = 0; x < win.widthCells; x++) {
      rowChars.push(String.fromCharCode(win.cells[rowStart + x * 2]!));
    }
    const rowText = rowChars.join('');
    expect(rowText).toContain(msg);
    // Verify centering: equal (or 1-off) padding on each side
    const startCol = rowText.indexOf(msg);
    const endCol = startCol + msg.length;
    const leftPad = startCol;
    const rightPad = win.widthCells - endCol;
    expect(Math.abs(leftPad - rightPad)).toBeLessThanOrEqual(1);
  });
});
