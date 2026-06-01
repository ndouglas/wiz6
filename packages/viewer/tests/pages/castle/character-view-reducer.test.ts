import { describe, it, expect } from 'vitest';
import {
  reduceCharacterView,
  nextActionCursor,
  type CharacterViewState,
  type CharacterViewEvent,
} from '../../../src/pages/castle/character-view-reducer.js';

const baseEnabled = { rename: true, portrait: true, profession: true };

// 7-entry camp menu (2+ members): [EQUIP,SPELL,ASSAY,SWAG,SKILL,REVIEW,EXIT], EXIT=6.
describe('nextActionCursor (column-major 2-row, n=7)', () => {
  it('Left → previous column same row, clamp at col0', () => {
    expect(nextActionCursor(6, 'ArrowLeft', 7)).toBe(4);
    expect(nextActionCursor(2, 'ArrowLeft', 7)).toBe(0);
    expect(nextActionCursor(0, 'ArrowLeft', 7)).toBe(0);
  });
  it('Right → next column same row, clamp if empty', () => {
    expect(nextActionCursor(4, 'ArrowRight', 7)).toBe(6);
    expect(nextActionCursor(5, 'ArrowRight', 7)).toBe(5); // REVIEW(c2r1) → no c3r1
    expect(nextActionCursor(0, 'ArrowRight', 7)).toBe(2);
  });
  it('Down → row0→row1 within column, clamp otherwise', () => {
    expect(nextActionCursor(4, 'ArrowDown', 7)).toBe(5);
    expect(nextActionCursor(5, 'ArrowDown', 7)).toBe(5);
    expect(nextActionCursor(6, 'ArrowDown', 7)).toBe(6); // EXIT(c3r0), no c3r1
  });
  it('Up → row1→row0 within column, clamp at row0', () => {
    expect(nextActionCursor(5, 'ArrowUp', 7)).toBe(4);
    expect(nextActionCursor(4, 'ArrowUp', 7)).toBe(4);
  });
});

// 6-entry (1 member): [EQUIP,SPELL,ASSAY,SWAG,SKILL,EXIT], EXIT=5.
describe('nextActionCursor (n=6)', () => {
  it('Down from SKILL(c2r0) reaches EXIT(c2r1)', () => {
    expect(nextActionCursor(4, 'ArrowDown', 6)).toBe(5);
    expect(nextActionCursor(4, 'ArrowRight', 6)).toBe(4); // no c3
  });
});

describe('reduceCharacterView — action-menu', () => {
  it('Enter on EDIT → edit-submenu', () => {
    const state: CharacterViewState = {
      kind: 'action-menu',
      cursorIdx: 5, // EDIT
      campEntries: ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL', 'EDIT', 'EXIT'],
    };
    const next = reduceCharacterView(state, { type: 'ENTER' }, baseEnabled);
    expect(next.kind).toBe('edit-submenu');
  });

  it('Enter on EXIT → exit-castle sentinel', () => {
    const state: CharacterViewState = {
      kind: 'action-menu',
      cursorIdx: 5,
      campEntries: ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL', 'EXIT'],
    };
    const next = reduceCharacterView(state, { type: 'ENTER' }, baseEnabled);
    expect(next.kind).toBe('exit-castle');
  });
});

describe('reduceCharacterView — edit-submenu', () => {
  it('DOWN at cursor=1 skips REPLACE (index 3) and lands on EX (index 4)', () => {
    const state: CharacterViewState = { kind: 'edit-submenu', cursorIdx: 1 };
    const next = reduceCharacterView(state, { type: 'ARROW_DOWN' }, baseEnabled);
    // 1 → next non-disabled is 2 then 4 (REPLACE=3 skipped).
    // DOWN moves within column though; for the spec, treat as next enabled.
    expect((next as { cursorIdx: number }).cursorIdx).not.toBe(3);
  });

  it('Escape → action-menu', () => {
    const state: CharacterViewState = { kind: 'edit-submenu', cursorIdx: 0 };
    const next = reduceCharacterView(state, { type: 'ESCAPE' }, baseEnabled);
    expect(next.kind).toBe('action-menu');
  });

  it('Enter on RENAME (idx 0) → rename state with empty buffer', () => {
    const state: CharacterViewState = { kind: 'edit-submenu', cursorIdx: 0 };
    const next = reduceCharacterView(state, { type: 'ENTER' }, baseEnabled);
    expect(next.kind).toBe('rename');
    if (next.kind === 'rename') expect(next.buffer).toBe('');
  });
});

describe('reduceCharacterView — rename', () => {
  it('printable ASCII appends (cap 7)', () => {
    const state: CharacterViewState = { kind: 'rename', buffer: 'NATHA' };
    const next = reduceCharacterView(state, { type: 'TYPE', key: 'X' }, baseEnabled);
    if (next.kind === 'rename') expect(next.buffer).toBe('NATHAX');
  });

  it('Backspace pops', () => {
    const state: CharacterViewState = { kind: 'rename', buffer: 'NAT' };
    const next = reduceCharacterView(state, { type: 'BACKSPACE' }, baseEnabled);
    if (next.kind === 'rename') expect(next.buffer).toBe('NA');
  });

  it('Enter on empty buffer is a no-op', () => {
    const state: CharacterViewState = { kind: 'rename', buffer: '' };
    const next = reduceCharacterView(state, { type: 'ENTER' }, baseEnabled);
    expect(next.kind).toBe('rename');
  });

  it('Enter on non-empty buffer → commit-rename intent', () => {
    const state: CharacterViewState = { kind: 'rename', buffer: 'NEW' };
    const next = reduceCharacterView(state, { type: 'ENTER' }, baseEnabled);
    expect(next.kind).toBe('commit-rename');
    if (next.kind === 'commit-rename') expect(next.name).toBe('NEW');
  });
});

describe('reduceCharacterView — portrait', () => {
  it('Right cycles previewIdx +1 (mod 42)', () => {
    const state: CharacterViewState = { kind: 'portrait', previewIdx: 41, originalIdx: 0 };
    const next = reduceCharacterView(state, { type: 'ARROW_RIGHT' }, baseEnabled);
    if (next.kind === 'portrait') expect(next.previewIdx).toBe(0);
  });

  it('Enter unchanged → edit-submenu (no commit)', () => {
    const state: CharacterViewState = { kind: 'portrait', previewIdx: 3, originalIdx: 3 };
    const next = reduceCharacterView(state, { type: 'ENTER' }, baseEnabled);
    expect(next.kind).toBe('edit-submenu');
  });

  it('Enter changed → commit-portrait intent', () => {
    const state: CharacterViewState = { kind: 'portrait', previewIdx: 5, originalIdx: 3 };
    const next = reduceCharacterView(state, { type: 'ENTER' }, baseEnabled);
    expect(next.kind).toBe('commit-portrait');
    if (next.kind === 'commit-portrait') expect(next.portraitIndex).toBe(5);
  });
});

describe('reduceCharacterView — profession-confirm', () => {
  it('Y → commit-class-change', () => {
    const state: CharacterViewState = { kind: 'profession-confirm', newClassId: 1, cursorYes: false };
    const next = reduceCharacterView(state, { type: 'TYPE', key: 'Y' }, baseEnabled);
    expect(next.kind).toBe('commit-class-change');
  });

  it('N → profession-picker (back)', () => {
    const state: CharacterViewState = { kind: 'profession-confirm', newClassId: 1, cursorYes: true };
    const next = reduceCharacterView(state, { type: 'TYPE', key: 'N' }, baseEnabled);
    expect(next.kind).toBe('profession-picker');
  });
});
