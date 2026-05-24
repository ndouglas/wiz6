import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { decodeCpuRegisters, identifyCsCode } from '../src/registers.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
// 1.sav: user-captured save (state 4 main menu); see TODO/registers
// validation notes for the expected CS=0x720D loop state.
const SAVE_STATE = join(REPO_ROOT, 'tools', 'dosbox', 'save', '1.sav');
const haveSave = existsSync(SAVE_STATE);

describe.skipIf(!haveSave)('registers — decode CPU snapshot from save', () => {
  it('returns register values within the bounds of x86 + DOSBox-X real-mode invariants', () => {
    const r = decodeCpuRegisters(SAVE_STATE);

    // Real-mode sanity checks (always-true for any wiz6 save):
    //   IDT limit is the canonical real-mode IVT size (1KB - 1)
    //   CR0.PE bit is clear
    //   CR0 = 0x10 (cache disable + ET) per DOSBox-X real-mode default
    //   selector << 4 == cached phys base (real-mode invariant)
    expect(r.IDT_LIMIT).toBe(0x3ff);
    expect(r.protectedMode).toBe(false);
    expect(r.CR0).toBe(0x10);
    expect(r.CS_PHYS).toBe(r.CS << 4);
    expect(r.DS_PHYS).toBe(r.DS << 4);
    expect(r.SS_PHYS).toBe(r.SS << 4);
    expect(r.ES_PHYS).toBe(r.ES << 4);

    // CS:EIP is inside an x86 16-bit segment, so EIP fits in u16.
    expect(r.EIP).toBeLessThan(0x10000);

    // Selectors fit in u16.
    for (const v of [r.CS, r.DS, r.SS, r.ES, r.FS, r.GS]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffff);
    }

    // Version sanity: should contain the build prefix we validated against.
    expect(r.dosboxVersion).toMatch(/^DOSBox-X 2026\.05\.02/);
  });

  it('rejects a save zip without a CPU entry', () => {
    expect(() => decodeCpuRegisters('/dev/null')).toThrow();
  });
});

describe('identifyCsCode', () => {
  it('returns the segment whose [physBase, physBase+size) contains CS_PHYS+EIP', () => {
    const map = {
      'wroot.exe': { physBase: 0x8000 },
      'wbase.ovr': { physBase: 0xc000 },
      'ega.drv': { physBase: 0x70000 },
    };
    const sizes = {
      'wroot.exe': 0x10000,
      'wbase.ovr': 0x4000,
      'ega.drv': 0x2300,
    };
    // CS:EIP at 0x720D:0x20EB = linear 0x720D0 + 0x20EB = 0x741BB → ega.drv
    // offset 0x741BB - 0x70000 = 0x41BB ... no wait, 0x70000 isn't where
    // ega.drv loaded above. Use 0x72258 (the real load addr we observed).
    const map2 = {
      'wroot.exe': { physBase: 0x8000 },
      'ega.drv': { physBase: 0x72258 },
    };
    const sizes2 = {
      'wroot.exe': 0x10000,
      'ega.drv': 0x2262,
    };
    const r = identifyCsCode(0x720d0, 0x20eb, map2, sizes2);
    expect(r).not.toBeNull();
    expect(r!.space).toBe('ega.drv');
    expect(r!.fileOffset).toBe(0x720d0 + 0x20eb - 0x72258);
    // Suppress unused-var lint
    void map;
    void sizes;
  });

  it('returns null when CS_PHYS+EIP falls outside every loaded segment', () => {
    const map = { 'wroot.exe': { physBase: 0x8000 } };
    const sizes = { 'wroot.exe': 0x1000 };
    expect(identifyCsCode(0x20000, 0, map, sizes)).toBeNull();
  });
});
