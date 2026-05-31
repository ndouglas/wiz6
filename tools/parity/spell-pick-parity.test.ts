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
import { composeSpellPanel } from '../../packages/viewer/src/pages/roster/creation/ega/compose-spell-panel.js';
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

describe('creation spell-pick panel pixel-parity', () => {
  let fontSet: FontSet;
  beforeAll(async () => {
    fontSet = await loadCreationFontSet({ loadFont: diskLoadFont, loadFont4bpp: diskLoadFont4bpp });
  });

  it('spell panel region matches the engine fixture (ENERGY BLAST / FIRE)', () => {
    const { outer, inner } = createSpellPickWindows();
    composeSpellPanel(outer, inner, { realm: 'FIRE', spellNames: ['ENERGY BLAST'], selectedIdx: null });
    const ours = renderCreationFrame([outer, inner], fontSet, WIZ6_MAIN);
    const eng = engineRgba('creation-spell-pick');
    // Panel rect: spellOuter @ (160,32), 160×128 px.
    const r = rectDiff(ours, eng, 160, 320, 32, 160);
    expect(r.pct, `spell panel: ${r.pct.toFixed(2)}% (${r.diff}/${r.total} px differ)`).toBe(100);
  });
});
