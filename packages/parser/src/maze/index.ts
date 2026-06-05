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
export { composeBackground, applyPlacedImage, applyMaskedMirror, MAZE_BITREV } from './background.js';
export { buildBackgroundPage } from './render.js';
export {
  expandMazeData,
  orPlacementFor,
  maskedMirrorFor,
} from './maze-data.js';
export {
  composeCallList,
  composeBackgroundFromAsset,
} from './callist.js';

// Dungeon level loader (reads committed extracted/maze/level-<id>.json)
export { loadDungeonLevel } from './level.js';

// Maze block decoder (pure, no I/O)
export {
  decodeMazeBlock,
  getBits,
  MB,
  MAZE_BANK,
  REGIONS,
  CELLS_PER_REGION,
  TOTAL_CELLS,
} from './maze-block.js';

// Shared types
export type { MazeSpan, CompositorCall } from './compositor.js';
export type { MazeWorkBuffer, MazeImageDesc, MazePlacement } from './maze-data.js';
export type { BackgroundCall, CallList } from './callist.js';
