/**
 * Locate the directory where DOSBox-X writes screenshot captures. Reads
 * `[render] captures=` from a wiz6.conf-style ini file; falls back to the
 * DOSBox-X default `~/Documents/DOSBox-X`.
 *
 * Spec: docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_CAPTURES_DIR = join(homedir(), 'Documents', 'DOSBox-X');

export function resolveCapturesDir(confPath: string): string {
  if (!existsSync(confPath)) {
    throw new Error(`captures path: wiz6.conf not found at ${confPath}`);
  }
  const lines = readFileSync(confPath, 'utf-8').split('\n');
  let inRender = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('[') && line.endsWith(']')) {
      inRender = line === '[render]';
      continue;
    }
    if (!inRender) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key === 'captures') return value;
  }
  return DEFAULT_CAPTURES_DIR;
}
