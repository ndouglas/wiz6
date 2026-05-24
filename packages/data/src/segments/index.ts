/**
 * Per-save segment-map abstraction. Located each loaded binary's physical
 * address in a save-state Memory blob, so RE findings and tooling can
 * specify typed `{space, offset}` addresses instead of bare physical
 * offsets (which silently break when overlays swap).
 *
 * Pure types + algorithm here. The Node-side disk-loading of anchor
 * signatures lives in `@wiz6/mcp/src/segments.ts`.
 */

export type { SegmentSpace, SegAddr, SegmentAnchor, SegmentMap, SegmentEntry } from './types.js';
export { resolveSegAddr } from './types.js';
export { findSegmentsInMemory } from './find-segments.js';
export { SEGMENT_ANCHORS } from './anchors.js';
