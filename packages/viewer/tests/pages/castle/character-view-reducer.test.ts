import { describe, it, expect } from 'vitest';
import {
  reduceCharacterView,
  nextActionCursor,
  skillTabEntries,
  SKILL_EXIT,
  type SwagInfo,
  type CharacterViewState,
  type CharacterViewEvent,
  type EquipInfo,
  type AssayInfo,
} from '../../../src/pages/castle/character-view-reducer.js';

const baseEnabled = { rename: true, portrait: true, profession: true };

// Assay info for tests: 3 carried items at inventory indices [2, 5, 9] (in
// display order — the i-th carried item maps to carried[i]). NONE == 3.
const assayInfo: AssayInfo = { carried: [2, 5, 9] };

// Equip closure for tests: slot 0 has candidate inv-idxs [3, 7], slot 4 has
// candidate inv-idx [1]; all other slots empty. Independent of selections
// (the page's real closure consumes selections; these tests exercise the
// reducer's navigation/recording, not equipCandidates' exclusivity logic).
const equipInfo: EquipInfo = {
  candidatesFor: (slot) => (slot === 0 ? [3, 7] : slot === 4 ? [1] : []),
};

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

describe('reduceCharacterView — EQUIP wizard', () => {
  const equipMenu: CharacterViewState = {
    kind: 'action-menu',
    cursorIdx: 0, // EQUIP
    campEntries: ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL', 'EXIT'],
  };

  it('Enter on EQUIP → equip-wizard at first populated slot (0), cursor 0', () => {
    const next = reduceCharacterView(equipMenu, { type: 'ENTER' }, baseEnabled, equipInfo);
    expect(next.kind).toBe('equip-wizard');
    if (next.kind === 'equip-wizard') {
      expect(next.slot).toBe(0);
      expect(next.cursor).toBe(0);
      expect(next.selections).toEqual(Array(8).fill(null));
    }
  });

  it('with no candidates anywhere → commit-equip (no-op) directly', () => {
    const empty: EquipInfo = { candidatesFor: () => [] };
    const next = reduceCharacterView(equipMenu, { type: 'ENTER' }, baseEnabled, empty);
    expect(next.kind).toBe('commit-equip');
    if (next.kind === 'commit-equip') expect(next.selections).toEqual(Array(8).fill(null));
  });

  it('Right/Left move the cursor (clamped at SKIP == candidateCount)', () => {
    const s: CharacterViewState = { kind: 'equip-wizard', slot: 0, selections: Array(8).fill(null), cursor: 0 };
    const r1 = reduceCharacterView(s, { type: 'ARROW_RIGHT' }, baseEnabled, equipInfo);
    expect(r1.kind === 'equip-wizard' && r1.cursor).toBe(1);
    const r2 = reduceCharacterView({ ...s, cursor: 1 }, { type: 'ARROW_RIGHT' }, baseEnabled, equipInfo);
    expect(r2.kind === 'equip-wizard' && r2.cursor).toBe(2); // SKIP
    const r3 = reduceCharacterView({ ...s, cursor: 2 }, { type: 'ARROW_RIGHT' }, baseEnabled, equipInfo);
    expect(r3.kind === 'equip-wizard' && r3.cursor).toBe(2); // clamp
    const l1 = reduceCharacterView({ ...s, cursor: 2 }, { type: 'ARROW_LEFT' }, baseEnabled, equipInfo);
    expect(l1.kind === 'equip-wizard' && l1.cursor).toBe(1);
  });

  it('Enter records the cursored candidate inv-idx and advances to next populated slot', () => {
    // slot 0, cursor 1 → candidate inv-idx 7. Advance to slot 4.
    const s: CharacterViewState = { kind: 'equip-wizard', slot: 0, selections: Array(8).fill(null), cursor: 1 };
    const next = reduceCharacterView(s, { type: 'ENTER' }, baseEnabled, equipInfo);
    expect(next.kind).toBe('equip-wizard');
    if (next.kind === 'equip-wizard') {
      expect(next.slot).toBe(4);
      expect(next.cursor).toBe(0);
      expect(next.selections[0]).toBe(7);
    }
  });

  it('Enter on SKIP records null and advances', () => {
    const s: CharacterViewState = { kind: 'equip-wizard', slot: 0, selections: Array(8).fill(null), cursor: 2 };
    const next = reduceCharacterView(s, { type: 'ENTER' }, baseEnabled, equipInfo);
    if (next.kind === 'equip-wizard') {
      expect(next.slot).toBe(4);
      expect(next.selections[0]).toBeNull();
    }
  });

  it('Enter on the last populated slot → commit-equip with full selections', () => {
    // Already at slot 4 (last populated), pick candidate 0 (inv-idx 1).
    const s: CharacterViewState = {
      kind: 'equip-wizard',
      slot: 4,
      selections: [7, null, null, null, null, null, null, null],
      cursor: 0,
    };
    const next = reduceCharacterView(s, { type: 'ENTER' }, baseEnabled, equipInfo);
    expect(next.kind).toBe('commit-equip');
    if (next.kind === 'commit-equip') {
      expect(next.selections[0]).toBe(7);
      expect(next.selections[4]).toBe(1);
    }
  });

  it('Escape cancels → action-menu (selections discarded)', () => {
    const s: CharacterViewState = { kind: 'equip-wizard', slot: 0, selections: [3, null, null, null, null, null, null, null], cursor: 0 };
    const next = reduceCharacterView(s, { type: 'ESCAPE' }, baseEnabled, equipInfo);
    expect(next.kind).toBe('action-menu');
  });
});

describe('reduceCharacterView — ASSAY picker / display', () => {
  const assayMenu: CharacterViewState = {
    kind: 'action-menu',
    cursorIdx: 2, // ASSAY
    campEntries: ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL', 'EXIT'],
  };

  it('Enter on ASSAY → assay-picker with cursor on NONE (== carried count)', () => {
    const next = reduceCharacterView(assayMenu, { type: 'ENTER' }, baseEnabled, undefined, assayInfo);
    expect(next.kind).toBe('assay-picker');
    if (next.kind === 'assay-picker') expect(next.cursor).toBe(3); // NONE
  });

  it('Up/Down move the cursor over [items…, NONE] (engine nav, #072)', () => {
    // carried = [2,5,9] → 3 items, NONE = 3.
    const fromNoneUp = reduceCharacterView({ kind: 'assay-picker', cursor: 3 }, { type: 'ARROW_UP' }, baseEnabled, undefined, assayInfo);
    expect(fromNoneUp.kind === 'assay-picker' && fromNoneUp.cursor).toBe(0); // NONE → top
    const top = reduceCharacterView({ kind: 'assay-picker', cursor: 0 }, { type: 'ARROW_UP' }, baseEnabled, undefined, assayInfo);
    expect(top.kind === 'assay-picker' && top.cursor).toBe(3); // top → NONE
    const down = reduceCharacterView({ kind: 'assay-picker', cursor: 0 }, { type: 'ARROW_DOWN' }, baseEnabled, undefined, assayInfo);
    expect(down.kind === 'assay-picker' && down.cursor).toBe(1);
    const last = reduceCharacterView({ kind: 'assay-picker', cursor: 2 }, { type: 'ARROW_DOWN' }, baseEnabled, undefined, assayInfo);
    expect(last.kind === 'assay-picker' && last.cursor).toBe(3); // last → NONE
    const fromNoneDown = reduceCharacterView({ kind: 'assay-picker', cursor: 3 }, { type: 'ARROW_DOWN' }, baseEnabled, undefined, assayInfo);
    expect(fromNoneDown.kind === 'assay-picker' && fromNoneDown.cursor).toBe(0); // NONE → top
  });

  it('Enter on NONE (cursor == count) → action-menu (page rehydrates to EXIT)', () => {
    const s: CharacterViewState = { kind: 'assay-picker', cursor: 3 };
    const next = reduceCharacterView(s, { type: 'ENTER' }, baseEnabled, undefined, assayInfo);
    expect(next.kind).toBe('action-menu');
  });

  it('Enter on an item → assay-display with that item inventory index', () => {
    const s: CharacterViewState = { kind: 'assay-picker', cursor: 1 };
    const next = reduceCharacterView(s, { type: 'ENTER' }, baseEnabled, undefined, assayInfo);
    expect(next.kind).toBe('assay-display');
    if (next.kind === 'assay-display') expect(next.itemIdx).toBe(5); // carried[1]
  });

  it('Escape on picker → action-menu', () => {
    const s: CharacterViewState = { kind: 'assay-picker', cursor: 1 };
    const next = reduceCharacterView(s, { type: 'ESCAPE' }, baseEnabled, undefined, assayInfo);
    expect(next.kind).toBe('action-menu');
  });

  it('Enter on assay-display → action-menu', () => {
    const s: CharacterViewState = { kind: 'assay-display', itemIdx: 5 };
    const next = reduceCharacterView(s, { type: 'ENTER' }, baseEnabled, undefined, assayInfo);
    expect(next.kind).toBe('action-menu');
  });

  it('Escape on assay-display → action-menu', () => {
    const s: CharacterViewState = { kind: 'assay-display', itemIdx: 5 };
    const next = reduceCharacterView(s, { type: 'ESCAPE' }, baseEnabled, undefined, assayInfo);
    expect(next.kind).toBe('action-menu');
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

describe('skillTabEntries (dynamic: available categories minus current, + EXIT)', () => {
  // No personal skills (THESUS): available = WEAPONRY/PHYSICAL/ACADEMIA.
  it('WEAPONRY view → [PHYSICAL, ACADEMIA, EXIT] (matches the engine capture)', () => {
    expect(skillTabEntries(0, false)).toEqual([1, 3, SKILL_EXIT]);
  });
  it('PHYSICAL view → [WEAPONRY, ACADEMIA, EXIT]', () => {
    expect(skillTabEntries(1, false)).toEqual([0, 3, SKILL_EXIT]);
  });
  it('ACADEMIA view → [WEAPONRY, PHYSICAL, EXIT]', () => {
    expect(skillTabEntries(3, false)).toEqual([0, 1, SKILL_EXIT]);
  });
  it('with personal skills, PERSONAL appears (WEAPONRY view → [PHYSICAL,PERSONAL,ACADEMIA,EXIT])', () => {
    expect(skillTabEntries(0, true)).toEqual([1, 2, 3, SKILL_EXIT]);
  });
});

describe('reduceCharacterView — SKILL viewer (read-only, dynamic tabs)', () => {
  const skillMenu: CharacterViewState = {
    kind: 'action-menu',
    cursorIdx: 4, // SKILL
    campEntries: ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL', 'EXIT'],
  };
  const noPersonal = { hasPersonalSkills: false };

  it('ENTER on SKILL opens the viewer on WEAPONRY (category 0, cursor 0)', () => {
    const next = reduceCharacterView(skillMenu, { type: 'ENTER' }, baseEnabled);
    expect(next).toEqual({ kind: 'skill-viewer', category: 0, cursor: 0 });
  });

  it('arrows move the entry cursor without changing the displayed category', () => {
    // WEAPONRY entries [PHYSICAL,ACADEMIA,EXIT] render column-major 2-row:
    // PHYSICAL(c0r0), ACADEMIA(c0r1), EXIT(c1r0). Down → ACADEMIA (cursor 1).
    const s: CharacterViewState = { kind: 'skill-viewer', category: 0, cursor: 0 };
    const next = reduceCharacterView(s, { type: 'ARROW_DOWN' }, baseEnabled, undefined, undefined, noPersonal);
    expect(next).toEqual({ kind: 'skill-viewer', category: 0, cursor: 1 });
  });

  it('ENTER on a category entry switches the displayed category (cursor → 0)', () => {
    // WEAPONRY view, cursor 1 = ACADEMIA → switch to ACADEMIA.
    const s: CharacterViewState = { kind: 'skill-viewer', category: 0, cursor: 1 };
    const next = reduceCharacterView(s, { type: 'ENTER' }, baseEnabled, undefined, undefined, noPersonal);
    expect(next).toEqual({ kind: 'skill-viewer', category: 3, cursor: 0 });
  });

  it('ENTER on the EXIT entry returns to the action menu', () => {
    // WEAPONRY entries [PHYSICAL,ACADEMIA,EXIT]; cursor 2 = EXIT.
    const s: CharacterViewState = { kind: 'skill-viewer', category: 0, cursor: 2 };
    const next = reduceCharacterView(s, { type: 'ENTER' }, baseEnabled, undefined, undefined, noPersonal);
    expect(next.kind).toBe('action-menu');
  });

  it('ESC returns to the action menu', () => {
    const s: CharacterViewState = { kind: 'skill-viewer', category: 3, cursor: 1 };
    const next = reduceCharacterView(s, { type: 'ESCAPE' }, baseEnabled, undefined, undefined, noPersonal);
    expect(next.kind).toBe('action-menu');
  });
});

describe('reduceCharacterView — SWAG bag manager', () => {
  // 4 carried items (array idx 0..3), 1 bag item (bag-relative idx 0).
  const swag: SwagInfo = {
    visibleMenu: ['ADD', 'REMOVE', 'DROP', 'EXIT'],
    carried: [0, 1, 2, 3],
    bag: [0],
  };
  const swagMenuEntry: CharacterViewState = {
    kind: 'action-menu',
    cursorIdx: 3, // SWAG
    campEntries: ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL', 'EXIT'],
  };
  const R = (s: CharacterViewState, e: Parameters<typeof reduceCharacterView>[1]) =>
    reduceCharacterView(s, e, baseEnabled, undefined, undefined, undefined, swag);

  it('ENTER on SWAG opens swag-menu with cursor on EXIT (last visible entry)', () => {
    expect(R(swagMenuEntry, { type: 'ENTER' })).toEqual({ kind: 'swag-menu', cursor: 3 });
  });

  it('swag-menu ENTER on ADD opens the add-picker (cursor on NONE = carried count)', () => {
    expect(R({ kind: 'swag-menu', cursor: 0 }, { type: 'ENTER' }))
      .toEqual({ kind: 'swag-add-picker', cursor: 4 }); // NONE at carried.length
  });

  it('swag-menu ENTER on REMOVE / DROP opens the bag pickers (cursor on NONE = bag count)', () => {
    expect(R({ kind: 'swag-menu', cursor: 1 }, { type: 'ENTER' }))
      .toEqual({ kind: 'swag-remove-picker', cursor: 1 });
    expect(R({ kind: 'swag-menu', cursor: 2 }, { type: 'ENTER' }))
      .toEqual({ kind: 'swag-drop-picker', cursor: 1 });
  });

  it('swag-menu ENTER on EXIT / ESC returns to the action menu', () => {
    expect(R({ kind: 'swag-menu', cursor: 3 }, { type: 'ENTER' }).kind).toBe('action-menu');
    expect(R({ kind: 'swag-menu', cursor: 0 }, { type: 'ESCAPE' }).kind).toBe('action-menu');
  });

  it('add-picker ENTER on an item → commit-swag-add with the carried array index', () => {
    // cursor 0 → carried[0] = array idx 0.
    expect(R({ kind: 'swag-add-picker', cursor: 0 }, { type: 'ENTER' }))
      .toEqual({ kind: 'commit-swag-add', carriedIdx: 0 });
  });

  it('add-picker ENTER on NONE / ESC → back to swag-menu', () => {
    expect(R({ kind: 'swag-add-picker', cursor: 4 }, { type: 'ENTER' }).kind).toBe('swag-menu');
    expect(R({ kind: 'swag-add-picker', cursor: 0 }, { type: 'ESCAPE' }).kind).toBe('swag-menu');
  });

  it('remove-picker / drop-picker ENTER on an item → commit-swag-remove / -drop (bag idx)', () => {
    expect(R({ kind: 'swag-remove-picker', cursor: 0 }, { type: 'ENTER' }))
      .toEqual({ kind: 'commit-swag-remove', bagIdx: 0 });
    expect(R({ kind: 'swag-drop-picker', cursor: 0 }, { type: 'ENTER' }))
      .toEqual({ kind: 'commit-swag-drop', bagIdx: 0 });
  });
});
