#!/usr/bin/env -S pnpm tsx
/**
 * save-state-diff — diff two DOSBox-X save-state Memory blobs.
 *
 * Reports byte offsets that differ, grouped into contiguous runs.
 *
 * Usage:
 *   pnpm tsx tools/parity/save-state-diff.ts <save-a> <save-b>
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export interface DiffRun {
  start: number;
  length: number;
  oldBytes: number[];
  newBytes: number[];
}

export function diffMemoryBlobs(a: Uint8Array, b: Uint8Array): DiffRun[] {
  const len = Math.min(a.length, b.length);
  const runs: DiffRun[] = [];
  let inRun = false;
  let runStart = 0;
  for (let i = 0; i <= len; i++) {
    const differ = i < len && a[i] !== b[i];
    if (differ && !inRun) {
      inRun = true;
      runStart = i;
    } else if (!differ && inRun) {
      runs.push({
        start: runStart,
        length: i - runStart,
        oldBytes: Array.from(a.slice(runStart, i)),
        newBytes: Array.from(b.slice(runStart, i)),
      });
      inRun = false;
    }
  }
  return runs;
}

function loadMemory(savPath: string): Uint8Array {
  const r = spawnSync('unzip', ['-p', savPath, 'Memory'], { maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`unzip -p ${savPath} Memory failed: ${r.stderr?.toString()}`);
  }
  return new Uint8Array(r.stdout);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [argA, argB] = process.argv.slice(2);
  if (!argA || !argB) {
    console.error('usage: pnpm tsx tools/parity/save-state-diff.ts <save-a> <save-b>');
    process.exit(1);
  }
  const a = loadMemory(resolve(argA));
  const b = loadMemory(resolve(argB));
  const runs = diffMemoryBlobs(a, b);
  console.log(`memory length: a=${a.length}, b=${b.length}`);
  console.log(`diff runs: ${runs.length}`);
  for (const run of runs.slice(0, 100)) {
    const oldHex = run.oldBytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const newHex = run.newBytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
    console.log(
      `  0x${run.start.toString(16)}..0x${(run.start + run.length - 1).toString(16)} (${run.length} bytes)`,
    );
    console.log(`    old: ${oldHex}`);
    console.log(`    new: ${newHex}`);
  }
  if (runs.length > 100) console.log(`  ... and ${runs.length - 100} more runs`);
}
