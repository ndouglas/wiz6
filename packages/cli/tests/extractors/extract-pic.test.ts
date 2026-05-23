import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractPic } from '../../src/extractors/extract-pic.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'wiz6-extract-pic-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('extractPic', () => {
  it('decodes a tiny synthetic .pic and writes JSON', () => {
    const src = join(tmpDir, 'mon00.pic');
    const out = join(tmpDir, 'mon00.json');
    // LIT(6) [58 02 03 05 ff 7f] RUN(18, 0x00) END
    // Decoded = 24 bytes [58 02 03 05 ff 7f 00 00 ...] → one descriptor record:
    //   pos = 0x0258, W = 3, H = 5, mask = [0xff, 0x7f, 0, 0, ..., 0]
    writeFileSync(src, Buffer.from([0x06, 0x58, 0x02, 0x03, 0x05, 0xff, 0x7f, 0xee, 0x00, 0x00]));
    const pic = extractPic({ originalPath: src, outputPath: out, id: 'mon00' });
    expect(pic.id).toBe('mon00');
    expect(pic.segments).toHaveLength(1);
    const written = JSON.parse(readFileSync(out, 'utf8'));
    expect(written.id).toBe('mon00');
    expect(written.descriptors).toHaveLength(1);
    expect(written.descriptors[0].pos).toBe(0x0258);
    expect(written.descriptors[0].width).toBe(3);
    expect(written.descriptors[0].height).toBe(5);
    // Old shape no longer present
    expect(written.segments[0].header).toBeUndefined();
  });

  it("emits palette: 'ega-default' in the extracted JSON", () => {
    const src = join(tmpDir, 'mon00.pic');
    const out = join(tmpDir, 'mon00.json');
    writeFileSync(src, Buffer.from([0x06, 0x58, 0x02, 0x03, 0x05, 0xff, 0x7f, 0xee, 0x00, 0x00]));
    const pic = extractPic({ originalPath: src, outputPath: out, id: 'mon00', emitPngs: false });
    expect(pic.palette).toBe('ega-default');
    const written = JSON.parse(readFileSync(out, 'utf8'));
    expect(written.palette).toBe('ega-default');
  });
});
