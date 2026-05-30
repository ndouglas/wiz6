import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveCapturesDir } from '../../src/dosbox/captures-dir.js';

describe('resolveCapturesDir', () => {
  it('reads `[render] captures=` from a wiz6.conf file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-captures-test-'));
    try {
      const conf = join(dir, 'wiz6.conf');
      writeFileSync(conf, [
        '[sdl]',
        'output = opengl',
        '',
        '[render]',
        'captures = /tmp/my-captures',
        'aspect = true',
      ].join('\n'));
      expect(resolveCapturesDir(conf)).toBe('/tmp/my-captures');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns default ~/Documents/DOSBox-X if no captures= line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-captures-test-'));
    try {
      const conf = join(dir, 'wiz6.conf');
      writeFileSync(conf, '[render]\naspect = true\n');
      const got = resolveCapturesDir(conf);
      expect(got).toMatch(/Documents\/DOSBox-X$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws if conf file is missing', () => {
    expect(() => resolveCapturesDir('/no/such/file.conf')).toThrow(/captures path/);
  });
});
