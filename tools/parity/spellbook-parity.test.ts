/**
 * spellbook-parity.test.ts — FULL-SCREEN (320×200) pixel-parity gate for the
 * camp SPELL read-only spellbook viewer (WPCVW SPELL action, #073 Stage 2).
 *
 * Renders TREON (pinned roster slot 4, M-Dracon MAGE) loaded from the PINNED
 * pcfile (test-fixtures/original/pcfile.dbs) via decodePcfile +
 * pcfileSlotToCharacter — the SAME bridge the camp/castle parity uses, so it
 * can't go stale. TREON's known spells (enumerated via knownSpellsBySchool):
 * FIRE-L1 "ENERGY BLAST" (idx 0, cost 2) + MENTAL-L1 (idx 48, cost 3).
 *
 * Two cases, mirroring the committed engine fixtures:
 *   spellbook-grid-fire    → school 0 FIRE, GRID mode (cursor on FIRE icon),
 *                            SPELLS lists "ENERGY BLAST", COST blank.
 *   spellbook-sublist-fire → school 0 FIRE, SUB-LIST, "ENERGY BLAST" selected
 *                            (red highlight), COST = 2.
 *
 * Both compared at tolerance 0 (100% gate). Mirrors renderReviewTwinkShuriken's
 * font/portrait/scenario setup; TREON's rendered portrait is at pcfile +0x19c.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WIZ6_MAIN,
  FontSchema,
  Font4bppSchema,
  MessageDbSchema,
  PortraitSetSchema,
  ScenarioDbSchema,
  resolveCarryCapacityMax,
} from '../../packages/data/src/index.js';
import type {
  Font,
  Font4bpp,
  Palette,
  MessageDb,
  PortraitSet,
  ScenarioDb,
  ActivePartyMember,
} from '../../packages/data/src/index.js';
import type { FontSet } from '../../packages/parser/src/index.js';
import { decodePcfile, pcfileSlotToCharacter } from '../../packages/parser/src/index.js';
import { loadCreationFontSet } from '../../packages/viewer/src/pages/roster/creation/ega/assets.js';
import { renderCreationFrame } from '../../packages/viewer/src/pages/roster/creation/ega/render-frame.js';
import { patchFontSetWithPortrait } from '../../packages/viewer/src/pages/roster/creation/ega/skill-train-frame.js';
import { composeSpellbookFrame } from '../../packages/viewer/src/pages/castle/compose-spellbook.js';
import { buildInventoryItems } from '../../packages/viewer/src/pages/castle/item-display.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { compareRgba, writeDiffPng } from './diff-image.js';
import { indicesToRgba } from './decode-screen.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const FIXTURES = join(ROOT, 'tools', 'parity', 'fixtures', 'engine');
const EXTRACTED_FONTS = join(ROOT, 'extracted', 'fonts');
const EXTRACTED_MESSAGES = join(ROOT, 'extracted', 'messages');
const EXTRACTED_PORTRAITS = join(ROOT, 'extracted', 'portraits');
const EXTRACTED_SCENARIO = join(ROOT, 'extracted', 'scenario');
const PINNED_PCFILE = join(ROOT, 'test-fixtures', 'original', 'pcfile.dbs');

async function diskLoadFont(url: string): Promise<Font> {
  const name = url.split('/').pop()!;
  return FontSchema.parse(JSON.parse(readFileSync(join(EXTRACTED_FONTS, name), 'utf-8')));
}
async function diskLoadFont4bpp(url: string): Promise<Font4bpp> {
  const name = url.split('/').pop()!;
  return Font4bppSchema.parse(JSON.parse(readFileSync(join(EXTRACTED_FONTS, name), 'utf-8')));
}

function engineRgba(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(join(FIXTURES, `${name}.idx.gz`)));
  if (raw.length !== 64000) {
    throw new Error(`fixture "${name}": expected 64000 index bytes, got ${raw.length}`);
  }
  return indicesToRgba(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
}

function loadPortrait(file: string): PortraitSet {
  return PortraitSetSchema.parse(JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, file), 'utf-8')));
}

/** TREON = pinned roster slot 4 (THESUS/TEMPEST/LYSANDR/NOBAL/TREON/PENTAG). */
function loadTreon(): ActivePartyMember {
  const pc = decodePcfile(new Uint8Array(readFileSync(PINNED_PCFILE)));
  const populated = pc.slots.filter((s) => s.populated);
  const slot = populated[4];
  if (!slot) throw new Error('pinned pcfile has no slot 4 (TREON)');
  const uuid = '00000000-0000-4000-8000-000000000005';
  const c = pcfileSlotToCharacter(slot, uuid);
  return { ...c, rosterCharacterId: uuid, portraitSlotId: 4 };
}

interface SpellbookCase {
  fixture: string;
  school: number;
  mode: 'grid' | 'sublist';
  spellIdx: number;
}

const CASES: SpellbookCase[] = [
  { fixture: 'spellbook-grid-fire', school: 0, mode: 'grid', spellIdx: 0 },
  { fixture: 'spellbook-sublist-fire', school: 0, mode: 'sublist', spellIdx: 0 },
];

describe('camp SPELL spellbook viewer FULL-SCREEN pixel-parity (target 100%)', () => {
  let fontSet: FontSet;
  let msgDb: MessageDb;
  let scenarioDb: ScenarioDb;
  beforeAll(async () => {
    fontSet = await loadCreationFontSet({ loadFont: diskLoadFont, loadFont4bpp: diskLoadFont4bpp });
    msgDb = MessageDbSchema.parse(
      JSON.parse(readFileSync(join(EXTRACTED_MESSAGES, 'msg.json'), 'utf-8')),
    );
    scenarioDb = ScenarioDbSchema.parse(
      JSON.parse(readFileSync(join(EXTRACTED_SCENARIO, 'scenario.json'), 'utf-8')),
    );
  });

  function render(palette: Palette, sc: SpellbookCase): Uint8ClampedArray {
    const treon = loadTreon();
    const fontSetWithPortrait = patchFontSetWithPortrait(
      fontSet,
      [loadPortrait('wport1.json'), loadPortrait('wport2.json'), loadPortrait('wport3.json')],
      treon.portraitIndex ?? 0,
    );
    // Mirror CharacterViewPage's runtime derivation (age/cc) exactly.
    const age = { years: Math.floor((treon.age ?? 0) / 365), second: 1 };
    const carryMax = resolveCarryCapacityMax(treon, false);
    const cc = {
      current: Math.floor((treon.encumbranceCurrent ?? 0) / 10),
      max: Math.floor(carryMax / 10),
    };
    const windows = composeSpellbookFrame({
      member: treon,
      db: msgDb,
      school: sc.school,
      mode: sc.mode,
      spellIdx: sc.spellIdx,
      inventory: buildInventoryItems(treon, scenarioDb),
      cc,
      age,
    });
    return renderCreationFrame(windows, fontSetWithPortrait, palette);
  }

  for (const sc of CASES) {
    it(`${sc.fixture}: full 320×200 RGB match = 100%`, () => {
      const ours = render(WIZ6_MAIN, sc);
      const eng = engineRgba(sc.fixture);
      const result = compareRgba(ours, eng, { tolerance: 0 });
      try {
        writeFileSync(
          join('/tmp', `spellbook-ours-${sc.fixture}.png`),
          encodePngRgba(320, 200, new Uint8Array(ours.buffer)),
        );
        writeDiffPng(ours, eng, join('/tmp', `spellbook-diff-${sc.fixture}.png`), { tolerance: 0 });
      } catch {
        /* diagnostics are non-fatal */
      }
      expect(
        result.matchPct,
        `${sc.fixture}: ${result.matchPct.toFixed(2)}% (${result.diffCount} px differ) — see /tmp/spellbook-diff-${sc.fixture}.png`,
      ).toBe(100);
    });
  }
});
