import { describe, expect, it } from 'vitest';
import { sndApplyLut, SND_LOG_LUT } from '../../src/formats/snd.js';

describe('SND_LOG_LUT', () => {
  it('has 256 entries', () => {
    expect(SND_LOG_LUT).toHaveLength(256);
  });

  it('starts at 63 (max amplitude at sample byte 0)', () => {
    expect(SND_LOG_LUT[0]).toBe(0x3f);
  });

  it('reaches 0 at sample byte ~219 (silence)', () => {
    expect(SND_LOG_LUT[219]).toBe(0);
    expect(SND_LOG_LUT[255]).toBe(0);
  });

  it('is monotonically non-increasing', () => {
    for (let i = 1; i < SND_LOG_LUT.length; i++) {
      expect(SND_LOG_LUT[i]!).toBeLessThanOrEqual(SND_LOG_LUT[i - 1]!);
    }
  });
});

describe('sndApplyLut', () => {
  it('returns empty for empty input', () => {
    expect(sndApplyLut([])).toEqual([]);
  });

  it('outputs centered around 128 (PCM silence) when input is constant', () => {
    // All samples = same value → LUT output constant → after mean subtraction, all 128
    const out = sndApplyLut([100, 100, 100, 100]);
    expect(out).toEqual([128, 128, 128, 128]);
  });

  it('produces values in 0..255 range', () => {
    const out = sndApplyLut([0, 64, 128, 192, 255]);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it('maps sample 0 (max LUT) to high amplitude, sample 255 (min LUT) to low', () => {
    // Mix two extreme samples; sample 0 has LUT=63, sample 255 has LUT=0.
    // Mean = 31.5, so 0→128+(63-31.5)*4=254 (clamped at 255), 255→128+(0-31.5)*4=2.
    const out = sndApplyLut([0, 255]);
    expect(out[0]).toBeGreaterThan(200); // loud
    expect(out[1]).toBeLessThan(50); // quiet
  });
});
