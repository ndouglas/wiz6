import { describe, expect, it } from 'vitest';
import {
  parseFindingsDoc,
  type RawFindingsDoc,
} from '../../src/symbols/index.js';

describe('parseFindingsDoc — single-name single-address', () => {
  it('extracts one SymbolEntry, stripping wroot segment prefix', () => {
    // 0x141df = 0x10000 + 0x41df — Ghidra segment-prefixed notation in the
    // findings JSONs. We normalize to the bare image offset 0x41df so the
    // thunk-delta law applies cleanly.
    const doc: RawFindingsDoc = {
      binaries: ['wroot.exe'],
      findings: [
        {
          id: 'fn-crt-main',
          applied_name: 'crt_main_set_iostate',
          category: 'crt',
          confidence: 'high',
          claim: '0x141df is the C runtime _main wrapper',
          evidence: { address: '0x141df' },
        },
      ],
    };
    const entries = parseFindingsDoc(doc);
    expect(entries).toEqual([
      {
        binary: 'wroot.exe',
        address: 0x41df,
        name: 'crt_main_set_iostate',
        category: 'crt',
        confidence: 'high',
        claim: '0x141df is the C runtime _main wrapper',
        source_finding_id: 'fn-crt-main',
      },
    ]);
  });
});

describe('parseFindingsDoc — renamed_full_list (overlay format)', () => {
  it('extracts entries from the flat rename log', () => {
    const doc: RawFindingsDoc = {
      binaries: ['wmaze.ovr'],
      renamed_full_list: [
        { addr: '0x108b', old: 'FUN_0000_108b', new: 'maze_step', category: 'maze_state' },
        { addr: '0x3304', old: 'FUN_0000_3304', new: 'maze_rotate', category: 'maze_state' },
      ],
    };
    expect(parseFindingsDoc(doc)).toEqual([
      { binary: 'wmaze.ovr', address: 0x108b, name: 'maze_step', category: 'maze_state' },
      { binary: 'wmaze.ovr', address: 0x3304, name: 'maze_rotate', category: 'maze_state' },
    ]);
  });

  it('normalizes wroot segment-prefixed addresses in renamed_full_list', () => {
    const doc: RawFindingsDoc = {
      binaries: ['wroot.exe'],
      renamed_full_list: [
        { addr: '0x1011a', old: 'FUN_1000_011a', new: 'ui_window_create', category: 'ui' },
      ],
    };
    const entries = parseFindingsDoc(doc);
    expect(entries[0]?.address).toBe(0x11a);
    expect(entries[0]?.name).toBe('ui_window_create');
  });

  it('renamed_full_list wins over per-finding applied_name at the same address', () => {
    const doc: RawFindingsDoc = {
      binaries: ['wroot.exe'],
      renamed_full_list: [
        { addr: '0x10100', old: 'FUN_1000_0100', new: 'canonical_name' },
      ],
      findings: [
        {
          applied_name: 'finding_name',
          evidence: { address: '0x10100' },
        },
      ],
    };
    const entries = parseFindingsDoc(doc);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe('canonical_name');
  });
});

describe('parseFindingsDoc — slash-delimited names matched to addresses array', () => {
  it('zips names to addresses positionally', () => {
    // Mirrors the wroot CRT dos-thunks finding shape from
    // docs/re/findings/wroot-naming-pass.json.
    const doc: RawFindingsDoc = {
      binaries: ['wroot.exe'],
      findings: [
        {
          id: 'fn-crt-dos-thunks',
          applied_name: 'crt_dos_close / lseek / unlink / rename',
          category: 'crt',
          confidence: 'high',
          evidence: {
            addresses: ['0x14309', '0x14321', '0x14340', '0x14358'],
          },
        },
      ],
    };
    const entries = parseFindingsDoc(doc);
    expect(entries.map((e) => e.name)).toEqual([
      'crt_dos_close',
      'lseek',
      'unlink',
      'rename',
    ]);
    // wroot segment-prefixed → normalized to image offsets
    expect(entries.map((e) => e.address)).toEqual([0x4309, 0x4321, 0x4340, 0x4358]);
    expect(entries.every((e) => e.binary === 'wroot.exe')).toBe(true);
  });
});

describe('parseFindingsDoc — single name applied to multiple addresses', () => {
  it('emits one entry per address sharing the name (aliases)', () => {
    const doc: RawFindingsDoc = {
      binaries: ['wmaze.ovr'],
      findings: [
        {
          id: 'fn-renderer',
          applied_name: 'maze_render',
          category: 'maze_view',
          evidence: { addresses: ['0x4ad7', '0x4ada'] }, // synthetic alias
        },
      ],
    };
    const entries = parseFindingsDoc(doc);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.name === 'maze_render')).toBe(true);
    expect(entries.map((e) => e.address).sort((a, b) => a - b)).toEqual([0x4ad7, 0x4ada]);
  });
});

describe('parseFindingsDoc — multi-name arity mismatch', () => {
  it('falls back to using the raw applied_name string for each address', () => {
    const doc: RawFindingsDoc = {
      binaries: ['wroot.exe'],
      findings: [
        {
          id: 'fn-amb',
          applied_name: 'foo / bar / baz',
          evidence: { addresses: ['0x100', '0x200'] }, // 3 names, 2 addresses
        },
      ],
    };
    const entries = parseFindingsDoc(doc);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.name === 'foo / bar / baz')).toBe(true);
  });
});

describe('parseFindingsDoc — skip conditions', () => {
  it('skips findings without applied_name', () => {
    const doc: RawFindingsDoc = {
      binaries: ['wroot.exe'],
      findings: [
        {
          id: 'fn-observation',
          claim: 'observation about something',
          evidence: { address: '0x100' },
        },
      ],
    };
    expect(parseFindingsDoc(doc)).toEqual([]);
  });

  it('skips findings without an address', () => {
    const doc: RawFindingsDoc = {
      binaries: ['wroot.exe'],
      findings: [{ applied_name: 'orphan', evidence: {} }],
    };
    expect(parseFindingsDoc(doc)).toEqual([]);
  });

  it('skips findings whose binary is unrecognised', () => {
    const doc: RawFindingsDoc = {
      binaries: ['unknown.exe'],
      findings: [
        { applied_name: 'foo', evidence: { binary: 'unknown.exe', address: '0x100' } },
      ],
    };
    expect(parseFindingsDoc(doc)).toEqual([]);
  });

  it('prefers per-finding evidence.binary over doc-level binaries[]', () => {
    const doc: RawFindingsDoc = {
      binaries: ['wroot.exe'],
      findings: [
        {
          applied_name: 'overlay_fn',
          evidence: { binary: 'wmaze.ovr', address: '0x42' },
        },
      ],
    };
    expect(parseFindingsDoc(doc)).toEqual([
      {
        binary: 'wmaze.ovr',
        address: 0x42,
        name: 'overlay_fn',
        category: undefined,
        confidence: undefined,
        claim: undefined,
        source_finding_id: undefined,
      },
    ]);
  });
});
