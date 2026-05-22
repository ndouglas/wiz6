// Decode a .pic file and write the raw decoded buffer (no JSON envelope).
// Output is the byte-for-byte engine view: 600-byte descriptor table + cell atlas.
// Used to byte-compare against a DOSBox-X save-state memory dump of the engine's buffer.
//
// Invoke: pnpm tsx tools/parity/decode-pic.ts <input.pic> <output.bin>

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { decodePic } from '../../packages/parser/src/index.js';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('usage: pnpm tsx tools/parity/decode-pic.ts <input.pic> <output.bin>');
  process.exit(1);
}

const bytes = new Uint8Array(readFileSync(input));
const pic = decodePic(bytes, { id: 'parity', sourceFile: basename(input) });
const decoded = Buffer.from(pic.segments[0]!.decodedBytes);
writeFileSync(output, decoded);
console.error(`wrote ${decoded.length} bytes to ${output}`);
