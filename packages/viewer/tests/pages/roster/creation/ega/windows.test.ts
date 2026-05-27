// packages/viewer/tests/pages/roster/creation/ega/windows.test.ts
import { describe, expect, it } from 'vitest';
import {
  CREATION_WINDOW_GEOMETRY,
  createPersistentWindows,
  createSkillTrainWindow,
  createSpellPickWindows,
} from '../../../../../src/pages/roster/creation/ega/windows.js';

// §2 geometry constants from docs/re/wpcmk-screens.md
const EXPECTED_TOP = { screenX: 0, screenY: 0, widthCells: 40, heightCells: 20, attr: 0x14 };
const EXPECTED_BOTTOM_BAR = { screenX: 0, screenY: 160, widthCells: 40, heightCells: 5, attr: 0x13 };
const EXPECTED_MENU_PANEL = { screenX: 168, screenY: 56, widthCells: 19, heightCells: 13, attr: 0x15 };
const EXPECTED_SKILL_TRAIN = { screenX: 160, screenY: 32, widthCells: 20, heightCells: 16, attr: 0x19 };
const EXPECTED_SPELL_OUTER = { screenX: 160, screenY: 32, widthCells: 20, heightCells: 16, attr: 0x16 };
const EXPECTED_SPELL_INNER = { screenX: 168, screenY: 56, widthCells: 19, heightCells: 8, attr: 0x17 };

describe('CREATION_WINDOW_GEOMETRY', () => {
  it('has an entry for top window', () => {
    const entry = CREATION_WINDOW_GEOMETRY.find((e) => e.id === 'top');
    expect(entry).toBeDefined();
    expect(entry!.screenX).toBe(EXPECTED_TOP.screenX);
    expect(entry!.screenY).toBe(EXPECTED_TOP.screenY);
    expect(entry!.widthCells).toBe(EXPECTED_TOP.widthCells);
    expect(entry!.heightCells).toBe(EXPECTED_TOP.heightCells);
    expect(entry!.attr).toBe(EXPECTED_TOP.attr);
  });

  it('has an entry for bottomBar window', () => {
    const entry = CREATION_WINDOW_GEOMETRY.find((e) => e.id === 'bottomBar');
    expect(entry).toBeDefined();
    expect(entry!.screenX).toBe(EXPECTED_BOTTOM_BAR.screenX);
    expect(entry!.screenY).toBe(EXPECTED_BOTTOM_BAR.screenY);
    expect(entry!.widthCells).toBe(EXPECTED_BOTTOM_BAR.widthCells);
    expect(entry!.heightCells).toBe(EXPECTED_BOTTOM_BAR.heightCells);
    expect(entry!.attr).toBe(EXPECTED_BOTTOM_BAR.attr);
  });

  it('has an entry for menuPanel window', () => {
    const entry = CREATION_WINDOW_GEOMETRY.find((e) => e.id === 'menuPanel');
    expect(entry).toBeDefined();
    expect(entry!.screenX).toBe(EXPECTED_MENU_PANEL.screenX);
    expect(entry!.screenY).toBe(EXPECTED_MENU_PANEL.screenY);
    expect(entry!.widthCells).toBe(EXPECTED_MENU_PANEL.widthCells);
    expect(entry!.heightCells).toBe(EXPECTED_MENU_PANEL.heightCells);
    expect(entry!.attr).toBe(EXPECTED_MENU_PANEL.attr);
  });

  it('has an entry for skillTrain window', () => {
    const entry = CREATION_WINDOW_GEOMETRY.find((e) => e.id === 'skillTrain');
    expect(entry).toBeDefined();
    expect(entry!.screenX).toBe(EXPECTED_SKILL_TRAIN.screenX);
    expect(entry!.screenY).toBe(EXPECTED_SKILL_TRAIN.screenY);
    expect(entry!.widthCells).toBe(EXPECTED_SKILL_TRAIN.widthCells);
    expect(entry!.heightCells).toBe(EXPECTED_SKILL_TRAIN.heightCells);
    expect(entry!.attr).toBe(EXPECTED_SKILL_TRAIN.attr);
  });

  it('has an entry for spellOuter window', () => {
    const entry = CREATION_WINDOW_GEOMETRY.find((e) => e.id === 'spellOuter');
    expect(entry).toBeDefined();
    expect(entry!.screenX).toBe(EXPECTED_SPELL_OUTER.screenX);
    expect(entry!.screenY).toBe(EXPECTED_SPELL_OUTER.screenY);
    expect(entry!.widthCells).toBe(EXPECTED_SPELL_OUTER.widthCells);
    expect(entry!.heightCells).toBe(EXPECTED_SPELL_OUTER.heightCells);
    expect(entry!.attr).toBe(EXPECTED_SPELL_OUTER.attr);
  });

  it('has an entry for spellInner window', () => {
    const entry = CREATION_WINDOW_GEOMETRY.find((e) => e.id === 'spellInner');
    expect(entry).toBeDefined();
    expect(entry!.screenX).toBe(EXPECTED_SPELL_INNER.screenX);
    expect(entry!.screenY).toBe(EXPECTED_SPELL_INNER.screenY);
    expect(entry!.widthCells).toBe(EXPECTED_SPELL_INNER.widthCells);
    expect(entry!.heightCells).toBe(EXPECTED_SPELL_INNER.heightCells);
    expect(entry!.attr).toBe(EXPECTED_SPELL_INNER.attr);
  });
});

describe('createPersistentWindows', () => {
  it('returns top window with correct geometry', () => {
    const { top } = createPersistentWindows();
    expect(top.screenX).toBe(EXPECTED_TOP.screenX);
    expect(top.screenY).toBe(EXPECTED_TOP.screenY);
    expect(top.widthCells).toBe(EXPECTED_TOP.widthCells);
    expect(top.heightCells).toBe(EXPECTED_TOP.heightCells);
  });

  it('returns top window with correct cells size', () => {
    const { top } = createPersistentWindows();
    expect(top.cells.length).toBe(top.widthCells * top.heightCells * 2);
  });

  it('top window cells are filled with space char and correct attr', () => {
    const { top } = createPersistentWindows();
    for (let i = 0; i < top.cells.length; i += 2) {
      expect(top.cells[i]).toBe(0x20);
      expect(top.cells[i + 1]).toBe(EXPECTED_TOP.attr);
    }
  });

  it('returns bottomBar window with correct geometry', () => {
    const { bottomBar } = createPersistentWindows();
    expect(bottomBar.screenX).toBe(EXPECTED_BOTTOM_BAR.screenX);
    expect(bottomBar.screenY).toBe(EXPECTED_BOTTOM_BAR.screenY);
    expect(bottomBar.widthCells).toBe(EXPECTED_BOTTOM_BAR.widthCells);
    expect(bottomBar.heightCells).toBe(EXPECTED_BOTTOM_BAR.heightCells);
  });

  it('returns bottomBar window with correct cells size', () => {
    const { bottomBar } = createPersistentWindows();
    expect(bottomBar.cells.length).toBe(bottomBar.widthCells * bottomBar.heightCells * 2);
  });

  it('bottomBar window cells are filled with space char and correct attr', () => {
    const { bottomBar } = createPersistentWindows();
    for (let i = 0; i < bottomBar.cells.length; i += 2) {
      expect(bottomBar.cells[i]).toBe(0x20);
      expect(bottomBar.cells[i + 1]).toBe(EXPECTED_BOTTOM_BAR.attr);
    }
  });

  it('returns menuPanel window with correct geometry', () => {
    const { menuPanel } = createPersistentWindows();
    expect(menuPanel.screenX).toBe(EXPECTED_MENU_PANEL.screenX);
    expect(menuPanel.screenY).toBe(EXPECTED_MENU_PANEL.screenY);
    expect(menuPanel.widthCells).toBe(EXPECTED_MENU_PANEL.widthCells);
    expect(menuPanel.heightCells).toBe(EXPECTED_MENU_PANEL.heightCells);
  });

  it('returns menuPanel window with correct cells size', () => {
    const { menuPanel } = createPersistentWindows();
    expect(menuPanel.cells.length).toBe(menuPanel.widthCells * menuPanel.heightCells * 2);
  });

  it('menuPanel window cells are filled with space char and correct attr', () => {
    const { menuPanel } = createPersistentWindows();
    for (let i = 0; i < menuPanel.cells.length; i += 2) {
      expect(menuPanel.cells[i]).toBe(0x20);
      expect(menuPanel.cells[i + 1]).toBe(EXPECTED_MENU_PANEL.attr);
    }
  });
});

describe('createSkillTrainWindow', () => {
  it('returns window with correct geometry', () => {
    const win = createSkillTrainWindow();
    expect(win.screenX).toBe(EXPECTED_SKILL_TRAIN.screenX);
    expect(win.screenY).toBe(EXPECTED_SKILL_TRAIN.screenY);
    expect(win.widthCells).toBe(EXPECTED_SKILL_TRAIN.widthCells);
    expect(win.heightCells).toBe(EXPECTED_SKILL_TRAIN.heightCells);
  });

  it('returns window with correct cells size', () => {
    const win = createSkillTrainWindow();
    expect(win.cells.length).toBe(win.widthCells * win.heightCells * 2);
  });

  it('cells are filled with space char and correct attr', () => {
    const win = createSkillTrainWindow();
    for (let i = 0; i < win.cells.length; i += 2) {
      expect(win.cells[i]).toBe(0x20);
      expect(win.cells[i + 1]).toBe(EXPECTED_SKILL_TRAIN.attr);
    }
  });
});

describe('createSpellPickWindows', () => {
  it('returns outer window with correct geometry', () => {
    const { outer } = createSpellPickWindows();
    expect(outer.screenX).toBe(EXPECTED_SPELL_OUTER.screenX);
    expect(outer.screenY).toBe(EXPECTED_SPELL_OUTER.screenY);
    expect(outer.widthCells).toBe(EXPECTED_SPELL_OUTER.widthCells);
    expect(outer.heightCells).toBe(EXPECTED_SPELL_OUTER.heightCells);
  });

  it('outer window has correct cells size', () => {
    const { outer } = createSpellPickWindows();
    expect(outer.cells.length).toBe(outer.widthCells * outer.heightCells * 2);
  });

  it('outer window cells filled with space char and correct attr', () => {
    const { outer } = createSpellPickWindows();
    for (let i = 0; i < outer.cells.length; i += 2) {
      expect(outer.cells[i]).toBe(0x20);
      expect(outer.cells[i + 1]).toBe(EXPECTED_SPELL_OUTER.attr);
    }
  });

  it('returns inner window with correct geometry', () => {
    const { inner } = createSpellPickWindows();
    expect(inner.screenX).toBe(EXPECTED_SPELL_INNER.screenX);
    expect(inner.screenY).toBe(EXPECTED_SPELL_INNER.screenY);
    expect(inner.widthCells).toBe(EXPECTED_SPELL_INNER.widthCells);
    expect(inner.heightCells).toBe(EXPECTED_SPELL_INNER.heightCells);
  });

  it('inner window has correct cells size', () => {
    const { inner } = createSpellPickWindows();
    expect(inner.cells.length).toBe(inner.widthCells * inner.heightCells * 2);
  });

  it('inner window cells filled with space char and correct attr', () => {
    const { inner } = createSpellPickWindows();
    for (let i = 0; i < inner.cells.length; i += 2) {
      expect(inner.cells[i]).toBe(0x20);
      expect(inner.cells[i + 1]).toBe(EXPECTED_SPELL_INNER.attr);
    }
  });
});
