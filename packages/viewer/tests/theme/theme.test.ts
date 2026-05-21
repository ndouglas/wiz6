import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const themePath = resolve(here, '../../src/theme/theme.css');

describe('theme.css', () => {
  const css = readFileSync(themePath, 'utf8');

  it.each([
    '--color-bg',
    '--color-surface',
    '--color-surface-elevated',
    '--color-border',
    '--color-border-strong',
    '--color-text',
    '--color-text-muted',
    '--color-text-faint',
    '--color-accent',
    '--color-class-1',
    '--color-class-2',
    '--color-class-3',
    '--color-class-4',
    '--color-element-fire',
    '--color-element-cold',
    '--color-element-poison',
    '--color-element-mental',
    '--color-heatmap-cold',
    '--color-heatmap-hot',
    '--color-immunity-glow',
  ])('defines token %s on :root', (token) => {
    const pattern = new RegExp(`${token.replace(/-/g, '\\-')}\\s*:`);
    expect(css).toMatch(pattern);
  });

  it('declares the tokens on :root', () => {
    expect(css).toMatch(/:root\s*\{/);
  });
});
