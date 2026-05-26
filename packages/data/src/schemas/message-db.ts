import { z } from 'zod';

// One decompressed record from msg.dbs (the underlying length-prefixed blocks).
export const MessageRecordSchema = z.object({
  index: z.number().int().nonnegative(),
  compressedBytes: z.number().int().nonnegative(),
  decodedText: z.string(),
});

// One individually-indexed message resolved through msg.hdr (bank-structured model).
// Each entry is a single decoded record from the 1KB bank indicated by msg.hdr.
//
// `id`          — integer message ID (e.g. 1130 for "CREATE PC")
// `rangeIndex`  — which range (row in msg.hdr) this message belongs to
// `bank`        — 1KB bank index into msg.dbs
// `offset`      — byte offset of the record within the bank
// `recordPos`   — absolute byte position in msg.dbs (bank * 1024 + offset)
// `decodedText` — Huffman-decoded text, exactly `decoded_len` chars
export const IndexedMessageSchema = z.object({
  id: z.number().int().nonnegative(),
  rangeIndex: z.number().int().nonnegative(),
  bank: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  recordPos: z.number().int().nonnegative(),
  decodedText: z.string(),
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
