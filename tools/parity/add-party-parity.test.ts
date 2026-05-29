/**
 * add-party-parity.test.ts — pixel-exact RGB parity for the wbase ADD PARTY
 * picker, overlaid on the MASTER OPTIONS castle scene.
 *
 * Renders the same composition AddPartyPage uses (composeCastleFrame +
 * picker overlay via renderTileWindow) and compares against the engine's
 * decoded framebuffer from `tools/dosbox/save/1.sav` (committed as
 * `fixtures/engine/add-party-picker.idx.gz`).
 *
 * The fixture state: party_size=0, NATHAN available in PCFILE, cursor on
 * NATHAN, ADD PARTY MEMBER option highlighted in the master menu behind.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PicSchema,
  EgaScreenSchema,
  FontSchema,
  Font4bppSchema,
  MessageDbSchema,
  WIZ6_MAIN,
  type Character,
  type Font,
  type Font4bpp,
  type MessageDb,
  type Pic,
} from '../../packages/data/src/index.js';
import {
  renderEgaScreen,
  renderTileWindow,
  concatenatePicSegments,
  visibleMenuOptions,
  type FontSet,
  type MainMenuContext,
  type MainMenuOption,
} from '../../packages/parser/src/index.js';
import { composeCastleFrame } from '../../packages/viewer/src/pages/game/castle-frame.js';
import { composeAddPartyPickerFrame } from '../../packages/viewer/src/pages/castle/compose-add-party-picker-frame.js';
import { loadCreationFontSet } from '../../packages/viewer/src/pages/roster/creation/ega/assets.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { indicesToRgba } from './decode-screen.js';
import { compareRgba, writeDiffPng } from './diff-image.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

function mainRoot(): string {
  try {
    const g = readFileSync(join(REPO_ROOT, '.git'), 'utf-8');
    const m = /gitdir:\s*(.+)/.exec(g);
    if (m) return resolve(m[1]!.trim().replace(/\/worktrees\/[^/]+$/, ''), '..');
  } catch {
    /* not a worktree */
  }
  return REPO_ROOT;
}
const ROOT = mainRoot();
const FIXTURES_ENGINE = join(ROOT, 'tools', 'parity', 'fixtures', 'engine');
const EXTRACTED = join(ROOT, 'extracted');

function engineRgba(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(join(FIXTURES_ENGINE, `${name}.idx.gz`)));
  return indicesToRgba(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
}

// Disk loaders for loadCreationFontSet (no fetch in vitest/node).
async function diskLoadFont(url: string): Promise<Font> {
  return FontSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED, 'fonts', url.replace(/^\/fonts\//, '')), 'utf-8')),
  );
}
async function diskLoadFont4bpp(url: string): Promise<Font4bpp> {
  return Font4bppSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED, 'fonts', url.replace(/^\/fonts\//, '')), 'utf-8')),
  );
}

/** NATHAN as he appears in save/1.sav: Rawulf Fighter Male. */
function nathan(): Character {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'NATHAN',
    race: 9, // Rawulf
    class: 0, // Fighter
    sex: 0, // Male
    level: 1,
    xp: 0,
    gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false,
    paralyzed: false,
    attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0,
    reaction: 0,
  };
}

// Engine context behind the picker: party_size=0, NATHAN available in PCFILE,
// cursor on ADD PARTY MEMBER (slot 0).
const CONTEXT: MainMenuContext = { partySize: 0, pcFileHasUnloadedChars: true };

describe('ADD PARTY picker pixel-parity vs committed engine fixture', () => {
  let mon08Pic: Pic;
  let mon08Decoded: number[];
  let dragonscRgba: Uint8ClampedArray;
  let wfont3: Font4bpp;
  let wfont1: Font4bpp;
  let wfont0: Font;
  let menuOptions: readonly MainMenuOption[];
  let pickerFontSet: FontSet;
  let msgDb: MessageDb;

  beforeAll(async () => {
    mon08Pic = PicSchema.parse(
      JSON.parse(readFileSync(join(EXTRACTED, 'pics', 'mon08.json'), 'utf-8')),
    );
    mon08Decoded = concatenatePicSegments(mon08Pic.segments);
    const dragonsc = EgaScreenSchema.parse(
      JSON.parse(readFileSync(join(EXTRACTED, 'screens', 'dragonsc.json'), 'utf-8')),
    );
    dragonscRgba = renderEgaScreen(dragonsc, WIZ6_MAIN).rgba;
    wfont3 = Font4bppSchema.parse(
      JSON.parse(readFileSync(join(EXTRACTED, 'fonts', 'wfont3.json'), 'utf-8')),
    );
    wfont1 = Font4bppSchema.parse(
      JSON.parse(readFileSync(join(EXTRACTED, 'fonts', 'wfont1.json'), 'utf-8')),
    );
    wfont0 = FontSchema.parse(
      JSON.parse(readFileSync(join(EXTRACTED, 'fonts', 'wfont0.json'), 'utf-8')),
    );
    menuOptions = visibleMenuOptions(CONTEXT);
    pickerFontSet = await loadCreationFontSet({
      loadFont: diskLoadFont,
      loadFont4bpp: diskLoadFont4bpp,
    });
    msgDb = MessageDbSchema.parse(
      JSON.parse(readFileSync(join(EXTRACTED, 'messages', 'msg.json'), 'utf-8')),
    );
  });

  it('add-party-picker: pixel-exact RGB match (regression floor)', () => {
    // Cursor on ADD PARTY MEMBER (slot 0) — the user just selected it to
    // open the picker. visibleMenuOptions returns slot 0 first in this state.
    const selectedIdx = menuOptions.findIndex((opt) => opt.slot === 0);

    // Compose the castle background.
    const ours = composeCastleFrame(
      0, // parity 0
      dragonscRgba,
      mon08Pic,
      mon08Decoded,
      wfont3,
      wfont0,
      menuOptions,
      selectedIdx >= 0 ? selectedIdx : 0,
      wfont1,
    );

    // Overlay the picker (NATHAN highlighted, cursor on candidate, not CANCEL).
    const pickerWindows = composeAddPartyPickerFrame(
      { candidates: [nathan()], cursorIdx: 0, onCancel: false },
      msgDb,
    );
    for (const win of pickerWindows) {
      renderTileWindow(win, ours, 320, 200, pickerFontSet, WIZ6_MAIN);
    }

    const eng = engineRgba('add-party-picker');
    const result = compareRgba(ours, eng, { tolerance: 0 });

    // Diagnostics.
    try {
      writeFileSync(
        join('/tmp', 'parity-ours-add-party-picker.png'),
        encodePngRgba(320, 200, new Uint8Array(ours.buffer)),
      );
      writeDiffPng(ours, eng, join('/tmp', 'parity-diff-add-party-picker.png'), {
        tolerance: 0,
      });
    } catch {
      /* diagnostics non-fatal */
    }

    console.log(`[add-party-picker] match=${result.matchPct.toFixed(2)}% diff=${result.diffCount}px → /tmp/parity-diff-add-party-picker.png`);

    // Regression floor — initially the achieved %, raised toward 100 as
    // remaining diffs are fixed. Failure indicates either a regression OR
    // (rarer) a fixture refresh that needs re-baselining.
    expect(
      result.matchPct,
      `add-party-picker: ${result.matchPct.toFixed(2)}% (${result.diffCount} px differ) — see /tmp/parity-diff-add-party-picker.png`,
    ).toBeGreaterThanOrEqual(97);
  });
});
