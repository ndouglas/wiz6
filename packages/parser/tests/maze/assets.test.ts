import { describe, it, expect } from 'vitest';
import { loadMazeAssets } from '../../src/maze/assets.js';
import { MazeRenderAssetsSchema } from '@wiz6/data';

describe('committed maze assets', () => {
  it('load + validate against the schema', () => {
    const a = loadMazeAssets();
    expect(() => MazeRenderAssetsSchema.parse(a)).not.toThrow();
    expect(a.atlas.length).toBeGreaterThan(0);
    expect(a.pieceDescriptors.length).toBeGreaterThan(0);
  });
  it('descriptor for piece 0xb (left wall face) has the RE-confirmed w/h', () => {
    const a = loadMazeAssets();
    // piece bytes 1-indexed; 0xb => index 10.
    // RE-confirmed in docs/re/findings/maze-stage1-compositor.json
    // (compositor-bridge-walltype-depth-to-piece-source): piece 0xb {srcPtr=0x1cd8, w=4, h=6}.
    // Cross-checked by extract-maze-assets.ts against the committed maze-corridor.state.
    const desc = a.pieceDescriptors[0xb - 1]!;
    expect(desc.w).toBe(4);
    expect(desc.h).toBe(6);
    expect(desc.srcPtr).toBe(0x1cd8);
  });
});
