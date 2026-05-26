#!/usr/bin/env node
// Parity harness for the 432-byte character record.
//
// Two modes:
//
//   extract --pcfile <path/pcfile.dbs> --slot <0..15> [--output <file>]
//     Read the raw 432-byte record for a given slot from pcfile.dbs and write
//     it to a file (or hex-dump to stdout). Also re-encodes via
//     encodeCharacterRecord(decodePcfile(...)) and can produce the re-encoded
//     binary for static round-trip validation.
//
//   compare <file_a> <file_b> [--context <n>]
//     Byte-diff two 432-byte records and exit 0 on MATCH, 1 on DIVERGENCE.
//     Delegates formatting to diff.py (shells out) so the output format is
//     consistent with all other parity checks.
//
// Future mode (blocked — see docs):
//   extract --save <path/N.sav> --slot <i>
//     Pull the live-engine character record from a DOSBox-X save state.
//     Requires a creation-commit save state that does not yet exist.
//
// Invoke: pnpm tsx tools/parity/decode-character.ts <mode> [args...]
//
// See tools/parity/README.md for the full recipe.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePcfile, encodeCharacterRecord } from '../../packages/parser/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIFF_PY = resolve(__dirname, 'diff.py');
const RECORD_SIZE = 0x1b0; // 432 bytes

// ─── helpers ───────────────────────────────────────────────────────────────

function hexDump(bytes: Uint8Array, label: string): void {
  const COLS = 16;
  console.error(`${label} (${bytes.length} bytes):`);
  for (let i = 0; i < bytes.length; i += COLS) {
    const chunk = bytes.subarray(i, i + COLS);
    const hex = Array.from(chunk)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    const addr = i.toString(16).padStart(4, '0');
    console.log(`  ${addr}  ${hex}`);
  }
}

function parseIntArg(name: string, value: string): number {
  const n = parseInt(value, 10);
  if (isNaN(n)) {
    console.error(`error: ${name} must be an integer, got: ${value}`);
    process.exit(2);
  }
  return n;
}

// ─── extract mode ──────────────────────────────────────────────────────────

function cmdExtract(argv: string[]): void {
  // Parse: --pcfile <path> --slot <i> [--output <file>] [--re-encoded]
  let pcfilePath: string | null = null;
  let slotIndex: number | null = null;
  let outputPath: string | null = null;
  let reEncoded = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--pcfile' && argv[i + 1]) {
      pcfilePath = argv[++i]!;
    } else if (a === '--slot' && argv[i + 1]) {
      slotIndex = parseIntArg('--slot', argv[++i]!);
    } else if (a === '--output' && argv[i + 1]) {
      outputPath = argv[++i]!;
    } else if (a === '--re-encoded') {
      reEncoded = true;
    } else {
      console.error(`error: unrecognised argument: ${a}`);
      process.exit(2);
    }
  }

  if (!pcfilePath || slotIndex === null) {
    console.error('usage: decode-character.ts extract --pcfile <path> --slot <0..15> [--output <file>] [--re-encoded]');
    process.exit(2);
  }
  if (slotIndex < 0 || slotIndex > 15) {
    console.error(`error: --slot must be 0..15, got: ${slotIndex}`);
    process.exit(2);
  }

  const bytes = new Uint8Array(readFileSync(pcfilePath));
  const decoded = decodePcfile(bytes);

  const slot = decoded.slots[slotIndex]!;
  const headerSize = 24;
  const rawRecord = bytes.subarray(headerSize + slotIndex * RECORD_SIZE, headerSize + (slotIndex + 1) * RECORD_SIZE);

  let record: Uint8Array;
  if (reEncoded) {
    // Re-encode path: validates the round-trip via encodeCharacterRecord
    record = encodeCharacterRecord(slot);
    console.error(`slot ${slotIndex}: re-encoded via encodeCharacterRecord (${record.length} bytes)`);
    if (slot.name !== null) {
      console.error(`  name: "${slot.name}", class: ${slot.class}, race: ${slot.race}`);
    }
  } else {
    // Raw path: direct bytes from pcfile.dbs
    record = rawRecord;
    console.error(`slot ${slotIndex}: raw bytes from pcfile.dbs (${record.length} bytes)`);
    if (slot.name !== null) {
      console.error(`  name: "${slot.name}", class: ${slot.class}, race: ${slot.race}`);
    }
  }

  if (outputPath) {
    writeFileSync(outputPath, record);
    console.error(`wrote ${record.length} bytes to ${outputPath}`);
  } else {
    hexDump(record, `slot ${slotIndex}${reEncoded ? ' (re-encoded)' : ''}`);
  }
}

// ─── compare mode ──────────────────────────────────────────────────────────

function cmdCompare(argv: string[]): void {
  // Parse: <file_a> <file_b> [--context <n>]
  const positional: string[] = [];
  let context = 32;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--context' && argv[i + 1]) {
      context = parseIntArg('--context', argv[++i]!);
    } else if (!a.startsWith('--')) {
      positional.push(a);
    } else {
      console.error(`error: unrecognised argument: ${a}`);
      process.exit(2);
    }
  }

  if (positional.length !== 2) {
    console.error('usage: decode-character.ts compare <file_a> <file_b> [--context <n>]');
    process.exit(2);
  }

  const [fileA, fileB] = positional as [string, string];

  // Validate sizes before diffing
  const bytesA = readFileSync(fileA);
  const bytesB = readFileSync(fileB);

  if (bytesA.length !== RECORD_SIZE || bytesB.length !== RECORD_SIZE) {
    console.error(`warning: expected ${RECORD_SIZE}-byte records`);
    console.error(`  ${fileA}: ${bytesA.length} bytes`);
    console.error(`  ${fileB}: ${bytesB.length} bytes`);
  }

  // Delegate to diff.py for consistent output format
  try {
    execFileSync('python3', [DIFF_PY, fileA, fileB, '--context', String(context)], {
      stdio: 'inherit',
    });
    // diff.py exited 0 → MATCH
    process.exit(0);
  } catch (err: unknown) {
    // diff.py exits 1 on divergence, 2 on I/O error
    const exitCode = (err as NodeJS.ErrnoException & { status?: number }).status ?? 1;
    process.exit(exitCode);
  }
}

// ─── main ──────────────────────────────────────────────────────────────────

const [, , mode, ...rest] = process.argv;

switch (mode) {
  case 'extract':
    cmdExtract(rest);
    break;
  case 'compare':
    cmdCompare(rest);
    break;
  default:
    console.error(`
usage: pnpm tsx tools/parity/decode-character.ts <mode> [args...]

Modes:
  extract  --pcfile <path> --slot <0..15> [--output <file>] [--re-encoded]
             Dump a 432-byte character record from pcfile.dbs.
             Without --re-encoded: raw bytes from disk.
             With    --re-encoded: re-encoded via encodeCharacterRecord (validates round-trip).

  compare  <file_a> <file_b> [--context <n>]
             Byte-diff two 432-byte records. Exit 0 = match, 1 = divergence.

Future (BLOCKED — requires creation-commit save state):
  extract  --save <path/N.sav> --slot <i>
             Read the live-engine character record from a DOSBox-X save state.
             See README.md "Character-creation parity" for the capture procedure.
`);
    process.exit(2);
}
