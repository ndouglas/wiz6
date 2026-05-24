import type { SegmentAnchor, SegmentEntry, SegmentMap } from './types.js';

/**
 * Find the location of every segment whose anchor matches in the given
 * memory blob. Returns a map keyed by segment name. Segments whose
 * anchor signature isn't found are simply absent from the result.
 *
 * Pure function: no I/O. The caller is responsible for loading the
 * anchor signatures from disk (see `@wiz6/cli/symbols-loader` patterns
 * for the Node-side reading).
 */
export function findSegmentsInMemory(
  memBlob: Uint8Array,
  anchors: ReadonlyArray<{ anchor: SegmentAnchor; signature: Uint8Array }>,
): SegmentMap {
  const out: SegmentMap = {};
  for (const { anchor, signature } of anchors) {
    const phys = findBytes(memBlob, signature);
    if (phys < 0) continue;
    const headerSkip = anchor.loadHeaderSkipBytes ?? 0;
    // memory_base = phys_anchor - (anchor_file_offset - headerSkip)
    // i.e. file_offset `headerSkip` maps to memory base 0.
    const physBase = phys - (anchor.anchorFileOffset - headerSkip);
    if (physBase < 0) continue;
    const entry: SegmentEntry = { physBase, anchorPhys: phys };
    out[anchor.space] = entry;
  }
  return out;
}

/**
 * Find the first occurrence of `needle` in `haystack`. Returns -1 if
 * absent. Uses a naive scan — fine for our 16 MB save blobs.
 */
function findBytes(haystack: Uint8Array, needle: Uint8Array): number {
  if (needle.length === 0 || needle.length > haystack.length) return -1;
  const last = haystack.length - needle.length;
  outer: for (let i = 0; i <= last; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}
