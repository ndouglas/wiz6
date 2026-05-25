import { describe, expect, it } from 'vitest';
import {
  encodeSave,
  decodeSave,
  encodeSaveBase64,
  decodeSaveBase64,
} from '../../src/formats/save-codec.js';
import type { Save } from '@wiz6/data';

const SAVE: Save = {
  schemaVersion: 1,
  metadata: { slotName: 'My adventure', timestamp: '2026-05-25T12:00:00.000Z', portVersion: '0.0.0' },
  party: [],
  position: { zone: 0, level: 0, x: 0, y: 0, globalX: 0, globalY: 0, facing: 0 },
  scenarioFlags: {},
  mazeState: {},
};

describe('save-codec', () => {
  it('round-trips encodeSave / decodeSave', () => {
    const bytes = encodeSave(SAVE);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    const restored = decodeSave(bytes);
    expect(restored).toEqual(SAVE);
  });

  it('round-trips through base64', () => {
    const b64 = encodeSaveBase64(SAVE);
    expect(typeof b64).toBe('string');
    expect(b64).not.toMatch(/[^A-Za-z0-9+/=]/); // base64-clean
    const restored = decodeSaveBase64(b64);
    expect(restored).toEqual(SAVE);
  });

  it('decodeSave validates against SaveSchema (rejects malformed bytes)', () => {
    expect(() => decodeSave(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });

  it('decodeSaveBase64 throws on invalid base64', () => {
    expect(() => decodeSaveBase64('not-base64!!!')).toThrow();
  });

  it('compressed output is smaller than the source JSON for non-trivial saves', () => {
    const big: Save = {
      ...SAVE,
      scenarioFlags: Object.fromEntries(
        new Array(100).fill(0).map((_, i) => [`flag_${i}`, true]),
      ),
    };
    const json = JSON.stringify(big);
    const bytes = encodeSave(big);
    expect(bytes.length).toBeLessThan(json.length);
  });
});
