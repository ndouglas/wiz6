/**
 * spell-screen-parity.test.ts — FULL-SCREEN (320×200) pixel-parity gate for the
 * character-creation SPELL PICKER (#060).
 *
 * The narrow `spell-pick-parity.test.ts` only renders the panel region
 * (x∈[160,320), y∈[32,160)) — it never drew the char-sheet half of the screen,
 * so a bug (missing char sheet) slipped through. This test mirrors the FULL
 * render block of `SpellPickScreen.tsx` (char sheet + school-mana icons + school
 * cursor + spell panel + bottom prompt) and compares all 320×200 pixels to each
 * committed engine fixture at 100% (tolerance 0).
 *
 * Fixture character (M-Elf Mage, save 1):
 *   name MAGE, race 1 (Elf), sex 0 (Male), class 1 (Mage),
 *   attrs str7 int18 pie11 vit7 dex9 spd9 per8 kar5, bonusPool 0,
 *   derived { hpInitial 2, stamina 63, level 1, age 20yr }, portrait 0 (brute-forced).
 *
 * The 6 cases are the SAME Mage draft with the cursor in different positions:
 *   creation-spell-pick            → school 0 FIRE,  grid mode, no selection
 *   creation-spell-grid-water      → school 1 WATER, grid mode, no selection
 *   creation-spell-grid-air        → school 2 AIR,   grid mode, no selection
 *   creation-spell-grid-earth      → school 3 EARTH, grid mode, no selection
 *   creation-spell-sublist-chill   → school 1 WATER, sub-list, selectedIdx 0 cost 2
 *   creation-spell-sublist-terror  → school 1 WATER, sub-list, selectedIdx 1 cost 3
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WIZ6_MAIN,
  FontSchema,
  Font4bppSchema,
  MessageDbSchema,
  PortraitSetSchema,
  creationSpellGrid,
  spellCost,
} from '../../packages/data/src/index.js';
import type { Font, Font4bpp, Palette, MessageDb, PortraitSet } from '../../packages/data/src/index.js';
import { setCursor, puts, type FontSet } from '../../packages/parser/src/index.js';
import type { DraftState } from '../../packages/viewer/src/pages/roster/creation/state.js';
import { blankDraft } from '../../packages/viewer/src/pages/roster/creation/state.js';
import { loadCreationFontSet } from '../../packages/viewer/src/pages/roster/creation/ega/assets.js';
import { renderCreationFrame } from '../../packages/viewer/src/pages/roster/creation/ega/render-frame.js';
import { createPersistentWindows, createSpellPickWindows } from '../../packages/viewer/src/pages/roster/creation/ega/windows.js';
import { composeSpellPanel, REALM_NAMES } from '../../packages/viewer/src/pages/roster/creation/ega/compose-spell-panel.js';
import { drawCharSheet } from '../../packages/viewer/src/pages/roster/creation/ega/char-sheet.js';
import { drawSchoolCursor } from '../../packages/viewer/src/pages/roster/creation/ega/compose-school-cursor.js';
import { patchFontSetWithPortrait } from '../../packages/viewer/src/pages/roster/creation/ega/skill-train-frame.js';
import { MSG, creationString, spellName } from '../../packages/viewer/src/pages/roster/creation/messages.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { compareRgba, writeDiffPng } from './diff-image.js';
import { indicesToRgba } from './decode-screen.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const FIXTURES = join(ROOT, 'tools', 'parity', 'fixtures', 'engine');
const EXTRACTED_FONTS = join(ROOT, 'extracted', 'fonts');
const EXTRACTED_MESSAGES = join(ROOT, 'extracted', 'messages');
const EXTRACTED_PORTRAITS = join(ROOT, 'extracted', 'portraits');

async function diskLoadFont(url: string): Promise<Font> {
  const name = url.split('/').pop()!;
  return FontSchema.parse(JSON.parse(readFileSync(join(EXTRACTED_FONTS, name), 'utf-8')));
}
async function diskLoadFont4bpp(url: string): Promise<Font4bpp> {
  const name = url.split('/').pop()!;
  return Font4bppSchema.parse(JSON.parse(readFileSync(join(EXTRACTED_FONTS, name), 'utf-8')));
}

/** Load a committed engine fixture as a 320×200 RGBA buffer (no .sav read). */
function engineRgba(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(join(FIXTURES, `${name}.idx.gz`)));
  if (raw.length !== 64000) {
    throw new Error(`fixture "${name}": expected 64000 index bytes, got ${raw.length}`);
  }
  return indicesToRgba(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
}

function loadPortrait(file: string): PortraitSet {
  return PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, file), 'utf-8')),
  );
}

// ─── The fixture Mage draft ───────────────────────────────────────────────────
// Portrait index 0 was brute-forced: at portrait 0 the full 320×200 frame is a
// 0-pixel exact match against creation-spell-pick (next-best index is 330 px
// off). The char sheet shows AGE = 20 years, so derived.age must be ≥20yr in
// DAYS (drawCharSheet divides by 365 at display time) — 20*365 lands AGE on the
// fixture's yellow "20".
const MAGE_PORTRAIT = 0;

function mageDraft(): DraftState {
  return {
    ...blankDraft(),
    name: 'MAGE',
    race: 1, // Elf
    sex: 0, // Male
    class: 1, // Mage
    attributes: { str: 7, int: 18, pie: 11, vit: 7, dex: 9, spd: 9, per: 8, kar: 5 },
    bonusPool: 0,
    derived: { hpInitial: 2, stamina: 63, level: 1, secondAge: 1, age: 20 * 365 },
    portrait: MAGE_PORTRAIT,
    spellPicks: [],
  };
}

/** wport1/2/3 cover portrait indices 0-13 / 14-27 / 28-41. */
function mageFontSet(fontSet: FontSet, portraitIdx: number): FontSet {
  return patchFontSetWithPortrait(
    fontSet,
    [loadPortrait('wport1.json'), loadPortrait('wport2.json'), loadPortrait('wport3.json')],
    portraitIdx,
  );
}

interface SpellCase {
  fixture: string;
  school: number;
  mode: 'grid' | 'sublist';
  selectedIdx: number | null;
}

// Mirrors SpellPickScreen.tsx render block exactly.
function renderSpellScreen(
  fontSet: FontSet,
  palette: Palette,
  db: MessageDb,
  draft: DraftState,
  sc: SpellCase,
): Uint8ClampedArray {
  const fontSetWithPortrait = mageFontSet(fontSet, draft.portrait);
  const { top, bottomBar } = createPersistentWindows();
  const { outer, inner } = createSpellPickWindows();

  drawCharSheet(top, draft, db);

  // Portrait: 3×3 tile glyphs (0x48..0x50, attr 0x02 = wfont2) at top cells
  // (1,1)..(3,3). The patched wfont2 carries the portrait's 9 tiles at those
  // glyph slots — same mechanism as the other char-sheet creation screens.
  for (let r = 0; r < 3; r++) {
    setCursor(top, 1, 1 + r);
    puts(
      top,
      String.fromCharCode(0x48 + r * 3) +
        String.fromCharCode(0x48 + r * 3 + 1) +
        String.fromCharCode(0x48 + r * 3 + 2),
      0x02,
    );
  }

  const grid = creationSpellGrid(draft.class ?? 0);
  const list = grid[sc.school] ?? [];
  const sel = sc.mode === 'sublist' ? sc.selectedIdx : null;

  composeSpellPanel(outer, inner, {
    realm: REALM_NAMES[sc.school] ?? '',
    spellNames: list.map((s) => spellName(db, s.entryIdx) || `SPELL ${s.entryIdx}`),
    selectedIdx: sel,
    cost:
      sel !== null && list[sel] != null ? String(spellCost(list[sel]!.entry)) : null,
  });

  // The grid cursor (solid highlight block over the school's mana icon) is only
  // drawn in GRID mode. In SUB-LIST mode the player has drilled into a school,
  // so the engine leaves that school's icon in its normal multi-colour glyph
  // (verified: grid-water cell(1,16) = solid 0x05 block; sublist-chill same cell
  // = the checkered FIRE/WATER icon glyph).
  if (sc.mode === 'grid') {
    drawSchoolCursor(top, sc.school);
  }

  const prompt =
    creationString(db, MSG.selectNewSpell) || 'SELECT A NEW SPELL FOR YOUR SPELLBOOK';
  setCursor(bottomBar, Math.floor((bottomBar.widthCells - prompt.length) / 2), 1);
  puts(bottomBar, prompt, 0x03);

  return renderCreationFrame([top, bottomBar, outer, inner], fontSetWithPortrait, palette);
}

const CASES: SpellCase[] = [
  { fixture: 'creation-spell-pick', school: 0, mode: 'grid', selectedIdx: null },
  { fixture: 'creation-spell-grid-water', school: 1, mode: 'grid', selectedIdx: null },
  { fixture: 'creation-spell-grid-air', school: 2, mode: 'grid', selectedIdx: null },
  { fixture: 'creation-spell-grid-earth', school: 3, mode: 'grid', selectedIdx: null },
  { fixture: 'creation-spell-sublist-chill', school: 1, mode: 'sublist', selectedIdx: 0 },
  { fixture: 'creation-spell-sublist-terror', school: 1, mode: 'sublist', selectedIdx: 1 },
];

describe('creation spell-picker FULL-SCREEN pixel-parity (target 100%)', () => {
  let fontSet: FontSet;
  let msgDb: MessageDb;
  beforeAll(async () => {
    fontSet = await loadCreationFontSet({ loadFont: diskLoadFont, loadFont4bpp: diskLoadFont4bpp });
    msgDb = MessageDbSchema.parse(
      JSON.parse(readFileSync(join(EXTRACTED_MESSAGES, 'msg.json'), 'utf-8')),
    );
  });

  for (const sc of CASES) {
    it(`${sc.fixture}: full 320×200 RGB match = 100%`, () => {
      const ours = renderSpellScreen(fontSet, WIZ6_MAIN, msgDb, mageDraft(), sc);
      const eng = engineRgba(sc.fixture);
      const result = compareRgba(ours, eng, { tolerance: 0 });

      try {
        writeFileSync(
          join('/tmp', `spell-ours-${sc.fixture}.png`),
          encodePngRgba(320, 200, new Uint8Array(ours.buffer)),
        );
        writeDiffPng(ours, eng, join('/tmp', `spell-diff-${sc.fixture}.png`), { tolerance: 0 });
      } catch {
        /* diagnostics are non-fatal */
      }

      expect(
        result.matchPct,
        `${sc.fixture}: ${result.matchPct.toFixed(2)}% (${result.diffCount} px differ) — see /tmp/spell-diff-${sc.fixture}.png`,
      ).toBe(100);
    });
  }
});
