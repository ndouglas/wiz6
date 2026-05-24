import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AdmZip from 'adm-zip';
import {
  SEGMENT_ANCHORS,
  findSegmentsInMemory,
  type SegmentMap,
} from '@wiz6/data';
import { SaveStateBridge } from './debugger-console.js';
import { resolveDgroupBase } from './dgroup.js';
import { resolveWbaseDgroupBase } from './overlay-dgroup.js';

/**
 * Build a SegmentMap for a save state by reading every anchor binary
 * from disk and searching for its signature in the save's Memory blob.
 *
 * Includes a `wroot.dgroup` entry populated by the legacy game_state-
 * validated resolver (see `dgroup.ts`) — its base is context-dependent
 * (winit vs wbase vs wmaze) and can't be located by simple byte-anchor
 * matching alone.
 *
 * Cached per save-path so we only pay the lookup once.
 */
const segmentMapCache = new Map<string, SegmentMap>();

export interface BuildSegmentMapOpts {
  /**
   * Optional SaveStateBridge for resolving `wroot.dgroup` via the legacy
   * game_state-legality validator. If omitted, `wroot.dgroup` is left
   * absent from the returned map.
   */
  bridge?: SaveStateBridge;
}

export function buildSegmentMap(
  savePath: string,
  repoRoot: string,
  opts: BuildSegmentMapOpts = {},
): SegmentMap {
  const cached = segmentMapCache.get(savePath);
  if (cached) return cached;

  // Load the Memory blob from the save ZIP.
  const zip = new AdmZip(readFileSync(savePath));
  const memEntry = zip.getEntry('Memory');
  if (!memEntry) throw new Error(`save state ${savePath} has no Memory entry`);
  const mem = new Uint8Array(memEntry.getData());

  // Load each anchor's signature bytes from disk.
  const anchors = SEGMENT_ANCHORS.map((anchor) => {
    const filePath = resolve(repoRoot, anchor.diskPath);
    let signature: Uint8Array;
    try {
      const file = readFileSync(filePath);
      signature = new Uint8Array(
        file.subarray(anchor.anchorFileOffset, anchor.anchorFileOffset + anchor.anchorLength),
      );
    } catch {
      // Disk file missing — skip this anchor.
      signature = new Uint8Array(0);
    }
    return { anchor, signature };
  }).filter((a) => a.signature.length > 0);

  const map = findSegmentsInMemory(mem, anchors);

  // Augment with wroot.dgroup if we have a bridge to validate against.
  if (opts.bridge) {
    try {
      const dgroupBase = resolveDgroupBase(opts.bridge, savePath);
      map['wroot.dgroup'] = {
        physBase: dgroupBase,
        // For wroot.dgroup, "anchor" is the DISK.HDR string in the wroot
        // overlay-name table; the resolver picks the right candidate
        // offset (0x05D6 winit-context or 0x1AEE wbase-context) by
        // checking game_state at +0x363A.
        anchorPhys: dgroupBase, // not meaningfully different here
      };
    } catch {
      // wroot not loaded or game_state invalid; leave absent.
    }

    // Augment with wbase.dgroup (predicate scan; only succeeds when
    // game_state is in wbase's handled set + menu_window is allocated).
    try {
      const wbaseDg = resolveWbaseDgroupBase(opts.bridge, savePath);
      map['wbase.dgroup'] = { physBase: wbaseDg, anchorPhys: wbaseDg };
    } catch {
      // wbase not active or detection ambiguous; leave absent.
    }
  }

  segmentMapCache.set(savePath, map);
  return map;
}

/** Clear the cache. Test-only. */
export function _clearSegmentMapCacheForTests(): void {
  segmentMapCache.clear();
}
