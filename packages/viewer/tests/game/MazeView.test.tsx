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
  DungeonLevel,
  Font,
  MazeBlock,
  MazeParty,
  MazeRenderAssets,
  MessageDb,
} from '@wiz6/data';
import { FontSchema, MessageDbSchema } from '@wiz6/data';
import {
  advanceEntry,
  turn,
  tryStepForward,
  loadMazeAssets as nodeLoadMazeAssets,
  renderMazeViewport,
  viewConfigKeyFor,
  type CapturedSpansTable,
} from '@wiz6/parser';

// ── mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../src/data-loader.js', () => ({
  loadMazeAssets: vi.fn(),
  loadMazeWallSpans: vi.fn(),
  loadMessageDb: vi.fn(),
  loadFont: vi.fn(),
}));

vi.mock('../../src/game/game-session-store.js', () => ({
  readGameSession: vi.fn(),
  updateParty: vi.fn(),
  updateSession: vi.fn(),
}));

import { MazeView } from '../../src/pages/game/MazeView.js';
import { loadMazeAssets, loadMazeWallSpans, loadMessageDb, loadFont } from '../../src/data-loader.js';
import { readGameSession, updateParty, updateSession } from '../../src/game/game-session-store.js';

const mockLoadMazeAssets = vi.mocked(loadMazeAssets);
const mockLoadMazeWallSpans = vi.mocked(loadMazeWallSpans);
const mockLoadMessageDb = vi.mocked(loadMessageDb);
const mockLoadFont = vi.mocked(loadFont);
const mockReadGameSession = vi.mocked(readGameSession);
const mockUpdateParty = vi.mocked(updateParty);
const mockUpdateSession = vi.mocked(updateSession);

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

const MSG_DB: MessageDb = MessageDbSchema.parse(
  JSON.parse(readFileSync(resolve(REPO_ROOT, 'extracted', 'messages', 'msg.json'), 'utf8')),
);
const MSG_FONT: Font = FontSchema.parse(
  JSON.parse(readFileSync(resolve(REPO_ROOT, 'extracted', 'fonts', 'wfont0.json'), 'utf8')),
);

// Scripted entry config (level-0): 3 narration lines, 3-step gate-walk.
const SCRIPTED_ENTRY = {
  start: { gx: 127, gy: 118, z: 0, facing: 0 },
  steps: 3,
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
  mockLoadFont.mockResolvedValue(MSG_FONT);
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
      schemaVersion: 2,
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

describe('MazeView — scripted entry (narration + gate-walk)', () => {
  const NARRATION_PARTY: MazeParty = { ...SCRIPTED_ENTRY.start };

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
      schemaVersion: 2,
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

  it('Enter advances narration → gate-walk (party unchanged)', async () => {
    renderMazeView();
    await waitFor(() => expect(mockLoadMazeAssets).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: 'Enter' });
    const expected = advanceEntry(
      { party: NARRATION_PARTY, entryMode: 'narration', stepsRemaining: 3 },
      LEVEL_0_SCRIPTED.mazeBlock,
    );
    expect(expected.entryMode).toBe('gate-walk');
    expect(expected.party).toEqual(NARRATION_PARTY); // narration ENTER = no move
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

  it('4 Enters drive the FSM narration → gate-walk → free (via MazeView dispatch)', async () => {
    // MazeView chains each advanceEntry result through its local sessionRef, so
    // consecutive Enter presses walk the FSM forward. Verify the *wiring*: the
    // sequence of updateSession entryMode values, ending in 'free' after the
    // 3-step gate-walk is exhausted. (The exact party gy at the endpoint is owned
    // by the movement-geometry / pixel-parity task, not this wiring test.)
    renderMazeView();
    await waitFor(() => expect(mockLoadMazeAssets).toHaveBeenCalled());

    fireEvent.keyDown(window, { key: 'Enter' }); // narration → gate-walk
    fireEvent.keyDown(window, { key: 'Enter' }); // gate-walk step 1
    fireEvent.keyDown(window, { key: 'Enter' }); // gate-walk step 2
    fireEvent.keyDown(window, { key: 'Enter' }); // gate-walk step 3 → free

    const modes = mockUpdateSession.mock.calls.map((c) => (c[0] as { entryMode: string }).entryMode);
    expect(modes).toEqual(['gate-walk', 'gate-walk', 'gate-walk', 'free']);
    // A 5th Enter in free-roam is the OPTIONS no-op: no further updateSession.
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(mockUpdateSession).toHaveBeenCalledTimes(4);
    // The party never moved via updateParty during the scripted entry.
    expect(mockUpdateParty).not.toHaveBeenCalled();
  });
});

describe('MazeView — captured wall spans (Task D1 byte-exact case)', () => {
  beforeEach(() => {
    // Real committed level-0 block at case-04's representative (a door recess with
    // substantive tile-2 walls), so the captured-span lookup HITS and the live
    // render draws real wall pixels.
    mockReadGameSession.mockReturnValue({
      schemaVersion: 2,
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
