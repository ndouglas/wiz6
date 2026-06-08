/**
 * assets.ts — node-side loader for the committed maze render assets (atlas +
 * piece descriptors).
 *
 * The assets are captured from the engine (see tools/parity/extract-maze-assets.ts)
 * and committed as a JSON fixture. This module imports that fixture and decodes it
 * via the ISOMORPHIC decoder (assets-decode.ts) — so it has NO `node:*` imports
 * and is safe to pull through the @wiz6/parser barrel from the browser. The
 * heavier node-only background-page loader (which needs `node:zlib`) lives in
 * assets-node.ts and is NOT re-exported from the barrel.
 *
 * Usage:
 *   import { loadMazeAssets } from '@wiz6/parser/maze/assets.js';
 *   const { atlas, pieceDescriptors } = loadMazeAssets();
 *
 * Browser path: the viewer fetches extracted/maze/assets.json (same shape) and
 * calls decodeMazeAssets() directly — see packages/viewer/src/data-loader.ts.
 */

import { type MazeRenderAssets } from '@wiz6/data';
import { decodeMazeAssets, type MazeAssetsRaw } from './assets-decode.js';
import raw from './__fixtures__/maze-assets.json' with { type: 'json' };

export function loadMazeAssets(): MazeRenderAssets {
  return decodeMazeAssets(raw as unknown as MazeAssetsRaw);
}

/**
 * Return the RAW committed maze-assets JSON (atlasB64 + pieceDescriptors). Used by
 * the CLI extractor to emit the browser-ready asset (extracted/maze/assets.json),
 * which the viewer fetches + decodes via the same decodeMazeAssets() — so the
 * browser and node MazeRenderAssets bytes are guaranteed identical.
 */
export function loadMazeAssetsRaw(): MazeAssetsRaw {
  const r = raw as unknown as {
    atlasB64: string;
    mazedataB64: string;
    pieceDescriptors: MazeAssetsRaw['pieceDescriptors'];
  };
  return { atlasB64: r.atlasB64, mazedataB64: r.mazedataB64, pieceDescriptors: r.pieceDescriptors };
}
