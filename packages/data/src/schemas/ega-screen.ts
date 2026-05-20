import { z } from 'zod';

const PLANE_BYTES = 8000; // 40 × 200
const TRAILER_BYTES = 256;
const WIDTH = 320;
const HEIGHT = 200;

const byteSchema = z.number().int().min(0).max(255);
const planeSchema = z.array(byteSchema).length(PLANE_BYTES);

export const EgaScreenSchema = z.object({
  id: z.string().min(1),
  sourceFile: z.string().min(1),
  width: z.literal(WIDTH),
  height: z.literal(HEIGHT),
  planes: z.array(planeSchema).length(4),
  trailer: z.array(byteSchema).length(TRAILER_BYTES),
});

export type EgaScreen = z.infer<typeof EgaScreenSchema>;
