import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../../src/index.js';

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
  tmpDir = mkdtempSync(join(tmpdir(), 'wiz6-cli-grep-'));
  mkdirSync(join(tmpDir, 'original'));
  writeFileSync(
    join(tmpDir, 'original/foo.dbs'),
    Buffer.concat([
      Buffer.alloc(100, 0),
      Buffer.from('CAPTAIN MATEY\0', 'latin1'),
      Buffer.alloc(50, 0xff),
    ]),
  );
  writeFileSync(
    join(tmpDir, 'original/bar.dbs'),
    Buffer.concat([
      Buffer.alloc(64, 0),
      Buffer.from([0x00, 0x01, 0x02, 0x03]),
      Buffer.alloc(20, 0),
    ]),
  );
  writeFileSync(
    join(tmpDir, 'original/baz.txt'),
    Buffer.from('some text without the pattern', 'latin1'),
  );
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('wiz6 grep', () => {
  it('finds an ASCII string and reports file:offset', () => {
    const { code, stdout } = capture(['grep', 'CAPTAIN MATEY'], tmpDir);
    expect(code).toBe(0);
    expect(stdout).toMatch(/foo\.dbs:100/);
  });

  it('finds a hex byte sequence with --hex', () => {
    const { code, stdout } = capture(['grep', '--hex', '00 01 02 03'], tmpDir);
    expect(code).toBe(0);
    expect(stdout).toMatch(/bar\.dbs:64/);
  });

  it('exits 1 when nothing matches', () => {
    const { code, stdout } = capture(['grep', 'NOPE'], tmpDir);
    expect(code).toBe(1);
    expect(stdout).toBe('');
  });

  it('exits 1 on missing pattern', () => {
    const { code, stderr } = capture(['grep'], tmpDir);
    expect(code).toBe(1);
    expect(stderr).toMatch(/usage|pattern/i);
  });

  it('rejects malformed --hex', () => {
    const { code, stderr } = capture(['grep', '--hex', 'not hex'], tmpDir);
    expect(code).toBe(1);
    expect(stderr).toMatch(/bad hex/i);
  });
});
