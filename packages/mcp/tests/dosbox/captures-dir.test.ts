import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveCapturesDir } from '../../src/dosbox/captures-dir.js';

describe('resolveCapturesDir', () => {
  it('reads `[dosbox] captures=` from a wiz6.conf file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-captures-test-'));
    try {
      const conf = join(dir, 'wiz6.conf');
      writeFileSync(conf, [
        '[sdl]',
        'output = opengl',
        '',
        '[dosbox]',
        'machine = svga_s3',
        'captures = /tmp/my-captures',
      ].join('\n'));
      expect(resolveCapturesDir(conf)).toBe('/tmp/my-captures');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ignores captures= in non-[dosbox] sections', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-captures-test-'));
    try {
      const conf = join(dir, 'wiz6.conf');
      writeFileSync(conf, [
        '[render]',
        'captures = /wrong/section',
        '[dosbox]',
        'captures = /right/section',
      ].join('\n'));
      expect(resolveCapturesDir(conf)).toBe('/right/section');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns default ~/Documents/DOSBox-X if no captures= line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiz6-captures-test-'));
    try {
      const conf = join(dir, 'wiz6.conf');
      writeFileSync(conf, '[dosbox]\nmachine = svga_s3\n');
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
