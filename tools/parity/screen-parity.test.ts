/**
 * screen-parity.test.ts — full-resolution RGB parity vs committed engine fixtures.
 *
 * For each ported screen we render our 320×200 frame and compare it pixel-for-
 * pixel (tolerance 0, full RGB) against the engine's real framebuffer, committed
 * under `fixtures/engine/<name>.idx.gz` (see that dir's README). No `.sav` is
 * read at test time — the fixtures are permanent derivatives of the DOSBox saves.
 *
 * The assertion is a **regression floor**, not the goal: each screen records its
 * current match % and we fail if a change drops below it. The TARGET is 100% and
 * we're there — all three creation screens (character-menu empty + populated,
 * name-input) are pixel-exact. On a shortfall, inspect the diff PNG in /tmp.
 *
 * Getting here required fixing a 16-scanline vertical offset in decode-screen.ts
 * (VRAM_OFFSET_IN_BLOB): the fixtures used to be shifted down 16px, which pinned
 * the comparison at ~80% even though our tile placement was already byte-exact
 * (cell-grid parity is blind to a uniform pixel shift).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIZ6_MAIN, FontSchema, Font4bppSchema, MessageDbSchema, PortraitSetSchema, classOffered, getRaceBaseStats } from '../../packages/data/src/index.js';
import type { Font, Font4bpp, Palette, MessageDb, PortraitSet } from '../../packages/data/src/index.js';
import { clearWindow, setCursor, puts, type FontSet } from '../../packages/parser/src/index.js';
import { loadCreationFontSet } from '../../packages/viewer/src/pages/roster/creation/ega/assets.js';
import { renderCreationFrame } from '../../packages/viewer/src/pages/roster/creation/ega/render-frame.js';
import { createPersistentWindows, createSkillTrainWindow } from '../../packages/viewer/src/pages/roster/creation/ega/windows.js';
import { highlightRange } from '../../packages/viewer/src/pages/roster/creation/ega/highlight.js';
import { drawCharSheet } from '../../packages/viewer/src/pages/roster/creation/ega/char-sheet.js';
import { blankDraft } from '../../packages/viewer/src/pages/roster/creation/state.js';
import { raceName, className, creationString, MSG } from '../../packages/viewer/src/pages/roster/creation/messages.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { compareRgba, writeDiffPng } from './diff-image.js';
import { indicesToRgba } from './decode-screen.js';

// ─── Paths (worktree-aware) ────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

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

const EXTRACTED_FONTS = join(mainRoot(), 'extracted', 'fonts');
const EXTRACTED_MESSAGES = join(mainRoot(), 'extracted', 'messages');
const EXTRACTED_PORTRAITS = join(mainRoot(), 'extracted', 'portraits');
const FIXTURES_ENGINE = join(mainRoot(), 'tools', 'parity', 'fixtures', 'engine');

// ─── Loaders ───────────────────────────────────────────────────────────────────

async function diskLoadFont(url: string): Promise<Font> {
  return FontSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_FONTS, url.replace(/^\/fonts\//, '')), 'utf-8')),
  );
}
async function diskLoadFont4bpp(url: string): Promise<Font4bpp> {
  return Font4bppSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_FONTS, url.replace(/^\/fonts\//, '')), 'utf-8')),
  );
}

/** Load a committed engine fixture as a 320×200 RGBA buffer (no .sav read). */
function engineRgba(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(join(FIXTURES_ENGINE, `${name}.idx.gz`)));
  if (raw.length !== 64000) {
    throw new Error(`fixture "${name}": expected 64000 index bytes, got ${raw.length}`);
  }
  return indicesToRgba(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
}

// ─── CHARACTER MENU helper (column-major, cols [4,16,28], rows [1,2]) ──────────
// Authoritative layout: packages/viewer/tests/.../cell-parity.test.ts.

const COL_X = [4, 16, 28];
const ROW_Y = [1, 2];

function renderCharacterMenu(
  fontSet: FontSet,
  palette: Palette,
  labels: string[],
  selected: number | null,
): Uint8ClampedArray {
  const { top, bottomBar, menuPanel } = createPersistentWindows();
  labels.forEach((label, i) => {
    setCursor(bottomBar, COL_X[Math.floor(i / 2)]!, ROW_Y[i % 2]!);
    puts(bottomBar, label, 0x03);
  });
  if (selected !== null) {
    const c = Math.floor(selected / 2);
    const r = selected % 2;
    highlightRange(bottomBar, COL_X[c]!, ROW_Y[r]!, labels[selected]!.length, 5);
  }
  return renderCreationFrame([top, bottomBar, menuPanel], fontSet, palette);
}

// ─── NAME INPUT helper (empty buffer + cursor) ─────────────────────────────────

function renderNameInput(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  // Engine fixture state (empty input — single-letter blink-off state at the
  // start of typing). Per the live struct dump from the save:
  //   col 17:    char 'a' (97) attr 0x10 — wfont0 glyph 97 is the SOLID-BLOCK
  //              cursor sprite (not a lowercase letter).
  //   col 18..24: spaces attr 0x00 (empty field).
  const { top, bottomBar, menuPanel } = createPersistentWindows();
  // Name-input renders typed text + cursor in COLORED highlight mode (yellow
  // text on black, white cursor block on black) — override the bottomBar's
  // default invertHighlight=true (which is right for the character-menu
  // selection cursor, wrong here).
  bottomBar.invertHighlight = false;
  const PROMPT = 'CHARACTER NAME >';
  const NAME_MAX_LENGTH = 7;
  setCursor(bottomBar, 1, 1);
  puts(bottomBar, PROMPT, 0x03);
  setCursor(bottomBar, 1 + PROMPT.length, 1);
  puts(bottomBar, 'a', 0x10); // wfont0 0x61 = cursor block sprite
  puts(bottomBar, ' '.repeat(NAME_MAX_LENGTH), 0x00);
  return renderCreationFrame([top, bottomBar, menuPanel], fontSet, palette);
}

// ─── RACE SELECT helper (char-sheet + race list + prompt) ──────────────────────
// Engine state: draft.name='NATHAN', race=null (not yet picked), HUMAN selected.

let msgDb: MessageDb;

function renderRaceSelect(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  const { top, bottomBar, menuPanel } = createPersistentWindows();
  const draft = { ...blankDraft(), name: 'NATHAN' };
  drawCharSheet(top, draft, msgDb, creationString(msgDb, MSG.raceTitle));
  const prompt = creationString(msgDb, MSG.racePrompt);
  setCursor(bottomBar, Math.floor((bottomBar.widthCells - prompt.length) / 2), 1);
  puts(bottomBar, prompt, 0x03);
  for (let i = 0; i < 11; i++) {
    const label = raceName(msgDb, i);
    setCursor(menuPanel, 1, i + 1);
    puts(menuPanel, label, 0x03);
    if (i === 0) highlightRange(menuPanel, 1, i + 1, label.length, 5);
  }
  return renderCreationFrame([top, bottomBar, menuPanel], fontSet, palette);
}

// ─── CLASS / PROFESSION SELECT helper (post-sex, bonus rolled) ─────────────────
// State: NATHAN, Human male, bonusPool=17 → 12 qualifying classes in 2 columns
// (FIGHTER..MONK in left col + NINJA in right col); Lord (deficit 18) and
// Valkyrie (female-only) excluded.

function renderClassSelect(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  const { top, bottomBar, menuPanel } = createPersistentWindows();
  const human = getRaceBaseStats(0);
  const draft = {
    ...blankDraft(),
    name: 'NATHAN',
    race: 0,
    sex: 0,
    attributes: { ...human, kar: 0 },
    bonusPool: 17,
  };
  drawCharSheet(top, draft, msgDb, creationString(msgDb, MSG.classTitle));
  const prompt = creationString(msgDb, MSG.classPrompt);
  setCursor(bottomBar, Math.ceil((bottomBar.widthCells - prompt.length) / 2), 1);
  puts(bottomBar, prompt, 0x03);
  // Two-column profession list — see MenuPickerScreen.menuCellOf.
  const ROWS_PER_COL = 11;
  const COL_STRIDE = 10;
  let n = 0;
  for (let i = 0; i < 14; i++) {
    if (!classOffered(draft.attributes, draft.bonusPool, draft.sex!, i)) continue;
    const label = className(msgDb, i);
    const col = Math.floor(n / ROWS_PER_COL);
    const x = 1 + col * COL_STRIDE;
    const row = (n % ROWS_PER_COL) + 1;
    setCursor(menuPanel, x, row);
    puts(menuPanel, label, 0x03);
    if (n === 0) highlightRange(menuPanel, x, row, label.length, 5);
    n++;
  }
  return renderCreationFrame([top, bottomBar, menuPanel], fontSet, palette);
}

// ─── PORTRAIT SELECT helper (post-karma; portrait sub-window open) ────────────
// Engine state (save 1): NATHAN, M-HUMAN, SAMURAI, karma=3, HP=7/7, STM=96/96,
// BONUS pool=0, portrait index 0 (default). Portrait sprite is a 3×3 tile grid
// at menuPanel cells (8,3)..(10,5), each cell drawn at attr 0x02 (wfont2). The
// engine loads wport1.ega into the wfont2 slot for this screen, mapping portrait
// 0's 9 tiles to font glyphs 0x48..0x50. We replicate that by injecting the 9
// tiles into a cloned font2.

function renderPortraitSelect(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  const { top, bottomBar, menuPanel } = createPersistentWindows();
  const draft = {
    ...blankDraft(),
    name: 'NATHAN',
    race: 0,    // HUMAN
    sex: 0,     // M
    class: 11,  // SAMURAI
    attributes: { str: 14, int: 11, pie: 8, vit: 9, dex: 12, spd: 14, per: 8, kar: 3 },
    derived: { hpInitial: 7, stamina: 96, level: 0, xp: 0 },
    bonusPool: 0,
    portrait: 0,
  };
  drawCharSheet(top, draft, msgDb, creationString(msgDb, MSG.portraitTitle));

  // bottomBar prompts — engine centers with Math.ceil padding (row 1: "◄► TO
  // REVIEW PORTRAITS" len 22 at col 9; row 2: "PRESS ▶ TO SELECT" len 17 at col 12).
  const review = creationString(msgDb, MSG.portraitReview);
  setCursor(bottomBar, Math.ceil((bottomBar.widthCells - review.length) / 2), 1);
  puts(bottomBar, review, 0x03);
  const select = creationString(msgDb, MSG.portraitSelect);
  setCursor(bottomBar, Math.ceil((bottomBar.widthCells - select.length) / 2), 2);
  puts(bottomBar, select, 0x03);

  // menuPanel: 9 portrait tile chars at (8..10, 3..5), attr 0x02.
  for (let r = 0; r < 3; r++) {
    setCursor(menuPanel, 8, 3 + r);
    for (let c = 0; c < 3; c++) {
      puts(menuPanel, String.fromCharCode(0x48 + r * 3 + c), 0x02);
    }
  }

  // Inject portrait 0's 9 tiles into a cloned font2 at glyphs 0x48..0x50.
  const wport1: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport1.json'), 'utf-8')),
  );
  const portrait = wport1.portraits[0]!;
  const baseFont2 = fontSet.font2!;
  const font2Glyphs = baseFont2.glyphs.map((g, i) =>
    i >= 0x48 && i <= 0x50 ? portrait.tiles[i - 0x48]! : g,
  );
  const fontSetWithPortrait: FontSet = {
    ...fontSet,
    font2: { ...baseFont2, glyphs: font2Glyphs },
  };

  return renderCreationFrame([top, bottomBar, menuPanel], fontSetWithPortrait, palette);
}

// ─── SKILL TRAIN helper (screen-13; post-portrait, WEAPONRY category) ─────────
// Engine state (save 1): NATHAN samurai post-karma/portrait; level=1, age=20;
// portrait 0 baked permanently into wfont2 glyphs 0x48..0x50 (the engine never
// restores wfont2 after the portrait picker exits, so portrait tiles render in
// top window cells (1..3, 1..3) for the rest of creation). Skill panel lives in
// a NEW temp window `skillTrain` (20×16 @ (160,32)) whose struct lives at
// DGROUP+0x7e26 (verified via byte-pattern scan).
//
// The skillTrain cells are written byte-exact — frame chrome (wfont1 tiles),
// "WEAPONRY" header with attr 0x04 brackets, 9 skill names left-aligned at
// attr 0x20, bonus values right-aligned at attr 0x10, "SKILL POINTS  5" at
// row 14. WAND&DAGGER (row 3) is the selected entry: a 'd' (0x64) at col 15
// attr 0x40 acts as the selection cursor. Rows 9 (SLING) and 11 (SHIELD)
// have a different left-vert glyph (0x0f vs 0x0d) — origin unclear, faithfully
// reproduced.

function writeRawCell(win: { cells: Uint8Array; widthCells: number }, x: number, y: number, ch: number, attr: number): void {
  const idx = (y * win.widthCells + x) * 2;
  win.cells[idx] = ch & 0xff;
  win.cells[idx + 1] = attr & 0xff;
}

function renderSkillTrain(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  const { top, bottomBar, menuPanel } = createPersistentWindows();
  const draft = {
    ...blankDraft(),
    name: 'NATHAN',
    race: 0,
    sex: 0,
    class: 11,  // Samurai
    attributes: { str: 14, int: 11, pie: 8, vit: 9, dex: 12, spd: 14, per: 8, kar: 3 },
    derived: { hpInitial: 7, stamina: 96, level: 1, xp: 0 },
    bonusPool: 0,
    portrait: 21,  // engine save 1 has *0x560c = 0x15 → portrait 21 (wport2 index 7)
  };
  // No status-row title — the engine leaves cols 21..38 of row 5 as gray spaces
  // for this screen (verified vs cells dump).
  drawCharSheet(top, draft, msgDb);

  // Overlay portrait tiles HIJ/KLM/NOP at (1..3, 1..3) attr 0x02 (wfont2).
  // drawCharSheet writes '   ' here in the empty-name path; we paint over it.
  for (let r = 0; r < 3; r++) {
    setCursor(top, 1, 1 + r);
    puts(top,
      String.fromCharCode(0x48 + r * 3) +
      String.fromCharCode(0x48 + r * 3 + 1) +
      String.fromCharCode(0x48 + r * 3 + 2),
      0x02,
    );
  }

  // Age fields (left of name column) — engine populates after skill-init:
  //   row 2 (col 5..7) = " 20" attr 0xe0
  //   row 3 (col 5..7) = "  1" attr 0xc0
  setCursor(top, 5, 2);
  puts(top, ' 20', 0xe0);
  setCursor(top, 5, 3);
  puts(top, '  1', 0xc0);

  // bottomBar — 3 prompt rows, all attr 0x03, centered with floor-padding.
  const assign = creationString(msgDb, MSG.skillAssign);
  setCursor(bottomBar, Math.floor((bottomBar.widthCells - assign.length) / 2), 1);
  puts(bottomBar, assign, 0x03);

  const adjusts = creationString(msgDb, MSG.skillAdjusts);
  const selects = creationString(msgDb, MSG.skillSelects);
  const combined = adjusts + '   ' + selects; // engine inserts 3 inter-prompt spaces
  setCursor(bottomBar, Math.floor((bottomBar.widthCells - combined.length) / 2), 2);
  puts(bottomBar, combined, 0x03);

  const nextCat = creationString(msgDb, MSG.skillNextCategory);
  setCursor(bottomBar, Math.floor((bottomBar.widthCells - nextCat.length) / 2), 3);
  puts(bottomBar, nextCat, 0x03);

  // skillTrain window — clear to gray (matches engine: 0x20, 0x03) then write
  // cells byte-exact per `/tmp/slot1-skill-cells.json`.
  const skillTrain = createSkillTrainWindow();
  clearWindow(skillTrain, 0x20, 0x03);

  // Row 0: frame top
  writeRawCell(skillTrain, 0, 0, 0x0e, 0x01);
  for (let x = 1; x < 19; x++) writeRawCell(skillTrain, x, 0, 0x0c, 0x01);
  writeRawCell(skillTrain, 19, 0, 0x0a, 0x01);

  // Row 1: WEAPONRY header with attr-0x04 brackets at cols 2 and 17.
  writeRawCell(skillTrain, 0, 1, 0x0d, 0x01);
  writeRawCell(skillTrain, 2, 1, 0x02, 0x04);
  setCursor(skillTrain, 6, 1);
  puts(skillTrain, 'WEAPONRY', 0x03);
  writeRawCell(skillTrain, 17, 1, 0x02, 0x04);
  writeRawCell(skillTrain, 19, 1, 0x05, 0x01);

  // Row 2: T-junction separator (left side = 0x21 — wfont1 glyph that
  // happens to be drawn as a left-T below the header bracket).
  writeRawCell(skillTrain, 0, 2, 0x21, 0x01);
  for (let x = 1; x < 19; x++) writeRawCell(skillTrain, x, 2, 0x0c, 0x01);
  writeRawCell(skillTrain, 19, 2, 0x0a, 0x01);

  // Rows 3-11: 9 skill entries (Samurai WEAPONRY: slots 0..8, no HANDS&FEET).
  const skills: ReadonlyArray<readonly [string, number]> = [
    ['WAND&DAGGER', 0], ['SWORD', 9], ['AXE', 0],
    ['MACE&FLAIL', 0], ['POLE&STAFF', 0], ['THROWING', 0],
    ['SLING', 0], ['BOWS', 0], ['SHIELD', 0],
  ];
  for (let i = 0; i < skills.length; i++) {
    const y = 3 + i;
    const [name, val] = skills[i]!;
    // Rows 9 (SLING) and 11 (SHIELD) carry left-vert glyph 0x0f; all others 0x0d.
    // Origin not fully RE'd — faithfully reproduced from the cell dump.
    const leftVert = (y === 9 || y === 11) ? 0x0f : 0x0d;
    writeRawCell(skillTrain, 0, y, leftVert, 0x01);
    setCursor(skillTrain, 1, y);
    puts(skillTrain, name, 0x20);
    // Pad cols name.length+1..15 with black-fill cells (ch 0x00 attr 0x01).
    for (let x = name.length + 1; x < 16; x++) {
      writeRawCell(skillTrain, x, y, 0x00, 0x01);
    }
    // Cols 16-17: spaces at attr 0x10 (right-side padding for the value).
    writeRawCell(skillTrain, 16, y, 0x20, 0x10);
    writeRawCell(skillTrain, 17, y, 0x20, 0x10);
    // Col 18: bonus value digit at attr 0x10.
    writeRawCell(skillTrain, 18, y, 0x30 + val, 0x10);
    writeRawCell(skillTrain, 19, y, 0x05, 0x01);
  }
  // Selection cursor: 'd' (0x64) at attr 0x40 on the SELECTED row's col 15.
  writeRawCell(skillTrain, 15, 3, 0x64, 0x40);

  // Row 12: empty spacer (left/right vert + black-fill interior).
  writeRawCell(skillTrain, 0, 12, 0x0d, 0x01);
  for (let x = 1; x < 19; x++) writeRawCell(skillTrain, x, 12, 0x00, 0x01);
  writeRawCell(skillTrain, 19, 12, 0x05, 0x01);

  // Row 13: T-junction separator above SKILL POINTS row.
  writeRawCell(skillTrain, 0, 13, 0x10, 0x01);
  for (let x = 1; x < 19; x++) writeRawCell(skillTrain, x, 13, 0x0c, 0x01);
  writeRawCell(skillTrain, 19, 13, 0x0a, 0x01);

  // Row 14: "SKILL POINTS  5" — label attr 0x90, value attr 0x10.
  writeRawCell(skillTrain, 0, 14, 0x0d, 0x01);
  setCursor(skillTrain, 1, 14);
  puts(skillTrain, 'SKILL POINTS', 0x90);
  for (let x = 13; x < 16; x++) writeRawCell(skillTrain, x, 14, 0x00, 0x01);
  writeRawCell(skillTrain, 16, 14, 0x20, 0x10);
  writeRawCell(skillTrain, 17, 14, 0x20, 0x10);
  writeRawCell(skillTrain, 18, 14, 0x35, 0x10); // '5'
  writeRawCell(skillTrain, 19, 14, 0x05, 0x01);

  // Row 15: frame bottom.
  writeRawCell(skillTrain, 0, 15, 0x0b, 0x01);
  for (let x = 1; x < 19; x++) writeRawCell(skillTrain, x, 15, 0x07, 0x01);
  writeRawCell(skillTrain, 19, 15, 0x08, 0x01);

  // Inject portrait 21 tiles into a cloned font2 at glyphs 0x48..0x50 (persistent
  // post-portrait-pick — engine never restores wfont2). Portrait 21 lives in
  // wport2 at internal index 7 (21 - 14 portraits/file).
  const wport2: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport2.json'), 'utf-8')),
  );
  const portrait = wport2.portraits[7]!;
  const baseFont2 = fontSet.font2!;
  const font2Glyphs = baseFont2.glyphs.map((g, i) =>
    i >= 0x48 && i <= 0x50 ? portrait.tiles[i - 0x48]! : g,
  );
  const fontSetWithPortrait: FontSet = {
    ...fontSet,
    font2: { ...baseFont2, glyphs: font2Glyphs },
  };

  return renderCreationFrame(
    [top, bottomBar, menuPanel, skillTrain],
    fontSetWithPortrait,
    palette,
  );
}

// ─── Screen table ──────────────────────────────────────────────────────────────
// `floor` = current measured match % minus a small margin. TARGET is 100.

interface ScreenCase {
  fixture: string;
  floor: number;
  render: (fontSet: FontSet, palette: Palette) => Uint8ClampedArray;
}

const SCREENS: ScreenCase[] = [
  {
    fixture: 'character-menu-empty',
    floor: 100, // pixel-exact (0 px differ) — fixture has CREATE PC highlighted
    render: (f, p) => renderCharacterMenu(f, p, ['CREATE PC', 'EXIT'], 0),
  },
  {
    fixture: 'character-menu-populated',
    floor: 100, // pixel-exact (0 px differ)
    render: (f, p) =>
      renderCharacterMenu(f, p, ['REVIEW PC', 'DELETE PC', 'RENAME PC', 'PORTRAIT', 'EXIT'], 0),
  },
  {
    fixture: 'creation-name-input',
    floor: 100, // pixel-exact (0 px differ)
    render: renderNameInput,
  },
  {
    fixture: 'creation-race-select',
    floor: 100, // pixel-exact — char-sheet + race list with HUMAN selected
    render: renderRaceSelect,
  },
  {
    fixture: 'creation-class-select',
    floor: 100, // pixel-exact — NATHAN, pool 17, 12 qualifying classes
    render: renderClassSelect,
  },
  {
    fixture: 'creation-portrait-select',
    floor: 100, // pixel-exact — NATHAN/SAMURAI char sheet + portrait 0 tile grid
    render: renderPortraitSelect,
  },
  {
    fixture: 'creation-skill-train',
    floor: 100, // pixel-exact — char sheet w/ persistent portrait 21 + skillTrain panel
    render: renderSkillTrain,
  },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('screen pixel-parity vs committed engine fixtures (target 100%)', () => {
  let fontSet: FontSet;
  beforeAll(async () => {
    fontSet = await loadCreationFontSet({ loadFont: diskLoadFont, loadFont4bpp: diskLoadFont4bpp });
    msgDb = MessageDbSchema.parse(
      JSON.parse(readFileSync(join(EXTRACTED_MESSAGES, 'msg.json'), 'utf-8')),
    );
  });

  for (const sc of SCREENS) {
    it(`${sc.fixture}: RGB match ≥ ${sc.floor}% (regression floor; target 100)`, () => {
      const ours = sc.render(fontSet, WIZ6_MAIN);
      const eng = engineRgba(sc.fixture);
      const result = compareRgba(ours, eng, { tolerance: 0 });

      // Diagnostics on a shortfall (and always, cheaply): write our render + diff.
      try {
        writeFileSync(
          join('/tmp', `parity-ours-${sc.fixture}.png`),
          encodePngRgba(320, 200, new Uint8Array(ours.buffer)),
        );
        writeDiffPng(ours, eng, join('/tmp', `parity-diff-${sc.fixture}.png`), { tolerance: 0 });
      } catch {
        /* diagnostics are non-fatal */
      }

      expect(
        result.matchPct,
        `${sc.fixture}: ${result.matchPct.toFixed(2)}% (${result.diffCount} px differ) — see /tmp/parity-diff-${sc.fixture}.png`,
      ).toBeGreaterThanOrEqual(sc.floor);
    });
  }
});
