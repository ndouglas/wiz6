/**
 * castle-parity.test.ts — full-RGB parity for the MASTER OPTIONS (main-menu)
 * screen at both parity ticks of the water animation.
 *
 * Renders our composeCastleFrame (same pure function CastleScreen drives at RAF)
 * at parity=0 and parity=1 and compares pixel-for-pixel against the committed
 * main-menu / main-menu-2 fixtures.
 *
 * Both frames are pixel-exact (0 px diff). Three engine details to nail:
 *   - opacity: titlepag-like alpha-zero pixels from renderEgaScreen get an
 *     opaque RGB copy.
 *   - status row (engine handle 0x7394) cleared with wfont3 char 0x1E (the
 *     "screen-edge" tile with a black bottom row), not 0x20.
 *   - party-panel border edges flanking the gate: wfont1 0x1C (heavy R-edge)
 *     at cell col 8 and wfont1 0x1A (light L-edge) at cell col 31 — the 1-px
 *     black columns at x=71/x=248 are these tiles' baked-in edge pixels.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PicSchema,
  EgaScreenSchema,
  FontSchema,
  Font4bppSchema,
  WIZ6_MAIN,
  type Font,
  type Font4bpp,
  type Pic,
} from '../../packages/data/src/index.js';
import {
  renderEgaScreen,
  concatenatePicSegments,
  visibleMenuOptions,
  type MainMenuContext,
  type MainMenuOption,
} from '../../packages/parser/src/index.js';
import { composeCastleFrame } from '../../packages/viewer/src/pages/game/castle-frame.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { indicesToRgba } from './decode-screen.js';
import { compareRgba, writeDiffPng } from './diff-image.js';

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
const ROOT = mainRoot();
const FIXTURES_ENGINE = join(ROOT, 'tools', 'parity', 'fixtures', 'engine');

function engineRgba(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(join(FIXTURES_ENGINE, `${name}.idx.gz`)));
  return indicesToRgba(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
}

// Engine state for the save the fixtures came from: empty party, no loaded PCs.
const CONTEXT: MainMenuContext = { partySize: 0, pcFileHasUnloadedChars: true };

interface CastleCase {
  fixture: string;
  floor: number;
  parity: 0 | 1;
}

const CASES: CastleCase[] = [
  // parity=1 (water overlays ON) matches main-menu; parity=0 matches main-menu-2.
  { fixture: 'main-menu', floor: 100, parity: 1 },
  { fixture: 'main-menu-2', floor: 100, parity: 0 },
];

describe('castle (main menu) pixel-parity vs committed fixtures', () => {
  let mon08Pic: Pic;
  let mon08Decoded: number[];
  let dragonscRgba: Uint8ClampedArray;
  let wfont3: Font4bpp;
  let wfont1: Font4bpp;
  let wfont0: Font;
  let menuOptions: readonly MainMenuOption[];

  beforeAll(() => {
    mon08Pic = PicSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'pics', 'mon08.json'), 'utf-8')),
    );
    mon08Decoded = concatenatePicSegments(mon08Pic.segments);
    const dragonsc = EgaScreenSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'screens', 'dragonsc.json'), 'utf-8')),
    );
    dragonscRgba = renderEgaScreen(dragonsc, WIZ6_MAIN).rgba;
    wfont3 = Font4bppSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'fonts', 'wfont3.json'), 'utf-8')),
    );
    wfont1 = Font4bppSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'fonts', 'wfont1.json'), 'utf-8')),
    );
    wfont0 = FontSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'fonts', 'wfont0.json'), 'utf-8')),
    );
    // Include QUIT GAME (slot 8) — the engine has all 6 options. The viewer
    // filters it out for the web port, but parity testing compares against the
    // engine's actual frame.
    menuOptions = visibleMenuOptions(CONTEXT);
  });

  for (const c of CASES) {
    it(`${c.fixture} (parity=${c.parity}): RGB match ≥ ${c.floor}% (regression floor; target 100)`, () => {
      const ours = composeCastleFrame(
        c.parity,
        dragonscRgba,
        mon08Pic,
        mon08Decoded,
        wfont3,
        wfont0,
        menuOptions,
        0, // ADD PARTY MEMBER highlighted in both fixtures
        wfont1,
      );
      const eng = engineRgba(c.fixture);
      const result = compareRgba(ours, eng, { tolerance: 0 });

      try {
        writeFileSync(
          join('/tmp', `parity-ours-${c.fixture}.png`),
          encodePngRgba(320, 200, new Uint8Array(ours.buffer)),
        );
        writeDiffPng(ours, eng, join('/tmp', `parity-diff-${c.fixture}.png`), { tolerance: 0 });
      } catch {
        /* diagnostics non-fatal */
      }

      expect(
        result.matchPct,
        `${c.fixture}: ${result.matchPct.toFixed(2)}% (${result.diffCount} px) — see /tmp/parity-diff-${c.fixture}.png`,
      ).toBeGreaterThanOrEqual(c.floor);
    });
  }
});
