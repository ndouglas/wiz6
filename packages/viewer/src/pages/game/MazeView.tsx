import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MAZE_VIEWPORT, type MazeRenderAssets } from '@wiz6/data';
import {
  renderMazeViewport,
  turn,
  tryStepForward,
  type CapturedSpansTable,
} from '@wiz6/parser';
import { CanvasPresenter } from '../../lib/presenter.js';
import { loadMazeAssets, loadMazeWallSpans } from '../../data-loader.js';
import {
  readGameSession,
  updateParty,
  type GameSession,
} from '../../game/game-session-store.js';
import { composeMazeFrame } from './compose-maze-frame.js';
import styles from './CastleScreen.module.css';

const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

/** The 16-entry composed EGA palette (index → [r,g,b]). The maze renderer returns
 *  palette indices 0..15; this is the standard EGA palette the corridor fixtures
 *  use (matches maze-corridor-tiles.json `palette`). */
const COMPOSED_PALETTE: readonly [number, number, number][] = [
  [0, 0, 0], [255, 255, 255], [85, 85, 255], [255, 85, 255],
  [255, 85, 85], [255, 255, 85], [85, 255, 85], [85, 255, 255],
  [85, 85, 85], [170, 170, 170], [0, 0, 170], [170, 0, 170],
  [170, 0, 0], [170, 85, 0], [0, 170, 0], [0, 170, 170],
];

/**
 * Render the maze viewport for `(block, party)` to a 176×112 palette-index buffer,
 * GRACEFULLY: unhandled off-corridor view-cases (Stage C) must not crash the view.
 * On any error we return a blank (all-zero / black) viewport so the chrome still
 * presents and movement keeps working.
 */
function safeRenderViewport(
  session: GameSession,
  assets: MazeRenderAssets,
  wallSpans: CapturedSpansTable | null,
): Uint8Array {
  try {
    return renderMazeViewport(
      session.level.mazeBlock,
      session.party,
      assets,
      wallSpans ? { capturedSpans: wallSpans } : undefined,
    );
  } catch (err) {
    console.warn('[MazeView] renderMazeViewport threw (unhandled view-case); rendering blank', err);
    return new Uint8Array(MAZE_VIEWPORT.w * MAZE_VIEWPORT.h);
  }
}

/**
 * Compose the full 320×200 frame: the static chrome (UI panels) with the LIVE
 * per-(cell,facing) wall viewport blitted in at MAZE_VIEWPORT. The wall viewport
 * is rendered over black (the floor/ceiling background page is Stage C); for the
 * walkable milestone walls-over-black is acceptable.
 */
function composeFrame(
  session: GameSession,
  assets: MazeRenderAssets,
  wallSpans: CapturedSpansTable | null,
): Uint8Array {
  const frame = composeMazeFrame(); // static chrome + (static) viewport baseline
  const vp = safeRenderViewport(session, assets, wallSpans);
  const { x: vx, y: vy, w: vw, h: vh } = MAZE_VIEWPORT;
  for (let row = 0; row < vh; row++) {
    for (let col = 0; col < vw; col++) {
      const idx = vp[row * vw + col]!;
      const color = COMPOSED_PALETTE[idx] ?? COMPOSED_PALETTE[0]!;
      const o = ((vy + row) * ENGINE_W + (vx + col)) * 4;
      frame[o] = color[0];
      frame[o + 1] = color[1];
      frame[o + 2] = color[2];
      frame[o + 3] = 0xff;
    }
  }
  return frame;
}

/**
 * MazeView — the walkable first-person dungeon view (B4 milestone).
 *
 * Renders the maze viewport per the party's `(cell, facing)` and responds to
 * movement keys:
 *   ArrowLeft  → turn left      ArrowRight → turn right
 *   ArrowUp    → step forward (no-op into a wall)   ArrowDown → no-op
 *
 * No session (not in a game) → redirect to /castle. The floor/ceiling background
 * and byte-exact off-corridor view-cases are Stage C.
 */
export function MazeView() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [assets, setAssets] = useState<MazeRenderAssets | null>(null);
  const [noSession, setNoSession] = useState(false);

  // Live party state lives in a ref so the keydown handler always reads/writes
  // the latest party without re-subscribing the listener every change.
  const sessionRef = useRef<GameSession | null>(null);
  const assetsRef = useRef<MazeRenderAssets | null>(null);
  const wallSpansRef = useRef<CapturedSpansTable | null>(null);
  const presenterRef = useRef<CanvasPresenter | null>(null);

  // Mount: read session (redirect if absent) + load assets once.
  useEffect(() => {
    const session = readGameSession();
    if (session === null) {
      setNoSession(true);
      navigate('/castle');
      return;
    }
    sessionRef.current = session;

    let cancelled = false;
    // Load the captured wall spans alongside the atlas. A failure here is
    // non-fatal: the renderer falls back to the generation path (corridor) when
    // no captured spans are available.
    loadMazeWallSpans()
      .then((spans) => {
        if (cancelled) return;
        wallSpansRef.current = spans;
        present();
      })
      .catch((err: unknown) => {
        console.warn('[MazeView] failed to load captured wall spans (falling back to generation):', err);
      });
    loadMazeAssets()
      .then((a) => {
        if (cancelled) return;
        assetsRef.current = a;
        setAssets(a);
      })
      .catch((err: unknown) => {
        console.error('[MazeView] failed to load maze assets:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Present a single frame using the current session + assets.
  function present() {
    const canvas = canvasRef.current;
    const session = sessionRef.current;
    const a = assetsRef.current;
    if (!canvas || !session || !a) return;
    if (!presenterRef.current) presenterRef.current = new CanvasPresenter(canvas);
    const frame = composeFrame(session, a, wallSpansRef.current);
    presenterRef.current.present(new Uint8ClampedArray(frame.buffer), ENGINE_W, ENGINE_H);
  }

  // Render whenever assets become available.
  useEffect(() => {
    if (assets) present();
  }, [assets]);

  // Keydown: movement. Registered once; reads/writes the session ref.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const session = sessionRef.current;
      if (!session) return;
      let nextParty = session.party;
      switch (e.key) {
        case 'ArrowLeft':
          nextParty = turn(session.party, 'left');
          break;
        case 'ArrowRight':
          nextParty = turn(session.party, 'right');
          break;
        case 'ArrowUp':
          nextParty = tryStepForward(session.party, session.level.mazeBlock);
          break;
        case 'ArrowDown':
          return; // no back-step in Wiz6
        default:
          return;
      }
      e.preventDefault();
      // Persist + update the in-memory session, then re-render.
      updateParty(nextParty);
      sessionRef.current = { ...session, party: nextParty };
      present();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (noSession) {
    return (
      <main className={styles.page}>
        <h1 className={styles.srOnly}>Dungeon — Maze View</h1>
        <p>
          No active game. <Link to="/castle">Return to Master Options</Link>.
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.srOnly}>Dungeon — Maze View</h1>
      <div className={styles.canvasWrap}>
        <canvas
          ref={canvasRef}
          width={ENGINE_W}
          height={ENGINE_H}
          style={{
            width: ENGINE_W * SCALE,
            height: ENGINE_H * SCALE,
            imageRendering: 'pixelated',
            background: '#000',
          }}
          aria-label="Wizardry VI dungeon corridor"
        />
      </div>
    </main>
  );
}
