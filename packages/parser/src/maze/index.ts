/**
 * index.ts — public barrel for the @wiz6/parser maze module.
 *
 * Re-exports the public pipeline entry point and the individual stage functions
 * so callers can use either the assembled renderer or individual stages.
 */

// Public entry point
export { renderMazeViewport } from './render.js';

// Discrete movement (turn + wall-collision step)
export {
  turn,
  tryStepForward,
  passabilityKey,
  passabilityFromTable,
  type ForwardVerdict,
  type MovementOpts,
} from './movement.js';

// Individual stages (for tests, parity tooling, and viewer assembly)
export { classifyVisibleWalls } from './classify.js';
export { deriveCorridorSpans, refineSpanColumns, cornerSolidSeamIdx } from './build.js';
export { generateCallList } from './flush.js';
export {
  renderFrameFromGeometry,
  renderFrameFromAssets,
  renderPieceCall,
  decodePieceToComposeBuffer,
  applyStore,
  deriveMasks,
  PLANE_STRIDE,
  PAGE_ROW_BYTES,
} from './compositor.js';
export { decodePageIndex, decodePageRgba } from './page.js';
export { loadMazeAssets, loadMazeAssetsRaw } from './assets.js';
export { decodeMazeAssets, type MazeAssetsRaw } from './assets-decode.js';
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
  EMIT_BASES,
  placementIndex,
  generateSkeletonIndices,
  computeVisibleDepths,
  generateCallist,
  generateNearFlankMasked,
  generateParityOddMasked,
  mirrorTwin,
  generateFullCallList,
} from './callist.js';

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

// Options menu navigation (pure, in-dungeon PARTY OPTIONS 3×3 grid)
export { moveOptionsCursor, commandAt, type OptionsCommand } from './options-menu.js';

// REVIEW WHO? member-picker navigation (pure, in-dungeon OPTIONS → REVIEW)
export { moveReviewCursor, REVIEW_EXIT } from './review-picker.js';

// OPEN door — pure FORCE/PICK/detect logic (#089)
export {
  strainBarLength,
  forceAttempt,
  pickAttempt,
  detectDoorAtParty,
  moveDoorMenuCursor,
  resolveDoorAttempt,
  type ForceMember,
  type PickMember,
  type PartyPos,
  type DoorOutcome,
  type DoorAttemptResult,
  type DoorAction,
  type DoorAttemptEffects,
} from './door-open.js';

// Door-record decoder — pure type-7 special-record extractor (#089)
export { decodeDoorRecords, SPECIAL_RECORD_BANK } from './door-record.js';

// Session door-state overlay — mutable per-session opened/welded edge map (#089)
export { DoorStateOverlay } from './door-state.js';

// Shared types
export type { MazeSpan, CompositorCall } from './compositor.js';
export type { MazeWorkBuffer, MazeImageDesc, MazePlacement } from './maze-data.js';
export type { BackgroundCall, CallList } from './callist.js';
