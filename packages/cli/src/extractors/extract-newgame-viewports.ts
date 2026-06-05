/**
 * extract-newgame-viewports.ts — extracts the MAZE_VIEWPORT rect from each of
 * the 5 scripted entry engine fixtures (newgame-seq-02..06.idx.gz) and writes
 * extracted/maze/newgame-viewports.json, a browser-ready committed asset.
 *
 * The oracle viewports are keyed by the party's gy at each scripted frame:
 *   gy=117 → frame 02 (title:      ENTERING / BANE OF THE COSMIC FORGE)
 *   gy=118 → frame 03 (narration:  APPROACHING THE GATE text)
 *   gy=119 → frame 04 (gate-walk:  one step forward)
 *   gy=120 → frame 05 (gate-walk:  two steps forward)
 *   gy=121 → frame 06 (bump:       HMMMM front-wall view)
 *
 * Output format: { "117": "<base64 19712 bytes>", ..., "121": "..." }
 * Each value is the raw 176×112 palette-index buffer (MAZE_VIEWPORT rect),
 * one byte per pixel, base64-encoded.
 *
 * This is committed ground-truth (copied from fixtures/, not regenerated from
 * original/), so it is a `copyFileSync`-style operation: the source is the
 * committed engine fixture, and the output is the browser-served asset.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname } from 'node:path';

/** The five scripted-entry frames: gy → fixture filename. */
const NEWGAME_FRAMES: { gy: number; file: string }[] = [
  { gy: 117, file: 'newgame-seq-02-entering-title.idx.gz' },
  { gy: 118, file: 'newgame-seq-03-narration.idx.gz' },
  { gy: 119, file: 'newgame-seq-04-walk-gy119.idx.gz' },
  { gy: 120, file: 'newgame-seq-05-walk-gy120.idx.gz' },
  { gy: 121, file: 'newgame-seq-06-walk-gy121-hmmm.idx.gz' },
];

const SCREEN_W = 320;
const VX = 72, VY = 32, VW = 176, VH = 112;

export interface ExtractNewgameViewportsOpts {
  /** Path to tools/parity/fixtures/engine/ */
  fixturesDir: string;
  /** Path to write extracted/maze/newgame-viewports.json */
  outputPath: string;
}

export interface NewgameViewportsResult {
  frameCount: number;
}

/**
 * Extract MAZE_VIEWPORT from each scripted-entry engine fixture and write the
 * browser-ready newgame-viewports.json.
 */
export function extractNewgameViewports(opts: ExtractNewgameViewportsOpts): NewgameViewportsResult {
  const result: Record<string, string> = {};

  for (const { gy, file } of NEWGAME_FRAMES) {
    const raw = gunzipSync(readFileSync(`${opts.fixturesDir}/${file}`));
    const full = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    if (full.length !== SCREEN_W * 200) {
      throw new Error(
        `extractNewgameViewports: fixture ${file} has unexpected size ${full.length} (expected ${SCREEN_W * 200})`,
      );
    }
    // Slice MAZE_VIEWPORT rect
    const vp = new Uint8Array(VW * VH);
    for (let row = 0; row < VH; row++) {
      for (let col = 0; col < VW; col++) {
        vp[row * VW + col] = full[(VY + row) * SCREEN_W + (VX + col)]!;
      }
    }
    result[String(gy)] = Buffer.from(vp).toString('base64');
  }

  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(result, null, 2));
  return { frameCount: NEWGAME_FRAMES.length };
}
