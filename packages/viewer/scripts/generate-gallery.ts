#!/usr/bin/env tsx
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePcfile } from '@wiz6/parser';
import { RosterSchema, type Character, type Roster } from '@wiz6/data';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const PCFILE = join(REPO, 'original', 'pcfile.dbs');
const OUT = join(HERE, '..', 'public', 'gallery', 'characters.json');

function slotUuid(n: number): string {
  // Deterministic UUID v4-shaped (4xxx + 8/9/a/bxxx) from slot index, so
  // re-running the generator produces the same ids. zod's `.uuid()`
  // accepts this format.
  const hex = n.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

const bytes = new Uint8Array(readFileSync(PCFILE));
const decoded = decodePcfile(bytes);

const characters: Character[] = decoded.slots
  .filter((s) => s.populated && s.name !== null)
  .map((s, i) => ({
    id: slotUuid(i),
    name: s.name!,
    // Decoded from pcfile (field offsets confirmed by wpcvw.ovr ASM traces):
    level: s.level,
    // XP is at record +0x0c (BSS abs 0x43f4/0x43f6). The prior +0x08 field is
    // ageCounter (a game-day age counter). All 6 stock chars have xp=0 at +0x0c,
    // consistent with "everyone starts at 0 XP". See character-xp-field.json.
    xp: s.xp,
    // Sensible defaults for fields we couldn't confidently decode.
    // A future RE refinement pass can replace these with the real values
    // by enriching the pcfile decoder (see docs/re/pcfile-dbs.md's
    // unmapped regions).
    race: 0,
    class: 0,
    savedOldLevel: 0,
    gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false,
    paralyzed: false,
    attributes: {
      str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12,
      personality: 50, karma: 50,
    },
    schoolMana: [0, 0, 0, 0, 0, 0],
    skills: new Array(14).fill(0),
    reaction: 50,
  }));

const roster: Roster = { schemaVersion: 1, characters };
RosterSchema.parse(roster); // validate before writing

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(roster, null, 2) + '\n');
console.log(`wrote ${OUT} with ${characters.length} characters`);
