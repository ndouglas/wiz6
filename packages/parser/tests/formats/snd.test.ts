import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodeSnd, SND_SAMPLE_RATE_HZ } from '../../src/formats/snd.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
// Vendored pristine game files — decoupled from the DOSBox-mutable original/.
const ORIGINAL = join(REPO_ROOT, 'test-fixtures', 'original');

function loadSnd(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(ORIGINAL, name)));
}

describe('decodeSnd', () => {
  describe('header parsing', () => {
    it('parses tree_size==0 as raw mode', () => {
      const bytes = new Uint8Array([0, 0, 128, 129, 130]);
      const snd = decodeSnd(bytes, { id: 't', sourceFile: 't.snd' });
      expect(snd.compression).toBe('raw');
      expect(snd.samples).toEqual([128, 129, 130]);
    });

    it('throws on a file shorter than the 2-byte header', () => {
      expect(() => decodeSnd(new Uint8Array([0]), { id: 't', sourceFile: 't.snd' })).toThrow(
        /too short/,
      );
    });
  });

  describe('huffman mode', () => {
    it('decodes a minimal 1-node tree (leaf-only, both branches same)', () => {
      // tree_size=4, one node: left=0x0080 leaf=128, right=0x0080 leaf=128
      // decoded_length=8 → expect 8 samples of 128 regardless of bitstream content
      const bytes = new Uint8Array([
        0x04, 0x00,  // tree_size = 4
        0x80, 0x00,  // node 0 left  = leaf 128
        0x80, 0x00,  // node 0 right = leaf 128
        0x08, 0x00,  // decoded_length = 8
        0xff,        // bitstream: any bits → leaves
      ]);
      const snd = decodeSnd(bytes, { id: 't', sourceFile: 't.snd' });
      expect(snd.compression).toBe('huffman');
      expect(snd.samples).toEqual([128, 128, 128, 128, 128, 128, 128, 128]);
    });

    it('follows an internal link to a deeper leaf', () => {
      // node 0: left=leaf(0x10), right=link to node 1 (-1 = 0xFFFF)
      // node 1: left=leaf(0x20), right=leaf(0x30)
      // bitstream 0b10000000 = 0x80: (link→1)(leaf 0x20)(leaf 0x10)*6
      // decoded_length=7 → stop after 7 samples
      const bytes = new Uint8Array([
        0x08, 0x00,  // tree_size = 8 (2 nodes)
        0x10, 0x00,  // node 0 left  = leaf 0x10
        0xff, 0xff,  // node 0 right = link, next_node = 0x10000 - 0xFFFF = 1
        0x20, 0x00,  // node 1 left  = leaf 0x20
        0x30, 0x00,  // node 1 right = leaf 0x30
        0x07, 0x00,  // decoded_length = 7
        0x80,        // bitstream: 1,0,0,0,0,0,0,0
      ]);
      const snd = decodeSnd(bytes, { id: 't', sourceFile: 't.snd' });
      expect(snd.samples).toEqual([0x20, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10]);
    });

    it('respects the decoded_length cap even if more bits remain', () => {
      // Same minimal tree, but decoded_length=2 with plenty of bitstream
      const bytes = new Uint8Array([
        0x04, 0x00,
        0x80, 0x00, 0x80, 0x00,
        0x02, 0x00,  // decoded_length = 2
        0xff, 0xff, 0xff,
      ]);
      const snd = decodeSnd(bytes, { id: 't', sourceFile: 't.snd' });
      expect(snd.samples).toEqual([128, 128]);
    });
  });

  describe('against real game files', () => {
    it('decodes sound00.snd (title clang) to its declared length', () => {
      const snd = decodeSnd(loadSnd('sound00.snd'), {
        id: 'sound00',
        sourceFile: 'sound00.snd',
      });
      expect(snd.compression).toBe('huffman');
      // sound00.snd's decoded_length prefix declares 1769 samples.
      expect(snd.samples.length).toBe(1769);
      // 8-bit unsigned PCM, centered around silence.
      const min = Math.min(...snd.samples);
      const max = Math.max(...snd.samples);
      expect(min).toBeGreaterThanOrEqual(0);
      expect(max).toBeLessThanOrEqual(255);
    });

    it('decodes sound22.snd (longer sustained sound)', () => {
      const snd = decodeSnd(loadSnd('sound22.snd'), {
        id: 'sound22',
        sourceFile: 'sound22.snd',
      });
      expect(snd.compression).toBe('huffman');
      expect(snd.samples.length).toBe(11134);
    });

    it('decodes sound28.snd as raw (tree_size=0)', () => {
      const snd = decodeSnd(loadSnd('sound28.snd'), {
        id: 'sound28',
        sourceFile: 'sound28.snd',
      });
      expect(snd.compression).toBe('raw');
      // File is 10270 bytes; we strip the 2-byte tree_size word → 10268 samples.
      expect(snd.samples.length).toBe(10268);
    });

    it('decodes all 35 sound files without throwing', () => {
      const filenames = [
        'sound00.snd', 'sound02.snd', 'sound03.snd', 'sound04.snd', 'sound05.snd',
        'sound06.snd', 'sound07.snd', 'sound08.snd', 'sound10.snd', 'sound11.snd',
        'sound12.snd', 'sound13.snd', 'sound14.snd', 'sound15.snd', 'sound16.snd',
        'sound17.snd', 'sound20.snd', 'sound21.snd', 'sound22.snd', 'sound23.snd',
        'sound24.snd', 'sound25.snd', 'sound26.snd', 'sound27.snd', 'sound28.snd',
        'sound29.snd', 'sound30.snd', 'sound31.snd', 'sound32.snd', 'sound33.snd',
        'sound34.snd', 'sound35.snd', 'sound36.snd', 'sound37.snd', 'sound38.snd',
      ];
      for (const name of filenames) {
        const id = name.replace(/\.snd$/, '');
        expect(() => decodeSnd(loadSnd(name), { id, sourceFile: name })).not.toThrow();
      }
    });
  });
});

describe('SND_SAMPLE_RATE_HZ', () => {
  it('is the engine-derived ~10kHz rate', () => {
    expect(SND_SAMPLE_RATE_HZ).toBe(10026);
  });
});
