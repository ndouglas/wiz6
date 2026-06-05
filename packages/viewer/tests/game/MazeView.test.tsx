/**
 * MazeView component test (B4 walkable milestone).
 *
 * Verifies the render + movement WIRING (not pixel parity — that gate is Stage C
 * in tools/parity / packages/parser maze viewport parity):
 *   - With no session → redirects to /castle (renders the "no active game" fallback).
 *   - With a session + loaded assets → mounts a canvas and presents a frame
 *     (putImageData is called → non-blank present path runs).
 *   - ArrowLeft/Right → updateParty(turn(...)); ArrowUp → updateParty(tryStepForward(...));
 *     ArrowDown → no-op.
 *
 * The session store + the browser asset loader are mocked so the test has no I/O.
 * Canvas drawing uses the global getContext stub from tests/setup.ts (we spy on
 * putImageData to confirm a frame is presented).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type {
  ActiveParty,
  ActivePartyMember,
  DungeonLevel,
  Font,
  Font4bpp,
  MazeBlock,
  MazeParty,
  MazeRenderAssets,
  MessageDb,
  PortraitSet,
} from '@wiz6/data';
import {
  ActivePartySchema,
  FontSchema,
  Font4bppSchema,
  MessageDbSchema,
  PortraitSetSchema,
} from '@wiz6/data';
import {
  advanceEntry,
  turn,
  tryStepForward,
  loadMazeAssets as nodeLoadMazeAssets,
  renderMazeViewport,
  viewConfigKeyFor,
  type CapturedSpansTable,
  type NewgameViewports,
} from '@wiz6/parser';

// ── mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../src/data-loader.js', () => ({
  loadMazeAssets: vi.fn(),
  loadMazeWallSpans: vi.fn(),
  loadMessageDb: vi.fn(),
  loadFont: vi.fn(),
  loadFont4bpp: vi.fn(),
  loadPortraitSet: vi.fn(),
  loadNewgameViewports: vi.fn(),
}));

vi.mock('../../src/game/game-session-store.js', () => ({
  readGameSession: vi.fn(),
  updateParty: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock('../../src/lib/active-party-store.js', () => ({
  readActiveParty: vi.fn(),
}));

import { MazeView } from '../../src/pages/game/MazeView.js';
import {
  loadMazeAssets,
  loadMazeWallSpans,
  loadMessageDb,
  loadFont,
  loadFont4bpp,
  loadPortraitSet,
  loadNewgameViewports,
} from '../../src/data-loader.js';
import { readGameSession, updateParty, updateSession } from '../../src/game/game-session-store.js';
import { readActiveParty } from '../../src/lib/active-party-store.js';

const mockLoadMazeAssets = vi.mocked(loadMazeAssets);
const mockLoadMazeWallSpans = vi.mocked(loadMazeWallSpans);
const mockLoadMessageDb = vi.mocked(loadMessageDb);
const mockLoadFont = vi.mocked(loadFont);
const mockLoadFont4bpp = vi.mocked(loadFont4bpp);
const mockLoadPortraitSet = vi.mocked(loadPortraitSet);
const mockLoadNewgameViewports = vi.mocked(loadNewgameViewports);
const mockReadGameSession = vi.mocked(readGameSession);
const mockUpdateParty = vi.mocked(updateParty);
const mockUpdateSession = vi.mocked(updateSession);
const mockReadActiveParty = vi.mocked(readActiveParty);

// Real assets (so renderMazeViewport runs end-to-end without crashing).
const ASSETS: MazeRenderAssets = nodeLoadMazeAssets();

// Real committed message db + 1bpp UI font (the browser-served copies), so the
// narration decode + glyph render run end-to-end without I/O.

// Real committed level-0 block + captured wall spans (the browser-served copies).
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const LEVEL_0_REAL: DungeonLevel = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'extracted', 'maze', 'level-0.json'), 'utf8'),
) as DungeonLevel;
const WALL_SPANS: CapturedSpansTable = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'extracted', 'maze', 'wall-spans.json'), 'utf8'),
) as CapturedSpansTable;
const REAL_BLOCK: MazeBlock = LEVEL_0_REAL.mazeBlock;

// Real committed oracle viewports (newgame-viewports.json).
const NEWGAME_VIEWPORTS_RAW = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'extracted', 'maze', 'newgame-viewports.json'), 'utf8'),
) as Record<string, string>;
const NEWGAME_VIEWPORTS: NewgameViewports = Object.fromEntries(
  Object.entries(NEWGAME_VIEWPORTS_RAW).map(([k, v]) => [
    Number(k),
    Uint8Array.from(atob(v), (c) => c.charCodeAt(0)),
  ]),
);

const MSG_DB: MessageDb = MessageDbSchema.parse(
  JSON.parse(readFileSync(resolve(REPO_ROOT, 'extracted', 'messages', 'msg.json'), 'utf8')),
);

// Real committed party-panel fonts + portrait sets (browser-served copies), so
// the LIVE party-panel render runs end-to-end without I/O. wfont0 doubles as the
// narration/message font (loadFont serves it for both).
const WFONT0: Font = FontSchema.parse(
  JSON.parse(readFileSync(resolve(REPO_ROOT, 'extracted', 'fonts', 'wfont0.json'), 'utf8')),
);
const WFONT1: Font4bpp = Font4bppSchema.parse(
  JSON.parse(readFileSync(resolve(REPO_ROOT, 'extracted', 'fonts', 'wfont1.json'), 'utf8')),
);
const WFONT3: Font4bpp = Font4bppSchema.parse(
  JSON.parse(readFileSync(resolve(REPO_ROOT, 'extracted', 'fonts', 'wfont3.json'), 'utf8')),
);
const WFONT4: Font4bpp = Font4bppSchema.parse(
  JSON.parse(readFileSync(resolve(REPO_ROOT, 'extracted', 'fonts', 'wfont4.json'), 'utf8')),
);
const WPORT1: PortraitSet = PortraitSetSchema.parse(
  JSON.parse(readFileSync(resolve(REPO_ROOT, 'extracted', 'portraits', 'wport1.json'), 'utf8')),
);
const WPORT2: PortraitSet = PortraitSetSchema.parse(
  JSON.parse(readFileSync(resolve(REPO_ROOT, 'extracted', 'portraits', 'wport2.json'), 'utf8')),
);
const WPORT3: PortraitSet = PortraitSetSchema.parse(
  JSON.parse(readFileSync(resolve(REPO_ROOT, 'extracted', 'portraits', 'wport3.json'), 'utf8')),
);

/** Build a minimal valid ActivePartyMember (validated by ActivePartySchema). */
function fakeMember(overrides: Partial<ActivePartyMember> = {}): ActivePartyMember {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'AAA',
    race: 0,
    class: 0,
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
    reaction: 50,
    sex: 0,
    portraitSlotId: 0,
    rosterCharacterId: '00000000-0000-4000-8000-000000000001',
    ...overrides,
  } as ActivePartyMember;
}

function partyOf(members: ActivePartyMember[]): ActiveParty {
  return ActivePartySchema.parse({ schemaVersion: 1, members });
}

// Scripted entry config (level-0): ENTERING title (gy=117) → 3 narration lines →
// 4-step walk to the HMMMM bump (gy=121).
const SCRIPTED_ENTRY = {
  start: { gx: 127, gy: 117, z: 0, facing: 0 },
  steps: 4,
  titleMsgIds: [1212, 1213],
  narrationMsgIds: [10010, 10011, 10012],
  bumpMsgId: 10020,
} as const;

// case-04 (door@d0/front-wall/corridor) — a byte-exact captured wall case with
// substantive tile-2 spans. Representative from the committed wall-spans fixture.
const CASE_04_PARTY: MazeParty = { gx: 127, gy: 121, z: 0, facing: 2 };

// Minimal level/party at the level-0 entrance.
const ENTRANCE: MazeParty = { gx: 127, gy: 120, z: 0, facing: 0 };
const LEVEL_0: DungeonLevel = {
  id: 0,
  entrance: ENTRANCE,
  mazeBlock: {
    gxBase: new Array(12).fill(0),
    gyBase: new Array(12).fill(0),
    regions: [[]],
  },
};

// Same minimal level, but WITH a scripted entry (drives the narration + walk).
const LEVEL_0_SCRIPTED: DungeonLevel = { ...LEVEL_0, scriptedEntry: SCRIPTED_ENTRY };

function renderMazeView() {
  return render(
    <MemoryRouter initialEntries={['/game/maze']}>
      <Routes>
        <Route path="/game/maze" element={<MazeView />} />
        <Route path="/castle" element={<div role="main" aria-label="castle" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default narration loaders resolve to the real fixtures; tests that don't
  // exercise narration simply ignore them (free-roam levels have no scriptedEntry).
  mockLoadMessageDb.mockResolvedValue(MSG_DB);
  // loadFont serves wfont0 for BOTH narration and panel font0; the real wfont0.
  mockLoadFont.mockResolvedValue(WFONT0);
  // Panel fonts (wfont1/3/4) + portrait sets — keyed by URL so the right asset
  // resolves for each loader call.
  mockLoadFont4bpp.mockImplementation((url: string) =>
    Promise.resolve(
      url.includes('wfont1') ? WFONT1 : url.includes('wfont4') ? WFONT4 : WFONT3,
    ),
  );
  mockLoadPortraitSet.mockImplementation((url: string) =>
    Promise.resolve(url.includes('wport2') ? WPORT2 : url.includes('wport3') ? WPORT3 : WPORT1),
  );
  // Default active party: a single member (the panel renders LIVE). Individual
  // tests override per-scenario.
  mockReadActiveParty.mockReturnValue(partyOf([fakeMember()]));
  // Default oracle viewports resolve to the real committed asset; tests that
  // don't exercise the scripted entry (free-roam levels) simply ignore them.
  mockLoadNewgameViewports.mockResolvedValue(NEWGAME_VIEWPORTS);
});

describe('MazeView — no session', () => {
  beforeEach(() => {
    mockReadGameSession.mockReturnValue(null);
  });

  it('redirects to /castle when there is no active game', async () => {
    renderMazeView();
    await waitFor(() => {
      expect(screen.getByRole('main', { name: /castle/i })).toBeInTheDocument();
    });
  });

  it('does NOT load assets when there is no session', () => {
    renderMazeView();
    expect(mockLoadMazeAssets).not.toHaveBeenCalled();
  });
});

describe('MazeView — with a session', () => {
  beforeEach(() => {
    mockReadGameSession.mockReturnValue({
      schemaVersion: 3,
      level: LEVEL_0,
      party: { ...ENTRANCE },
      entryMode: 'free',
      stepsRemaining: 0,
    });
    mockLoadMazeAssets.mockResolvedValue(ASSETS);
    mockLoadMazeWallSpans.mockResolvedValue(WALL_SPANS);
  });

  it('mounts a 320×200 canvas', () => {
    const { container } = renderMazeView();
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
    expect(canvas!.width).toBe(320);
    expect(canvas!.height).toBe(200);
  });

  it('presents a frame once assets load (putImageData called)', async () => {
    // The setup stub returns a fresh ctx per getContext() call; install a
    // singleton ctx with a putImageData spy so we can observe the present path.
    const putImageData = vi.fn();
    const stableCtx = {
      imageSmoothingEnabled: false,
      putImageData,
    } as unknown as CanvasRenderingContext2D;
    const getCtxSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(stableCtx as unknown as ReturnType<HTMLCanvasElement['getContext']>);
    try {
      renderMazeView();
      await waitFor(() => expect(mockLoadMazeAssets).toHaveBeenCalled());
      await waitFor(() => expect(putImageData).toHaveBeenCalled());
    } finally {
      getCtxSpy.mockRestore();
    }
  });

  it('ArrowLeft → updateParty(turn left)', async () => {
    renderMazeView();
    await waitFor(() => expect(mockLoadMazeAssets).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(mockUpdateParty).toHaveBeenCalledWith(turn(ENTRANCE, 'left'));
  });

  it('ArrowRight → updateParty(turn right)', async () => {
    renderMazeView();
    await waitFor(() => expect(mockLoadMazeAssets).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(mockUpdateParty).toHaveBeenCalledWith(turn(ENTRANCE, 'right'));
  });

  it('ArrowUp → updateParty(tryStepForward)', async () => {
    renderMazeView();
    await waitFor(() => expect(mockLoadMazeAssets).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(mockUpdateParty).toHaveBeenCalledWith(
      tryStepForward(ENTRANCE, LEVEL_0.mazeBlock),
    );
  });

  it('ArrowDown → no-op (no updateParty)', async () => {
    renderMazeView();
    await waitFor(() => expect(mockLoadMazeAssets).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(mockUpdateParty).not.toHaveBeenCalled();
  });

  it('Enter → no-op in free-roam (OPTIONS/camp deferred)', async () => {
    renderMazeView();
    await waitFor(() => expect(mockLoadMazeAssets).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(mockUpdateParty).not.toHaveBeenCalled();
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it('renders the screen reader heading', () => {
    renderMazeView();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});

describe('MazeView — scripted entry (title → narration → gate-walk → bump → free)', () => {
  // The narration frame sits at gy=118 (one step past the gy=117 title start).
  const NARRATION_PARTY: MazeParty = { ...SCRIPTED_ENTRY.start, gy: 118 };

  /** Install a singleton ctx whose putImageData records the presented ImageData. */
  function spyPresent(): { frames: ImageData[]; restore: () => void } {
    const frames: ImageData[] = [];
    const stableCtx = {
      imageSmoothingEnabled: false,
      putImageData: (img: ImageData) => frames.push(img),
    } as unknown as CanvasRenderingContext2D;
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(stableCtx as unknown as ReturnType<HTMLCanvasElement['getContext']>);
    return { frames, restore: () => spy.mockRestore() };
  }

  beforeEach(() => {
    mockReadGameSession.mockReturnValue({
      schemaVersion: 3,
      level: LEVEL_0_SCRIPTED,
      party: { ...NARRATION_PARTY },
      entryMode: 'narration',
      stepsRemaining: 3,
    });
    mockLoadMazeAssets.mockResolvedValue(ASSETS);
    mockLoadMazeWallSpans.mockResolvedValue(WALL_SPANS);
  });

  it('renders white narration text in the bottom strip text band (y=153..174)', async () => {
    const { frames, restore } = spyPresent();
    try {
      renderMazeView();
      await waitFor(() => expect(mockLoadMessageDb).toHaveBeenCalledWith('/messages/msg.json'));
      await waitFor(() => expect(mockLoadFont).toHaveBeenCalledWith('/fonts/wfont0.json'));
      // Wait for a frame presented AFTER the narration loaded (non-black text band).
      await waitFor(() => {
        const img = frames[frames.length - 1];
        if (!img) throw new Error('no frame yet');
        let nonBlack = 0;
        for (let y = 153; y <= 174; y++) {
          for (let x = 8; x < 312; x++) {
            const o = (y * 320 + x) * 4;
            if (img.data[o] || img.data[o + 1] || img.data[o + 2]) nonBlack++;
          }
        }
        if (nonBlack === 0) throw new Error('text band still blank');
      });
    } finally {
      restore();
    }
  });

  it('Enter advances narration → gate-walk (+1 forward step, dismisses text)', async () => {
    renderMazeView();
    await waitFor(() => expect(mockLoadMazeAssets).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: 'Enter' });
    const expected = advanceEntry(
      { party: NARRATION_PARTY, entryMode: 'narration', stepsRemaining: 3 },
      LEVEL_0_SCRIPTED.mazeBlock,
    );
    expect(expected.entryMode).toBe('gate-walk');
    expect(expected.party.gy).toBe(119); // narration ENTER steps gy 118→119
    expect(mockUpdateSession).toHaveBeenCalledWith(expected);
    expect(mockUpdateParty).not.toHaveBeenCalled();
  });

  it('arrow keys are inert during narration', async () => {
    renderMazeView();
    await waitFor(() => expect(mockLoadMazeAssets).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(mockUpdateParty).not.toHaveBeenCalled();
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it('Enters drive the FSM narration → gate-walk → bump → free (via MazeView dispatch)', async () => {
    // MazeView chains each advanceEntry result through its local sessionRef, so
    // consecutive Enter presses walk the FSM forward. Verify the *wiring*: the
    // sequence of updateSession entryMode values, ending in 'free'. The seeded
    // frame is the narration frame (gy=118, stepsRemaining=3 — one step already
    // consumed by title→narration). (The exact pixel rendering of each frame is
    // owned by the pixel-parity task, not this wiring test.)
    renderMazeView();
    await waitFor(() => expect(mockLoadMazeAssets).toHaveBeenCalled());

    fireEvent.keyDown(window, { key: 'Enter' }); // narration → gate-walk (gy119)
    fireEvent.keyDown(window, { key: 'Enter' }); // gate-walk → bump (gy120, inner-gate HMMMM)
    fireEvent.keyDown(window, { key: 'Enter' }); // bump → bump (gy121, dead-end HMMMM)
    fireEvent.keyDown(window, { key: 'Enter' }); // bump → free

    const modes = mockUpdateSession.mock.calls.map((c) => (c[0] as { entryMode: string }).entryMode);
    expect(modes).toEqual(['gate-walk', 'bump', 'bump', 'free']);
    // A 5th Enter in free-roam is the OPTIONS no-op: no further updateSession.
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(mockUpdateSession).toHaveBeenCalledTimes(4);
    // The party never moved via updateParty during the scripted entry.
    expect(mockUpdateParty).not.toHaveBeenCalled();
  });

  it('oracle viewport: scripted-entry frame (gy=118) viewport region is non-blank and matches the committed fixture slice', async () => {
    // The oracle viewports are loaded alongside other assets. Once
    // loadNewgameViewports resolves, composeFrame should blit the committed gate
    // pixels into the MAZE_VIEWPORT rect of the presented frame.
    const { frames, restore } = spyPresent();
    try {
      renderMazeView();
      await waitFor(() => expect(mockLoadMazeAssets).toHaveBeenCalled());
      // Wait for the oracle viewports to load (triggers a re-present).
      await waitFor(() => expect(mockLoadNewgameViewports).toHaveBeenCalled());
      // Wait for at least one frame to be presented after oracle load.
      await waitFor(() => expect(frames.length).toBeGreaterThan(0));

      const img = frames[frames.length - 1]!;
      // The viewport rect in the 320×200 frame.
      const ENGINE_W = 320;
      const { x: vx, y: vy, w: vw, h: vh } = { x: 72, y: 32, w: 176, h: 112 };

      // (a) Non-blank: the oracle data has 15797 non-zero pixels for gy=118; the
      //     viewport should contain non-black RGBA pixels.
      let nonBlack = 0;
      for (let row = 0; row < vh; row++) {
        for (let col = 0; col < vw; col++) {
          const o = ((vy + row) * ENGINE_W + (vx + col)) * 4;
          if (img.data[o] || img.data[o + 1] || img.data[o + 2]) nonBlack++;
        }
      }
      expect(nonBlack, 'viewport should contain non-black pixels (oracle gate)').toBeGreaterThan(0);

      // (b) Viewport region matches the oracle buffer for gy=118 mapped through
      //     COMPOSED_PALETTE (the same palette MazeView uses).
      const COMPOSED_PALETTE: readonly [number, number, number][] = [
        [0, 0, 0], [255, 255, 255], [85, 85, 255], [255, 85, 255],
        [255, 85, 85], [255, 255, 85], [85, 255, 85], [85, 255, 255],
        [85, 85, 85], [170, 170, 170], [0, 0, 170], [170, 0, 170],
        [170, 0, 0], [170, 85, 0], [0, 170, 0], [0, 170, 170],
      ];
      const oracleBuf = NEWGAME_VIEWPORTS[118]!;
      let mismatches = 0;
      let firstDiff: string | null = null;
      for (let row = 0; row < vh; row++) {
        for (let col = 0; col < vw; col++) {
          const idx = oracleBuf[row * vw + col]!;
          const [er, eg, eb] = COMPOSED_PALETTE[idx] ?? COMPOSED_PALETTE[0]!;
          const frameOff = ((vy + row) * ENGINE_W + (vx + col)) * 4;
          if (
            img.data[frameOff] !== er ||
            img.data[frameOff + 1] !== eg ||
            img.data[frameOff + 2] !== eb
          ) {
            mismatches++;
            if (firstDiff === null) {
              firstDiff = `vp(${col},${row}) got [${img.data[frameOff]},${img.data[frameOff + 1]},${img.data[frameOff + 2]}] want [${er},${eg},${eb}]`;
            }
          }
        }
      }
      expect(
        mismatches,
        `viewport should match oracle pixels (${mismatches}/${vw * vh} differ; first: ${firstDiff})`,
      ).toBe(0);
    } finally {
      restore();
    }
  });
});

describe('MazeView — captured wall spans (Task D1 byte-exact case)', () => {
  beforeEach(() => {
    // Real committed level-0 block at case-04's representative (a door recess with
    // substantive tile-2 walls), so the captured-span lookup HITS and the live
    // render draws real wall pixels.
    mockReadGameSession.mockReturnValue({
      schemaVersion: 3,
      level: { ...LEVEL_0_REAL, entrance: CASE_04_PARTY },
      party: { ...CASE_04_PARTY },
      entryMode: 'free',
      stepsRemaining: 0,
    });
    mockLoadMazeAssets.mockResolvedValue(ASSETS);
    mockLoadMazeWallSpans.mockResolvedValue(WALL_SPANS);
  });

  /** Install a singleton ctx whose putImageData records the presented ImageData. */
  function spyPresent(): { frames: ImageData[]; restore: () => void } {
    const frames: ImageData[] = [];
    const stableCtx = {
      imageSmoothingEnabled: false,
      putImageData: (img: ImageData) => frames.push(img),
    } as unknown as CanvasRenderingContext2D;
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(stableCtx as unknown as ReturnType<HTMLCanvasElement['getContext']>);
    return { frames, restore: () => spy.mockRestore() };
  }

  it('renders a NON-BLANK viewport (real wall pixels) for a byte-exact case', async () => {
    const { frames, restore } = spyPresent();
    try {
      renderMazeView();
      // Both async loaders must resolve before the byte-exact frame is presented.
      await waitFor(() => expect(mockLoadMazeAssets).toHaveBeenCalled());
      await waitFor(() => expect(mockLoadMazeWallSpans).toHaveBeenCalled());
      await waitFor(() => expect(frames.length).toBeGreaterThan(0));

      const img = frames[frames.length - 1]!;
      // The viewport rect is x=72,y=32,w=176,h=112 in the 320×200 frame; a door
      // recess paints non-black wall pixels inside it. Count non-black pixels.
      const ENGINE_W = 320;
      const { x: vx, y: vy, w: vw, h: vh } = { x: 72, y: 32, w: 176, h: 112 };
      let nonBlack = 0;
      for (let row = 0; row < vh; row++) {
        for (let col = 0; col < vw; col++) {
          const o = ((vy + row) * ENGINE_W + (vx + col)) * 4;
          if (img.data[o] || img.data[o + 1] || img.data[o + 2]) nonBlack++;
        }
      }
      expect(nonBlack).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  it('the config-key lookup HITS the committed case-04 entry', () => {
    // The renderer looks up captured spans by viewConfigKeyFor(block, party). If
    // the live key drifted from how C2 keyed the fixture, the lookup would miss
    // and silently fall back. Assert the live key EQUALS case-04's committed key.
    const case04 = WALL_SPANS.cases.find((c) => c.id === 'case-04')!;
    expect(viewConfigKeyFor(REAL_BLOCK, CASE_04_PARTY)).toBe(case04.configKey);
    // And the captured render at that view is non-blank (real door-recess walls).
    const direct = renderMazeViewport(REAL_BLOCK, CASE_04_PARTY, ASSETS, {
      capturedSpans: WALL_SPANS,
    });
    expect(direct.some((v) => v !== 0)).toBe(true);
  });

  it('the captured path CHANGES the render vs generation (case-26 junction)', () => {
    // case-26 (4-way junction recess) is a byte-exact captured case whose spans
    // DIFFER from the generation path. The captured render must therefore differ
    // from the bare generation render — proving the captured spans were actually
    // used (the lookup hit and fed opts.capturedSpans), not the corridor fallback.
    const CASE_26: MazeParty = { gx: 126, gy: 122, z: 0, facing: 2 };
    const case26 = WALL_SPANS.cases.find((c) => c.id === 'case-26')!;
    expect(viewConfigKeyFor(REAL_BLOCK, CASE_26)).toBe(case26.configKey);
    const captured = renderMazeViewport(REAL_BLOCK, CASE_26, ASSETS, {
      capturedSpans: WALL_SPANS,
    });
    const generated = renderMazeViewport(REAL_BLOCK, CASE_26, ASSETS);
    expect(captured.some((v) => v !== 0)).toBe(true);
    expect(Buffer.from(captured).equals(Buffer.from(generated))).toBe(false);
  });
});

describe('MazeView — LIVE party panel (Task 3: not the baked party)', () => {
  /** Install a singleton ctx whose putImageData records the presented ImageData. */
  function spyPresent(): { frames: ImageData[]; restore: () => void } {
    const frames: ImageData[] = [];
    const stableCtx = {
      imageSmoothingEnabled: false,
      putImageData: (img: ImageData) => frames.push(img),
    } as unknown as CanvasRenderingContext2D;
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(stableCtx as unknown as ReturnType<HTMLCanvasElement['getContext']>);
    return { frames, restore: () => spy.mockRestore() };
  }

  beforeEach(() => {
    mockReadGameSession.mockReturnValue({
      schemaVersion: 3,
      level: LEVEL_0,
      party: { ...ENTRANCE },
      entryMode: 'free',
      stepsRemaining: 0,
    });
    mockLoadMazeAssets.mockResolvedValue(ASSETS);
    mockLoadMazeWallSpans.mockResolvedValue(WALL_SPANS);
  });

  // The two side party-panel columns the live render overwrites: LEFT panel
  // window @ screen (8,40), RIGHT @ (256,40), each 7 cells (56px) × 12 cells
  // (96px). Sample only the name-row band so two distinct names visibly differ.
  const LEFT = { x: 8, y: 40, w: 56, h: 96 };
  const RIGHT = { x: 256, y: 40, w: 56, h: 96 };

  function regionBytes(img: ImageData, r: { x: number; y: number; w: number; h: number }): number[] {
    const out: number[] = [];
    for (let row = 0; row < r.h; row++) {
      for (let col = 0; col < r.w; col++) {
        const o = ((r.y + row) * 320 + (r.x + col)) * 4;
        out.push(img.data[o]!, img.data[o + 1]!, img.data[o + 2]!);
      }
    }
    return out;
  }

  async function presentForParty(members: ActivePartyMember[]): Promise<ImageData> {
    mockReadActiveParty.mockReturnValue(partyOf(members));
    const { frames, restore } = spyPresent();
    try {
      renderMazeView();
      await waitFor(() => expect(mockLoadMazeAssets).toHaveBeenCalled());
      // Panel fonts must load before the live panel is drawn.
      await waitFor(() => expect(mockLoadFont4bpp).toHaveBeenCalledWith('/fonts/wfont3.json'));
      await waitFor(() => expect(frames.length).toBeGreaterThan(0));
      return frames[frames.length - 1]!;
    } finally {
      restore();
    }
  }

  it('the LEFT/RIGHT panel columns differ for two different parties', async () => {
    const partyA = await presentForParty([
      fakeMember({ name: 'NATHAN', portraitIndex: 0 }),
      fakeMember({ name: 'GANDALF', portraitIndex: 5 }),
    ]);
    const leftA = regionBytes(partyA, LEFT);
    const rightA = regionBytes(partyA, RIGHT);

    vi.clearAllMocks();
    // Re-establish the per-suite defaults cleared above.
    mockLoadMessageDb.mockResolvedValue(MSG_DB);
    mockLoadFont.mockResolvedValue(WFONT0);
    mockLoadFont4bpp.mockImplementation((url: string) =>
      Promise.resolve(url.includes('wfont1') ? WFONT1 : url.includes('wfont4') ? WFONT4 : WFONT3),
    );
    mockLoadPortraitSet.mockImplementation((url: string) =>
      Promise.resolve(url.includes('wport2') ? WPORT2 : url.includes('wport3') ? WPORT3 : WPORT1),
    );
    mockLoadNewgameViewports.mockResolvedValue(NEWGAME_VIEWPORTS);
    mockReadGameSession.mockReturnValue({
      schemaVersion: 3,
      level: LEVEL_0,
      party: { ...ENTRANCE },
      entryMode: 'free',
      stepsRemaining: 0,
    });
    mockLoadMazeAssets.mockResolvedValue(ASSETS);
    mockLoadMazeWallSpans.mockResolvedValue(WALL_SPANS);

    const partyB = await presentForParty([
      fakeMember({ name: 'ZOLTAN', portraitIndex: 14 }),
      fakeMember({ name: 'MERLINX', portraitIndex: 28 }),
    ]);
    const leftB = regionBytes(partyB, LEFT);
    const rightB = regionBytes(partyB, RIGHT);

    // Different parties → different panel pixels (NOT a baked, party-invariant set).
    expect(leftA).not.toEqual(leftB);
    expect(rightA).not.toEqual(rightB);
  });

  it('the panel columns match composePartyPanels output at the slot coords', async () => {
    const members = [
      fakeMember({ name: 'NATHAN', portraitIndex: 0 }),
      fakeMember({ name: 'GANDALF', portraitIndex: 5 }),
      fakeMember({ name: 'BORIS', portraitIndex: 17 }),
    ];
    const img = await presentForParty(members);

    // Build the EXPECTED panel pixels directly via the shared compositor over a
    // black background, then assert the presented frame's panel regions match.
    const { composePartyPanels } = await import('../../src/pages/game/party-panel-compose.js');
    const expected = new Uint8ClampedArray(320 * 200 * 4);
    composePartyPanels(
      expected,
      members,
      { font0: WFONT0, font1: WFONT1, font3: WFONT3, font4: WFONT4 },
      [WPORT1, WPORT2, WPORT3],
    );
    const expImg = { data: expected } as ImageData;

    // The panel windows fully overwrite the side columns, so the frame's panel
    // region must equal the compositor's output there.
    expect(regionBytes(img, LEFT)).toEqual(regionBytes(expImg, LEFT));
    expect(regionBytes(img, RIGHT)).toEqual(regionBytes(expImg, RIGHT));
  });

  it('a partial party leaves empty slots blank (no stale baked portrait)', async () => {
    // Single member in slot 0 (LEFT). Slot 1 (RIGHT) and slots 2..5 are empty —
    // they must render as the engine's solid-gray cleared panel, NOT a baked
    // portrait. Compare against the compositor's ground truth.
    const members = [fakeMember({ name: 'SOLO', portraitIndex: 3 })];
    const img = await presentForParty(members);

    const { composePartyPanels } = await import('../../src/pages/game/party-panel-compose.js');
    const expected = new Uint8ClampedArray(320 * 200 * 4);
    composePartyPanels(
      expected,
      members,
      { font0: WFONT0, font1: WFONT1, font3: WFONT3, font4: WFONT4 },
      [WPORT1, WPORT2, WPORT3],
    );
    const expImg = { data: expected } as ImageData;

    // The RIGHT column (all slots empty) must equal the cleared-panel ground
    // truth — i.e. uniform gray space, not the baked THESUS/LYSANDR portraits.
    expect(regionBytes(img, RIGHT)).toEqual(regionBytes(expImg, RIGHT));
  });
});
