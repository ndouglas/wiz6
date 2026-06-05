/**
 * maze-entry-narration-parity.test.ts — PIXEL-PARITY GATE (gate-tier `.test.ts`,
 * runs in default CI; tolerance 0) for the START-NEW-GAME entry narration strip.
 *
 * ── WHAT IS GATED ──
 * The 3 narration lines (msg 10010/10011/10012) the port draws into the bottom
 * black message strip, byte-exact vs the committed engine framebuffer fixture,
 * over the text band — in the PALETTE-INDEX domain (tolerance 0 = 100%).
 *
 * ── COMPARISON DOMAIN: palette INDEX ──
 * The committed fixture (maze-entry-narration.idx.gz) stores palette INDICES
 * (rgbaToIndices over the COMPOSED_PALETTE, per tools/parity/decode-screen.ts) —
 * the same domain the maze-corridor viewport gate compares in. We build OUR strip
 * with drawNarrationStrip (the SAME pure helper MazeView's drawNarration calls,
 * same wfont0, x=8, y=153/161/169, fg index 5 / bg index 0), then map our RGBA
 * back to indices via the same COMPOSED_PALETTE and compare indices. Gating on the
 * index makes the gate palette-independent (idx, not RGB).
 *
 * ── THE BAND (rect compared) ──
 * y = 153..174 inclusive (the 3 text rows + their pitch gaps), x = 0..319 (full
 * width). Confirmed from the fixture: the band contains ONLY indices {0,5} — the
 * text glyphs (idx 5) on the black strip (idx 0). RE: maze-entry-narration.json
 * modal_geometry (line1 y153-158 / line2 y161-166 / line3 y169-174, x>=8).
 *
 * ── EXCLUSIONS ──
 * NONE inside the band. The dungeon view above (y<144, partial-fidelity in our
 * port) is excluded by construction (band starts at y=153). The run-to-run mouse
 * cursor (x313-319 y184-190) is BELOW the band and never intersects it. Verified:
 * the band is fully deterministic across the two fixture captures (idx-diff 0).
 *
 * ── PALETTE RECONCILIATION (Task 5 concern) ──
 * The RE prose says "white text (palette idx 5)" but COMPOSED_PALETTE[5] is bright
 * yellow [255,255,85] (white is idx 1). The fixture INDEX is the ground truth: the
 * text-band glyphs ARE index 5 (confirmed by histogram: band = {0:..., 5:...}).
 * Both the engine's COMPOSED_PALETTE (decode-screen) and the port's MazeView
 * COMPOSED_PALETTE map idx 5 → [255,255,85], so the DISPLAYED text is yellow and
 * matches the engine .png. No palette change required; no walkable-parity risk.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  decodeNarrationLines,
  drawNarrationStrip,
} from '../../src/index.js';
import {
  FontSchema,
  MessageDbSchema,
  type Font,
  type MessageDb,
  type Palette,
} from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../..');
const FIX = resolve(ROOT, 'tools/parity/fixtures/engine');

const ENGINE_W = 320;
const ENGINE_H = 200;

/** Entry-narration message IDs (RE: maze-entry-sequence.json phase_A_narration). */
const NARRATION_MSG_IDS = [10010, 10011, 10012];

/** The text band gated (inclusive). */
const BAND_Y0 = 153;
const BAND_Y1 = 174;

/**
 * COMPOSED_PALETTE — the 16-entry composed EGA palette MazeView composes with,
 * and the same palette decode-screen.ts uses to map the fixture (idx 0 = black,
 * idx 5 = yellow [255,255,85]). Kept in lockstep with MazeView's COMPOSED_PALETTE.
 */
const COMPOSED_PALETTE: readonly [number, number, number][] = [
  [0, 0, 0], [255, 255, 255], [85, 85, 255], [255, 85, 255],
  [255, 85, 85], [255, 255, 85], [85, 255, 85], [85, 255, 255],
  [85, 85, 85], [170, 170, 170], [0, 0, 170], [170, 0, 170],
  [170, 0, 0], [170, 85, 0], [0, 170, 0], [0, 170, 170],
];

const NARRATION_PALETTE: Palette = {
  name: 'composed-ega',
  provenance: 'MazeView COMPOSED_PALETTE',
  colors: COMPOSED_PALETTE.map((c) => [...c]) as Palette['colors'],
};

/** Map an RGB triple to its COMPOSED_PALETTE index (exact match). */
function rgbToIndex(r: number, g: number, b: number): number {
  for (let i = 0; i < COMPOSED_PALETTE.length; i++) {
    const c = COMPOSED_PALETTE[i]!;
    if (c[0] === r && c[1] === g && c[2] === b) return i;
  }
  // Any non-palette colour would fail the gate loudly; -1 surfaces it.
  return -1;
}

function loadFont(): Font {
  return FontSchema.parse(
    JSON.parse(readFileSync(resolve(ROOT, 'extracted/fonts/wfont0.json'), 'utf8')),
  );
}

function loadMessageDb(): MessageDb {
  return MessageDbSchema.parse(
    JSON.parse(readFileSync(resolve(ROOT, 'extracted/messages/msg.json'), 'utf8')),
  );
}

/** The committed engine fixture as a 320×200 palette-index buffer. */
function engineIndices(): Uint8Array {
  const raw = gunzipSync(readFileSync(resolve(FIX, 'maze-entry-narration.idx.gz')));
  return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
}

/**
 * Build OUR narration strip on a black (idx 0) background exactly as MazeView's
 * drawNarration does, then convert to a 320×200 palette-index buffer.
 */
function ourIndices(lines: string[], font: Font): Uint8Array {
  // Black RGBA canvas (idx 0 = [0,0,0]). drawNarrationStrip fills glyph + bg
  // pixels in the band; the rest stays black (idx 0) — same as the engine strip.
  const rgba = new Uint8ClampedArray(ENGINE_W * ENGINE_H * 4);
  for (let p = 3; p < rgba.length; p += 4) rgba[p] = 0xff; // opaque
  drawNarrationStrip(rgba, ENGINE_W, ENGINE_H, lines, font, NARRATION_PALETTE);
  const out = new Uint8Array(ENGINE_W * ENGINE_H);
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    out[i] = rgbToIndex(rgba[o]!, rgba[o + 1]!, rgba[o + 2]!);
  }
  return out;
}

describe('maze entry narration strip parity (GATE — text band, tolerance 0)', () => {
  const font = loadFont();
  const msgDb = loadMessageDb();
  const lines = decodeNarrationLines(msgDb, NARRATION_MSG_IDS);
  const eng = engineIndices();
  const ours = ourIndices(lines, font);

  it('decodes the 3 expected narration lines', () => {
    expect(lines).toEqual([
      'APPROACHING THE GATE WITH CONFIDENCE,',
      'YOU KNOW IF THINGS GET TOO HAIRY YOU ',
      'CAN ALWAYS TURN AND RUN BACK OUT...',
    ]);
  });

  it('fixtures have the expected shape and the band uses only indices {0,5}', () => {
    expect(eng.length).toBe(ENGINE_W * ENGINE_H);
    const seen = new Set<number>();
    for (let y = BAND_Y0; y <= BAND_Y1; y++)
      for (let x = 0; x < ENGINE_W; x++) seen.add(eng[y * ENGINE_W + x]!);
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 5]);
    // our render must also only emit known palette indices in the band
    expect(ours.includes(-1 as unknown as number)).toBe(false);
  });

  it('our narration strip is INDEX-EXACT vs the engine over y=153..174 (tolerance 0 = 100%)', () => {
    let total = 0;
    let match = 0;
    const diffs: string[] = [];
    for (let y = BAND_Y0; y <= BAND_Y1; y++) {
      for (let x = 0; x < ENGINE_W; x++) {
        const i = y * ENGINE_W + x;
        total++;
        if (ours[i] === eng[i]) match++;
        else if (diffs.length < 20)
          diffs.push(`(${x},${y}) got=${ours[i]} want=${eng[i]}`);
      }
    }
    const pct = (100 * match) / total;
    if (pct < 100)
      console.error(
        `narration band ${match}/${total} = ${pct.toFixed(4)}%  diffs: ${diffs.join('  ')}`,
      );
    expect(match).toBe(total);
  });
});
