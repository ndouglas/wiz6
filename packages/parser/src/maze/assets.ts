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

import { MazeRenderAssetsSchema, type MazeRenderAssets } from '@wiz6/data';
import raw from './__fixtures__/maze-assets.json' with { type: 'json' };

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
