import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DecodedPcfileSchema } from '@wiz6/data';
import { extractPcfile } from '../../src/extractors/extract-pcfile.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..', '..');
const PCFILE_SRC = join(REPO_ROOT, 'original', 'pcfile.dbs');

describe('extractPcfile', () => {
  it('reads pcfile.dbs and writes decoded JSON', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wiz6-pcfile-'));
    try {
      const out = join(tmpDir, 'pcfile.json');
      const decoded = extractPcfile({ originalPath: PCFILE_SRC, outputPath: out });

      expect(decoded.header.slotCount).toBe(16);
      expect(decoded.header.recordSize).toBe(0x1b0);
      expect(decoded.header.headerSize).toBe(24);

      const populated = decoded.slots.filter((s) => s.populated);
      expect(populated.length).toBe(6);
      expect(populated.map((s) => s.name)).toEqual(['THESUS', 'TEMPEST', 'LYSANDR', 'NOBAL', 'TREON', 'PENTAG']);

      const written = JSON.parse(readFileSync(out, 'utf8'));
      expect(() => DecodedPcfileSchema.parse(written)).not.toThrow();
      expect(written.header.recordSize).toBe(0x1b0);
      expect(
        written.slots
          .filter((s: { populated: boolean }) => s.populated)
          .map((s: { name: string }) => s.name)
      ).toEqual(['THESUS', 'TEMPEST', 'LYSANDR', 'NOBAL', 'TREON', 'PENTAG']);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates parent directories for the output path', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wiz6-pcfile-mkdir-'));
    try {
      const out = join(tmpDir, 'a', 'b', 'c', 'pcfile.json');
      const decoded = extractPcfile({ originalPath: PCFILE_SRC, outputPath: out });
      expect(decoded.header.slotCount).toBe(16);
      const written = JSON.parse(readFileSync(out, 'utf8'));
      expect(written.header.slotCount).toBe(16);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
