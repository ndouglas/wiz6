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
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { DungeonLevel, MazeParty, MazeRenderAssets } from '@wiz6/data';
import { turn, tryStepForward, loadMazeAssets as nodeLoadMazeAssets } from '@wiz6/parser';

// ── mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../src/data-loader.js', () => ({
  loadMazeAssets: vi.fn(),
}));

vi.mock('../../src/game/game-session-store.js', () => ({
  readGameSession: vi.fn(),
  updateParty: vi.fn(),
}));

import { MazeView } from '../../src/pages/game/MazeView.js';
import { loadMazeAssets } from '../../src/data-loader.js';
import { readGameSession, updateParty } from '../../src/game/game-session-store.js';

const mockLoadMazeAssets = vi.mocked(loadMazeAssets);
const mockReadGameSession = vi.mocked(readGameSession);
const mockUpdateParty = vi.mocked(updateParty);

// Real assets (so renderMazeViewport runs end-to-end without crashing).
const ASSETS: MazeRenderAssets = nodeLoadMazeAssets();

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
      schemaVersion: 1,
      level: LEVEL_0,
      party: { ...ENTRANCE },
    });
    mockLoadMazeAssets.mockResolvedValue(ASSETS);
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

  it('renders the screen reader heading', () => {
    renderMazeView();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
