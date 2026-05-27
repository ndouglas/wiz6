import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { run } from '../../src/index.js';

const REPO_ROOT = resolve(__dirname, '../../../..');
// Vendored pristine game files — decoupled from the DOSBox-mutable original/.
const REAL_DBS = join(REPO_ROOT, 'test-fixtures', 'original', 'scenario.dbs');

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
  tmpDir = mkdtempSync(join(tmpdir(), 'wiz6-cli-show-'));
  mkdirSync(join(tmpDir, 'original'));
  copyFileSync(REAL_DBS, join(tmpDir, 'original/scenario.dbs'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('wiz6 show monster', () => {
  it('prints a monster by slug', () => {
    const { code, stdout } = capture(['show', 'monster', 'rat'], tmpDir);
    expect(code).toBe(0);
    expect(stdout).toMatch(/RAT/);
    expect(stdout).toMatch(/xpOnKill/);
  });

  it('prints a monster by numeric index', () => {
    const { code, stdout } = capture(['show', 'monster', '0'], tmpDir);
    expect(code).toBe(0);
    expect(stdout).toMatch(/RAT/);
  });

  it('emits --json output', () => {
    const { code, stdout } = capture(['show', 'monster', 'rat', '--json'], tmpDir);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.nameIdSingular).toBe('RAT');
    expect(parsed.statBytes).toHaveLength(158);
  });

  it('exits 1 on unknown slug', () => {
    const { code, stderr } = capture(['show', 'monster', 'no-such-monster'], tmpDir);
    expect(code).toBe(1);
    expect(stderr).toMatch(/no monster matches/i);
  });

  it('rejects an unknown type', () => {
    const { code, stderr } = capture(['show', 'bogus', 'whatever'], tmpDir);
    expect(code).toBe(1);
    expect(stderr).toMatch(/unknown.*type/i);
  });
});
