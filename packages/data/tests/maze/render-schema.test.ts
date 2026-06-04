import { describe, it, expect } from 'vitest';
import {
  MazeCellWallsSchema, PartySchema, PieceDescriptorSchema, MazeRenderAssetsSchema,
  type Party,
} from '@wiz6/data';

describe('maze render schemas', () => {
  it('parses a Party with facing 0..3', () => {
    const p: Party = PartySchema.parse({ x: 7, y: 3, z: 0, facing: 0 });
    expect(p.facing).toBe(0);
    expect(() => PartySchema.parse({ x: 0, y: 0, z: 0, facing: 4 })).toThrow();
  });
  it('parses a PieceDescriptor', () => {
    const d = PieceDescriptorSchema.parse({ srcPtr: 0x2138, w: 4, h: 6, presenceBitmap: new Uint8Array(0x14) });
    expect(d.w).toBe(4);
  });
  it('parses MazeRenderAssets', () => {
    const a = MazeRenderAssetsSchema.parse({ atlas: new Uint8Array(0x4000), pieceDescriptors: [] });
    expect(a.atlas.length).toBe(0x4000);
  });
  it('parses MazeCellWalls (a local wall grid keyed by cell index)', () => {
    const w = MazeCellWallsSchema.parse({ cells: { 195: { north: 2, west: 0, pit: false } } });
    expect(w.cells[195].north).toBe(2);
  });
});
