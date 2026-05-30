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

// NUG2 from engine save 2 slot 1 (verified via dosbox_read_struct):
//   portraitIndex=10, class=9 (Bishop), race=1 (Elf), level=1, sex=0,
//   hp 5/5, sp 63/63, attributes [STR=7,INT=15,PIE=15,VIT=7,DEX=9,SPD=9,PER=8,KAR=2],
//   schoolMana [3,3,0,0,0,0]. Slot 1 → RIGHT panel column.
const ENGINE_SAVE_2_NUG2: ActivePartyMember = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'NUG2',
  race: 1,
  class: 9,
  level: 1,
  savedOldLevel: 0,
  xp: 0,
  gold: 0,
  conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  dead: false,
  paralyzed: false,
  attributes: { str: 7, int: 15, pie: 15, vit: 7, dex: 9, spd: 9, per: 8, kar: 2 },
  schoolMana: [3, 3, 0, 0, 0, 0],
  schoolManaMax: [3, 3, 0, 0, 0, 0],
  skills: [
    0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0,
    0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 6, 0, 6, 0,
  ],
  reaction: 12,
  sex: 0,
  portraitSlotId: 1,
  rosterCharacterId: '00000000-0000-4000-8000-000000000002',
  portraitIndex: 10,
  hpCurrent: 5,
  hpMax: 5,
  staminaCurrent: 63,
  staminaMax: 63,
  age: 7180,
};

// castle-2-members: NATHAN slot 0 (LEFT) + NUG2 slot 1 (RIGHT). Both chars in
// party → roster empty → pcFileHasUnloadedChars=false (no ADD PARTY MEMBER;
// START NEW GAME appears since partySize>=2). REVIEW MEMBER is the highlighted
// top-left option (selectedIdx 0).
const TWO_MEMBER_CONTEXT: MainMenuContext = { partySize: 2, pcFileHasUnloadedChars: false };

// NUG3..NUG6 (engine save 6 slots 2..5, verified via dosbox_read_struct). All
// level 1, sex 0, no conditions. Even slots (0,2,4) render LEFT, odd (1,3,5)
// RIGHT. skills/attributes are carried for fidelity but don't affect the castle
// panel render (portrait + name + class symbol + HP/SP bars + status icons do).
const ENGINE_NUG3: ActivePartyMember = {
  id: '00000000-0000-4000-8000-000000000003', name: 'NUG3', race: 7, class: 1,
  level: 1, savedOldLevel: 0, xp: 0, gold: 0,
  conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], dead: false, paralyzed: false,
  attributes: { str: 10, int: 15, pie: 6, vit: 12, dex: 10, spd: 8, per: 6, kar: 3 },
  schoolMana: [3, 0, 0, 3, 0, 0], schoolManaMax: [3, 0, 0, 3, 0, 0],
  skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0],
  reaction: 16, sex: 0, portraitSlotId: 2,
  rosterCharacterId: '00000000-0000-4000-8000-000000000003',
  portraitIndex: 9, hpCurrent: 2, hpMax: 2, staminaCurrent: 102, staminaMax: 102, age: 6998,
};
const ENGINE_NUG4: ActivePartyMember = {
  id: '00000000-0000-4000-8000-000000000004', name: 'NUG4', race: 5, class: 6,
  level: 1, savedOldLevel: 0, xp: 0, gold: 0,
  conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], dead: false, paralyzed: false,
  attributes: { str: 3, int: 11, pie: 6, vit: 6, dex: 15, spd: 14, per: 18, kar: 6 },
  schoolMana: [0, 0, 0, 0, 0, 0], schoolManaMax: [0, 0, 0, 0, 0, 0],
  skills: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 8, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0],
  reaction: 28, sex: 0, portraitSlotId: 3,
  rosterCharacterId: '00000000-0000-4000-8000-000000000004',
  portraitIndex: 15, hpCurrent: 1, hpMax: 1, staminaCurrent: 45, staminaMax: 45, age: 6671,
};
const ENGINE_NUG5: ActivePartyMember = {
  id: '00000000-0000-4000-8000-000000000005', name: 'NUG5', race: 10, class: 3,
  level: 1, savedOldLevel: 0, xp: 0, gold: 0,
  conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], dead: false, paralyzed: false,
  attributes: { str: 10, int: 10, pie: 6, vit: 10, dex: 14, spd: 8, per: 9, kar: 17 },
  schoolMana: [0, 0, 0, 0, 0, 0], schoolManaMax: [0, 0, 0, 0, 0, 0],
  skills: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 10, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  reaction: 8, sex: 0, portraitSlotId: 4,
  rosterCharacterId: '00000000-0000-4000-8000-000000000005',
  portraitIndex: 9, hpCurrent: 5, hpMax: 5, staminaCurrent: 90, staminaMax: 90, age: 6853,
};
const ENGINE_NUG6: ActivePartyMember = {
  id: '00000000-0000-4000-8000-000000000006', name: 'NUG6', race: 1, class: 9,
  level: 1, savedOldLevel: 0, xp: 0, gold: 0,
  conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], dead: false, paralyzed: false,
  attributes: { str: 7, int: 15, pie: 15, vit: 7, dex: 9, spd: 9, per: 8, kar: 10 },
  schoolMana: [3, 0, 0, 0, 0, 4], schoolManaMax: [3, 0, 0, 0, 0, 4],
  skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 6, 0],
  reaction: 36, sex: 0, portraitSlotId: 5,
  rosterCharacterId: '00000000-0000-4000-8000-000000000006',
  portraitIndex: 10, hpCurrent: 3, hpMax: 3, staminaCurrent: 63, staminaMax: 63, age: 6638,
};

// N=3/4/5 built from the 6-char roster: roster still has unloaded chars, so
// ADD PARTY MEMBER is visible + highlighted (selectedIdx 0).
const UNLOADED_CONTEXT_3: MainMenuContext = { partySize: 3, pcFileHasUnloadedChars: true };
const UNLOADED_CONTEXT_4: MainMenuContext = { partySize: 4, pcFileHasUnloadedChars: true };
const UNLOADED_CONTEXT_5: MainMenuContext = { partySize: 5, pcFileHasUnloadedChars: true };
// N=6: full party, roster empty → no ADD PARTY MEMBER; cursor on START NEW GAME
// (index 2 of the visible menu REVIEW/DISMISS/START NEW/...).
const SIX_MEMBER_CONTEXT: MainMenuContext = { partySize: 6, pcFileHasUnloadedChars: false };

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
  // castle-1-members: NATHAN solo, ADD PARTY MEMBER highlighted (selectedIdx=0).
  // Captured from engine save 1. Per Task 2 the FUN_1b2d info-panel rendering
  // (name label + colored bar + class symbol + status/condition icons) is
  // ported in; the portrait blit position is corrected from y=13 (a spurious
  // empirical hold-over) to y=48 (panel row 1, where the engine actually
  // draws it).
  {
    // 98.20% with Task 2 (port of FUN_1b2d panel-cell render + portrait moved
    // from y=13 to y=48 panel-row 1). Up from 97.21% baseline. The remaining
    // ~1.8% diff is concentrated in panel cells col 0..3 rows 6..8 of the
    // LEFT slot-0 area: the wport-extracted 24×24 portrait sprite does NOT
    // match the engine's 32×24 portrait rendering (TODO #061: dcf2 coord
    // transform still unresolved; TODO #026: wport extraction is wrong shape).
    // The class-symbol / status-icon cells render in the correct positions
    // with the correct font glyphs — the engine's color choice for those
    // cells (palette index 4 dark red vs ours palette index 3 magenta) is
    // also a small contributor to the remaining diff.
    //
    // Target 100% is gated on TODO #026 + #061 — when the portrait blit
    // produces engine-faithful pixels, raise this floor accordingly.
    fixture: 'castle-1-members',
    floor: 98,
    parity: 1,
    context: ONE_MEMBER_CONTEXT,
    members: [ENGINE_SAVE_1_NATHAN],
    selectedIdx: 0,
  },
  // castle-2-members: NATHAN (LEFT/Fighter) + NUG2 (RIGHT/Bishop). The wport
  // portrait gap (TODO #061/#026) now affects TWO portraits, so the floor is
  // lower than N=1. Conservative floor; tighten to the measured value below.
  {
    fixture: 'castle-2-members',
    floor: 97,
    parity: 1,
    context: TWO_MEMBER_CONTEXT,
    members: [ENGINE_SAVE_1_NATHAN, ENGINE_SAVE_2_NUG2],
    selectedIdx: 0,
  },
  // castle-{3,4,5}-members: party built up from the 6-char roster (NATHAN, NUG2,
  // NUG3..). Roster still has unloaded chars → ADD PARTY MEMBER highlighted
  // (selectedIdx 0). Conservative floors; tightened to measured values below.
  {
    fixture: 'castle-3-members',
    floor: 95,
    parity: 1,
    context: UNLOADED_CONTEXT_3,
    members: [ENGINE_SAVE_1_NATHAN, ENGINE_SAVE_2_NUG2, ENGINE_NUG3],
    selectedIdx: 0,
  },
  {
    fixture: 'castle-4-members',
    floor: 94,
    parity: 1,
    context: UNLOADED_CONTEXT_4,
    members: [ENGINE_SAVE_1_NATHAN, ENGINE_SAVE_2_NUG2, ENGINE_NUG3, ENGINE_NUG4],
    selectedIdx: 0,
  },
  {
    fixture: 'castle-5-members',
    floor: 92,
    parity: 1,
    context: UNLOADED_CONTEXT_5,
    members: [ENGINE_SAVE_1_NATHAN, ENGINE_SAVE_2_NUG2, ENGINE_NUG3, ENGINE_NUG4, ENGINE_NUG5],
    selectedIdx: 0,
  },
  // castle-6-members: full party, roster empty → no ADD PARTY MEMBER; cursor on
  // START NEW GAME (selectedIdx 2 in the visible menu).
  {
    fixture: 'castle-6-members',
    floor: 91,
    parity: 1,
    context: SIX_MEMBER_CONTEXT,
    members: [
      ENGINE_SAVE_1_NATHAN, ENGINE_SAVE_2_NUG2, ENGINE_NUG3,
      ENGINE_NUG4, ENGINE_NUG5, ENGINE_NUG6,
    ],
    selectedIdx: 2,
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
