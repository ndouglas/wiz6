/**
 * intro-parity.test.ts — full-RGB parity for the title/boot sequence frames.
 *
 * Renders our intro compositor (composeIntroFrame, the same pure function
 * GameTitle drives) at four stable phase boundaries and compares pixel-for-pixel
 * (tolerance 0) against committed engine framebuffer fixtures. No `.sav` read.
 *
 * Current state (floors are regression guards; TARGET 100%, diff PNGs in /tmp):
 *   sirtech-logo          100%  — pixel-exact
 *   author-credit         100%  — pixel-exact
 *   title-art             ~98%  — residual is the bottom ~7 rows (185-191)
 *   title-art-copyright   ~98%  — same bottom-rows residual
 *
 * composeIntroFrame emits an opaque frame (the engine framebuffer is opaque);
 * an earlier version inherited renderEgaScreen's transparent-black alpha on the
 * titlepag background, which compareRgba (alpha-aware) scored as ~37% extra diff
 * — that masked the true ~93/98% and is why the title floors are now this high.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PicSchema, EgaScreenSchema, WIZ6_MAIN } from '../../packages/data/src/index.js';
import {
  renderPicDescriptor,
  concatenatePicSegments,
  renderEgaScreen,
  composeIntroFrame,
  SCROLL_TERMINAL_POS,
  type IntroState,
  type IntroPhase,
  type RenderedSprite,
} from '../../packages/parser/src/index.js';
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

/** Minimal IntroState — composeIntroFrame only reads phase + scrollPos. */
function introState(phase: IntroPhase, scrollPos = 0): IntroState {
  return { phase, frame: 0, scrollPos, holdFramesRemaining: 0, skipLatch: false };
}

interface IntroCase {
  fixture: string;
  floor: number;
  state: IntroState;
  withTitlepag: boolean;
}

const CASES: IntroCase[] = [
  { fixture: 'sirtech-logo', floor: 100, state: introState('sirtech-splash'), withTitlepag: false },
  { fixture: 'author-credit', floor: 100, state: introState('bradley-splash'), withTitlepag: false },
  { fixture: 'title-art', floor: 98, state: introState('wizardry-hang'), withTitlepag: true },
  // Mid-scroll credits frames (the scroll runs scrollPos 0..SCROLL_TERMINAL_POS over
  // the titlepag background). scrollPos found by sweeping composeIntroFrame against the
  // committed engine frames; floors are the measured match minus a small margin
  // (same composer residual as the other scroll frames).
  { fixture: 'title-page', floor: 97, state: introState('scroll', 172), withTitlepag: true },
  { fixture: 'title-page-2', floor: 98, state: introState('scroll', 218), withTitlepag: true },
  {
    fixture: 'title-art-copyright',
    floor: 98,
    state: introState('post-scroll', SCROLL_TERMINAL_POS + 1),
    withTitlepag: true,
  },
];

describe('intro pixel-parity vs committed engine fixtures (target 100%)', () => {
  let sprites: RenderedSprite[];
  let titlepag: Uint8ClampedArray;

  beforeAll(() => {
    const pic = PicSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'pics', 'credits.json'), 'utf-8')),
    );
    const decoded = concatenatePicSegments(pic.segments);
    sprites = pic.descriptors.map((d) => renderPicDescriptor(d, decoded, WIZ6_MAIN));
    const screen = EgaScreenSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'screens', 'titlepag.json'), 'utf-8')),
    );
    titlepag = renderEgaScreen(screen, WIZ6_MAIN).rgba;
  });

  for (const c of CASES) {
    it(`${c.fixture}: RGB match ≥ ${c.floor}% (regression floor; target 100)`, () => {
      const ours = composeIntroFrame(c.state, sprites, c.withTitlepag ? titlepag : null);
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
