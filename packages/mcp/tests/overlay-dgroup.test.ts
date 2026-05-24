import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SaveStateBridge } from '../src/debugger-console.js';
import {
  resolveWbaseDgroupBase,
  _clearOverlayDgroupCachesForTests,
} from '../src/overlay-dgroup.js';
import { _clearDgroupCacheForTests } from '../src/dgroup.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const EXTRACT_PY = join(REPO_ROOT, 'tools', 'parity', 'extract.py');
const SAVE_STATE = join(REPO_ROOT, 'tools', 'dosbox', 'save', '1.sav');
const haveSave = existsSync(SAVE_STATE);

describe.skipIf(!haveSave)('overlay-dgroup — wbase.dgroup predicate scan', () => {
  it('finds the wbase DGROUP for save 1 (state-4 main menu) and yields a non-zero menu_window', () => {
    _clearDgroupCacheForTests();
    _clearOverlayDgroupCachesForTests();
    const bridge = new SaveStateBridge(EXTRACT_PY, SAVE_STATE);
    const wbaseDg = resolveWbaseDgroupBase(bridge, SAVE_STATE);
    expect(wbaseDg).toBeGreaterThan(0x10000);

    // The whole point: at wbase.dgroup + 0x4fbc we get a non-zero menu
    // window handle (the predicate is part of the scan, but this asserts
    // the scan returned a base where it's actually true post-detection).
    const mwBytes = bridge.readPhysical(wbaseDg + 0x4fbc, 2);
    const mw = mwBytes[0]! | (mwBytes[1]! << 8);
    expect(mw).not.toBe(0);
  });

  it('caches the result so repeated calls don\'t re-scan', () => {
    _clearDgroupCacheForTests();
    _clearOverlayDgroupCachesForTests();
    const bridge = new SaveStateBridge(EXTRACT_PY, SAVE_STATE);
    const first = resolveWbaseDgroupBase(bridge, SAVE_STATE);
    const second = resolveWbaseDgroupBase(bridge, SAVE_STATE);
    expect(second).toBe(first);
  });
});
