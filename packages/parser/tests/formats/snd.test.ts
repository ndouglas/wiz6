import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodeSnd, sndSampleRateHz, DEFAULT_SND_RATE_DIVISOR } from '../../src/formats/snd.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const ORIGINAL = join(REPO_ROOT, 'original');

function loadSnd(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(ORIGINAL, name)));
}

describe('decodeSnd', () => {
  describe('header parsing', () => {
    it('parses rate_word == 0xFFFF as null (engine default)', () => {
      // Minimal valid file: header only, no tree (raw PCM mode, zero samples).
      const bytes = new Uint8Array([0, 0, 0xff, 0xff]);
      const snd = decodeSnd(bytes, { id: 't', sourceFile: 't.snd' });
      expect(snd.rateDivisor).toBeNull();
      expect(snd.compression).toBe('raw');
      expect(snd.samples).toEqual([]);
    });

    it('parses an explicit rate divisor', () => {
      const bytes = new Uint8Array([0, 0, 0xc8, 0x00]); // divisor 200
      const snd = decodeSnd(bytes, { id: 't', sourceFile: 't.snd' });
      expect(snd.rateDivisor).toBe(200);
    });

    it('throws on a file shorter than the 4-byte header', () => {
      expect(() => decodeSnd(new Uint8Array([0, 0, 0]), { id: 't', sourceFile: 't.snd' })).toThrow(
        /too short/,
      );
    });
  });

  describe('raw PCM mode (tree_size = 0)', () => {
    it('emits bytes 4..end as samples', () => {
      const bytes = new Uint8Array([0, 0, 0xff, 0xff, 128, 129, 130, 127, 126]);
      const snd = decodeSnd(bytes, { id: 't', sourceFile: 't.snd' });
      expect(snd.compression).toBe('raw');
      expect(snd.samples).toEqual([128, 129, 130, 127, 126]);
    });
  });

  describe('huffman mode', () => {
    it('decodes a minimal 1-node tree (leaf-only left branch)', () => {
      // tree_size = 4 (one node: left=0x0080 leaf=128, right=0x0080 leaf=128)
      // bitstream byte 0xff (8 bits) → 8 samples of 128
      const bytes = new Uint8Array([
        0x04,
        0x00, // tree_size = 4
        0xff,
        0xff, // rate_word = default
        0x80,
        0x00, // left  = 0x0080 (leaf, value 128)
        0x80,
        0x00, // right = 0x0080 (leaf, value 128)
        0xff, // bitstream: all bits = 1, all decode to leaf
      ]);
      const snd = decodeSnd(bytes, { id: 't', sourceFile: 't.snd' });
      expect(snd.compression).toBe('huffman');
      expect(snd.samples).toEqual([128, 128, 128, 128, 128, 128, 128, 128]);
    });

    it('follows an internal link to a deeper leaf', () => {
      // node 0: left = leaf(0x10), right = link(0xFFFF means -1, next_node = 1)
      // node 1: left = leaf(0x20), right = leaf(0x30)
      // bitstream byte 0b10_00_00_00 = 0x80: first bit 1 → link to node 1; next bit 0 → leaf 0x20; remaining bits → tree walks again
      const bytes = new Uint8Array([
        0x08,
        0x00, // tree_size = 8 (2 nodes)
        0xff,
        0xff, // rate_word = default
        // node 0
        0x10,
        0x00, // left  = leaf 0x10
        0xff,
        0xff, // right = link, next_node = 0x10000 - 0xFFFF = 1
        // node 1
        0x20,
        0x00, // left  = leaf 0x20
        0x30,
        0x00, // right = leaf 0x30
        0x80, // bitstream: 1, 0, 0, 0, 0, 0, 0, 0  →  (link→1)(leaf 0x20)(leaf 0x10)*6
      ]);
      const snd = decodeSnd(bytes, { id: 't', sourceFile: 't.snd' });
      expect(snd.samples.slice(0, 7)).toEqual([0x20, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10]);
    });
  });

  describe('against real game files', () => {
    it('decodes sound00.snd (title clang, huffman, default rate)', () => {
      const snd = decodeSnd(loadSnd('sound00.snd'), {
        id: 'sound00',
        sourceFile: 'sound00.snd',
      });
      expect(snd.compression).toBe('huffman');
      expect(snd.rateDivisor).toBeNull();
      // Sample count should be reasonable for a ~0.1 sec clang at ~8 kHz.
      // 1302-byte input → expect hundreds-to-thousands of samples.
      expect(snd.samples.length).toBeGreaterThan(100);
      expect(snd.samples.length).toBeLessThan(20000);
      // 8-bit unsigned PCM: samples should center near 128, range 0..255.
      const min = Math.min(...snd.samples);
      const max = Math.max(...snd.samples);
      expect(min).toBeGreaterThanOrEqual(0);
      expect(max).toBeLessThanOrEqual(255);
    });

    it('decodes sound04.snd (huffman, explicit divisor=200)', () => {
      const snd = decodeSnd(loadSnd('sound04.snd'), {
        id: 'sound04',
        sourceFile: 'sound04.snd',
      });
      expect(snd.compression).toBe('huffman');
      expect(snd.rateDivisor).toBe(200);
      expect(snd.samples.length).toBeGreaterThan(0);
    });

    it('decodes sound28.snd as raw PCM (tree_size = 0)', () => {
      const snd = decodeSnd(loadSnd('sound28.snd'), {
        id: 'sound28',
        sourceFile: 'sound28.snd',
      });
      expect(snd.compression).toBe('raw');
      // File size 10270 bytes; 4-byte header → 10266 samples
      expect(snd.samples.length).toBe(10266);
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

describe('sndSampleRateHz', () => {
  it('uses the default divisor when rateDivisor is null', () => {
    const expected = Math.round(1_193_182 / DEFAULT_SND_RATE_DIVISOR / 2);
    expect(sndSampleRateHz(null)).toBe(expected);
  });

  it('computes sample rate from an explicit divisor (DI advances 0.5 sample/tick)', () => {
    // divisor 200 → 1193182 / 200 / 2 ≈ 2982.96 → 2983
    expect(sndSampleRateHz(200)).toBe(2983);
    // divisor 132 → 1193182 / 132 / 2 ≈ 4519.63 → 4520
    expect(sndSampleRateHz(132)).toBe(4520);
  });
});
