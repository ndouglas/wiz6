/**
 * spell-pick-parity.test.ts — pixel-parity for the character-creation SPELL
 * PICKER panel (the gate that #060 never had).
 *
 * The spell panel (spellOuter 20×16 @160,32 + spellInner 19×8 @168,56) fully
 * paints the screen region x∈[160,320), y∈[32,160). We render ONLY those two
 * windows (via composeSpellPanel for the captured fixture state — Mage "ENERGY
 * BLAST"/FIRE) and compare that region to the committed engine fixture
 * `creation-spell-pick`. The surrounding char-sheet/bottom-bar are rendered by
 * already-pixel-tested composers; this test isolates the panel we re-implemented.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIZ6_MAIN, type Font, type Font4bpp } from '../../packages/data/src/index.js';
import type { FontSet } from '../../packages/parser/src/index.js';
import { FontSchema, Font4bppSchema } from '../../packages/data/src/index.js';
import { loadCreationFontSet } from '../../packages/viewer/src/pages/roster/creation/ega/assets.js';
import { createSpellPickWindows } from '../../packages/viewer/src/pages/roster/creation/ega/windows.js';
import { composeSpellPanel, type SpellPanelView } from '../../packages/viewer/src/pages/roster/creation/ega/compose-spell-panel.js';
import { renderCreationFrame } from '../../packages/viewer/src/pages/roster/creation/ega/render-frame.js';
import { indicesToRgba } from './decode-screen.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const FIXTURES = join(ROOT, 'tools', 'parity', 'fixtures', 'engine');
const EXTRACTED_FONTS = join(ROOT, 'extracted', 'fonts');

async function diskLoadFont(url: string): Promise<Font> {
  const name = url.split('/').pop()!;
  return FontSchema.parse(JSON.parse(readFileSync(join(EXTRACTED_FONTS, name), 'utf-8')));
}
async function diskLoadFont4bpp(url: string): Promise<Font4bpp> {
  const name = url.split('/').pop()!;
  return Font4bppSchema.parse(JSON.parse(readFileSync(join(EXTRACTED_FONTS, name), 'utf-8')));
}

function engineRgba(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(join(FIXTURES, `${name}.idx.gz`)));
  return indicesToRgba(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
}

/** Count mismatching pixels within a rect [x0,x1) × [y0,y1). */
function rectDiff(a: ArrayLike<number>, b: ArrayLike<number>, x0: number, x1: number, y0: number, y1: number) {
  let diff = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * 320 + x) * 4;
      total++;
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) diff++;
    }
  }
  return { diff, total, pct: ((total - diff) / total) * 100 };
}

// Each case = a captured engine fixture + the SpellPanelView that should
// reproduce its panel region. Provenance: a level-1 M-Elf Mage at the creation
// spell picker (game_state 0x10); see the fixture-capture commit + the
// docs/re/findings/spell-picker-eligibility.json grid model.
const CASES: Array<{ fixture: string; view: SpellPanelView; label: string }> = [
  { fixture: 'creation-spell-pick',          label: 'FIRE grid (ENERGY BLAST)',     view: { realm: 'FIRE',  spellNames: ['ENERGY BLAST'], selectedIdx: null } },
  { fixture: 'creation-spell-grid-water',    label: 'WATER grid (2 spells)',        view: { realm: 'WATER', spellNames: ['CHILLING TOUCH', 'TERROR'], selectedIdx: null } },
  { fixture: 'creation-spell-grid-air',      label: 'AIR grid (blank school)',      view: { realm: 'AIR',   spellNames: [], selectedIdx: null } },
  { fixture: 'creation-spell-grid-earth',    label: 'EARTH grid (2 spells)',        view: { realm: 'EARTH', spellNames: ['ARMOR SHIELD', 'DIRECTION'], selectedIdx: null } },
  { fixture: 'creation-spell-sublist-chill', label: 'sub-list CHILLING TOUCH cost2', view: { realm: 'WATER', spellNames: ['CHILLING TOUCH', 'TERROR'], selectedIdx: 0, cost: '2' } },
  { fixture: 'creation-spell-sublist-terror', label: 'sub-list TERROR cost3',        view: { realm: 'WATER', spellNames: ['CHILLING TOUCH', 'TERROR'], selectedIdx: 1, cost: '3' } },
];

describe('creation spell-pick panel pixel-parity', () => {
  let fontSet: FontSet;
  beforeAll(async () => {
    fontSet = await loadCreationFontSet({ loadFont: diskLoadFont, loadFont4bpp: diskLoadFont4bpp });
  });

  // The spell panel (spellOuter @160,32 + spellInner @168,56) fully paints the
  // region x∈[160,320), y∈[32,160). We render ONLY those two windows and compare
  // that rect; the surrounding char-sheet/bottom-bar are other composers.
  for (const { fixture, view, label } of CASES) {
    it(`spell panel region matches the engine fixture — ${label}`, () => {
      const { outer, inner } = createSpellPickWindows();
      composeSpellPanel(outer, inner, view);
      const ours = renderCreationFrame([outer, inner], fontSet, WIZ6_MAIN);
      const eng = engineRgba(fixture);
      const r = rectDiff(ours, eng, 160, 320, 32, 160);
      expect(r.pct, `${label}: ${r.pct.toFixed(2)}% (${r.diff}/${r.total} px differ)`).toBe(100);
    });
  }
});
