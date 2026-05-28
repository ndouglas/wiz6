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
 * we're there — both character-menu screens are pixel-exact; name-input sits
 * at ~99% pending the renderer fixes tracked in TODO #021 (empty-cell black
 * fill + attr 0x10 yellow-not-white in the cursor highlight path). On a
 * shortfall, inspect the diff PNG in /tmp.
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
import { WIZ6_MAIN, FontSchema, Font4bppSchema } from '../../packages/data/src/index.js';
import type { Font, Font4bpp, Palette } from '../../packages/data/src/index.js';
import { setCursor, puts, type FontSet } from '../../packages/parser/src/index.js';
import { loadCreationFontSet } from '../../packages/viewer/src/pages/roster/creation/ega/assets.js';
import { renderCreationFrame } from '../../packages/viewer/src/pages/roster/creation/ega/render-frame.js';
import { createPersistentWindows } from '../../packages/viewer/src/pages/roster/creation/ega/windows.js';
import { highlightRange } from '../../packages/viewer/src/pages/roster/creation/ega/highlight.js';
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
  const PROMPT = 'CHARACTER NAME >';
  const NAME_MAX_LENGTH = 7;
  setCursor(bottomBar, 1, 1);
  puts(bottomBar, PROMPT, 0x03);
  setCursor(bottomBar, 1 + PROMPT.length, 1);
  puts(bottomBar, 'a', 0x10); // wfont0 0x61 = cursor block sprite
  puts(bottomBar, ' '.repeat(NAME_MAX_LENGTH), 0x00);
  return renderCreationFrame([top, bottomBar, menuPanel], fontSet, palette);
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
    floor: 99, // actual ~99.20% — see TODO #021 (empty-cell black-fill + attr 0x10 color mapping)
    render: renderNameInput,
  },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('screen pixel-parity vs committed engine fixtures (target 100%)', () => {
  let fontSet: FontSet;
  beforeAll(async () => {
    fontSet = await loadCreationFontSet({ loadFont: diskLoadFont, loadFont4bpp: diskLoadFont4bpp });
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
