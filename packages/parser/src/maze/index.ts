/**
 * index.ts — public barrel for the @wiz6/parser maze module.
 *
 * Re-exports the public pipeline entry point and the individual stage functions
 * so callers can use either the assembled renderer or individual stages.
 */

// Public entry point
export { renderMazeViewport } from './render.js';

// Individual stages (for tests, parity tooling, and viewer assembly)
export { classifyVisibleWalls } from './classify.js';
export { deriveCorridorSpans, refineSpanColumns, cornerSolidSeamIdx } from './build.js';
export { generateCallList } from './flush.js';
export {
  renderFrameFromGeometry,
  renderPieceCall,
  decodePieceToComposeBuffer,
  applyStore,
  deriveMasks,
  PLANE_STRIDE,
  PAGE_ROW_BYTES,
} from './compositor.js';
export { decodePageIndex, decodePageRgba } from './page.js';
export { loadMazeAssets } from './assets.js';

// Shared types
export type { MazeSpan, CompositorCall } from './compositor.js';
