import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PicSchema, WIZ6_MAIN } from '@wiz6/data';
import {
  renderPicDescriptor,
  renderEgaScreen,
  concatenatePicSegments,
  initialIntroState,
  stepIntro,
  composeIntroFrame,
  SCROLL_RAF_STEP_RATIO,
  type IntroState,
  type RenderedSprite,
} from '@wiz6/parser';
import { loadEgaScreen } from '../../data-loader.js';
import { loadSnd, playSnd, installAudioUnlockListener, type PlayableSnd } from '../../lib/audio.js';
import styles from './GameTitle.module.css';

const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

// Engine (col, y) values from the scroll entry table are absolute screen
// coordinates, not window-relative — entry 0 caps at y=3 (Wizardry logo top),
// which puts it 3px below the top edge of the screen. The renderer maps
// engine coords 1:1 to canvas coords.

export function GameTitle() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<IntroState>(initialIntroState());
  const skipRef = useRef(false);
  const [spritesByDesc, setSpritesByDesc] = useState<RenderedSprite[] | null>(null);
  const [titlepagRgba, setTitlepagRgba] = useState<Uint8ClampedArray | null>(null);
  // Browser Web Audio policy requires a user gesture before any AudioContext
  // can produce sound. We hold the intro on frame 0 until that gesture lands,
  // so the SOUND04 / SOUND13 / SOUND14 transitions are actually audible.
  const [started, setStarted] = useState(false);
  // Engine sound-table dump (MCP, 2026-05-24 — see TODO #Q-G) reveals
  // each sound's playback rate via the per-slot `duration` field at
  // DGROUP 0x3344+N*12+8. The loadSnd(url, {slotN}) call uses that to
  // pick the correct playback rate so each sound matches the engine's
  // pitch + duration:
  //   - SOUND04 (slot 4, door click): near-default rate
  //   - SOUND05 (slot 5, "pow"):       7365 Hz (slower than default 10026)
  //   - SOUND06 (slot 6, whoosh):     near-default rate
  //   - SOUND07 (slot 7, clang):       near-default rate
  //   - SOUND13 (slot 13, bradley):    6280 Hz (much slower than default)
  const sound04Ref = useRef<PlayableSnd | null>(null);
  const sound05Ref = useRef<PlayableSnd | null>(null);
  const sound06Ref = useRef<PlayableSnd | null>(null);
  const sound07Ref = useRef<PlayableSnd | null>(null);
  const sound13Ref = useRef<PlayableSnd | null>(null);
  // Track which phase transitions have already triggered a sound so a single
  // phase doesn't fire repeatedly during its hold frames.
  const soundFiredRef = useRef<Set<string>>(new Set());

  // Install one-shot listener so first user gesture unlocks Web Audio.
  useEffect(() => installAudioUnlockListener(), []);

  // Preload the four transition sounds in parallel. Silently no-ops if files
  // missing (Web Audio remains locked or `pnpm wiz6 extract --all` not run).
  useEffect(() => {
    let cancelled = false;
    loadSnd('/sounds/sound04.snd', { slotN: 4 }).then((s) => { if (!cancelled) sound04Ref.current = s; });
    loadSnd('/sounds/sound05.snd', { slotN: 5 }).then((s) => { if (!cancelled) sound05Ref.current = s; });
    loadSnd('/sounds/sound06.snd', { slotN: 6 }).then((s) => { if (!cancelled) sound06Ref.current = s; });
    loadSnd('/sounds/sound07.snd', { slotN: 7 }).then((s) => { if (!cancelled) sound07Ref.current = s; });
    loadSnd('/sounds/sound13.snd', { slotN: 13 }).then((s) => { if (!cancelled) sound13Ref.current = s; });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load credits.pic once and render every descriptor into RGBA.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/pics/credits.json');
        if (!res.ok) return;
        const text = await res.text();
        if (text.trimStart().startsWith('<')) return;
        const pic = PicSchema.parse(JSON.parse(text));
        const decoded = concatenatePicSegments(pic.segments);
        const rendered = pic.descriptors.map((d) => renderPicDescriptor(d, decoded, WIZ6_MAIN));
        if (!cancelled) setSpritesByDesc(rendered);
      } catch {
        /* leave null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load titlepag.scr and render to RGBA (used as scroll-phase background).
  useEffect(() => {
    let cancelled = false;
    loadEgaScreen('/screens/titlepag.json')
      .then((screen) => {
        if (cancelled) return;
        const rendered = renderEgaScreen(screen, WIZ6_MAIN);
        setTitlepagRgba(rendered.rgba);
      })
      .catch(() => {
        /* leave null; scroll falls back to black bg */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // RAF loop. Held until `started` so the intro doesn't auto-play silently
  // — Web Audio is gesture-locked until the user clicks/types.
  useEffect(() => {
    if (!spritesByDesc) return;
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    let raf = 0;

    // Sub-frame counter for slowing the scroll phase. Outside scroll, we
    // step the sim every RAF (1:1). During scroll, we step once per
    // SCROLL_RAF_STEP_RATIO RAFs — credits scroll slow enough to read.
    // skipRef is only consumed on stepping frames, so input is never lost.
    let subRaf = 0;

    const tick = () => {
      const isScroll = stateRef.current.phase === 'scroll';
      const interval = isScroll ? SCROLL_RAF_STEP_RATIO : 1;
      subRaf = (subRaf + 1) % interval;
      const shouldStep = subRaf === 0;

      if (shouldStep) {
        const skipPressed = skipRef.current;
        skipRef.current = false;
        const prevPhase = stateRef.current.phase;
        stateRef.current = stepIntro(stateRef.current, 1, { skipPressed });
        const transition = `${prevPhase}->${stateRef.current.phase}`;
        // User-by-ear mapping (see ref declarations above for context):
        //   sirtech-splash entry: SOUND04 ("door click")
        //   title-hold entry:     SOUND05 → SOUND06 → SOUND07 in rapid
        //                         succession; clang lands ~as the Wizardry
        //                         wordmark appears
        if (transition === 'pause-pre-sirtech->sirtech-splash' && !soundFiredRef.current.has(transition)) {
          // Engine sequence: SOUND04 → wait(2) ≈ 100 ms → SOUND13. Both
          // play during the sirtech-splash visual; SOUND13 is the "bradley
          // is about to render" cue but it fires while sirtech is still
          // alone on screen. Fire SOUND13 via setTimeout so it follows
          // SOUND04 by the engine-matched 100 ms gap.
          if (sound04Ref.current) playSnd(sound04Ref.current);
          const s13 = sound13Ref.current;
          if (s13) window.setTimeout(() => playSnd(s13), 100);
          soundFiredRef.current.add(transition);
        } else if (transition === 'pause-pre-scroll->title-hold' && !soundFiredRef.current.has(transition)) {
          // User-by-ear sequence: SOUND05 immediately, ~brief pause, then
          // SOUND06 (whoosh), then SOUND07 (clang lands with Wizardry logo).
          // Per the engine's wait(10)/wait(10) between the three sounds we
          // stretch the gap from 180→500ms (engine ticks at ~20Hz on a 486
          // so wait(10) ≈ 500ms).
          if (sound05Ref.current) playSnd(sound05Ref.current);
          const s6 = sound06Ref.current;
          const s7 = sound07Ref.current;
          if (s6) window.setTimeout(() => playSnd(s6), 500);
          if (s7) window.setTimeout(() => playSnd(s7), 1000);
          soundFiredRef.current.add(transition);
        }
      }

      const frameRgba = composeIntroFrame(stateRef.current, spritesByDesc, titlepagRgba);
      // Allocate an ArrayBuffer-backed ImageData and copy in — passing the
      // Uint8ClampedArray to the ctor trips the ArrayBufferLike DOM lib types.
      const img = new ImageData(ENGINE_W, ENGINE_H);
      img.data.set(frameRgba);
      ctx.putImageData(img, 0, 0);

      if (stateRef.current.phase === 'done') {
        navigate('/castle');
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spritesByDesc, titlepagRgba, navigate, started]);

  // Skip listener only after the intro has started — otherwise the click
  // that starts the intro would also register as a skip and fast-forward
  // through frame 0.
  useEffect(() => {
    if (!started) return;
    const onSkip = () => {
      skipRef.current = true;
    };
    window.addEventListener('keydown', onSkip);
    window.addEventListener('mousedown', onSkip);
    return () => {
      window.removeEventListener('keydown', onSkip);
      window.removeEventListener('mousedown', onSkip);
    };
  }, [started]);

  return (
    <main className={styles.page}>
      <h1 className={styles.srOnly}>Wizardry VI: Bane of the Cosmic Forge</h1>
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
          aria-label="Wizardry VI intro sequence"
        />
        {!started && (
          <button
            type="button"
            className={styles.startGate}
            onClick={() => setStarted(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setStarted(true);
              }
            }}
            aria-label="Begin Wizardry VI intro"
          >
            <span>Click to begin</span>
            <kbd>browser audio requires a gesture before sound can play</kbd>
          </button>
        )}
      </div>
      <p className={styles.footer}>
        Click or press any key to skip ·
        Wizardry VI: Bane of the Cosmic Forge © 1990 Sir-Tech Software, Inc. ·
        <Link to="/explore">data explorer</Link>
      </p>
    </main>
  );
}


