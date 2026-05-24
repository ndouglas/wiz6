// Per-save DGROUP base resolution.
//
// Wiz6 keeps its runtime state in a single 16-bit DOS data segment ("DGROUP").
// Every DGROUP-relative offset documented in `docs/re/` (game_state at 0x363a,
// sound table at 0x3344, party at 0x43e8, etc.) is implicitly anchored to
// whatever physical address DGROUP happens to live at when the save was taken.
//
// That physical anchor varies per save state — DOS loader placement isn't
// deterministic across CONFIG.SYS / device-driver variations — so we resolve
// it at runtime by anchoring on a known string template.
//
// The cheapest anchor is the SOUND00.SND filename template at DGROUP `0x513A`.
// That's a fixed 12-byte ASCII pattern the engine writes into DGROUP during
// preload and reuses for every per-slot filename build. Find it, subtract
// 0x513A, and you have the DGROUP physical base.
//
// Results are cached per save path so we only pay the lookup once.

import { SaveStateBridge } from './debugger-console.js';

/** DGROUP offset of the SOUND00.SND filename template. */
export const SOUND_TEMPLATE_DGROUP_OFFSET = 0x513a;

/** ASCII hex of "SOUND00.SND\0" — the 12-byte anchor pattern. */
export const SOUND_TEMPLATE_HEX = '53 4f 55 4e 44 30 30 2e 53 4e 44 00';

const dgroupCache = new Map<string, number>();

/**
 * Locate the DGROUP physical base for the given save state.
 *
 * Anchors on the SOUND00.SND template via SaveStateBridge.findPattern, then
 * subtracts SOUND_TEMPLATE_DGROUP_OFFSET. Throws if the anchor isn't found
 * (which would indicate the save was taken before the sound table preload —
 * the existing save in the repo is post-preload, so this is the normal case).
 *
 * Results are cached by `savePath`.
 */
export function resolveDgroupBase(bridge: SaveStateBridge, savePath: string): number {
  const cached = dgroupCache.get(savePath);
  if (cached !== undefined) return cached;
  const phys = bridge.findPattern(SOUND_TEMPLATE_HEX);
  if (phys < 0) {
    throw new Error(
      `could not locate SOUND00.SND template in ${savePath}; ` +
        'unable to resolve DGROUP base. The anchor only appears after the ' +
        'sound-table preload runs (state 2). Use a later save.',
    );
  }
  const base = phys - SOUND_TEMPLATE_DGROUP_OFFSET;
  dgroupCache.set(savePath, base);
  return base;
}

/** Convert a DGROUP-relative offset to a physical-memory offset for `savePath`. */
export function dgroupOffsetToPhysical(
  bridge: SaveStateBridge,
  savePath: string,
  dgroupOffset: number,
): number {
  return resolveDgroupBase(bridge, savePath) + dgroupOffset;
}

/** Clear the cache. Test-only. */
export function _clearDgroupCacheForTests(): void {
  dgroupCache.clear();
}
