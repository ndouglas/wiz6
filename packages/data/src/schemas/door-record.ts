import { z } from 'zod';

/** A type-7 forceable/pickable door, decoded from the maze special-record table.
 *  `facing` 0..3 is the edge the door sits on (N/E/S/W). `welded` = engine edge
 *  code 2 (the "jammed" state neither FORCE nor PICK can open). lockStrength is
 *  the 5-bit field at record +0x630 (0..31). */
export const DoorRecordSchema = z.object({
  gx: z.number().int(),
  gy: z.number().int(),
  facing: z.number().int().min(0).max(3),
  lockStrength: z.number().int().min(0).max(31),
  welded: z.boolean(),
});
export type DoorRecord = z.infer<typeof DoorRecordSchema>;
