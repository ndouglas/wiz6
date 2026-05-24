import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AdmZip from 'adm-zip';
import {
  SEGMENT_ANCHORS,
  findSegmentsInMemory,
  type SegmentMap,
} from '@wiz6/data';

/**
 * Build a SegmentMap for a save state by reading every anchor binary
 * from disk and searching for its signature in the save's Memory blob.
 *
 * Cached per save-path so we only pay the lookup once.
 */
const segmentMapCache = new Map<string, SegmentMap>();

export function buildSegmentMap(savePath: string, repoRoot: string): SegmentMap {
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
  segmentMapCache.set(savePath, map);
  return map;
}

/** Clear the cache. Test-only. */
export function _clearSegmentMapCacheForTests(): void {
  segmentMapCache.clear();
}
