import { describe, it, expect } from 'vitest';
import { composeRenamePrompt } from '../../../src/pages/castle/compose-rename-prompt.js';
import type { MessageDb } from '@wiz6/data';

const stubDb = {
  indexedMessages: [{ id: 0x468, decodedText: 'NEW NAME >' }],
} as unknown as MessageDb;

function attrAt(cells: Uint8Array, w: number, col: number, row: number): number {
  return cells[(row * w + col) * 2 + 1] ?? 0;
}
function charAt(cells: Uint8Array, w: number, col: number, row: number): string {
  return String.fromCharCode(cells[(row * w + col) * 2] ?? 0);
}

describe('composeRenamePrompt', () => {
  it('renders "NEW NAME >" at (1, 1) attr 0x03', () => {
    const w = composeRenamePrompt({ buffer: '', db: stubDb });
    expect(charAt(w.cells, 40, 1, 1)).toBe('N');
    expect(charAt(w.cells, 40, 2, 1)).toBe('E');
    expect(attrAt(w.cells, 40, 1, 1)).toBe(0x03);
  });

  it('empty buffer: cursor block "a" attr 0x10 immediately after the prompt', () => {
    const w = composeRenamePrompt({ buffer: '', db: stubDb });
    // "NEW NAME >" is 10 chars, starting at col 1 → ends at col 10. Buffer at col 11.
    expect(charAt(w.cells, 40, 11, 1)).toBe('a');
    expect(attrAt(w.cells, 40, 11, 1)).toBe(0x10);
  });

  it('non-empty buffer "FOO": 3 uppercase letters at attr 0x50, cursor block right after', () => {
    const w = composeRenamePrompt({ buffer: 'foo', db: stubDb });
    expect(charAt(w.cells, 40, 11, 1)).toBe('F');
    expect(charAt(w.cells, 40, 12, 1)).toBe('O');
    expect(charAt(w.cells, 40, 13, 1)).toBe('O');
    expect(attrAt(w.cells, 40, 11, 1)).toBe(0x50);
    expect(attrAt(w.cells, 40, 12, 1)).toBe(0x50);
    expect(charAt(w.cells, 40, 14, 1)).toBe('a');
    expect(attrAt(w.cells, 40, 14, 1)).toBe(0x10);
  });

  it('caps the buffer-visible region at 7 chars even if buffer is longer', () => {
    const w = composeRenamePrompt({ buffer: 'NATHANXX', db: stubDb });
    // 7 buffer cells at 11..17 attr 0x50; cursor block at 18.
    for (let i = 0; i < 7; i++) {
      expect(attrAt(w.cells, 40, 11 + i, 1)).toBe(0x50);
    }
    expect(charAt(w.cells, 40, 18, 1)).toBe('a');
  });
});
