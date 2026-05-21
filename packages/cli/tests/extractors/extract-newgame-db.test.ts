import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractNewgameDb } from '../../src/extractors/extract-newgame-db.js';

describe('extractNewgameDb', () => {
  it('reads a 49856-byte file and writes JSON with 779 records', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-newgame-'));
    const dbsPath = join(dir, 'newgame.dbs');
    const outputPath = join(dir, 'out', 'newgame.json');

    const bytes = new Uint8Array(49856);
    bytes[0] = 0xab; // record 0 non-empty
    writeFileSync(dbsPath, bytes);

    const db = extractNewgameDb({
      originalPath: dbsPath,
      outputPath,
      id: 'newgame',
    });
    expect(db.recordCount).toBe(779);

    const written = JSON.parse(readFileSync(outputPath, 'utf-8'));
    expect(written.id).toBe('newgame');
    expect(written.records).toHaveLength(779);
    expect(written.records[0].empty).toBe(false);
    expect(written.records[1].empty).toBe(true);
  });
});
