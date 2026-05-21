import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { run } from '../../src/index.js';

const REPO_ROOT = resolve(__dirname, '../../../..');
const REAL_ORIGINAL = join(REPO_ROOT, 'original');

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
  tmpDir = mkdtempSync(join(tmpdir(), 'wiz6-cli-extract-'));
  mkdirSync(join(tmpDir, 'original'));
  // Copy the input files needed by the messages/newgame/scenario tests.
  // extractMessageDb requires msg.dbs + misc.hdr (huffman tree) + msg.hdr (index).
  for (const f of ['scenario.dbs', 'newgame.dbs', 'msg.dbs', 'misc.hdr', 'msg.hdr']) {
    const src = join(REAL_ORIGINAL, f);
    if (existsSync(src)) copyFileSync(src, join(tmpDir, 'original', f));
  }
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('wiz6 extract', () => {
  it('extracts scenario.dbs into extracted/scenario/scenario.json', () => {
    const { code } = capture(['extract', 'scenario'], tmpDir);
    expect(code).toBe(0);
    expect(existsSync(join(tmpDir, 'extracted/scenario/scenario.json'))).toBe(true);
  });

  it('extracts msg.dbs', () => {
    const { code } = capture(['extract', 'messages'], tmpDir);
    expect(code).toBe(0);
    expect(existsSync(join(tmpDir, 'extracted/messages/msg.json'))).toBe(true);
  });

  it('extracts newgame.dbs', () => {
    const { code } = capture(['extract', 'newgame'], tmpDir);
    expect(code).toBe(0);
    expect(existsSync(join(tmpDir, 'extracted/newgame/newgame.json'))).toBe(true);
  });

  it('rejects an unknown extract type', () => {
    const { code, stderr } = capture(['extract', 'bogus'], tmpDir);
    expect(code).toBe(1);
    expect(stderr).toMatch(/unknown/i);
  });

  it('exits 1 with usage when no type is given', () => {
    const { code, stderr } = capture(['extract'], tmpDir);
    expect(code).toBe(1);
    expect(stderr).toMatch(/usage/i);
  });
});
