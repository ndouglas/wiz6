import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveOriginalDir, readFileBytes } from '../../src/lib/loaders.js';

describe('resolveOriginalDir', () => {
  it('returns the given path if it points at a directory containing a known .dbs', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wiz6-cli-'));
    mkdirSync(join(tmp, 'original'));
    writeFileSync(join(tmp, 'original/scenario.dbs'), Buffer.alloc(10));
    expect(resolveOriginalDir({ cwd: tmp, override: null })).toBe(join(tmp, 'original'));
  });

  it('honours the --original override', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wiz6-cli-'));
    mkdirSync(join(tmp, 'somewhere'));
    writeFileSync(join(tmp, 'somewhere/scenario.dbs'), Buffer.alloc(10));
    expect(resolveOriginalDir({ cwd: '/totally/elsewhere', override: join(tmp, 'somewhere') })).toBe(
      join(tmp, 'somewhere'),
    );
  });

  it('throws a helpful error when no original/ is found', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wiz6-cli-empty-'));
    expect(() => resolveOriginalDir({ cwd: tmp, override: null })).toThrow(
      /no original\/ directory found/i,
    );
  });
});

describe('readFileBytes', () => {
  it('reads a binary file into a Uint8Array', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wiz6-cli-read-'));
    writeFileSync(join(tmp, 'b'), Buffer.from([0xab, 0xcd, 0xef]));
    const bytes = readFileBytes(join(tmp, 'b'));
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes)).toEqual([0xab, 0xcd, 0xef]);
  });
});
