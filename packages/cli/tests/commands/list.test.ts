import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { run } from '../../src/index.js';

const REPO_ROOT = resolve(__dirname, '../../../..');
const REAL_DBS = join(REPO_ROOT, 'original/scenario.dbs');

function capture(args: readonly string[], cwd?: string): {
  code: number;
  stdout: string;
  stderr: string;
} {
  let stdout = '';
  let stderr = '';
  const origCwd = process.cwd();
  if (cwd) process.chdir(cwd);
  try {
    const code = run([...args], {
      write: (s) => {
        stdout += s;
      },
      writeErr: (s) => {
        stderr += s;
      },
    });
    return { code, stdout, stderr };
  } finally {
    process.chdir(origCwd);
  }
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'wiz6-cli-list-'));
  mkdirSync(join(tmpDir, 'original'));
  copyFileSync(REAL_DBS, join(tmpDir, 'original/scenario.dbs'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('wiz6 list monsters', () => {
  it('prints a table including known monsters', () => {
    const { code, stdout } = capture(['list', 'monsters'], tmpDir);
    expect(code).toBe(0);
    expect(stdout).toMatch(/RAT/);
    expect(stdout).toMatch(/ZOMBIE/);
  });

  it('--limit caps the row count', () => {
    const { code, stdout } = capture(['list', 'monsters', '--limit', '3'], tmpDir);
    expect(code).toBe(0);
    const dataLines = stdout.trim().split('\n').length - 1; // minus header
    expect(dataLines).toBeLessThanOrEqual(3);
  });

  it('--class filters by monsterClass', () => {
    const { code, stdout } = capture(['list', 'monsters', '--class', '3'], tmpDir);
    expect(code).toBe(0);
    const dataLines = stdout.trim().split('\n').length - 1;
    expect(dataLines).toBeLessThan(50);
    expect(dataLines).toBeGreaterThan(0);
  });

  it('--sort xp --dir desc orders by xp descending', () => {
    const { code, stdout } = capture(
      ['list', 'monsters', '--sort', 'xp', '--dir', 'desc', '--limit', '5'],
      tmpDir,
    );
    expect(code).toBe(0);
    const lines = stdout.trim().split('\n');
    expect(lines.length).toBeGreaterThan(2);
  });

  it('--json emits valid JSON array', () => {
    const { code, stdout } = capture(['list', 'monsters', '--json', '--limit', '5'], tmpDir);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeLessThanOrEqual(5);
    expect(parsed[0].nameIdSingular).toBeTruthy();
  });

  it('rejects an unknown type', () => {
    const { code, stderr } = capture(['list', 'bogus'], tmpDir);
    expect(code).toBe(1);
    expect(stderr).toMatch(/unknown.*type/i);
  });
});
