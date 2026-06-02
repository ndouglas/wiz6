/**
 * add-party-parity.test.ts — pixel-exact RGB parity for the wbase ADD PARTY
 * picker, overlaid on the MASTER OPTIONS castle scene.
 *
 * Renders the same composition AddPartyPage uses (composeCastleFrame +
 * picker overlay via renderTileWindow) and compares against the engine's
 * decoded framebuffer (committed as `fixtures/engine/add-party-picker.idx.gz`,
 * re-minted byte-exact from the pinned roster via the `add-party-picker`
 * recipe — see tools/dosbox/state-catalog.ts).
 *
 * The fixture state: party_size=0, the pinned roster (THESUS/TEMPEST/LYSANDR/
 * NOBAL/TREON/PENTAG) available in PCFILE, cursor on THESUS (slot 0), ADD PARTY
 * MEMBER option highlighted in the master menu behind.
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
  decodePcfile,
  pcfileSlotToCharacter,
  type FontSet,
  type MainMenuContext,
  type MainMenuOption,
} from '../../packages/parser/src/index.js';
import { composeCastleFrame } from '../../packages/viewer/src/pages/game/castle-frame.js';
import { composeAddPartyPickerFrame } from '../../packages/viewer/src/pages/castle/compose-add-party-picker-frame.js';
import { loadCreationFontSet } from '../../packages/viewer/src/pages/roster/creation/ega/assets.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { indicesToRgba } from './decode-screen.js';
import { compareRgba, compareRgbaMulti, writeDiffPng } from './diff-image.js';

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

/**
 * The pinned roster (test-fixtures/original/pcfile.dbs): THESUS, TEMPEST,
 * LYSANDR, NOBAL, TREON, PENTAG (slots 0..5). The ADD PARTY MEMBER picker over
 * an empty party lists all of them, cursor on THESUS (slot 0). Decoded
 * data-driven from the same pcfile the engine boots from — only name/race/
 * class/sex feed the picker rows, all of which pcfileSlotToCharacter maps; this
 * can't go stale if the pinned roster changes.
 */
function pinnedRoster(): Character[] {
  const bytes = readFileSync(join(ROOT, 'test-fixtures', 'original', 'pcfile.dbs'));
  const pc = decodePcfile(new Uint8Array(bytes));
  return pc.slots
    .filter((s) => s.populated)
    .map((slot, i) =>
      pcfileSlotToCharacter(slot, `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`),
    );
}

// Engine context behind the picker: party_size=0, roster available in PCFILE,
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

    // Compose the full picker frame at a given water-animation parity: castle
    // background + the picker overlay (THESUS highlighted at top, cursor on
    // candidate 0). The composer draws THESUS at the center row and the next
    // two roster chars below it — matching the engine's 3-visible-row list.
    const candidates = pinnedRoster();
    const renderFrame = (parity: 0 | 1): Uint8ClampedArray => {
      const frame = composeCastleFrame(
        parity,
        dragonscRgba,
        mon08Pic,
        mon08Decoded,
        wfont3,
        wfont0,
        menuOptions,
        selectedIdx >= 0 ? selectedIdx : 0,
        wfont1,
      );
      const pickerWindows = composeAddPartyPickerFrame(
        { candidates, cursorIdx: 0, onCancel: false },
        msgDb,
      );
      for (const win of pickerWindows) {
        renderTileWindow(win, frame, 320, 200, pickerFontSet, WIZ6_MAIN);
      }
      return frame;
    };

    const ours = renderFrame(1);
    const eng = engineRgba('add-party-picker');
    // The only parity-gated content is the animated fountain/water behind the
    // picker; the picker + static castle chrome match in both phases. Match the
    // fixture against BOTH phases so an arbitrary fountain capture phase isn't
    // penalised (same approach as castle-parity.test.ts).
    const result = compareRgbaMulti(eng, [renderFrame(0), renderFrame(1)], { tolerance: 0 });

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
    ).toBeGreaterThanOrEqual(100);
  });
});
