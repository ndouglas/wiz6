import { z } from 'zod';

const RECORD_BYTES = 64;

const byteSchema = z.number().int().min(0).max(255);
const recordBytes = z.array(byteSchema).length(RECORD_BYTES);

export const NewgameRecordSchema = z.object({
  index: z.number().int().nonnegative(),
  bytes: recordBytes,
  empty: z.boolean(),
});

export const NewgameDbSchema = z
  .object({
    id: z.string().min(1),
    sourceFile: z.string().min(1),
    recordCount: z.number().int().positive(),
    records: z.array(NewgameRecordSchema),
  })
  .refine((d) => d.recordCount === d.records.length, {
    message: 'recordCount must equal records.length',
    path: ['recordCount'],
  })
  .refine((d) => d.records.every((r, i) => r.index === i), {
    message: 'records must be indexed sequentially from 0',
    path: ['records'],
  });

export type NewgameRecord = z.infer<typeof NewgameRecordSchema>;
export type NewgameDb = z.infer<typeof NewgameDbSchema>;
