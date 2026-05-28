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
import { setCursor, puts, type FontSet } from '../../packages/parser/src/index.js';
import { loadCreationFontSet } from '../../packages/viewer/src/pages/roster/creation/ega/assets.js';
import { renderCreationFrame } from '../../packages/viewer/src/pages/roster/creation/ega/render-frame.js';
import { createPersistentWindows } from '../../packages/viewer/src/pages/roster/creation/ega/windows.js';
import { composeSkillTrainFrame, patchFontSetWithPortrait } from '../../packages/viewer/src/pages/roster/creation/ega/skill-train-frame.js';
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
// Engine state (save 1): NATHAN samurai post-karma/portrait; age=20, level=1;
// portrait 21 (wport2 index 7) permanently baked into wfont2 glyphs 0x48..0x50;
// WEAPONRY category, 9 skills 0..8 (Samurai excludes HANDS&FEET), 1 point
// already spent on SWORD (value 9), 5 remaining in the pool.
//
// This test renders through the SHARED `composeSkillTrainFrame` module that
// the live `SkillTrainScreen.tsx` also calls — pixel parity here is the
// regression guard for that viewer screen too.

function makeSkillTrainDraft(skills: number[]) {
  return {
    ...blankDraft(),
    name: 'NATHAN',
    race: 0,
    sex: 0,
    class: 11, // Samurai
    attributes: { str: 14, int: 11, pie: 8, vit: 9, dex: 12, spd: 14, per: 8, kar: 3 },
    derived: { age: 20, hpInitial: 7, stamina: 96, level: 1, xp: 0 },
    bonusPool: 0,
    portrait: 21,
    skills,
  };
}

function skillTrainFontSet(fontSet: FontSet): FontSet {
  const wport2: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport2.json'), 'utf-8')),
  );
  const empty: PortraitSet = { ...wport2, portraits: [] };
  return patchFontSetWithPortrait(fontSet, [empty, wport2, empty], 21);
}

const SAMURAI_WEAPONRY_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

function renderSkillTrain(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  // Mid-allocation state: 5 points remaining, SWORD at 9 (1 already spent).
  // Bottom prompt: "PRESS ▶ FOR NEXT CATEGORY".
  const skills = new Array<number>(30).fill(0);
  skills[1] = 9;
  const windows = composeSkillTrainFrame(
    {
      draft: makeSkillTrainDraft(skills),
      categoryIdx: 0,
      trainableInCategory: SAMURAI_WEAPONRY_SLOTS,
      cursorIdx: 0,
      skillPoints: 5,
    },
    msgDb,
  );
  return renderCreationFrame(windows, skillTrainFontSet(fontSet), palette);
}

function renderSkillTrainDone(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  // Exhausted state: 0 points remaining, all 5 budget points spent on
  // WAND&DAGGER (slot 0 = 5). Bottom prompt toggles to "PRESS ▶ TO EXIT" — the
  // engine does NOT auto-advance; Enter (▶) is the exit key.
  const skills = new Array<number>(30).fill(0);
  skills[0] = 5; // WAND&DAGGER
  skills[1] = 9; // SWORD (preserved from base)
  const windows = composeSkillTrainFrame(
    {
      draft: makeSkillTrainDraft(skills),
      categoryIdx: 0,
      trainableInCategory: SAMURAI_WEAPONRY_SLOTS,
      cursorIdx: 0,
      skillPoints: 0,
    },
    msgDb,
  );
  return renderCreationFrame(windows, skillTrainFontSet(fontSet), palette);
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
    floor: 100, // pixel-exact — mid-allocation; row 3 = "PRESS ▶ FOR NEXT CATEGORY"
    render: renderSkillTrain,
  },
  {
    fixture: 'creation-skill-train-done',
    floor: 100, // pixel-exact — budget = 0; row 3 = "PRESS ▶ TO EXIT"
    render: renderSkillTrainDone,
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
