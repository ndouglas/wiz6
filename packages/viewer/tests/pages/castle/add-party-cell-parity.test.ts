/**
 * add-party-cell-parity.test.ts — BYTE-EXACT tile parity for the ADD PARTY picker.
 *
 * Drives composeAddPartyPickerFrame against the engine's live cell memory
 * dumped from save/1.sav (NATHAN as the only candidate, cursor on NATHAN).
 *
 * Fixture: tools/parity/fixtures/cells/add-party-picker-1char.json
 *
 * Residual cells: the right panel has two engine-residual cells at row 4
 * cols 18-19 (`[0x36, 0x10]` and `[0x00, 0x01]`) per the Task 1 findings
 * (docs/re/findings/wbase-window-struct.json). These are leftover bytes from
 * the dynamic window struct's allocation (cells_off = struct + 0x14 with
 * 4 unknown header bytes preceding cells), NOT picker content. The composer
 * emits clean background fill in those positions; the test masks the fixture
 * before comparison.
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

/**
 * Prefer files from the WORKTREE (REPO_ROOT) when present — both
 * tools/parity/fixtures and extracted/ are gitignored / branch-local in
 * progress, so they may exist only in the active worktree. Fall back to
 * the main checkout (`mainRoot()`) when the file isn't in the worktree.
 */
function resolveAsset(...rel: string[]): string {
  const inWorktree = join(REPO_ROOT, ...rel);
  if (existsSync(inWorktree)) return inWorktree;
  return join(mainRoot(), ...rel);
}

const FIXTURES_REL = ['tools', 'parity', 'fixtures', 'cells'];

interface EngineWindow {
  w: number;
  h: number;
  x: number;
  y: number;
  attr: number;
  cells: [number, number][][];
}

function loadFixture(): Record<string, EngineWindow> {
  const path = resolveAsset(...FIXTURES_REL, 'add-party-picker-1char.json');
  return JSON.parse(readFileSync(path, 'utf-8')).windows;
}

function loadMsgDb(): MessageDb {
  const path = resolveAsset('extracted', 'messages', 'msg.json');
  return MessageDbSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
}

function nathan(): Character {
  // Match the engine state in save/1.sav: NATHAN, Rawulf, Fighter, Male.
  // Race 9 = Rawulf, Class 0 = Fighter, Sex 0 = Male.
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'NATHAN',
    race: 9,
    class: 0,
    sex: 0,
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

/** Convert a window's Uint8Array cells to the [char,attr][][] grid shape used by the fixture. */
function toGrid(win: { widthCells: number; heightCells: number; cells: Uint8Array }): [number, number][][] {
  const grid: [number, number][][] = [];
  for (let y = 0; y < win.heightCells; y++) {
    const row: [number, number][] = [];
    for (let x = 0; x < win.widthCells; x++) {
      const i = (y * win.widthCells + x) * 2;
      row.push([win.cells[i]!, win.cells[i + 1]!]);
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Mask the engine-residual cells in the right panel before comparison.
 * Per docs/re/findings/wbase-window-struct.json, the right panel's
 * cells_off = struct + 0x14 (vs +0x10 for the left), leaving 4 bytes of
 * unknown-purpose header data that bleeds into the last cells of the last
 * row. These two cells are NOT picker content — they're allocator leftovers.
 */
function maskResiduals(window: EngineWindow): EngineWindow {
  const cells = window.cells.map((row) => row.map(([c, a]) => [c, a] as [number, number]));
  // Right panel row 4 cols 18, 19: engine residuals — overwrite to background fill.
  cells[4]![18] = [0x20, 0x03];
  cells[4]![19] = [0x20, 0x03];
  return { ...window, cells };
}

describe('ADD PARTY picker — cell-grid parity', () => {
  it('1-candidate state matches save/1.sav byte-exact (residuals masked)', () => {
    const fixture = loadFixture();
    const db = loadMsgDb();

    const windows = composeAddPartyPickerFrame(
      { candidates: [nathan()], cursorIdx: 0, onCancel: false },
      db,
    );
    expect(windows).toHaveLength(2);

    // Match composer outputs to fixture window keys by dimensions.
    const left = windows.find(
      (w) => w.widthCells === fixture.leftPanel!.w && w.heightCells === fixture.leftPanel!.h,
    );
    const right = windows.find(
      (w) => w.widthCells === fixture.rightPanel!.w && w.heightCells === fixture.rightPanel!.h,
    );
    expect(left).toBeDefined();
    expect(right).toBeDefined();

    // Screen position: fixture stores x/y in CELL coords; composer emits PIXEL
    // coords (cells × 8). Mismatched screenX/screenY puts the windows in the
    // wrong place — invisible to a cells-only comparison, so we check it here.
    expect(left!.screenX).toBe(fixture.leftPanel!.x * 8);
    expect(left!.screenY).toBe(fixture.leftPanel!.y * 8);
    expect(right!.screenX).toBe(fixture.rightPanel!.x * 8);
    expect(right!.screenY).toBe(fixture.rightPanel!.y * 8);

    // Composer-emitted right panel must NOT contain the residual bytes — mask
    // the fixture to match the clean output the composer produces.
    const rightMasked = maskResiduals(fixture.rightPanel!);

    expect(toGrid(left!)).toEqual(fixture.leftPanel!.cells);
    expect(toGrid(right!)).toEqual(rightMasked.cells);
  });
});
