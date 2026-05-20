import { z } from 'zod';

// One decompressed record from msg.dbs (the underlying length-prefixed blocks).
export const MessageRecordSchema = z.object({
  index: z.number().int().nonnegative(),
  compressedBytes: z.number().int().nonnegative(),
  decodedText: z.string(),
});

// One individually-indexed message resolved through msg.hdr (Stage 1g.1).
// Each entry is a slice of a section's decoded bit stream.
//
// `decodedText` is the raw slice — Stage 1g.2 investigation showed it
// usually has 1-8 chars of leading noise (probably a per-message header
// or bit-stream resync artifact whose semantics we haven't decoded).
// `cleanedText` applies a heuristic strip — see decoder for details.
export const IndexedMessageSchema = z.object({
  index: z.number().int().nonnegative(),
  byteOffset: z.number().int().nonnegative(),   // col_a — byte offset in msg.dbs (bit-stream model)
  charOffset: z.number().int().nonnegative(),   // col_b — char offset within the section
  raw: z.number().int().nonnegative(),          // col_c — raw value; semantics TBD
  sectionIndex: z.number().int().nonnegative(),
  decodedText: z.string(),
  cleanedText: z.string(),
});

export const MessageDbSchema = z.object({
  id: z.string().min(1),
  sourceFile: z.string().min(1),
  treeSourceFile: z.string().min(1),
  indexSourceFile: z.string().min(1),
  recordCount: z.number().int().nonnegative(),
  records: z.array(MessageRecordSchema),
  indexedCount: z.number().int().nonnegative(),
  indexedMessages: z.array(IndexedMessageSchema),
}).refine((m) => m.recordCount === m.records.length, {
  message: 'recordCount must equal records.length',
  path: ['recordCount'],
}).refine((m) => m.indexedCount === m.indexedMessages.length, {
  message: 'indexedCount must equal indexedMessages.length',
  path: ['indexedCount'],
});

export type MessageRecord = z.infer<typeof MessageRecordSchema>;
export type IndexedMessage = z.infer<typeof IndexedMessageSchema>;
export type MessageDb = z.infer<typeof MessageDbSchema>;
