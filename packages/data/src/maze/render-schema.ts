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

export const PieceDescriptorSchema = z.object({
  srcPtr: z.number().int(), w: z.number().int(), h: z.number().int(),
  presenceBitmap: z.instanceof(Uint8Array),
});
export type PieceDescriptor = z.infer<typeof PieceDescriptorSchema>;

export const MazeRenderAssetsSchema = z.object({
  atlas: z.instanceof(Uint8Array),
  pieceDescriptors: z.array(PieceDescriptorSchema),
});
export type MazeRenderAssets = z.infer<typeof MazeRenderAssetsSchema>;
