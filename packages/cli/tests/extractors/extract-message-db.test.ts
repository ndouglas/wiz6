import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractMessageDb } from '../../src/extractors/extract-message-db.js';

describe('extractMessageDb', () => {
  it('reads dbs + tree + hdr from disk and writes JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-msg-'));
    const dbsPath = join(dir, 'msg.dbs');
    const treePath = join(dir, 'misc.hdr');
    const indexPath = join(dir, 'msg.hdr');
    const outputPath = join(dir, 'out', 'msg.json');

    // Toy tree (1024 bytes): root.left=A, root.right=B.
    const tree = new Uint8Array(1024);
    tree[0] = 0x41; tree[2] = 0x42;
    writeFileSync(treePath, tree);

    // One length-prefixed record: length=2, payload=0x55 -> ABABABAB.
    writeFileSync(dbsPath, new Uint8Array([0x02, 0x55]));

    // Empty msg.hdr (count=0).
    writeFileSync(indexPath, new Uint8Array([0x00, 0x00]));

    const db = extractMessageDb({
      dbsPath, treePath, indexPath, outputPath, id: 'msg',
    });
    expect(db.recordCount).toBe(1);
    expect(db.records[0]?.decodedText).toBe('ABABABAB');
    expect(db.indexedCount).toBe(0);

    const written = JSON.parse(readFileSync(outputPath, 'utf-8'));
    expect(written.id).toBe('msg');
    expect(written.sourceFile).toBe('msg.dbs');
    expect(written.treeSourceFile).toBe('misc.hdr');
    expect(written.indexSourceFile).toBe('msg.hdr');
    expect(written.records).toHaveLength(1);
    expect(written.indexedMessages).toHaveLength(0);
  });
});
