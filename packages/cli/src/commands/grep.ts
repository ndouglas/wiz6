import { parseArgs } from 'node:util';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resolveOriginalDir } from '../lib/loaders.js';
import type { CliIO } from '../index.js';

interface GrepOpts {
  cwd: string;
  io: CliIO;
}

function parseHexPattern(s: string): Uint8Array {
  const cleaned = s.trim().replace(/\s+/g, '');
  if (!/^[0-9a-fA-F]+$/.test(cleaned) || cleaned.length % 2 !== 0) {
    throw new Error(`bad hex pattern: ${s}`);
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function findAll(haystack: Uint8Array, needle: Uint8Array): number[] {
  if (needle.length === 0) return [];
  const hits: number[] = [];
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) hits.push(i);
  }
  return hits;
}

function context(bytes: Uint8Array, offset: number, length: number, width = 40): string {
  const start = Math.max(0, offset - 8);
  const end = Math.min(bytes.length, offset + length + 16);
  const slice = bytes.subarray(start, end);
  let out = '';
  for (const b of slice) {
    if (b >= 0x20 && b < 0x7f) out += String.fromCharCode(b);
    else out += '.';
  }
  if (out.length > width) out = out.slice(0, width);
  return out;
}

export function runGrepCommand(args: readonly string[], opts: GrepOpts): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      options: {
        original: { type: 'string' },
        hex: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: true,
    });
  } catch (err) {
    opts.io.writeErr(`bad args: ${(err as Error).message}\n`);
    return 1;
  }

  const pattern = parsed.positionals[0];
  if (!pattern) {
    opts.io.writeErr(`usage: wiz6 grep <pattern> [--hex]\n`);
    return 1;
  }

  let needle: Uint8Array;
  if (parsed.values.hex === true) {
    try {
      needle = parseHexPattern(pattern);
    } catch (err) {
      opts.io.writeErr(`${(err as Error).message}\n`);
      return 1;
    }
  } else {
    needle = new TextEncoder().encode(pattern);
  }

  let originalDir: string;
  try {
    originalDir = resolveOriginalDir({
      cwd: opts.cwd,
      override: (parsed.values.original as string | undefined) ?? null,
    });
  } catch (err) {
    opts.io.writeErr(`${(err as Error).message}\n`);
    return 1;
  }

  const entries = readdirSync(originalDir);
  let totalHits = 0;
  for (const name of entries.sort()) {
    const path = join(originalDir, name);
    if (!statSync(path).isFile()) continue;
    const bytes = new Uint8Array(readFileSync(path));
    const hits = findAll(bytes, needle);
    for (const off of hits) {
      opts.io.write(`${name}:${off}  ${context(bytes, off, needle.length)}\n`);
      totalHits++;
    }
  }
  return totalHits > 0 ? 0 : 1;
}
