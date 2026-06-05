/**
 * render.test.ts — gate for renderMazeViewport: the full pipeline from
 * (mazeBlock, party, assets) -> 176×112 palette-index buffer.
 *
 * Drives the committed LOOKBACK frame (the head-on-door recess that emits 4 wt=2
 * side walls) from the real per-zone maze block to exercise the full
 * classify->build->flush->compositor->decode->crop pipeline end to end.
 * Validation at this level: correct output shape + non-zero pixels (stone wall
 * indices present). Pixel-parity against the engine framebuffer is the separate
 * gate (Task T11).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderMazeViewport } from '../../src/maze/render.js';
import { loadMazeAssets } from '../../src/maze/assets.js';
import { MazeBlockSchema, type MazeBlock, type MazeParty } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const framesPath = resolve(here, '../../../../tools/parity/fixtures/engine/maze-frames.json');
const FRAMES = JSON.parse(readFileSync(framesPath, 'utf8'));
const BLOCK: MazeBlock = MazeBlockSchema.parse(FRAMES.mazeBlock);
const LOOKBACK: MazeParty = FRAMES.classifyFrames.frames.find(
  (f: { name: string }) => f.name === 'maze-corridor-lookback',
).party;

describe('renderMazeViewport', () => {
  it('returns 176×112 indices with stone walls present (lookback recess)', () => {
    const assets = loadMazeAssets();
    const idx = renderMazeViewport(BLOCK, LOOKBACK, assets);
    expect(idx.length).toBe(176 * 112);
    expect(idx.some((v) => v !== 0)).toBe(true);
  });
});
