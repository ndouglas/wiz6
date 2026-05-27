/**
 * cell-parity.test.ts — BYTE-EXACT tile parity for the CHARACTER MENU.
 *
 * Compares our composed window cell grids (char, attr per 8×8 cell) against the
 * engine's LIVE window cell memory, dumped from DOSBox-X save states 1/2/3 via
 * `tools/parity/dump-cells.py` and committed as JSON fixtures.
 *
 * This is the authoritative parity oracle: the engine's cell array is exactly
 * what it placed, independent of any framebuffer decode. (The older framebuffer
 * decoder, tools/parity/decode-screen.ts, has a display-start offset bug and is
 * NOT used here.)
 *
 * Ground truth: docs/re/findings/wpcmk-charmenu-toplayout.json — every cell is
 * an 8×8 tile written via ui_put_styled_char_at; the attr low nibble selects
 * the wfont, and the glyph's own pixels carry the colour (no attr recolour).
 *
 * Roster states (column-major fill, columns at bottomBar cols [4,16,28], rows
 * [1,2]):
 *   save1 PARTIAL: CREATE/REVIEW/DELETE/RENAME/PORTRAIT/EXIT, no cursor highlight
 *   save2 EMPTY:   CREATE PC + EXIT, no cursor highlight
 *   save3 FULL:    REVIEW/DELETE/RENAME/PORTRAIT/EXIT, REVIEW (opt 0) highlighted
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setCursor, puts, clearWindow } from '@wiz6/parser';
import { MessageDbSchema, classOffered } from '@wiz6/data';
import { createPersistentWindows } from '../../../../../src/pages/roster/creation/ega/windows.js';
import { highlightRange } from '../../../../../src/pages/roster/creation/ega/highlight.js';
import { drawCharSheet } from '../../../../../src/pages/roster/creation/ega/char-sheet.js';
import { blankDraft } from '../../../../../src/pages/roster/creation/state.js';
import { raceName, className, creationString, MSG } from '../../../../../src/pages/roster/creation/messages.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..', '..', '..');

/** Resolve the main checkout root (handles git worktrees). */
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

const FIXTURES = join(mainRoot(), 'tools', 'parity', 'fixtures', 'cells');

interface EngineWindow {
  w: number;
  h: number;
  cells: [number, number][][]; // [char, attr] per row
}
function loadSave(n: number): Record<string, EngineWindow> {
  return JSON.parse(readFileSync(join(FIXTURES, `save${n}.json`), 'utf-8')).windows;
}

const COL_X = [4, 16, 28];
const ROW_Y = [1, 2];

/** Place a column-major menu (and optional cursor highlight) into bottomBar. */
function placeMenu(
  bottomBar: ReturnType<typeof createPersistentWindows>['bottomBar'],
  labels: string[],
  selected: number | null,
) {
  labels.forEach((label, i) => {
    const col = Math.floor(i / 2);
    const row = i % 2;
    setCursor(bottomBar, COL_X[col]!, ROW_Y[row]!);
    puts(bottomBar, label, 0x03);
  });
  if (selected !== null) {
    const col = Math.floor(selected / 2);
    const row = selected % 2;
    highlightRange(bottomBar, COL_X[col]!, ROW_Y[row]!, labels[selected]!.length, 5);
  }
}

/** Count cell (char, attr) mismatches between our window and the engine's. */
function diffCount(
  ourCells: Uint8Array | number[],
  eng: EngineWindow,
): { diffs: number; first?: string } {
  let diffs = 0;
  let first: string | undefined;
  for (let y = 0; y < eng.h; y++) {
    for (let x = 0; x < eng.w; x++) {
      const i = (y * eng.w + x) * 2;
      const [ec, ea] = eng.cells[y]![x]!;
      if (ourCells[i] !== ec || ourCells[i + 1] !== ea) {
        diffs++;
        first ??= `(${x},${y}) ours=(${ourCells[i]!.toString(16)},${ourCells[i + 1]!.toString(16)}) eng=(${ec.toString(16)},${ea.toString(16)})`;
      }
    }
  }
  return { diffs, first };
}

const CASES: { name: string; save: number; labels: string[]; selected: number | null }[] = [
  {
    name: 'PARTIAL (save1)',
    save: 1,
    labels: ['CREATE PC', 'REVIEW PC', 'DELETE PC', 'RENAME PC', 'PORTRAIT', 'EXIT'],
    selected: null,
  },
  { name: 'EMPTY (save2)', save: 2, labels: ['CREATE PC', 'EXIT'], selected: null },
  {
    name: 'FULL (save3, REVIEW highlighted)',
    save: 3,
    labels: ['REVIEW PC', 'DELETE PC', 'RENAME PC', 'PORTRAIT', 'EXIT'],
    selected: 0,
  },
];

describe('CHARACTER MENU cell-grid parity (byte-exact vs engine)', () => {
  for (const c of CASES) {
    it(`${c.name}: top + bottomBar + menuPanel match engine cell memory`, () => {
      const eng = loadSave(c.save);
      const { top, bottomBar, menuPanel } = createPersistentWindows();
      placeMenu(bottomBar, c.labels, c.selected);

      for (const [name, win] of [
        ['top', top],
        ['bottomBar', bottomBar],
        ['menuPanel', menuPanel],
      ] as const) {
        const { diffs, first } = diffCount(win.cells, eng[name]!);
        expect(diffs, `${name} diff: ${first ?? ''}`).toBe(0);
      }
    });
  }
});

describe('NAME INPUT cell-grid parity (byte-exact vs engine, buffer="a")', () => {
  // Mirrors NameInputScreen's render: prompt "CHARACTER NAME >" at (col 1,
  // row 1) attr 0x03, then a fixed 8-cell field at col 17 — typed text +
  // cursor at attr 0x10 (inverse-video), remainder blanked at attr 0x00.
  const NAME_MAX_LENGTH = 7;
  const PROMPT = 'CHARACTER NAME >';

  it('top + bottomBar + menuPanel match engine cell memory', () => {
    const eng = JSON.parse(
      readFileSync(join(FIXTURES, 'name-input.json'), 'utf-8'),
    ).windows as Record<string, EngineWindow>;
    const { top, bottomBar, menuPanel } = createPersistentWindows();

    const buffer = 'a';
    setCursor(bottomBar, 1, 1);
    puts(bottomBar, PROMPT, 0x03);
    setCursor(bottomBar, 1 + PROMPT.length, 1);
    puts(bottomBar, `${buffer} `, 0x10);
    const pad = NAME_MAX_LENGTH + 1 - (buffer.length + 1);
    if (pad > 0) puts(bottomBar, ' '.repeat(pad), 0x00);

    for (const [name, win] of [
      ['top', top],
      ['bottomBar', bottomBar],
      ['menuPanel', menuPanel],
    ] as const) {
      const { diffs, first } = diffCount(win.cells, eng[name]!);
      expect(diffs, `${name} diff: ${first ?? ''}`).toBe(0);
    }
  });
});

describe('RACE SELECT cell-grid parity (menuPanel + bottomBar; cursor on HUMAN)', () => {
  // The populated char-sheet `top` is a separate shared component (attribute
  // labels/values), not yet ported — so this only asserts the race list +
  // prompt, which ARE byte-exact: menuPanel races at col 1 rows 1+ (HUMAN
  // highlighted at attr 0x50), bottomBar prompt centered at row 1 attr 0x03.
  it('menuPanel race list + centered prompt match engine cell memory', () => {
    const eng = JSON.parse(
      readFileSync(join(FIXTURES, 'race-select.json'), 'utf-8'),
    ).windows as Record<string, EngineWindow>;
    const db = MessageDbSchema.parse(
      JSON.parse(readFileSync(join(mainRoot(), 'extracted', 'messages', 'msg.json'), 'utf-8')),
    );
    const { bottomBar, menuPanel } = createPersistentWindows();

    const prompt = creationString(db, MSG.racePrompt);
    const col = Math.floor((bottomBar.widthCells - prompt.length) / 2);
    setCursor(bottomBar, col, 1);
    puts(bottomBar, prompt, 0x03);

    clearWindow(menuPanel, 0x20, 0x03);
    for (let i = 0; i < 11; i++) {
      const label = raceName(db, i);
      setCursor(menuPanel, 1, i + 1);
      puts(menuPanel, label, 0x03);
      if (i === 0) highlightRange(menuPanel, 1, i + 1, label.length, 5);
    }

    for (const [name, win] of [
      ['bottomBar', bottomBar],
      ['menuPanel', menuPanel],
    ] as const) {
      const { diffs, first } = diffCount(win.cells, eng[name]!);
      expect(diffs, `${name} diff: ${first ?? ''}`).toBe(0);
    }
  });
});

describe('CHAR SHEET `top` cell-grid parity (byte-exact vs engine)', () => {
  // drawCharSheet fills the 40×20 `top` window with the char-sheet content
  // (attribute labels+values, HP/STM, EXP/LVL/MKS/RNK, name/race header, bottom
  // stat grid). The status title is drawn centered into row 5 cols 21..38.
  //
  // The name field reproduces draft.name at (4,1) attr 0x50; both fixtures were
  // captured with a 1-char residual rendering as 'P' (the engine name buffer
  // held content), so the draft.name='P' matches the live engine cells.
  const db = MessageDbSchema.parse(
    JSON.parse(readFileSync(join(mainRoot(), 'extracted', 'messages', 'msg.json'), 'utf-8')),
  );

  function loadTop(fixture: string): EngineWindow {
    return JSON.parse(readFileSync(join(FIXTURES, fixture), 'utf-8')).windows.top as EngineWindow;
  }

  it('RACE screen: race not picked → attrs 0, no BONUS row, rank NONE', () => {
    const eng = loadTop('race-select.json');
    const { top } = createPersistentWindows();
    // race=null, class=null, attributes all 0, bonusPool 0 (not rolled).
    const draft = { ...blankDraft(), name: 'P' };
    drawCharSheet(top, draft, db, creationString(db, MSG.raceTitle));

    const { diffs, first } = diffCount(top.cells, eng);
    expect(diffs, `top diff: ${first ?? ''}`).toBe(0);
  });

  it('CLASS screen: race HUMAN, bonus 6, class not picked → rank NONE', () => {
    const eng = loadTop('class-select.json');
    const { top } = createPersistentWindows();
    // race=HUMAN(0), sex=MALE(0), bonusPool=6 (rolled → BONUS row present),
    // class=null (rank NONE), attrs STR9 INT8 PIE8 VIT9 DEX9 SPD8 PER8 KAR0.
    const draft = {
      ...blankDraft(),
      name: 'P',
      race: 0,
      sex: 0,
      bonusPool: 6,
      attributes: { str: 9, int: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 },
    };
    drawCharSheet(top, draft, db, creationString(db, MSG.classTitle));

    const { diffs, first } = diffCount(top.cells, eng);
    expect(diffs, `top diff: ${first ?? ''}`).toBe(0);
  });

  it('BONUS ALLOCATOR: class FIGHTER, STR raised to 13, bonus 2, cursor on STR', () => {
    // top = char-sheet (class name FIGHTER on row 2, STR=13, BONUS row=2) +
    // the allocator cursor marker 'b' (0x62, attr 0x70) at col 7 of the cursor
    // attribute's row (STR → row 5). No status title on this screen.
    const eng = loadTop('bonus-alloc.json');
    const { top } = createPersistentWindows();
    const draft = {
      ...blankDraft(),
      name: 'P',
      race: 0,
      sex: 0,
      class: 0,
      bonusPool: 2,
      attributes: { str: 13, int: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 },
    };
    drawCharSheet(top, draft, db);
    const cursor = 0; // STR
    setCursor(top, 7, 5 + cursor);
    puts(top, String.fromCharCode(0x62), 0x70);

    const { diffs, first } = diffCount(top.cells, eng);
    expect(diffs, `top diff: ${first ?? ''}`).toBe(0);
  });
});

describe('PERSONALITY (karma) cell-grid parity', () => {
  // Char-sheet with rolled values (STR 15, KAR 17, HP 10/10, STM 99/99, BONUS 0)
  // + the "CASTING KARMA - PRESS" prompt. The top matches byte-exact EXCEPT one
  // cell (7,5): the engine leaves a (space, attr 0x70) there — the erased
  // bonus-allocator cursor 'b', lingering because the engine reuses windows.
  // Our port redraws clean, so that single stale cell is an accepted diff.
  const db = MessageDbSchema.parse(
    JSON.parse(readFileSync(join(mainRoot(), 'extracted', 'messages', 'msg.json'), 'utf-8')),
  );
  const STALE_CELLS = new Set(['7,5']);

  function diffCoords(ourCells: Uint8Array | number[], eng: EngineWindow): string[] {
    const out: string[] = [];
    for (let y = 0; y < eng.h; y++) {
      for (let x = 0; x < eng.w; x++) {
        const i = (y * eng.w + x) * 2;
        const [ec, ea] = eng.cells[y]![x]!;
        if (ourCells[i] !== ec || ourCells[i + 1] !== ea) out.push(`${x},${y}`);
      }
    }
    return out;
  }

  it('top (minus the stale allocator-cursor cell) + bottomBar match engine', () => {
    const w = JSON.parse(readFileSync(join(FIXTURES, 'personality.json'), 'utf-8'))
      .windows as Record<string, EngineWindow>;
    const { top, bottomBar } = createPersistentWindows();
    const draft = {
      ...blankDraft(),
      name: 'P',
      race: 0,
      sex: 0,
      class: 0,
      bonusPool: 0,
      attributes: { str: 15, int: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 17 },
      derived: { hpInitial: 10, stamina: 99, level: 0, xp: 0 },
    };
    drawCharSheet(top, draft, db);

    clearWindow(bottomBar, 0x20, 0x03);
    const prompt = creationString(db, MSG.personality);
    const col = Math.ceil((bottomBar.widthCells - prompt.length) / 2);
    setCursor(bottomBar, col, 1);
    puts(bottomBar, prompt, 0x03);

    const topDiffs = diffCoords(top.cells, w.top!).filter((c) => !STALE_CELLS.has(c));
    expect(topDiffs, `unexpected top diffs: ${topDiffs.join(' ')}`).toEqual([]);
    expect(diffCoords(bottomBar.cells, w.bottomBar!)).toEqual([]);
  });
});

describe('CLASS SELECT cell-grid parity (pool-aware qualification)', () => {
  // The engine offers only the classes reachable by spending the bonus pool
  // (Σ max(0, req-attr) ≤ pool), packed at col 1 rows 1+, FIGHTER highlighted.
  // The "SELECT CHARACTER PROFESSION" prompt is assembled + ceil-centered (col 7).
  // Saves confirm the rule, its threshold, the sex gate, and the column wrap:
  //   Human base + pool 6  → 5 classes (Fighter/Mage/Priest/Thief/Ranger)
  //   Elf base   + pool 9  → 7 (adds Alchemist+Bard, deficit 7; Bishop@10 excluded)
  //   Human male + pool 18 → 13, two columns (11 left + MONK/NINJA right);
  //                          VALKYRIE excluded — female-only, char is male.
  const db = MessageDbSchema.parse(
    JSON.parse(readFileSync(join(mainRoot(), 'extracted', 'messages', 'msg.json'), 'utf-8')),
  );
  // Two-column list geometry — must mirror MenuPickerScreen's menuCellOf.
  const COLUMN_ROWS = 11;
  const COLUMN_STRIDE = 10;
  const CASES = [
    {
      name: 'Human base, pool 6 → 5 qualifying',
      fixture: 'class-select.json',
      attrs: { str: 9, int: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 },
      pool: 6,
      sex: 0,
      expected: 5,
    },
    {
      name: 'Elf base, pool 9 → 7 qualifying (Bishop@10 excluded)',
      fixture: 'class-select-elf.json',
      attrs: { str: 7, int: 10, pie: 10, vit: 7, dex: 9, spd: 9, per: 8, kar: 0 },
      pool: 9,
      sex: 0,
      expected: 7,
    },
    {
      name: 'Human male, pool 18 → 13 in two columns (Valkyrie excluded, female-only)',
      fixture: 'class-select-all.json',
      attrs: { str: 9, int: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 },
      pool: 18,
      sex: 0,
      expected: 13,
    },
  ];

  for (const c of CASES) {
    it(`${c.name}: list + prompt match engine cell memory`, () => {
      const eng = JSON.parse(
        readFileSync(join(FIXTURES, c.fixture), 'utf-8'),
      ).windows as Record<string, EngineWindow>;
      const { bottomBar, menuPanel } = createPersistentWindows();

      const prompt = creationString(db, MSG.classPrompt);
      setCursor(bottomBar, Math.ceil((bottomBar.widthCells - prompt.length) / 2), 1);
      puts(bottomBar, prompt, 0x03);

      clearWindow(menuPanel, 0x20, 0x03);
      let n = 0;
      for (let i = 0; i < 14; i++) {
        if (!classOffered(c.attrs, c.pool, c.sex, i)) continue;
        const label = className(db, i);
        const x = 1 + Math.floor(n / COLUMN_ROWS) * COLUMN_STRIDE;
        const row = (n % COLUMN_ROWS) + 1;
        setCursor(menuPanel, x, row);
        puts(menuPanel, label, 0x03);
        if (n === 0) highlightRange(menuPanel, x, row, label.length, 5); // FIGHTER selected
        n++;
      }
      expect(n, 'qualifying class count').toBe(c.expected);

      for (const [name, win] of [
        ['bottomBar', bottomBar],
        ['menuPanel', menuPanel],
      ] as const) {
        const { diffs, first } = diffCount(win.cells, eng[name]!);
        expect(diffs, `${name} diff: ${first ?? ''}`).toBe(0);
      }
    });
  }
});
