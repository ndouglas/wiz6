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
  composeCallList,
  decodeNarrationLines,
  drawEntryStrip,
  expandMazeData,
  generateFullCallList,
  renderMazeViewport,
  oracleViewportForGy,
  oracleAnimViewport,
  tickEntry,
  turn,
  tryStepForward,
  viewConfigKeyFor,
  type CapturedSpansTable,
  type EntryStripText,
  type ForwardVerdict,
  type MazeWorkBuffer,
  type NewgameViewports,
} from '@wiz6/parser';
import { CanvasPresenter } from '../../lib/presenter.js';
import {
  loadFont,
  loadFont4bpp,
  loadMazeAssets,
  loadMazePassability,
  loadMazeWallSpans,
  loadMazeViewportOracles,
  loadMessageDb,
  loadNewgameViewports,
  loadPortraitSet,
} from '../../data-loader.js';
import {
  loadSnd,
  playSnd,
  installAudioUnlockListener,
  type PlayableSnd,
} from '../../lib/audio.js';
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

/** The cutscene tick interval (ms). tickEntry is called once per tick for every
 *  non-free scripted mode. One ANIMATION FRAME advances per tick (8 frames →
 *  ~1.6s gate/door slide); HOLD beats accumulate ticks (entry-sequence.ts
 *  TITLE_HOLD/TEXT_HOLD/WALK_HOLD thresholds give the per-beat durations below).
 *
 *  FEEL-tuned, NOT wall-clock parity (CLAUDE.md "Wall-clock parity ≠ byte
 *  parity"). At 200ms/tick the cutscene cadence is:
 *    door slide  : 8 frames × 200ms          ≈ 1.6s
 *    ENTERING     : TITLE_HOLD(13) × 200ms    ≈ 2.6s
 *    APPROACHING  : TEXT_HOLD(13) × 200ms     ≈ 2.6s
 *    gate1 lift   : 8 frames × 200ms          ≈ 1.6s
 *    walk (cell)  : WALK_HOLD(10) × 200ms     ≈ 2.0s
 *    HMMM         : TEXT_HOLD(13) × 200ms     ≈ 2.6s
 *    gate2 lift   : 8 frames × 200ms          ≈ 1.6s
 *  Whole cutscene ≈ 14.6s (auto-push; no input required).
 *
 *  Kept exported under the old name `ANIM_FRAME_MS` is gone; tests reference
 *  CUTSCENE_TICK_MS. */
export const CUTSCENE_TICK_MS = 200;

/** Door/recess piece animation cadence: the seam phase toggles every this-many ms
 *  in free-roam so the dungeon door shimmers between its two atlas frames. Tuned
 *  to feel like the engine's flicker (not wall-clock-matched — the original is a
 *  CPU busy-wait clock). */
export const DOOR_ANIM_TICK_MS = 350;

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
  mazeWorkBuffer: MazeWorkBuffer | null,
  phase: 0 | 1 = 0,
  viewportOracles: Map<string, Uint8Array> | null = null,
): Uint8Array {
  // Animation path: the door-slide / two portcullis-lift viewport animations play
  // captured oracle frames keyed by "door:N" / "gate1:N" / "gate2:N" (animFrame
  // is the frame index).
  if (session.entryMode === 'door-open') {
    const a = oracleAnimViewport(newgameViewports, 'door', session.animFrame);
    if (a !== null) return a;
  }
  if (session.entryMode === 'gate1-open') {
    const a = oracleAnimViewport(newgameViewports, 'gate1', session.animFrame);
    if (a !== null) return a;
  }
  if (session.entryMode === 'gate2-open') {
    const a = oracleAnimViewport(newgameViewports, 'gate2', session.animFrame);
    if (a !== null) return a;
  }
  // Approach beats show the CLOSED gate (frame 0) ahead while the text is held.
  if (session.entryMode === 'approach1') {
    const a = oracleAnimViewport(newgameViewports, 'gate1', 0);
    if (a !== null) return a;
  }
  if (session.entryMode === 'approach2') {
    const a = oracleAnimViewport(newgameViewports, 'gate2', 0);
    if (a !== null) return a;
  }

  // Oracle path: scripted entry stills with committed engine pixels (keyed by gy:
  // title→gy117 corridor, walk→gy119 corridor). Returns null in 'free' mode, so
  // free-roam falls through to the GENERATED background page below.
  const oracle = oracleViewportForGy(newgameViewports, session.party.gy, session.entryMode);
  if (oracle !== null) return oracle;

  // FREE-ROAM background: compose the floor/ceiling/walls/portcullis background
  // page from mazedata.ega via the byte-exact from-asset generator
  // (generateFullCallList → composeCallList(expandMazeData(mazedata))) and feed it
  // as renderMazeViewport's `page`. This replaces the prior walls-over-black
  // (mostly-black) free-roam render. Scoped to free-roam only — the scripted entry
  // oracle paths above are unchanged. The work buffer is pre-expanded once when
  // assets load (expandMazeData parses 102KB) and reused per frame.
  if (session.entryMode === 'free' && mazeWorkBuffer !== null) {
    try {
      // CAPTURE-REPLAY (faithful level-0): if this view-config has a committed engine
      // viewport, return it verbatim (byte-exact). Otherwise fall through to the
      // generated background page below.
      if (viewportOracles?.size) {
        const vp = viewportOracles.get(viewConfigKeyFor(session.level.mazeBlock, session.party));
        if (vp) return vp;
      }
      const calls = generateFullCallList(session.level.mazeBlock, session.party);
      const page = composeCallList(mazeWorkBuffer, calls);
      return renderMazeViewport(session.level.mazeBlock, session.party, assets, {
        page,
        phase,
        ...(wallSpans ? { capturedSpans: wallSpans } : {}),
      });
    } catch (err) {
      console.warn('[MazeView] free-roam background generation threw; falling back', err);
      // fall through to the prior (walls-over-black) path below
    }
  }

  try {
    return renderMazeViewport(
      session.level.mazeBlock,
      session.party,
      assets,
      wallSpans ? { capturedSpans: wallSpans, phase } : { phase },
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
  mazeWorkBuffer: MazeWorkBuffer | null,
  phase: 0 | 1 = 0,
  viewportOracles: Map<string, Uint8Array> | null = null,
): Uint8Array {
  // Static chrome + LIVE party panels (the player's actual party) + viewport
  // baseline. partyPanels is undefined until the panel fonts/active party load;
  // until then the baked chrome panels show (cleared once the fonts arrive).
  const frame = composeMazeFrame(partyPanels);
  const vp = safeRenderViewport(session, assets, wallSpans, newgameViewports, mazeWorkBuffer, phase, viewportOracles);
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
  // drawEntryStrip helper OVERWRITES the strip for every scripted mode (title/
  // approach1/gate1-open/walk/approach2/gate2-open land on the mode-appropriate
  // fill so the text never lands on the gray OPTIONS/TURN widget). For 'free' it
  // is a NO-OP — the baked gray OPTIONS/TURN widget from the static chrome shows
  // through (issue A: no stale HMMM in free-roam). The same helper backs the
  // per-state strip parity gates so the live render can't drift.
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
  // The expanded mazedata.ega work buffer for the free-roam from-asset background
  // generator. Computed ONCE when assets load (expandMazeData parses 102KB) and
  // reused per frame — never per-render.
  const mazeWorkBufferRef = useRef<MazeWorkBuffer | null>(null);
  const wallSpansRef = useRef<CapturedSpansTable | null>(null);
  // CAPTURE-REPLAY viewport oracles (configKey -> engine viewport) for faithful
  // level-0: when a config has a committed oracle, the viewport is the byte-exact
  // engine frame (covers all 266 engine-reachable configs). Loaded async below.
  const viewportOraclesRef = useRef<Map<string, Uint8Array> | null>(null);
  // Faithful-movement passability gate (configKey -> engine verdict). Constrains
  // movement to the engine-reachable level-0 set; null = wall-model fallback.
  const passabilityRef = useRef<Map<string, ForwardVerdict> | null>(null);
  // Door-piece ANIMATION phase (0/1). The dungeon door/recess pieces flicker
  // between two adjacent atlas frames on the engine's global clock; we toggle this
  // on a timer in free-roam so the door shimmers like the engine. Lives in a ref
  // (read by present()) + a timer started once below.
  const phaseRef = useRef<0 | 1>(0);
  // Oracle viewports for the 5 scripted entry frames (loaded once on mount for
  // levels with a scriptedEntry). Null until loaded or if not a scripted level.
  const newgameViewportsRef = useRef<NewgameViewports | null>(null);
  const presenterRef = useRef<CanvasPresenter | null>(null);
  // Decoded per-mode strip text (title/narration/bump) + the message font, loaded
  // once. Null until both resolve (or if the level has no scriptedEntry — then
  // there's no scripted strip and the baked free-roam widget shows).
  const stripTextRef = useRef<{ text: EntryStripText; font: Font } | null>(null);
  // Self-rescheduling timer that drives the WHOLE auto-push cutscene (the session
  // lives in sessionRef, not React state, so we use a timer ref rather than a
  // reactive effect). It calls tickEntry once per CUTSCENE_TICK_MS for every
  // non-free scripted mode and stops at 'free'.
  const cutsceneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Gate-clang sounds (SOUND04 then SOUND13) played when EACH portcullis starts
  // lifting (RE: the engine's gate routine calls play_sound(4) then
  // play_sound(0xd=13) — docs/re/findings/maze-gate-open-animation.json). Loaded
  // on mount; silently no-op until the user has gestured (audio.ts autoplay gate).
  const sound04Ref = useRef<PlayableSnd | null>(null);
  const sound13Ref = useRef<PlayableSnd | null>(null);

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
    // Auto-drive the cutscene on entry (door slide → ... → free, no input).
    scheduleCutsceneTick();

    // Read the player's active party once (it doesn't change mid-dungeon).
    activePartyRef.current = readActiveParty().members;

    // Install the audio-unlock listener + preload the gate-clang sounds. Silently
    // no-ops if the files are missing or the user hasn't gestured yet.
    const removeAudioUnlock = installAudioUnlockListener();
    loadSnd('/sounds/sound04.snd', { slotN: 4 }).then((s) => { sound04Ref.current = s; }).catch(() => {});
    loadSnd('/sounds/sound13.snd', { slotN: 13 }).then((s) => { sound13Ref.current = s; }).catch(() => {});

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
    // CAPTURE-REPLAY: load the per-config engine viewport oracles (faithful level-0).
    // Non-fatal: null leaves the renderer on the generation path.
    loadMazeViewportOracles()
      .then((m) => {
        if (cancelled || !m) return;
        viewportOraclesRef.current = m;
        present();
      })
      .catch((err: unknown) => {
        console.warn('[MazeView] failed to load viewport oracles (falling back to generation):', err);
      });
    loadMazePassability()
      .then((m) => {
        if (cancelled || !m) return;
        passabilityRef.current = m;
      })
      .catch((err: unknown) => {
        console.warn('[MazeView] failed to load passability (movement falls back to the model):', err);
      });
    loadMazeAssets()
      .then((a) => {
        if (cancelled) return;
        assetsRef.current = a;
        // Pre-expand the mazedata.ega work buffer ONCE (102KB parse) so the
        // free-roam from-asset background generator can compose per frame cheaply.
        // Non-fatal: on failure free-roam falls back to walls-over-black.
        try {
          mazeWorkBufferRef.current = expandMazeData(a.mazedata);
        } catch (err) {
          console.warn('[MazeView] failed to expand mazedata.ega (free-roam background disabled):', err);
        }
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
      if (cutsceneTimerRef.current) clearTimeout(cutsceneTimerRef.current);
      removeAudioUnlock();
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
      mazeWorkBufferRef.current,
      phaseRef.current,
      viewportOraclesRef.current,
    );
    presenterRef.current.present(new Uint8ClampedArray(frame.buffer), ENGINE_W, ENGINE_H);
  }

  /** Play the gate "shk" drag (SOUND04) — called once per portcullis-lift FRAME
   *  so the gate makes a shk...shk...shk dragging sound as it opens. Silent no-op
   *  until the user has gestured / if the file didn't load. */
  function playGateShk() {
    if (sound04Ref.current) playSnd(sound04Ref.current);
  }

  // Drive the WHOLE auto-push cutscene. Self-reschedules one tickEntry per
  // CUTSCENE_TICK_MS for every non-free scripted mode (animation frames advance,
  // hold beats accumulate, the party auto-pushes at each beat threshold).
  // tickEntry returns 'free' at the end, so the re-scheduled call sees 'free' and
  // returns — no infinite loop. When a tick ENTERS a gate-open mode (the lift
  // starts), the gate clang plays.
  function scheduleCutsceneTick() {
    if (cutsceneTimerRef.current) {
      clearTimeout(cutsceneTimerRef.current);
      cutsceneTimerRef.current = null;
    }
    const s = sessionRef.current;
    // 'free' = cutscene over; 'approach1' = the one INTERACTIVE beat (APPROACHING
    // waits for ENTER) — stop the timer there and let the keydown handler resume.
    if (!s || s.entryMode === 'free' || s.entryMode === 'approach1') return;
    cutsceneTimerRef.current = setTimeout(() => {
      const cur = sessionRef.current;
      if (!cur) return;
      const next = tickEntry({
        party: cur.party,
        entryMode: cur.entryMode,
        animFrame: cur.animFrame,
        holdTicks: cur.holdTicks,
      });
      // The portcullis lift drags a "shk" on EVERY frame (mode-enter or animFrame
      // advance while in a gate-open mode) → shk...shk...shk as it opens.
      const inLift = next.entryMode === 'gate1-open' || next.entryMode === 'gate2-open';
      const frameChanged = next.entryMode !== cur.entryMode || next.animFrame !== cur.animFrame;
      if (inLift && frameChanged) playGateShk();
      updateSession(next);
      sessionRef.current = { ...cur, ...next };
      present(); // re-render every tick (incl. the final 'free' transition — issue A)
      scheduleCutsceneTick();
    }, CUTSCENE_TICK_MS);
  }

  // Render whenever assets become available.
  useEffect(() => {
    if (assets) present();
  }, [assets]);

  // Door-piece animation: toggle the seam phase on a slow clock so the dungeon
  // door/recess pieces shimmer between their two atlas frames like the engine.
  // Only repaints in free-roam (the scripted-entry oracle frames are pre-captured
  // and ignore the phase). Interval tuned to feel like the engine's flicker, not
  // wall-clock-matched (the original is a busy-wait clock — see CLAUDE.md).
  useEffect(() => {
    if (!assets) return;
    const id = setInterval(() => {
      phaseRef.current = phaseRef.current === 0 ? 1 : 0;
      if (sessionRef.current?.entryMode === 'free') present();
    }, DOOR_ANIM_TICK_MS);
    return () => clearInterval(id);
    // present/refs are stable; re-arm only when assets (re)load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  // Keydown: movement. Registered once; reads/writes the session ref.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const session = sessionRef.current;
      if (!session) return;

      // Scripted AUTO-PUSH cutscene: ENTER SKIPS the current beat (fast-forwards
      // what the timer would do); arrow keys are no-ops. The timer keeps driving
      // the rest of the cutscene (scheduleCutsceneTick reschedules off the new
      // mode). RE: docs/re/findings/maze-gate-open-animation.json.
      if (session.entryMode !== 'free') {
        if (e.key === 'Enter') {
          e.preventDefault();
          const next = advanceEntry(
            {
              party: session.party,
              entryMode: session.entryMode,
              animFrame: session.animFrame,
              holdTicks: session.holdTicks,
            },
            session.level.mazeBlock,
          );
          // ENTER at APPROACHING STARTS the first portcullis lift — play the
          // first "shk" at the lift start; the timer plays one per subsequent frame.
          const startedLift =
            next.entryMode !== session.entryMode &&
            (next.entryMode === 'gate1-open' || next.entryMode === 'gate2-open');
          if (startedLift) playGateShk();
          updateSession(next);
          sessionRef.current = { ...session, ...next };
          present();
          // Resume the timer off the new mode (or stop if we skipped to 'free').
          scheduleCutsceneTick();
        }
        return; // arrows (and everything else) inert during the scripted cutscene
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
          nextParty = tryStepForward(
            session.party,
            session.level.mazeBlock,
            passabilityRef.current
              ? { passability: passabilityRef.current }
              : undefined,
          );
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
