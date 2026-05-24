import { describe, expect, it } from 'vitest';
import {
  WROOT_THUNK_DELTA,
  resolveThunkToWrootOffset,
  wrootOffsetToThunkAddress,
} from '../../src/symbols/index.js';

describe('thunk-delta law', () => {
  it('exposes the documented constant 0xBA9C', () => {
    expect(WROOT_THUNK_DELTA).toBe(0xba9c);
  });

  it('resolves the three documented sample thunks', () => {
    // From CLAUDE.md "Cross-overlay calls: the thunk-delta law"
    expect(resolveThunkToWrootOffset(0xbbb6)).toBe(0x11a); // ui_window_create
    expect(resolveThunkToWrootOffset(0xe0df)).toBe(0x2643); // kbd_check_with_filter
    expect(resolveThunkToWrootOffset(0xee85)).toBe(0x33e9); // huffman_load_and_decompress
  });

  it('round-trips via wrootOffsetToThunkAddress', () => {
    const wrootOffset = 0x11a;
    expect(resolveThunkToWrootOffset(wrootOffsetToThunkAddress(wrootOffset))).toBe(wrootOffset);
  });
});
