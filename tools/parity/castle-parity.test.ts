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
  decodePcfile,
  pcfileSlotToCharacter,
  type MainMenuContext,
} from '../../packages/parser/src/index.js';
import { composeCastleFrame } from '../../packages/viewer/src/pages/game/castle-frame.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { indicesToRgba } from './decode-screen.js';
import { compareRgba, compareRgbaMulti, writeDiffPng } from './diff-image.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const PINNED_PCFILE = ['test-fixtures', 'original', 'pcfile.dbs'];

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

interface CastleCase {
  fixture: string;
  floor: number;
  parity: 0 | 1;
  context: MainMenuContext;
  members: ReadonlyArray<ActivePartyMember>;
  selectedIdx: number;
}

// ─── Pinned-roster party members (data-driven, re-mintable) ──────────────────
// The castle-N-members fixtures are re-minted from the PINNED roster in
// test-fixtures/original/pcfile.dbs: THESUS / TEMPEST / LYSANDR / NOBAL / TREON /
// PENTAG (slots 0..5). The `castle-N` recipe drives ADD PARTY MEMBER N times,
// always picking the first available roster char, so the party is the first N
// pinned slots IN ORDER. The engine lays portraits out column-major: party
// index 0,2,4 → LEFT panel column (top→bottom); 1,3,5 → RIGHT column. So
// portraitSlotId == party index.
//
// We decode the SAME pcfile the engine boots from (offline, deterministic — the
// pcfileSlotToCharacter bridge maps every field the castle panel renders:
// name, race, class, rendered portrait at +0x19c, HP/stamina, conditions,
// schoolMana). This can't go stale: change the pinned roster and the structs
// follow. ActivePartyMember = Character + portraitSlotId (party index) +
// rosterCharacterId (deterministic UUID, unused by the render).
function loadPinnedRosterParty(n: number): ActivePartyMember[] {
  const bytes = readFileSync(join(REPO_ROOT, ...PINNED_PCFILE));
  const pc = decodePcfile(new Uint8Array(bytes));
  const populated = pc.slots.filter((s) => s.populated);
  if (populated.length < n) {
    throw new Error(`pinned pcfile has ${populated.length} chars, need ${n}`);
  }
  return populated.slice(0, n).map((slot, partyIdx) => {
    const uuid = `00000000-0000-4000-8000-${String(partyIdx + 1).padStart(12, '0')}`;
    const c = pcfileSlotToCharacter(slot, uuid);
    return { ...c, rosterCharacterId: uuid, portraitSlotId: partyIdx };
  });
}

// N=1..5: roster still has unloaded chars → ADD PARTY MEMBER visible +
// highlighted (selectedIdx 0). N=6: full party, roster empty → no ADD PARTY
// MEMBER; the recipe's trailing `up up up` re-anchors the cursor on the
// top-left option (now REVIEW MEMBER), so selectedIdx 0 in both cases.
function castleCase(n: number): CastleCase {
  const full = n >= 6;
  return {
    fixture: `castle-${n}-members`,
    floor: 100,
    parity: 1,
    context: { partySize: n, pcFileHasUnloadedChars: !full },
    members: loadPinnedRosterParty(n),
    selectedIdx: 0,
  };
}

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
  // castle-1..6-members: re-minted from the pinned roster (THESUS first; see
  // loadPinnedRosterParty). Per-member panels match BOTH water-animation phases
  // (compareRgbaMulti), so an arbitrary fountain capture phase isn't penalised
  // while static content (panels, gate, menu) must match in both.
  castleCase(1),
  castleCase(2),
  castleCase(3),
  castleCase(4),
  castleCase(5),
  castleCase(6),
];

describe('castle (main menu) pixel-parity vs committed fixtures', () => {
  let mon08Pic: Pic;
  let mon08Decoded: number[];
  let dragonscRgba: Uint8ClampedArray;
  let wfont3: Font4bpp;
  let wfont1: Font4bpp;
  let wfont0: Font;
  let wfont4: Font4bpp;
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
  });

  for (const c of CASES) {
    it(`${c.fixture} (parity=${c.parity}): RGB match ≥ ${c.floor}% (regression floor; target 100)`, () => {
      const menuOptions = visibleMenuOptions(c.context);
      const render = (parity: 0 | 1): Uint8ClampedArray =>
        composeCastleFrame(
          parity,
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
          wfont4,
        );
      const ours = render(c.parity);
      const eng = engineRgba(c.fixture);
      // The per-member panels are parity-independent; the ONLY parity-gated
      // content is the animated water/fountain. The castle-N fixtures were
      // captured from arbitrary saves, so their fountain phase doesn't always
      // line up with a single parity tick. Match the fixture against BOTH phases
      // (any-of) so an arbitrary capture phase isn't penalised, while static
      // content (panels, gate, menu) must still match identically in both. The
      // empty-party main-menu fixtures stay strict single-phase (floor 100) —
      // they are the discrete-phase ground truth.
      const result =
        c.members.length > 0
          ? compareRgbaMulti(eng, [render(0), render(1)], { tolerance: 0 })
          : compareRgba(ours, eng, { tolerance: 0 });

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
