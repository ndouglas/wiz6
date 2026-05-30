/**
 * castle-parity.test.ts — full-RGB parity for the MASTER OPTIONS (main-menu)
 * screen at both parity ticks of the water animation.
 *
 * Renders our composeCastleFrame (same pure function CastleScreen drives at RAF)
 * at parity=0 and parity=1 and compares pixel-for-pixel against the committed
 * main-menu / main-menu-2 fixtures.
 *
 * Both frames are pixel-exact (0 px diff). Three engine details to nail:
 *   - opacity: titlepag-like alpha-zero pixels from renderEgaScreen get an
 *     opaque RGB copy.
 *   - status row (engine handle 0x7394) cleared with wfont3 char 0x1E (the
 *     "screen-edge" tile with a black bottom row), not 0x20.
 *   - party-panel border edges flanking the gate: wfont1 0x1C (heavy R-edge)
 *     at cell col 8 and wfont1 0x1A (light L-edge) at cell col 31 — the 1-px
 *     black columns at x=71/x=248 are these tiles' baked-in edge pixels.
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
  visibleMenuOptions,
  type MainMenuContext,
  type MainMenuOption,
} from '../../packages/parser/src/index.js';
import { composeCastleFrame } from '../../packages/viewer/src/pages/game/castle-frame.js';
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

function engineRgba(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(join(FIXTURES_ENGINE, `${name}.idx.gz`)));
  return indicesToRgba(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
}

// Engine state for the empty-party fixtures.
const EMPTY_CONTEXT: MainMenuContext = { partySize: 0, pcFileHasUnloadedChars: true };
// Engine state for the castle-one-member fixture: NATHAN in party, PCFILE has
// at least one available unloaded char (so ADD PARTY MEMBER shows + is the
// highlighted top-left entry).
const ONE_MEMBER_CONTEXT: MainMenuContext = { partySize: 1, pcFileHasUnloadedChars: true };

interface CastleCase {
  fixture: string;
  floor: number;
  parity: 0 | 1;
  context: MainMenuContext;
  members: ReadonlyArray<ActivePartyMember>;
  selectedIdx: number;
}

// NATHAN from engine save 1 (verified via dosbox_read_struct):
//   portraitIndex=9, class=0 (Fighter), race=9, level=1, sex=0,
//   hp 7/7, sp 108/108, attributes [STR=16, INT=8, PIE=12, VIT=10, DEX=8, SPD=8, PER=10, KAR=18].
const ENGINE_SAVE_1_NATHAN: ActivePartyMember = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'NATHAN',
  race: 9,
  class: 0,
  level: 1,
  savedOldLevel: 0,
  xp: 0,
  gold: 0,
  conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  dead: false,
  paralyzed: false,
  attributes: { str: 16, int: 8, pie: 12, vit: 10, dex: 8, spd: 8, per: 10, kar: 18 },
  schoolMana: [0, 0, 0, 0, 0, 0],
  schoolManaMax: [0, 0, 0, 0, 0, 0],
  skills: [
    0, 17, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  reaction: 4,
  sex: 0,
  portraitSlotId: 0,
  rosterCharacterId: '00000000-0000-4000-8000-000000000001',
  portraitIndex: 9,
  hpCurrent: 7,
  hpMax: 7,
  staminaCurrent: 108,
  staminaMax: 108,
  age: 6925,
};

const CASES: CastleCase[] = [
  // parity=1 (water overlays ON) matches main-menu; parity=0 matches main-menu-2.
  {
    fixture: 'main-menu',
    floor: 100,
    parity: 1,
    context: EMPTY_CONTEXT,
    members: [],
    selectedIdx: 0,
  },
  {
    fixture: 'main-menu-2',
    floor: 100,
    parity: 0,
    context: EMPTY_CONTEXT,
    members: [],
    selectedIdx: 0,
  },
  // castle-one-member: NATHAN in party slot 0 (portraitSlotId=0), REVIEW MEMBER
  // highlighted (selectedIdx=1 because ADD PARTY MEMBER is at idx 0 and is still
  // visible since NUG2 is in PCFILE). Captured from engine save 1.
  // Starts as a regression floor of 0 — the test exists primarily to surface the
  // diff so the render path can be brought to parity (TODO #028 follow-up).
  // castle-one-member: NATHAN solo, ADD PARTY MEMBER highlighted (selectedIdx=0).
  // 97.21% — remaining ~3% is the per-member info panel (name label + HP bar +
  // class icons, engine FUN_1b2d, not yet ported — #024). Floor 97 as regression
  // marker; target 100 once #024 lands.
  {
    fixture: 'castle-one-member',
    floor: 97,
    parity: 1,
    context: ONE_MEMBER_CONTEXT,
    members: [ENGINE_SAVE_1_NATHAN],
    selectedIdx: 0,
  },
];

describe('castle (main menu) pixel-parity vs committed fixtures', () => {
  let mon08Pic: Pic;
  let mon08Decoded: number[];
  let dragonscRgba: Uint8ClampedArray;
  let wfont3: Font4bpp;
  let wfont1: Font4bpp;
  let wfont0: Font;
  let portraitSets: PortraitSet[];

  beforeAll(() => {
    mon08Pic = PicSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'pics', 'mon08.json'), 'utf-8')),
    );
    mon08Decoded = concatenatePicSegments(mon08Pic.segments);
    const dragonsc = EgaScreenSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'screens', 'dragonsc.json'), 'utf-8')),
    );
    dragonscRgba = renderEgaScreen(dragonsc, WIZ6_MAIN).rgba;
    wfont3 = Font4bppSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'fonts', 'wfont3.json'), 'utf-8')),
    );
    wfont1 = Font4bppSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'fonts', 'wfont1.json'), 'utf-8')),
    );
    wfont0 = FontSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'extracted', 'fonts', 'wfont0.json'), 'utf-8')),
    );
    portraitSets = [1, 2, 3].map((n) =>
      PortraitSetSchema.parse(
        JSON.parse(
          readFileSync(join(ROOT, 'extracted', 'portraits', `wport${n}.json`), 'utf-8'),
        ),
      ),
    );
  });

  for (const c of CASES) {
    it(`${c.fixture} (parity=${c.parity}): RGB match ≥ ${c.floor}% (regression floor; target 100)`, () => {
      const menuOptions = visibleMenuOptions(c.context);
      const ours = composeCastleFrame(
        c.parity,
        dragonscRgba,
        mon08Pic,
        mon08Decoded,
        wfont3,
        wfont0,
        menuOptions,
        c.selectedIdx,
        wfont1,
        c.members,
        c.members.length > 0 ? portraitSets : null,
      );
      const eng = engineRgba(c.fixture);
      const result = compareRgba(ours, eng, { tolerance: 0 });

      try {
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
      ).toBeGreaterThanOrEqual(c.floor);
    });
  }
});
