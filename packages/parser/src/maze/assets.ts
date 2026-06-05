/**
 * assets.ts — loader for the committed maze render assets (atlas + piece descriptors).
 *
 * The assets are captured from the engine (see tools/parity/extract-maze-assets.ts)
 * and committed as a JSON fixture. This module decodes the base64 fields and
 * returns a validated MazeRenderAssets.
 *
 * Usage:
 *   import { loadMazeAssets } from '@wiz6/parser/maze/assets.js';
 *   const { atlas, pieceDescriptors } = loadMazeAssets();
 */

import { gunzipSync } from 'node:zlib';
import { MazeRenderAssetsSchema, type MazeRenderAssets } from '@wiz6/data';
import raw from './__fixtures__/maze-assets.json' with { type: 'json' };
import corridorBg from './__fixtures__/maze-corridor-background.json' with { type: 'json' };

export function loadMazeAssets(): MazeRenderAssets {
  const atlas = Uint8Array.from(Buffer.from(raw.atlasB64, 'base64'));
  const pieceDescriptors = raw.pieceDescriptors.map((d) => ({
    srcPtr: d.srcPtr,
    w: d.w,
    h: d.h,
    presenceBitmap: Uint8Array.from(Buffer.from(d.bitmapB64, 'base64')),
  }));
  return MazeRenderAssetsSchema.parse({ atlas, pieceDescriptors });
}

/**
 * Load the engine's OR-blit BACKGROUND compose page for the maze-corridor frame
 * (zone-0, facing 0). 4-plane EGA page (4 * PLANE_STRIDE = 0x8000 bytes), suitable
 * as the `page` arg of renderMazeViewport.
 *
 * This is the engine's actual composed page, read deterministically from the
 * committed serialize-state (no live capture). It reproduces the maze-corridor
 * viewport BYTE-EXACT (100%, the first full-viewport gate —
 * tests/maze/maze-corridor-viewport-parity.test.ts). The from-on-disk-asset
 * placement-list generator that would let composeBackground rebuild this page from
 * the floor/ceiling/window assets is tracked work (still blocked — see
 * docs/re/findings/maze-background-fromasset.json).
 */
export function loadMazeCorridorBackgroundPage(): Uint8Array {
  const gz = Uint8Array.from(Buffer.from(corridorBg.pageGzB64, 'base64'));
  return new Uint8Array(gunzipSync(gz));
}
