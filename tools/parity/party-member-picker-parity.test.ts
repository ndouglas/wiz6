/**
 * party-member-picker-parity.test.ts — full-RGB pixel parity for the wbase
 * REVIEW WHO? / DISMISS WHO? party-member picker (compose-party-member-picker-frame).
 *
 * Renders the FULL screen the player sees: composeCastleFrame (the live castle
 * scene behind the picker — gate, fountain, party portraits, MASTER OPTIONS
 * menu) with the picker windows overlaid on top, and compares pixel-for-pixel
 * (tolerance 0) against the committed engine fixtures.
 *
 * Fixtures captured from a 3-member castle party (verified via dosbox_read_struct):
 *   slot 0 THESUS  — LEFT panel column
 *   slot 1 TEMPEST — RIGHT panel column
 *   slot 2 LYSANDR — LEFT panel column
 *
 * portraitIndex here is the RENDERED portrait selector (the global wport index
 * 0..41, record +0x19c), NOT the struct's +0x1ac creation-default field. The
 * raw struct read gave 10/8/13 (the +0x1ac default); the actually-rendered
 * portraits are 0/22/20, recovered by brute-force matching each engine portrait
 * region against all 42 wport candidates (0px diff). Same gotcha castle-parity
 * documents for NATHAN (+0x1ac=9 but rendered=21).
 *
 * Four cases:
 *   review-who-exit    — title "REVIEW WHO?", cursor -1 (EXIT highlighted)
 *   review-who-member  — title "REVIEW WHO?", cursor 0  (THESUS highlighted)
 *   dismiss-who-exit   — title "DISMISS WHO?", cursor -1 (EXIT highlighted)
 *   dismiss-who-member — title "DISMISS WHO?", cursor 0  (THESUS highlighted)
 *
 * The picker window only covers cells 0-18; the bottom-right region (cols 19-39,
 * rows 19-24) is gray fill in the engine — composeCastleFrame must not leak its
 * MASTER OPTIONS right column through there.
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
  PortraitSetSchema,
  WIZ6_MAIN,
  type ActivePartyMember,
  type Font,
  type Font4bpp,
  type Pic,
  type PortraitSet,
} from '../../packages/data/src/index.js';
import {
  renderEgaScreen,
  concatenatePicSegments,
  renderTileWindow,
  visibleMenuOptions,
  type FontSet,
  type MainMenuContext,
} from '../../packages/parser/src/index.js';
import { composeCastleFrame } from '../../packages/viewer/src/pages/game/castle-frame.js';
import { composePartyMemberPickerFrame } from '../../packages/viewer/src/pages/castle/compose-party-member-picker-frame.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { indicesToRgba } from './decode-screen.js';
import { compareRgbaMulti, writeDiffPng } from './diff-image.js';

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

function engineRgba(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(join(FIXTURES_ENGINE, `${name}.idx.gz`)));
  return indicesToRgba(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
}

// --- The 3 captured party members (dosbox_read_struct, slot order) -----------
// Only fields that affect the castle panel + picker render matter (name,
// portraitIndex, hp/stamina bars, class/race symbols). Other fields carry
// plausible values for type-completeness.
function member(
  idx: number,
  name: string,
  portraitIndex: number,
  hp: number,
  stamina: number,
  age: number,
  race: number,
  klass: number,
): ActivePartyMember {
  return {
    id: `00000000-0000-4000-8000-00000000000${idx + 1}`,
    name,
    race,
    class: klass,
    level: 1,
    savedOldLevel: 0,
    xp: 0,
    gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false,
    paralyzed: false,
    attributes: { str: 10, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 10 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    reaction: 0,
    sex: 0,
    portraitSlotId: idx,
    rosterCharacterId: `00000000-0000-4000-8000-00000000000${idx + 1}`,
    portraitIndex,
    hpCurrent: hp,
    hpMax: hp,
    staminaCurrent: stamina,
    staminaMax: stamina,
    age,
  };
}

const MEMBERS: ReadonlyArray<ActivePartyMember> = [
  member(0, 'THESUS', 0, 8, 126, 6590, 0, 0),
  member(1, 'TEMPEST', 22, 9, 123, 7405, 10, 0),
  member(2, 'LYSANDR', 20, 5, 87, 7265, 8, 3),
];

interface PickerCase {
  fixture: string;
  title: string;
  cursor: number;
}

const CASES: PickerCase[] = [
  { fixture: 'review-who-exit', title: 'REVIEW WHO?', cursor: -1 },
  { fixture: 'review-who-member', title: 'REVIEW WHO?', cursor: 0 },
  { fixture: 'dismiss-who-exit', title: 'DISMISS WHO?', cursor: -1 },
  { fixture: 'dismiss-who-member', title: 'DISMISS WHO?', cursor: 0 },
];

describe('party-member picker (REVIEW/DISMISS WHO?) pixel-parity vs committed fixtures', () => {
  let mon08Pic: Pic;
  let mon08Decoded: number[];
  let dragonscRgba: Uint8ClampedArray;
  let wfont0: Font;
  let wfont1: Font4bpp;
  let wfont2: Font4bpp;
  let wfont3: Font4bpp;
  let wfont4: Font4bpp;
  let portraitSets: PortraitSet[];
  let fontSet: FontSet;

  beforeAll(() => {
    mon08Pic = PicSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'pics', 'mon08.json'), 'utf-8')),
    );
    mon08Decoded = concatenatePicSegments(mon08Pic.segments);
    const dragonsc = EgaScreenSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'screens', 'dragonsc.json'), 'utf-8')),
    );
    dragonscRgba = renderEgaScreen(dragonsc, WIZ6_MAIN).rgba;
    wfont0 = FontSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'fonts', 'wfont0.json'), 'utf-8')),
    );
    wfont1 = Font4bppSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'fonts', 'wfont1.json'), 'utf-8')),
    );
    wfont2 = Font4bppSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'fonts', 'wfont2.json'), 'utf-8')),
    );
    wfont3 = Font4bppSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'fonts', 'wfont3.json'), 'utf-8')),
    );
    wfont4 = Font4bppSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'fonts', 'wfont4.json'), 'utf-8')),
    );
    portraitSets = [1, 2, 3].map((n) =>
      PortraitSetSchema.parse(
        JSON.parse(
          readFileSync(join(ROOT, 'extracted', 'portraits', `wport${n}.json`), 'utf-8'),
        ),
      ),
    );
    fontSet = { font0: wfont0, font1: wfont1, font2: wfont2, font3: wfont3, font4: wfont4 };
  });

  // The menu state the engine had when the picker opened: the main-menu grid
  // stays painted behind the picker. Mirror PartyMemberPicker.tsx (filter slot 8).
  function visibleMenu() {
    const ctx: MainMenuContext = { partySize: 3, pcFileHasUnloadedChars: true };
    return visibleMenuOptions(ctx).filter((opt) => opt.slot !== 8);
  }

  for (const c of CASES) {
    it(`${c.fixture}: RGB match = 100% (tolerance 0)`, () => {
      const visible = visibleMenu();
      // Render the full screen (castle frame + picker overlay) at a given
      // fountain-animation parity phase.
      const render = (parity: 0 | 1): Uint8ClampedArray => {
        const buf = composeCastleFrame(
          parity,
          dragonscRgba,
          mon08Pic,
          mon08Decoded,
          wfont3,
          wfont0,
          visible,
          0,
          wfont1,
          MEMBERS,
          portraitSets,
          wfont4,
        );
        for (const win of composePartyMemberPickerFrame({
          title: c.title,
          members: MEMBERS,
          cursor: c.cursor,
        })) {
          renderTileWindow(win, buf, 320, 200, fontSet, WIZ6_MAIN);
        }
        return buf;
      };

      const eng = engineRgba(c.fixture);
      // The ONLY parity-gated (animated) content is the castle fountain/dragon
      // (~x214-242, y52-117). The picker overlay, party panels, gate, and banner
      // are all static. Each fixture was captured at an arbitrary fountain phase,
      // so we match it against BOTH phases (any-of): a pixel passes if it equals
      // either phase. Because the phases are identical everywhere except the
      // animated region, the slack is confined there — all static content
      // (picker, panels, banner) must still match identically in both phases.
      // Same approach + rationale as castle-parity.test.ts.
      const result = compareRgbaMulti(eng, [render(0), render(1)], { tolerance: 0 });

      try {
        const ours = render(0);
        writeFileSync(
          join('/tmp', `parity-ours-${c.fixture}.png`),
          encodePngRgba(320, 200, new Uint8Array(ours.buffer)),
        );
        writeDiffPng(ours, eng, join('/tmp', `parity-diff-${c.fixture}.png`), { tolerance: 0 });
      } catch {
        /* diagnostics non-fatal */
      }

      expect(
        result.matchPct,
        `${c.fixture}: ${result.matchPct.toFixed(2)}% (${result.diffCount} px) — see /tmp/parity-diff-${c.fixture}.png`,
      ).toBe(100);
    });
  }
});
