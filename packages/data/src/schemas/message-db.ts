import { z } from 'zod';

// One decompressed record from msg.dbs.
export const MessageRecordSchema = z.object({
  index: z.number().int().nonnegative(),
  compressedBytes: z.number().int().nonnegative(),
  decodedText: z.string(),
});

export const MessageDbSchema = z.object({
  id: z.string().min(1),
  sourceFile: z.string().min(1),
  treeSourceFile: z.string().min(1),
  recordCount: z.number().int().nonnegative(),
  records: z.array(MessageRecordSchema),
}).refine((m) => m.recordCount === m.records.length, {
  message: 'recordCount must equal records.length',
  path: ['recordCount'],
});

export type MessageRecord = z.infer<typeof MessageRecordSchema>;
export type MessageDb = z.infer<typeof MessageDbSchema>;
