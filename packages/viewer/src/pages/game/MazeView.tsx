import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MAZE_VIEWPORT,
  type ActivePartyMember,
  type Font,
  type Font4bpp,
  type MazeRenderAssets,
  type MessageDb,
  type Palette,
  type PortraitSet,
} from '@wiz6/data';
import {
  advanceEntry,
  decodeNarrationLines,
  drawEntryStrip,
  renderMazeViewport,
  oracleViewportForGy,
  oracleAnimViewport,
  tickEntry,
  turn,
  tryStepForward,
  type CapturedSpansTable,
  type EntryStripText,
  type NewgameViewports,
} from '@wiz6/parser';
import { CanvasPresenter } from '../../lib/presenter.js';
import {
  loadFont,
  loadFont4bpp,
  loadMazeAssets,
  loadMazeWallSpans,
  loadMessageDb,
  loadNewgameViewports,
  loadPortraitSet,
} from '../../data-loader.js';
import { readActiveParty } from '../../lib/active-party-store.js';
import {
  readGameSession,
  updateParty,
  updateSession,
  type GameSession,
} from '../../game/game-session-store.js';
import { composeMazeFrame, type MazePartyPanels } from './compose-maze-frame.js';
import type { PanelFontSet } from './party-panel-compose.js';
import styles from './CastleScreen.module.css';

const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

/** Per-frame interval for the door-slide / portcullis-lift viewport animations.
 *  FEEL-tuned, NOT wall-clock parity (8 frames ≈ 0.7s slide) — see CLAUDE.md
 *  "Wall-clock parity ≠ byte parity": tune the per-frame interval to feel right. */
export const ANIM_FRAME_MS = 90;

/** Message db URL — served from extracted/ via the viewer publicDir. */
const MSG_DB_URL = '/messages/msg.json';
/** The small 1bpp UI message font (wfont0) used for the bottom strip text. */
const MESSAGE_FONT_URL = '/fonts/wfont0.json';

/** The 16-entry composed EGA palette (index → [r,g,b]). The maze renderer returns
 *  palette indices 0..15; this is the standard EGA palette the corridor fixtures
 *  use (matches maze-corridor-tiles.json `palette`). */
const COMPOSED_PALETTE: readonly [number, number, number][] = [
  [0, 0, 0], [255, 255, 255], [85, 85, 255], [255, 85, 255],
  [255, 85, 85], [255, 255, 85], [85, 255, 85], [85, 255, 255],
  [85, 85, 85], [170, 170, 170], [0, 0, 170], [170, 0, 170],
  [170, 0, 0], [170, 85, 0], [0, 170, 0], [0, 170, 170],
];

/** COMPOSED_PALETTE as a `Palette` object for the text-run renderer (which
 *  indexes `palette.colors[i]`). The narration strip uses index 5 (yellow
 *  [255,255,85] — the engine's entry-narration color, NOT white) on index 0. */
const NARRATION_PALETTE: Palette = {
  name: 'composed-ega',
  provenance: 'MazeView COMPOSED_PALETTE',
  colors: COMPOSED_PALETTE.map((c) => [...c]) as Palette['colors'],
};

/**
 * Render the maze viewport for `(block, party)` to a 176×112 palette-index buffer.
 *
 * During the scripted entry sequence (entryMode !== 'free'), PREFER the
 * framebuffer oracle if loaded — it returns committed engine pixels for the
 * gate view that the geometry renderer cannot reproduce byte-exact (banked
 * tile atlas). Falls back to the live renderer if the oracle is not yet loaded
 * or the gy is not one of the 5 scripted frames.
 *
 * GRACEFULLY: unhandled off-corridor view-cases (Stage C) must not crash the
 * view. On any error we return a blank (all-zero / black) viewport so the
 * chrome still presents and movement keeps working.
 */
function safeRenderViewport(
  session: GameSession,
  assets: MazeRenderAssets,
  wallSpans: CapturedSpansTable | null,
  newgameViewports: NewgameViewports | null,
): Uint8Array {
  // Animation path: the door-slide / portcullis-lift viewport animations play
  // captured oracle frames keyed by "door:N" / "gate:N" (animFrame is the index).
  if (session.entryMode === 'door-open') {
    const a = oracleAnimViewport(newgameViewports, 'door', session.animFrame);
    if (a !== null) return a;
  }
  if (session.entryMode === 'gate-open') {
    const a = oracleAnimViewport(newgameViewports, 'gate', session.animFrame);
    if (a !== null) return a;
  }

  // Oracle path: scripted entry stills with committed engine pixels (keyed by gy).
  const oracle = oracleViewportForGy(newgameViewports, session.party.gy, session.entryMode);
  if (oracle !== null) return oracle;

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
 *
 * During the scripted entry sequence, the oracle viewport (committed engine
 * pixels) is preferred over the live renderer for the gate frames.
 */
function composeFrame(
  session: GameSession,
  assets: MazeRenderAssets,
  wallSpans: CapturedSpansTable | null,
  newgameViewports: NewgameViewports | null,
  stripText: { text: EntryStripText; font: Font } | null,
  partyPanels: MazePartyPanels | undefined,
): Uint8Array {
  // Static chrome + LIVE party panels (the player's actual party) + viewport
  // baseline. partyPanels is undefined until the panel fonts/active party load;
  // until then the baked chrome panels show (cleared once the fonts arrive).
  const frame = composeMazeFrame(partyPanels);
  const vp = safeRenderViewport(session, assets, wallSpans, newgameViewports);
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

  // Bottom-strip per-`entryMode` state machine (y144–199). The shared
  // drawEntryStrip helper OVERWRITES the strip for title/narration/gate-walk/bump
  // (so the narration/bump land on a CLEAN BLACK strip — the fix for the shipped
  // bug where the text was drawn OVER the gray OPTIONS/TURN widget). For 'free' it
  // is a no-op (the baked gray widget from the static chrome stays). The same
  // helper backs the per-state strip parity gates so the live render can't drift.
  if (stripText && session.entryMode !== 'free') {
    const rgba = new Uint8ClampedArray(frame.buffer);
    drawEntryStrip(
      rgba,
      ENGINE_W,
      ENGINE_H,
      session.entryMode,
      stripText.text,
      stripText.font,
      NARRATION_PALETTE,
    );
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
  // Oracle viewports for the 5 scripted entry frames (loaded once on mount for
  // levels with a scriptedEntry). Null until loaded or if not a scripted level.
  const newgameViewportsRef = useRef<NewgameViewports | null>(null);
  const presenterRef = useRef<CanvasPresenter | null>(null);
  // Decoded per-mode strip text (title/narration/bump) + the message font, loaded
  // once. Null until both resolve (or if the level has no scriptedEntry — then
  // there's no scripted strip and the baked free-roam widget shows).
  const stripTextRef = useRef<{ text: EntryStripText; font: Font } | null>(null);
  // Self-rescheduling timer that drives the door-slide / portcullis-lift viewport
  // animations (the session lives in sessionRef, not React state, so we use a
  // timer ref rather than a reactive effect).
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live party-panel inputs: the player's actual active party (read once on
  // mount — it doesn't change mid-dungeon) + the panel fonts + portrait sets.
  // composeMazeFrame uses these to OVERWRITE the baked chrome side panels (which
  // carry the RE drive's fixed party) with the real party. Built once both the
  // fonts and portraits load (mazePartyPanelsRef stays undefined until then, so
  // the baked chrome shows briefly during load — then gets cleared/replaced).
  const activePartyRef = useRef<ReadonlyArray<ActivePartyMember>>([]);
  const panelFontsRef = useRef<PanelFontSet>({
    font0: null,
    font1: null,
    font3: null,
    font4: null,
  });
  const portraitSetsRef = useRef<PortraitSet[] | null>(null);

  /** Build the live party-panel arg if the fonts have loaded and there's a
   *  party to draw; undefined otherwise (keeps the baked chrome panels). */
  function partyPanelsArg(): MazePartyPanels | undefined {
    const members = activePartyRef.current;
    const fonts = panelFontsRef.current;
    if (members.length === 0 || !fonts.font3) return undefined;
    return { members, fonts, portraitSets: portraitSetsRef.current };
  }

  // Mount: read session (redirect if absent) + load assets once.
  useEffect(() => {
    const session = readGameSession();
    if (session === null) {
      setNoSession(true);
      navigate('/castle');
      return;
    }
    sessionRef.current = session;
    // Auto-play the door slide (or any animation mode) on entry.
    scheduleAnimTick();

    // Read the player's active party once (it doesn't change mid-dungeon).
    activePartyRef.current = readActiveParty().members;

    let cancelled = false;

    // Load the party-panel fonts (wfont0/1/3/4) + the 3 wport portrait sets so
    // the LEFT/RIGHT party panels render LIVE (overwriting the baked chrome's
    // fixed-party portraits). Each is non-fatal: until they resolve the baked
    // chrome panels show through. wfont3 is the gate — partyPanelsArg() returns
    // undefined until it's present.
    Promise.all([
      loadFont('/fonts/wfont0.json'),
      loadFont4bpp('/fonts/wfont1.json'),
      loadFont4bpp('/fonts/wfont3.json'),
      loadFont4bpp('/fonts/wfont4.json'),
    ])
      .then(([font0, font1, font3, font4]: [Font, Font4bpp, Font4bpp, Font4bpp]) => {
        if (cancelled) return;
        panelFontsRef.current = { font0, font1, font3, font4 };
        present();
      })
      .catch((err: unknown) => {
        console.warn('[MazeView] failed to load party-panel fonts (baked chrome panels remain):', err);
      });
    Promise.all([
      loadPortraitSet('/portraits/wport1.json'),
      loadPortraitSet('/portraits/wport2.json'),
      loadPortraitSet('/portraits/wport3.json'),
    ])
      .then((sets: PortraitSet[]) => {
        if (cancelled) return;
        portraitSetsRef.current = sets;
        present();
      })
      .catch((err: unknown) => {
        console.warn('[MazeView] failed to load portrait sets (party panels render without portraits):', err);
      });
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

    // Load the scripted-entry oracle viewports for levels with a scriptedEntry.
    // Non-fatal: during the scripted sequence the live renderer will be used as a
    // fallback (renders the gate generically, not byte-exact).
    const scriptedEntry = session.level.scriptedEntry;
    if (scriptedEntry) {
      loadNewgameViewports()
        .then((vps) => {
          if (cancelled) return;
          newgameViewportsRef.current = vps;
          present();
        })
        .catch((err: unknown) => {
          console.warn('[MazeView] failed to load newgame oracle viewports (falling back to live renderer):', err);
        });

      // Decode the entry strip text once: load the message db + the small UI font,
      // then resolve the level's title/narration/bump msg IDs to display strings.
      Promise.all([loadMessageDb(MSG_DB_URL), loadFont(MESSAGE_FONT_URL)])
        .then(([msgDb, font]: [MessageDb, Font]) => {
          if (cancelled) return;
          const text: EntryStripText = {
            title: decodeNarrationLines(msgDb, scriptedEntry.titleMsgIds),
            narration: decodeNarrationLines(msgDb, scriptedEntry.narrationMsgIds),
            bump: decodeNarrationLines(msgDb, [scriptedEntry.bumpMsgId])[0] ?? '',
          };
          stripTextRef.current = { text, font };
          present();
        })
        .catch((err: unknown) => {
          console.warn('[MazeView] failed to load entry strip text (message db/font):', err);
        });
    }
    return () => {
      cancelled = true;
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
    };
  }, [navigate]);

  // Present a single frame using the current session + assets.
  function present() {
    const canvas = canvasRef.current;
    const session = sessionRef.current;
    const a = assetsRef.current;
    if (!canvas || !session || !a) return;
    if (!presenterRef.current) presenterRef.current = new CanvasPresenter(canvas);
    const frame = composeFrame(
      session,
      a,
      wallSpansRef.current,
      newgameViewportsRef.current,
      stripTextRef.current,
      partyPanelsArg(),
    );
    presenterRef.current.present(new Uint8ClampedArray(frame.buffer), ENGINE_W, ENGINE_H);
  }

  // Drive the door-slide / portcullis-lift viewport animations. Self-reschedules
  // one tickEntry per ANIM_FRAME_MS while the session is in an animation mode.
  // tickEntry transitions OFF the animation mode at the last frame, so the
  // re-scheduled call sees a non-anim mode and returns — no infinite loop.
  function scheduleAnimTick() {
    if (animTimerRef.current) {
      clearTimeout(animTimerRef.current);
      animTimerRef.current = null;
    }
    const s = sessionRef.current;
    if (!s) return;
    if (s.entryMode !== 'door-open' && s.entryMode !== 'gate-open') return;
    animTimerRef.current = setTimeout(() => {
      const cur = sessionRef.current;
      if (!cur) return;
      const next = tickEntry({
        party: cur.party,
        entryMode: cur.entryMode,
        animFrame: cur.animFrame,
        stepsRemaining: cur.stepsRemaining,
      });
      updateSession(next);
      sessionRef.current = { ...cur, ...next };
      present();
      scheduleAnimTick();
    }, ANIM_FRAME_MS);
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

      // Scripted entry (title → narration → gate-walk → bump): ENTER advances the
      // FSM; arrow keys are no-ops (the engine ignores them during the scripted
      // entry — RE: docs/re/findings/maze-newgame-byteexact.json per_enter_pin_addendum).
      // (Title/bump strip RENDERING is Tasks 3-4; here we only keep the FSM driveable.)
      if (session.entryMode !== 'free') {
        if (e.key === 'Enter') {
          e.preventDefault();
          const next = advanceEntry(
            {
              party: session.party,
              entryMode: session.entryMode,
              animFrame: session.animFrame,
              stepsRemaining: session.stepsRemaining,
            },
            session.level.mazeBlock,
          );
          updateSession(next);
          sessionRef.current = { ...session, ...next };
          present();
          // Reaching gate-open via the walk starts the portcullis animation.
          scheduleAnimTick();
        }
        return; // arrows (and everything else) inert during scripted entry
      }

      // Free-roam: arrows turn/step; Enter is reserved for OPTIONS/camp (deferred
      // — see TODO #078 / the faithful-START-NEW-GAME spec "Deferred"), no-op for now.
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
        case 'Enter':
          return; // OPTIONS/camp menu deferred (TODO #078)
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
