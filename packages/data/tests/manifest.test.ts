import { describe, expect, it } from 'vitest';
import { ManifestSchema, type Manifest } from '../src/index.js';

describe('ManifestSchema', () => {
  it('accepts a valid manifest', () => {
    const valid: Manifest = {
      schemaVersion: 1,
      generatedAt: '2026-05-19T00:00:00Z',
      sourceChecksum: 'abc123',
      assets: [],
    };
    expect(() => ManifestSchema.parse(valid)).not.toThrow();
  });

  it('rejects a manifest missing schemaVersion', () => {
    const invalid = {
      generatedAt: '2026-05-19T00:00:00Z',
      sourceChecksum: 'abc123',
      assets: [],
    };
    expect(() => ManifestSchema.parse(invalid)).toThrow();
  });
});
