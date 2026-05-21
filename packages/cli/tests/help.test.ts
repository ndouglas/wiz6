import { describe, expect, it } from 'vitest';
import { run } from '../src/index.js';

function capture(args: readonly string[]): { code: number; stdout: string; stderr: string } {
  let stdout = '';
  let stderr = '';
  const code = run([...args], {
    write: (s) => {
      stdout += s;
    },
    writeErr: (s) => {
      stderr += s;
    },
  });
  return { code, stdout, stderr };
}

describe('wiz6 CLI', () => {
  it('prints usage when called with no args (exit 1)', () => {
    const { code, stderr } = capture([]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/usage/i);
    expect(stderr).toMatch(/list/i);
    expect(stderr).toMatch(/show/i);
    expect(stderr).toMatch(/grep/i);
    expect(stderr).toMatch(/extract/i);
  });

  it('prints help on --help (exit 0)', () => {
    const { code, stdout } = capture(['--help']);
    expect(code).toBe(0);
    expect(stdout).toMatch(/usage/i);
  });

  it('prints help on -h (exit 0)', () => {
    const { code, stdout } = capture(['-h']);
    expect(code).toBe(0);
    expect(stdout).toMatch(/usage/i);
  });

  it('exits 1 on unknown subcommand', () => {
    const { code, stderr } = capture(['nope']);
    expect(code).toBe(1);
    expect(stderr).toMatch(/unknown subcommand/i);
  });
});
