import { z } from 'zod';

export const ManifestAssetSchema = z.object({
  kind: z.string(),
  id: z.string(),
  path: z.string(),
  sourceFile: z.string(),
  sourceOffset: z.number().int().nonnegative().optional(),
  sourceLength: z.number().int().nonnegative().optional(),
});

export const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  sourceChecksum: z.string(),
  assets: z.array(ManifestAssetSchema),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestAsset = z.infer<typeof ManifestAssetSchema>;
