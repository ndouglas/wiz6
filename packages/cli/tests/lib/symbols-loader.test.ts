import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
  findFindingsDir,
  loadSymbolIndex,
  readNamingPassDocs,
} from '../../src/lib/symbols-loader.js';

const REPO_ROOT = resolve(__dirname, '../../../..');

describe('symbols-loader — disk integration', () => {
  it('findFindingsDir locates the repo findings directory from anywhere within the tree', () => {
    const dir = findFindingsDir(__dirname);
    expect(dir).toContain('docs/re/findings');
  });

  it('readNamingPassDocs returns one entry per naming-pass JSON', () => {
    const dir = findFindingsDir(REPO_ROOT);
    const docs = readNamingPassDocs(dir);
    expect(docs.length).toBeGreaterThanOrEqual(5);
    expect(docs.every((d) => Array.isArray(d.findings))).toBe(true);
    // Skips non-naming-pass docs (e.g. palette-loads.json).
    expect(docs.every((d) => typeof d.topic === 'string' && d.topic.endsWith('-naming-pass'))).toBe(true);
  });

  it('loadSymbolIndex resolves the three documented sample thunks', () => {
    const idx = loadSymbolIndex({ cwd: REPO_ROOT });
    // The three samples from CLAUDE.md "thunk-delta law":
    //   0xbbb6 → ui_window_create
    //   0xe0df → kbd_check_with_filter
    //   0xee85 → huffman_load_and_decompress
    expect(idx.resolveThunk(0xbbb6)?.name).toBe('ui_window_create');
    expect(idx.resolveThunk(0xe0df)?.name).toBe('kbd_check_with_filter');
    expect(idx.resolveThunk(0xee85)?.name).toBe('huffman_load_and_decompress');
  });

  it('loadSymbolIndex includes overlay symbols (not just wroot)', () => {
    const idx = loadSymbolIndex({ cwd: REPO_ROOT });
    const wmaze = idx.byBinary('wmaze.ovr');
    const wroot = idx.byBinary('wroot.exe');
    expect(wmaze.length).toBeGreaterThan(10);
    expect(wroot.length).toBeGreaterThan(10);
  });
});
