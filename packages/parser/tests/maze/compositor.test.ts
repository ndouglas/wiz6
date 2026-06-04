import { describe, it, expect } from 'vitest';
import { renderFrameFromGeometry } from '../../src/maze/compositor.js';
import { loadMazeAssets } from '../../src/maze/assets.js';
import { decodePageIndex } from '../../src/maze/page.js';
import { PLANE_STRIDE } from '@wiz6/data';

describe('compositor', () => {
  it('renders the y3 call-list into a page whose viewport decodes non-blank', () => {
    const assets = loadMazeAssets();
    const page = new Uint8Array(4 * PLANE_STRIDE);
    const calls = [
      { piece: 0xe, x0: 144, arg10: 60, tile: 2 },
      { piece: 0xb, x0: 147, arg10: 59, tile: 2 },
    ];
    renderFrameFromGeometry(page, assets.atlas, assets.pieceDescriptors, calls);
    const idx = decodePageIndex(page, 320, 200);
    let nonZero = 0;
    for (let y = 32; y < 144; y++) for (let x = 136; x < 192; x++) if (idx[y * 320 + x]) nonZero++;
    expect(nonZero).toBeGreaterThan(100);
  });
});
