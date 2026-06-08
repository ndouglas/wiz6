/**
 * newgame-sequence-parity.test.ts — FULL-SCREEN, PER-FRAME, BYTE-EXACT parity
 * gate (gate-tier `.test.ts`, runs in default CI; tolerance 0) for the
 * START-NEW-GAME scripted entry sequence, frames 02–06.
 *
 * ── THE PROOF (Task 5) ──
 * For each scripted entry frame we compose the SAME full 320×200 frame MazeView
 * draws — static chrome + LIVE party panel + oracle viewport + per-mode bottom
 * strip — and compare it to the committed engine framebuffer fixture
 * (tools/parity/fixtures/engine/newgame-seq-0N.idx.gz) PIXEL-FOR-PIXEL, at
 * tolerance 0 (100% = 0/64000 diff over the gated region).
 *
 * ── COMPOSE PATH (mirrors MazeView.composeFrame exactly) ──
 *   1. composeMazeFrame(panels)  — static chrome + LIVE 6-member party panel
 *      (overwrites the baked chrome side columns). Same pure compositor the
 *      castle MASTER OPTIONS screen uses (RE-confirmed: dungeon panel ==
 *      MASTER OPTIONS panel byte-exact).
 *   2. oracle viewport blit at MAZE_VIEWPORT — committed engine pixels for the
 *      gate view (the banked tile atlas can't be rendered byte-exact). This
 *      region is byte-exact BY CONSTRUCTION (the oracle is a slice of the
 *      fixture's MAZE_VIEWPORT).
 *   3. drawEntryStrip(mode) — the per-entryMode bottom strip (y144–199).
 *
 * So the gate's TEACHING content is the CHROME + PARTY PANEL + STRIP; the
 * viewport is oracle'd (intended, see CLAUDE.md parity notes for fixed
 * sequences). If the panel doesn't match, the roster seeding is wrong — fix the
 * seeding, not the tolerance.
 *
 * ── ROSTER SEEDING ──
 * The fixtures were captured with the pinned 6-member roster
 * (THESUS/TEMPEST/LYSANDR/NOBAL/TREON/PENTAG = test-fixtures/original/pcfile.dbs
 * slots 0–5). We decode that SAME pcfile offline and build ActivePartyMembers via
 * pcfileSlotToCharacter — the identical path castle-parity.test.ts's
 * loadPinnedRosterParty uses. portraitSlotId == party index (engine lays out
 * portraits column-major: 0,2,4 LEFT; 1,3,5 RIGHT).
 *
 * ── PER-FRAME REGIONS RENDERED vs ORACLE ──
 *   02 title     gy=117  chrome + panel + TITLE strip (gray + blue ENTERING/BANE) | oracle: corridor
 *   03 narration gy=118  chrome + panel + NARRATION strip (black + 3 yellow lines) | oracle: close inner gate
 *   04 gate-walk gy=119  chrome + panel + GATE-WALK strip (clean black, no text)   | oracle: corridor
 *   05 bump      gy=120  chrome + panel + BUMP strip (black + yellow HMMMM...)      | oracle: inner gate
 *   06 bump      gy=121  chrome + panel + BUMP strip (black + yellow HMMMM...)      | oracle: dead-end
 *
 * ── ONE DOCUMENTED EXCLUSION: the run-to-run mouse cursor (frame 03 only) ──
 * The narration fixture (frame 03) was re-captured at remintStep=60 (after the
 * engine redraws the message window), by which point the engine's MOUSE CURSOR
 * has been drawn into the bottom-right of the strip — a NON-DETERMINISTIC
 * software cursor (idx 12 dark-red [170,0,0] + idx 1 white outline), bounded
 * EXACTLY to x=313..319, y=184..190 (49 px, 7×7). Frames 02/04/05/06 were captured at
 * phases where the cursor is not in that spot. We exclude that 7×7 cursor rect
 * (a deliberate, documented per-region exclusion per CLAUDE.md — NOT a tolerance
 * lift; everything outside it is gated at tolerance 0). The existing
 * maze-entry-narration parity gate handled the same artifact by starting its band
 * below the cursor.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FontSchema,
  Font4bppSchema,
  PortraitSetSchema,
  MessageDbSchema,
  MAZE_VIEWPORT,
  type ActivePartyMember,
  type Font,
  type Font4bpp,
  type PortraitSet,
  type MessageDb,
  type Palette,
} from '@wiz6/data';
import {
  decodePcfile,
  pcfileSlotToCharacter,
  decodeNarrationLines,
  drawEntryStrip,
  type EntryMode,
  type EntryStripText,
} from '@wiz6/parser';
import {
  composeMazeFrame,
  type MazePartyPanels,
} from '../../src/pages/game/compose-maze-frame.js';
import { COMPOSED_PALETTE, indicesToRgba } from '../../../../tools/parity/decode-screen.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');
const FIX = resolve(ROOT, 'tools/parity/fixtures/engine');
const W = 320;
const H = 200;

/** Palette object for drawEntryStrip (same COMPOSED_PALETTE MazeView uses). */
const PALETTE: Palette = {
  name: 'composed-ega',
  provenance: 'COMPOSED_PALETTE (decode-screen)',
  colors: COMPOSED_PALETTE.map((c) => [...c]) as Palette['colors'],
};

/** The non-deterministic mouse-cursor rect to exclude (frame 03 only). */
const CURSOR = { x0: 313, x1: 319, y0: 184, y1: 190 };

function engineRgba(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(resolve(FIX, name)));
  return indicesToRgba(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
}

/** Decode the pinned pcfile.dbs slots 0..n-1 into ActivePartyMembers (same path
 *  as castle-parity.test.ts loadPinnedRosterParty). */
function loadPinnedRosterParty(n: number): ActivePartyMember[] {
  const bytes = readFileSync(resolve(ROOT, 'test-fixtures/original/pcfile.dbs'));
  const pc = decodePcfile(new Uint8Array(bytes));
  const populated = pc.slots.filter((s) => s.populated);
  if (populated.length < n) throw new Error(`pinned pcfile has ${populated.length} chars, need ${n}`);
  return populated.slice(0, n).map((slot, i) => {
    const uuid = `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
    const c = pcfileSlotToCharacter(slot, uuid);
    return { ...c, rosterCharacterId: uuid, portraitSlotId: i };
  });
}

interface SeqCase {
  fixture: string;
  gy: number;
  mode: EntryMode;
  /** Skip the cursor rect (frame 03's non-deterministic mouse cursor). */
  excludeCursor: boolean;
}

const CASES: SeqCase[] = [
  { fixture: 'newgame-seq-02-entering-title.idx.gz', gy: 117, mode: 'title', excludeCursor: false },
  { fixture: 'newgame-seq-03-narration.idx.gz', gy: 118, mode: 'narration', excludeCursor: true },
  { fixture: 'newgame-seq-04-walk-gy119.idx.gz', gy: 119, mode: 'gate-walk', excludeCursor: false },
  { fixture: 'newgame-seq-05-walk-gy120.idx.gz', gy: 120, mode: 'bump', excludeCursor: false },
  { fixture: 'newgame-seq-06-walk-gy121-hmmm.idx.gz', gy: 121, mode: 'bump', excludeCursor: false },
];

describe('START-NEW-GAME sequence FULL-SCREEN per-frame parity (GATE, tolerance 0)', () => {
  let wfont0: Font;
  let wfont1: Font4bpp;
  let wfont3: Font4bpp;
  let wfont4: Font4bpp;
  let portraitSets: PortraitSet[];
  let msgDb: MessageDb;
  let viewportsJson: Record<string, string>;
  let text: EntryStripText;
  let panels: MazePartyPanels;

  beforeAll(() => {
    wfont0 = FontSchema.parse(
      JSON.parse(readFileSync(resolve(ROOT, 'extracted/fonts/wfont0.json'), 'utf8')),
    );
    wfont1 = Font4bppSchema.parse(
      JSON.parse(readFileSync(resolve(ROOT, 'extracted/fonts/wfont1.json'), 'utf8')),
    );
    wfont3 = Font4bppSchema.parse(
      JSON.parse(readFileSync(resolve(ROOT, 'extracted/fonts/wfont3.json'), 'utf8')),
    );
    wfont4 = Font4bppSchema.parse(
      JSON.parse(readFileSync(resolve(ROOT, 'extracted/fonts/wfont4.json'), 'utf8')),
    );
    portraitSets = [1, 2, 3].map((n) =>
      PortraitSetSchema.parse(
        JSON.parse(readFileSync(resolve(ROOT, `extracted/portraits/wport${n}.json`), 'utf8')),
      ),
    );
    msgDb = MessageDbSchema.parse(
      JSON.parse(readFileSync(resolve(ROOT, 'extracted/messages/msg.json'), 'utf8')),
    );
    viewportsJson = JSON.parse(
      readFileSync(resolve(ROOT, 'extracted/maze/newgame-viewports.json'), 'utf8'),
    ) as Record<string, string>;

    text = {
      title: decodeNarrationLines(msgDb, [1212, 1213]),
      narration: decodeNarrationLines(msgDb, [10010, 10011, 10012]),
      bump: decodeNarrationLines(msgDb, [10020])[0] ?? '',
    };

    panels = {
      members: loadPinnedRosterParty(6),
      fonts: { font0: wfont0, font1: wfont1, font3: wfont3, font4: wfont4 },
      portraitSets,
    };
  });

  /** Oracle viewport (176×112 RGBA) for a scripted gy. */
  function oracleRgba(gy: number): Uint8Array {
    const b64 = viewportsJson[String(gy)];
    if (!b64) throw new Error(`no oracle viewport for gy=${gy}`);
    const idx = Uint8Array.from(Buffer.from(b64, 'base64'));
    return indicesToRgba(idx);
  }

  /** Compose the full 320×200 frame exactly as MazeView.composeFrame does. */
  function composeFull(gy: number, mode: EntryMode): Uint8Array {
    const frame = composeMazeFrame(panels); // chrome + live party panel
    const vp = oracleRgba(gy);
    const { x: vx, y: vy, w: vw, h: vh } = MAZE_VIEWPORT;
    for (let r = 0; r < vh; r++) {
      for (let c = 0; c < vw; c++) {
        const s = (r * vw + c) * 4;
        const d = ((vy + r) * W + (vx + c)) * 4;
        frame[d] = vp[s]!;
        frame[d + 1] = vp[s + 1]!;
        frame[d + 2] = vp[s + 2]!;
        frame[d + 3] = 0xff;
      }
    }
    if (mode !== 'free') {
      const rgba = new Uint8ClampedArray(frame.buffer);
      drawEntryStrip(rgba, W, H, mode, text, wfont0, PALETTE);
    }
    return frame;
  }

  for (const cs of CASES) {
    it(`${cs.fixture} (gy=${cs.gy}, ${cs.mode}): FULL-SCREEN byte-exact (0 diff)`, () => {
      const ours = composeFull(cs.gy, cs.mode);
      const eng = engineRgba(cs.fixture);
      let diff = 0;
      const samples: string[] = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (
            cs.excludeCursor &&
            x >= CURSOR.x0 &&
            x <= CURSOR.x1 &&
            y >= CURSOR.y0 &&
            y <= CURSOR.y1
          )
            continue;
          const o = (y * W + x) * 4;
          if (ours[o] !== eng[o] || ours[o + 1] !== eng[o + 1] || ours[o + 2] !== eng[o + 2]) {
            diff++;
            if (samples.length < 12)
              samples.push(
                `(${x},${y}) ours=${ours[o]},${ours[o + 1]},${ours[o + 2]} eng=${eng[o]},${eng[o + 1]},${eng[o + 2]}`,
              );
          }
        }
      }
      expect(diff, `${cs.fixture}: ${diff} diff px — ${samples.join(' | ')}`).toBe(0);
    });
  }

  // ── ANIMATION FRAMES (Stage 4) — the two entry viewport animations ──
  // door:0..7 = castle doors sliding apart (entryMode 'door-open' → clean-black strip)
  // gate:0..7 = dungeon portcullis lifting open (entryMode 'gate-open' → black + HMMMM)
  // Byte-exact by construction: the viewport is the committed `<seq>:<n>` oracle slice
  // (=== the fixture's MAZE_VIEWPORT), and chrome+panel+strip are rendered. The mouse
  // is parked off-screen in these captures (no cursor exclusion needed).
  /** Compose the full frame for an animation oracle key `<seq>:<n>` + entry mode. */
  function composeAnimFull(seq: 'door' | 'gate', frame: number, mode: EntryMode): Uint8Array {
    const f = composeMazeFrame(panels);
    const b64 = viewportsJson[`${seq}:${frame}`];
    if (!b64) throw new Error(`no oracle viewport for ${seq}:${frame}`);
    const vp = indicesToRgba(Uint8Array.from(Buffer.from(b64, 'base64')));
    const { x: vx, y: vy, w: vw, h: vh } = MAZE_VIEWPORT;
    for (let r = 0; r < vh; r++) {
      for (let c = 0; c < vw; c++) {
        const s = (r * vw + c) * 4;
        const d = ((vy + r) * W + (vx + c)) * 4;
        f[d] = vp[s]!;
        f[d + 1] = vp[s + 1]!;
        f[d + 2] = vp[s + 2]!;
        f[d + 3] = 0xff;
      }
    }
    const rgba = new Uint8ClampedArray(f.buffer);
    drawEntryStrip(rgba, W, H, mode, text, wfont0, PALETTE);
    return f;
  }

  const ANIM_CASES: { seq: 'door' | 'gate'; mode: EntryMode }[] = [
    { seq: 'door', mode: 'door-open' },
    { seq: 'gate', mode: 'gate-open' },
  ];
  for (const { seq, mode } of ANIM_CASES) {
    for (let n = 0; n < 8; n++) {
      const fixture = `newgame-anim-${seq}-${String(n).padStart(2, '0')}.idx.gz`;
      it(`${fixture} (${seq}:${n}, ${mode}): FULL-SCREEN byte-exact (0 diff)`, () => {
        const ours = composeAnimFull(seq, n, mode);
        const eng = engineRgba(fixture);
        let diff = 0;
        const samples: string[] = [];
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const o = (y * W + x) * 4;
            if (ours[o] !== eng[o] || ours[o + 1] !== eng[o + 1] || ours[o + 2] !== eng[o + 2]) {
              diff++;
              if (samples.length < 12)
                samples.push(
                  `(${x},${y}) ours=${ours[o]},${ours[o + 1]},${ours[o + 2]} eng=${eng[o]},${eng[o + 1]},${eng[o + 2]}`,
                );
            }
          }
        }
        expect(diff, `${fixture}: ${diff} diff px — ${samples.join(' | ')}`).toBe(0);
      });
    }
  }
});
