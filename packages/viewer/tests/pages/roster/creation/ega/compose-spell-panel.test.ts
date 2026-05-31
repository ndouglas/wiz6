/**
 * compose-spell-panel.test.ts — cell-level unit tests for the per-school spell
 * list / sub-list panel renderer. These assert the cell PLACEMENT + attrs
 * (grid-browse vs sub-list highlight + COST); the pixel gate lives in
 * tools/parity/spell-pick-parity.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { createSpellPickWindows } from '../../../../../src/pages/roster/creation/ega/windows.js';
import { composeSpellPanel, REALM_ATTR } from '../../../../../src/pages/roster/creation/ega/compose-spell-panel.js';
import { drawSchoolCursor } from '../../../../../src/pages/roster/creation/ega/compose-school-cursor.js';
import { createTileWindow, type TileWindow } from '@wiz6/parser';

/** Read (char, attr) at cell (x,y). */
function readCell(w: TileWindow, x: number, y: number): [number, number] {
  const i = (y * w.widthCells + x) * 2;
  return [w.cells[i]!, w.cells[i + 1]!];
}
function readText(w: TileWindow, x: number, y: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(readCell(w, x + i, y)[0]);
  return s;
}

const NAME_ROW0 = 3;
const COST_X = [6, 7, 8]; // outer COST box cols

describe('composeSpellPanel — grid-browse mode', () => {
  it('lists names on successive rows from row 3, plain wfont3, COST blank', () => {
    const { outer, inner } = createSpellPickWindows();
    composeSpellPanel(outer, inner, {
      realm: 'WATER',
      spellNames: ['CHILLING TOUCH', 'TERROR'],
      selectedIdx: null,
    });
    // Names at rows 3 and 4, col 1, wfont3 (attr 0x03), no highlight.
    expect(readText(inner, 1, NAME_ROW0, 14)).toBe('CHILLING TOUCH');
    expect(readCell(inner, 1, NAME_ROW0)[1]).toBe(0x03);
    expect(readText(inner, 1, NAME_ROW0 + 1, 6)).toBe('TERROR');
    expect(readCell(inner, 1, NAME_ROW0 + 1)[1]).toBe(0x03);
    // COST box blank (space, attr 0x00) in grid-browse mode.
    for (const x of COST_X) expect(readCell(outer, x, 14)).toEqual([0x20, 0x00]);
  });

  it('empty spell list leaves the interior blank (no name cells)', () => {
    const { outer, inner } = createSpellPickWindows();
    composeSpellPanel(outer, inner, { realm: 'AIR', spellNames: [], selectedIdx: null });
    // row 3 col 1 should be a gray space (background fill), not a glyph.
    expect(readCell(inner, 1, NAME_ROW0)).toEqual([0x20, 0x03]);
  });

  it('renders the realm name left-aligned at col 11 in the realm colour', () => {
    const { outer, inner } = createSpellPickWindows();
    composeSpellPanel(outer, inner, { realm: 'EARTH', spellNames: [], selectedIdx: null });
    expect(readText(outer, 11, 12, 5)).toBe('EARTH');
    expect(readCell(outer, 11, 12)[1]).toBe(REALM_ATTR.EARTH);
  });
});

describe('composeSpellPanel — sub-list mode', () => {
  it('selectedIdx=1 anchors the highlight bar on row 3, with realm-colour text + COST', () => {
    const { outer, inner } = createSpellPickWindows();
    composeSpellPanel(outer, inner, {
      realm: 'WATER',
      spellNames: ['CHILLING TOUCH', 'TERROR'],
      selectedIdx: 1,
      cost: '3',
    });
    // List scrolls so the SELECTED spell (TERROR) sits on row 3; CHILLING above on row 2.
    expect(readText(inner, 1, 2, 14)).toBe('CHILLING TOUCH');
    expect(readCell(inner, 1, 2)[1]).toBe(0x03); // plain row
    expect(readText(inner, 1, 3, 6)).toBe('TERROR');
    expect(readCell(inner, 1, 3)[1]).toBe(REALM_ATTR.WATER); // highlight bar attr
    // Highlight bar fills cols 1..17 (a non-text cell is a black space at realm attr).
    expect(readCell(inner, 17, 3)).toEqual([0x20, REALM_ATTR.WATER]);
    // COST digit right-aligned to col 8, realm colour.
    expect(readCell(outer, 8, 14)).toEqual(['3'.charCodeAt(0), REALM_ATTR.WATER]);
    expect(readCell(outer, 6, 14)).toEqual([0x20, 0x00]);
    expect(readCell(outer, 7, 14)).toEqual([0x20, 0x00]);
  });

  it('selectedIdx=0 anchors the highlight on row 3 with the second spell below', () => {
    const { outer, inner } = createSpellPickWindows();
    composeSpellPanel(outer, inner, {
      realm: 'WATER',
      spellNames: ['CHILLING TOUCH', 'TERROR'],
      selectedIdx: 0,
      cost: '2',
    });
    expect(readText(inner, 1, 3, 14)).toBe('CHILLING TOUCH');
    expect(readCell(inner, 1, 3)[1]).toBe(REALM_ATTR.WATER);
    expect(readText(inner, 1, 4, 6)).toBe('TERROR');
    expect(readCell(inner, 1, 4)[1]).toBe(0x03);
    expect(readCell(outer, 8, 14)).toEqual(['2'.charCodeAt(0), REALM_ATTR.WATER]);
  });
});

describe('drawSchoolCursor', () => {
  it('draws the solid wfont0 block (char 0x63, attr 0x50) at the school icon cell', () => {
    const top = createTileWindow({ screenX: 0, screenY: 0, widthCells: 40, heightCells: 20 });
    drawSchoolCursor(top, 1); // school 1 → left col, row 16
    expect(readCell(top, 1, 16)).toEqual([0x63, 0x50]);
  });

  it('maps school 3 to the right-column icon (col 11, row 14)', () => {
    const top = createTileWindow({ screenX: 0, screenY: 0, widthCells: 40, heightCells: 20 });
    drawSchoolCursor(top, 3);
    expect(readCell(top, 11, 14)).toEqual([0x63, 0x50]);
  });

  it('is a no-op for out-of-range school indices', () => {
    const top = createTileWindow({ screenX: 0, screenY: 0, widthCells: 40, heightCells: 20 });
    drawSchoolCursor(top, 6);
    // unchanged: default cell is (0,0)
    expect(readCell(top, 1, 14)).toEqual([0x00, 0x00]);
  });
});
