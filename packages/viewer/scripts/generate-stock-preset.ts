#!/usr/bin/env tsx
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePcfile, pcfileSlotToCharacter } from '@wiz6/parser';
import { PcFileJsonSchema } from '@wiz6/data';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
// Read from test-fixtures (pristine), not original/ (mutable DOSBox workspace).
const PCFILE = join(REPO, 'test-fixtures', 'original', 'pcfile.dbs');
// Write into the Vite publicDir (repo-root `extracted/`, per viewer vite.config),
// NOT packages/viewer/public/ — that dir is never served, so the asset 404'd in
// prod and the Stock preset showed empty. (Same fix applied to generate-gallery.)
const OUT_DIR = join(REPO, 'extracted', 'presets');
const OUT = join(OUT_DIR, 'stock.json');

/**
 * Deterministic UUID v4-shaped from stock slot index.
 * Using the same scheme as generate-gallery's slotUuid so re-running is stable.
 * Starts from offset 100 (0x64) to avoid colliding with gallery UUIDs (0x00..0x0f).
 */
function stockSlotUuid(n: number): string {
  const hex = (n + 0x64).toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

const bytes = new Uint8Array(readFileSync(PCFILE));
const decoded = decodePcfile(bytes);

const characters = decoded.slots
  .filter((s) => s.populated)
  .map((s, i) => pcfileSlotToCharacter(s, stockSlotUuid(i)));

const payload = PcFileJsonSchema.parse({ format: 'wiz6-pcfile', version: 1, characters });
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
console.log(`wrote ${characters.length} stock characters → ${OUT}`);
