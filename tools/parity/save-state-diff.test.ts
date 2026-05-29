import { describe, expect, it } from 'vitest';
import { diffMemoryBlobs } from './save-state-diff.js';

describe('diffMemoryBlobs', () => {
  it('finds no diffs between identical buffers', () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([1, 2, 3, 4, 5]);
    expect(diffMemoryBlobs(a, b)).toEqual([]);
  });

  it('finds a single-byte diff and reports it as a 1-byte run', () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([1, 2, 7, 4, 5]);
    const runs = diffMemoryBlobs(a, b);
    expect(runs).toEqual([{ start: 2, length: 1, oldBytes: [3], newBytes: [7] }]);
  });

  it('groups contiguous diffs into a single run', () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([1, 9, 8, 7, 5]);
    const runs = diffMemoryBlobs(a, b);
    expect(runs).toEqual([{ start: 1, length: 3, oldBytes: [2, 3, 4], newBytes: [9, 8, 7] }]);
  });

  it('returns multiple runs when diffs are non-contiguous', () => {
    const a = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const b = new Uint8Array([9, 2, 3, 7, 5, 8]);
    const runs = diffMemoryBlobs(a, b);
    expect(runs).toHaveLength(3);
    expect(runs[0]!.start).toBe(0);
    expect(runs[1]!.start).toBe(3);
    expect(runs[2]!.start).toBe(5);
  });
});
