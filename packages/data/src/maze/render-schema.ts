import { z } from 'zod';

export const PartySchema = z.object({
  x: z.number().int().min(0), y: z.number().int().min(0), z: z.number().int().min(0),
  facing: z.number().int().min(0).max(3),
});
export type Party = z.infer<typeof PartySchema>;

/** One cell's wall data as the engine stores it (2-bit N/W fields, 0=open 2=solid; + pit). */
export const CellWallsSchema = z.object({
  north: z.number().int(), west: z.number().int(), pit: z.boolean().default(false),
});
export const MazeCellWallsSchema = z.object({
  // keyed by cell index = z*64 + y*8 + x (sparse: only the cells the projection reads).
  cells: z.record(z.coerce.number().int(), CellWallsSchema),
});
export type MazeCellWalls = z.infer<typeof MazeCellWallsSchema>;

// ---------------------------------------------------------------------------
// MazeBlock — the FULL per-zone maze block as the engine's CLASSIFY stage reads
// it (orient2-aware, multi-region). This is the corrected, complete input model
// the old single-grid MazeCellWalls could not express:
//   docs/re/findings/maze-classify-gating.json (prong3: single grid insufficient)
//   docs/re/findings/maze-classify-determinism.json (corrected per-facing reads)
//   docs/re/findings/maze-emit-gate-closed.json (orient2 front gate)
//
// The engine tiles the map into per-region 64-cell PLANES (each region a separate
// 8×8 cell grid). A cell anywhere on the map is addressed by GLOBAL cell coords
// (gx, gy); the resolver (wmaze 0x357a/0x35b7) maps (gx,gy) -> the region r with
//   gxBase[r] <= gx <= gxBase[r]+7  AND  gyBase[r] <= gy <= gyBase[r]+7
// then localCellB = gx - gxBase[r], localCellA = gy - gyBase[r], and the plane
// cell index = r*64 + localCellA*8 + localCellB. Out-of-region = SOLID wall.
//
// Each cell carries five fields (the engine's sub-tables in maze_block):
//   north / west  : 2-bit wall fields (+0x60 / +0x120). 0=open, 2=solid, 1/3=door.
//   special4      : 4-bit decoration code (+0x1f8).
//   orient2       : 2-bit door/recess ORIENTATION (+0x378) — the per-facing emit
//                   discriminator (the front classifier's orientation gate).
//   pit           : 1-bit pit flag (+0x43a).
// All STATIC per-zone data — a pure function of the committed maze block.
// ---------------------------------------------------------------------------

/** One cell of a region plane (the five engine sub-table fields). */
export const MazeBlockCellSchema = z.object({
  north: z.number().int().min(0).max(3),
  west: z.number().int().min(0).max(3),
  special4: z.number().int().min(0).max(15),
  orient2: z.number().int().min(0).max(3),
  pit: z.number().int().min(0).max(1),
});
export type MazeBlockCell = z.infer<typeof MazeBlockCellSchema>;

export const MazeBlockSchema = z.object({
  // Region tables (maze_ptr+0x1e0 / +0x1ec). 12 entries each (regions 0..11).
  gxBase: z.array(z.number().int()),
  gyBase: z.array(z.number().int()),
  // Per-region 64-cell planes: regions[r][localCellA*8 + localCellB].
  regions: z.array(z.array(MazeBlockCellSchema)),
});
export type MazeBlock = z.infer<typeof MazeBlockSchema>;

/** Party as the CLASSIFY stage needs it: GLOBAL cell coords (gx, gy) + facing.
 *  gx = gxBase[region] + cellB; gy = gyBase[region] + cellA (so the depth/lateral
 *  view-steps move (gx,gy) by ±1 global cell and cross region planes correctly). */
export const MazePartySchema = z.object({
  gx: z.number().int().min(0),
  gy: z.number().int().min(0),
  z: z.number().int().min(0).default(0),
  facing: z.number().int().min(0).max(3),
});
export type MazeParty = z.infer<typeof MazePartySchema>;

export const PieceDescriptorSchema = z.object({
  srcPtr: z.number().int(), w: z.number().int(), h: z.number().int(),
  presenceBitmap: z.instanceof(Uint8Array),
});
export type PieceDescriptor = z.infer<typeof PieceDescriptorSchema>;

/** One tile's source atlas (descriptor-table + 4-plane source cells, 0x4000 B)
 *  + its parsed 0x18 piece descriptors. The wall compositor selects which tile's
 *  atlas to use per FUN_1c94 call via the call's `tile` arg (= span.walltype):
 *  the engine resolves it as cs:[0x17a+2*tile] + cs:[0x169] (a per-tile
 *  descriptor-table segment). docs/re/findings/maze-tile-atlas-extract.json. */
export const TileAtlasSchema = z.object({
  atlas: z.instanceof(Uint8Array),
  pieceDescriptors: z.array(PieceDescriptorSchema),
});
export type TileAtlas = z.infer<typeof TileAtlasSchema>;

export const MazeRenderAssetsSchema = z.object({
  /** The tile-2 atlas (BACK-COMPAT default; == atlasByTile[2].atlas). The corridor
   *  solid-wall path uses tile 2; older call sites pass this directly. */
  atlas: z.instanceof(Uint8Array),
  /** The tile-2 piece descriptors (BACK-COMPAT default; == atlasByTile[2].pieceDescriptors). */
  pieceDescriptors: z.array(PieceDescriptorSchema),
  /** Per-tile atlases keyed by tile index (0/1/2 = the wall tiles). The compositor
   *  selects the atlas+descriptors per call by the call's `tile` (= span.walltype).
   *  Tiles not present here fall back to the tile-2 atlas. */
  atlasByTile: z.record(z.coerce.number().int(), TileAtlasSchema).default({}),
  /** Raw `mazedata.ega` file bytes — the source for the from-asset background
   *  generator (expandMazeData → generateFullCallList → composeCallList). Threaded
   *  through the same asset pipeline as the atlas so free-roam can compose the
   *  floor/ceiling/walls/portcullis background page in the browser. */
  mazedata: z.instanceof(Uint8Array),
});
export type MazeRenderAssets = z.infer<typeof MazeRenderAssetsSchema>;

// ---------------------------------------------------------------------------
// BackgroundPlacement — one resolved floor/ceiling/side-panel/window OR-blit
// placement record for the maze background compositor (ega.drv DISPATCH ENTRY 15
// = FUN_0a93, the 4-plane planar OR-copy). Each record places ONE 4-plane planar
// sub-image into the off-screen compose page with an OR-merge, UNDER the wall
// pieces. The fields are exactly the asm's per-image quantities (the resolved
// product of a placement record @cs:[0x190] + its image descriptor @cs:[0x18e]):
//   docs/re/findings/maze-floor-ceiling-decoder.json
//
// The pixel data (`src`) is a 4-plane planar work buffer (the decompressed .pic
// asset); the 4 planes are CONTIGUOUS at src[si + p*planeStride]. See
// packages/parser/src/maze/background.ts (composeBackground) for the walk.
// ---------------------------------------------------------------------------
export const BackgroundPlacementSchema = z.object({
  /** 4-plane planar source work buffer (>= si + 4*planeStride). */
  src: z.instanceof(Uint8Array),
  /** plane-0 source byte offset (= imgdesc.srcOff + placement.bias). */
  si: z.number().int().min(0),
  /** dest page byte offset, plane 0, row 0 (= destX + bias + 0x28*destRow). */
  di: z.number().int().min(0),
  /** bytes copied per row (= placement.count; <= w). */
  cx: z.number().int().min(0),
  /** image width in bytes (= imgdesc.w; the source row stride). */
  w: z.number().int().min(0),
  /** number of rows (= imgdesc.h; the outer row count). */
  h: z.number().int().min(0),
  /** plane stride (= w*h). */
  planeStride: z.number().int().min(0),
});
export type BackgroundPlacement = z.infer<typeof BackgroundPlacementSchema>;

// MaskedMirrorPlacement — one resolved masked-MIRROR blit for the maze background
// compositor (ega.drv FUN_0a93 SECOND branch, file 0xbc6, taken when arg[bp+0x10]
// != 0xffff). It places a HORIZONTALLY-MIRRORED copy of one image into a dest
// placement's geometry: the source row is read BACKWARD (asm `dec si`) and each
// byte run through a CS:[0x192] 8-bit bit-reverse LUT — the two together mirror the
// sub-image horizontally (a perspective-pair: the right side panel mirrored into
// the left's geometry, etc.). A per-call flag selects OR-merge vs REPLACE.
//   docs/re/findings/maze-masked-mirror.json
//
// Asm-derived per-row geometry (file 0xbc6..0xd2e), byte-exact verified against the
// engine's live per-call page writes (call#0 full + calls 0..4 row-exact):
//   cx   = destPlacement.count                       ([bp-4])
//   di   = destPlacement.destX + destPlacement.bias + 0x28*destPlacement.destRow
//   siBase (plane 0, row 0) = srcImg.srcOffLow + (srcImg.w-1) - destPlacement.bias
//          within seg (dataSeg + srcImg.segDelta)
//   for row in 0..srcImg.h-1:
//     for p in 0..3:
//       for b in 0..cx-1:  v = bitrev(src[siBase + p*planeStride + row*srcImg.w - b])
//                          OR-merge: page[di+p*PS+row*0x28 + b] |= v
//                          REPLACE : page[di+p*PS+row*0x28 + b]  = v
// ---------------------------------------------------------------------------
export const MaskedMirrorPlacementSchema = z.object({
  /** 4-plane planar source work buffer (the SAME dataSeg as BackgroundPlacement). */
  src: z.instanceof(Uint8Array),
  /** plane-0 row-0 source byte offset of the LAST byte to read (mirror start). */
  siBase: z.number().int().min(0),
  /** dest page byte offset, plane 0, row 0 (from the DEST placement geometry). */
  di: z.number().int().min(0),
  /** bytes written per row (= dest placement.count). */
  cx: z.number().int().min(0),
  /** source row stride (= source image w). */
  w: z.number().int().min(0),
  /** number of rows (= source image h). */
  h: z.number().int().min(0),
  /** plane stride (= source w*h). */
  planeStride: z.number().int().min(0),
  /** merge mode: 'or' (flag != 0) OR-merges; 'replace' (flag 0) overwrites. */
  mode: z.enum(['or', 'replace']),
});
export type MaskedMirrorPlacement = z.infer<typeof MaskedMirrorPlacementSchema>;
