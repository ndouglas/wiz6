import { describe, expect, it } from 'vitest';
import {
  buildSymbolIndex,
  type SymbolEntry,
} from '../../src/symbols/index.js';

const fixture: SymbolEntry[] = [
  { binary: 'wroot.exe', address: 0x11a, name: 'ui_window_create', category: 'ui', confidence: 'high' },
  { binary: 'wroot.exe', address: 0x2643, name: 'kbd_check_with_filter', category: 'kbd', confidence: 'high' },
  { binary: 'wroot.exe', address: 0x33e9, name: 'huffman_load_and_decompress', category: 'codec' },
  { binary: 'wmaze.ovr', address: 0x108b, name: 'maze_step', category: 'maze_state' },
  { binary: 'wmaze.ovr', address: 0x3304, name: 'maze_rotate', category: 'maze_state' },
  { binary: 'winit.ovr', address: 0x525, name: 'winit_load_disk_headers', category: 'boot' },
];

describe('buildSymbolIndex', () => {
  const idx = buildSymbolIndex(fixture);

  it('byName returns the matching entry', () => {
    expect(idx.byName('maze_step')?.address).toBe(0x108b);
    expect(idx.byName('ui_window_create')?.binary).toBe('wroot.exe');
    expect(idx.byName('nonexistent')).toBeUndefined();
  });

  it('byAddress is keyed on (binary, address)', () => {
    expect(idx.byAddress('wmaze.ovr', 0x108b)?.name).toBe('maze_step');
    expect(idx.byAddress('wroot.exe', 0x108b)).toBeUndefined();
    expect(idx.byAddress('winit.ovr', 0x525)?.name).toBe('winit_load_disk_headers');
  });

  it('byBinary returns all entries in a given binary', () => {
    expect(idx.byBinary('wmaze.ovr')).toHaveLength(2);
    expect(idx.byBinary('wroot.exe')).toHaveLength(3);
    expect(idx.byBinary('wpcvw.ovr')).toEqual([]);
  });

  it('resolveThunk maps the documented sample thunk addresses', () => {
    // 0xbbb6 - 0xBA9C = 0x11a → ui_window_create
    expect(idx.resolveThunk(0xbbb6)?.name).toBe('ui_window_create');
    // 0xe0df - 0xBA9C = 0x2643 → kbd_check_with_filter
    expect(idx.resolveThunk(0xe0df)?.name).toBe('kbd_check_with_filter');
    // 0xee85 - 0xBA9C = 0x33e9 → huffman_load_and_decompress
    expect(idx.resolveThunk(0xee85)?.name).toBe('huffman_load_and_decompress');
  });

  it('resolveThunk returns undefined when the resolved wroot offset has no symbol', () => {
    // 0xFFFF - 0xBA9C = 0x4563, not in fixture
    expect(idx.resolveThunk(0xffff)).toBeUndefined();
  });

  it('allByName returns every match across binaries', () => {
    const dup: SymbolEntry[] = [
      ...fixture,
      { binary: 'wmele.ovr', address: 0x100, name: 'maze_step' },
    ];
    const dupIdx = buildSymbolIndex(dup);
    const all = dupIdx.allByName('maze_step');
    expect(all).toHaveLength(2);
    expect(new Set(all.map((e) => e.binary))).toEqual(new Set(['wmaze.ovr', 'wmele.ovr']));
  });

  it('exposes entries verbatim', () => {
    expect(idx.entries).toBe(fixture);
  });
});
