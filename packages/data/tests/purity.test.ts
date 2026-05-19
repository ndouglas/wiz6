import { execSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('engine-purity eslint rule', () => {
  it('flags Node-only imports inside packages/data/src/**', () => {
    const repoRoot = join(import.meta.dirname, '..', '..', '..');
    const probePath = join(repoRoot, 'packages/data/src/__purity_probe.ts');
    writeFileSync(probePath, "import { readFileSync } from 'node:fs';\nconsole.log(readFileSync);\n");
    try {
      let output = '';
      try {
        execSync(`pnpm exec eslint ${probePath}`, { cwd: repoRoot, encoding: 'utf8' });
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string };
        output = (e.stdout ?? '') + (e.stderr ?? '');
      }
      expect(output).toMatch(/no-restricted-imports/);
    } finally {
      rmSync(probePath, { force: true });
    }
  });
});
