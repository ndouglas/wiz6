import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PicSchema, EGA_DEFAULT } from '@wiz6/data';
import {
  renderPicDescriptor,
  renderEgaScreen,
  concatenatePicSegments,
  initialIntroState,
  stepIntro,
  visibleScrollEntries,
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
  const clangRef = useRef<PlayableSnd | null>(null);
  // Track which phase transitions have already triggered the clang so a
  // single phase doesn't fire repeatedly during its hold frames.
  const clangFiredRef = useRef<Set<string>>(new Set());

  // Install one-shot listener so first user gesture unlocks Web Audio.
  useEffect(() => installAudioUnlockListener(), []);

  // Preload the title clang (sound00.snd, played at splash-display entry per
  // winit state 1 step 6 — call 0xc546(4)). Silently no-ops if file missing.
  useEffect(() => {
    let cancelled = false;
    loadSnd('/sounds/sound00.snd').then((snd) => {
      if (!cancelled) clangRef.current = snd;
    });
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
        const rendered = pic.descriptors.map((d) => renderPicDescriptor(d, decoded, EGA_DEFAULT));
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
        const rendered = renderEgaScreen(screen, EGA_DEFAULT);
        setTitlepagRgba(rendered.rgba);
      })
      .catch(() => {
        /* leave null; scroll falls back to black bg */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // RAF loop.
  useEffect(() => {
    if (!spritesByDesc) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    let raf = 0;
    // Per-frame compositing buffer — one putImageData per frame, all sprite
    // blending happens by hand into this buffer so alpha actually composites.
    const frameRgba = new Uint8ClampedArray(ENGINE_W * ENGINE_H * 4);

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
        // Fire the clang on key transitions. Engine state 1 has at least two
        // sound triggers (step 6 = call 0xc546(4) and step 8 = call 0xc546(0xD));
        // both use entries in the sound table at 0x3344 that index the same
        // SOUND00.SND buffer with different parameters. We don't have the
        // parameters mapped yet, so all triggers play sound00 directly.
        // The user's lived recollection includes a clang at the Wizardry-logo
        // reveal (scroll start), so we also fire there.
        const transition = `${prevPhase}->${stateRef.current.phase}`;
        const SOUND_TRIGGERS = new Set([
          'pause-pre-sirtech->sirtech-splash', // step 6 / 8 — splash appears
          'pause-between->bradley-splash', // user-described "Bradley" beat
          'pause-pre-scroll->title-hold', // Wizardry logo reveal (titlepag draws)
        ]);
        if (
          clangRef.current &&
          SOUND_TRIGGERS.has(transition) &&
          !clangFiredRef.current.has(transition)
        ) {
          playSnd(clangRef.current);
          clangFiredRef.current.add(transition);
        }
      }

      composeFrame(frameRgba, stateRef.current, spritesByDesc, titlepagRgba);
      ctx.putImageData(new ImageData(frameRgba, ENGINE_W, ENGINE_H), 0, 0);

      if (stateRef.current.phase === 'done') {
        navigate('/castle');
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spritesByDesc, titlepagRgba, navigate]);

  useEffect(() => {
    const onSkip = () => {
      skipRef.current = true;
    };
    window.addEventListener('keydown', onSkip);
    window.addEventListener('mousedown', onSkip);
    return () => {
      window.removeEventListener('keydown', onSkip);
      window.removeEventListener('mousedown', onSkip);
    };
  }, []);

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
      </div>
      <p className={styles.footer}>
        Click or press any key to skip ·
        Wizardry VI: Bane of the Cosmic Forge © 1990 Sir-Tech Software, Inc. ·
        <Link to="/explore">data explorer</Link>
      </p>
    </main>
  );
}

/**
 * Compose one frame into `dest` (ENGINE_W*ENGINE_H*4 RGBA bytes). Composites
 * sprite alpha properly: transparent sprite pixels are skipped, the underlying
 * background pixel is preserved. One `dest` buffer, mutated in place; viewer
 * calls putImageData(dest) once per frame.
 */
function composeFrame(
  dest: Uint8ClampedArray,
  state: IntroState,
  sprites: RenderedSprite[],
  titlepagRgba: Uint8ClampedArray | null,
): void {
  fillBlack(dest);

  // Background per phase. titlepag shows during the new title-hold phase too
  // (Wizardry wordmark + scene visible before credits start scrolling).
  if (
    (state.phase === 'title-hold' || state.phase === 'scroll' || state.phase === 'post-scroll') &&
    titlepagRgba
  ) {
    dest.set(titlepagRgba);
  }

  // Sir-Tech splash layout: dragon ABOVE wordmark, red-bar edges meeting
  // (152×32 each, ~2px overlap so red strips visually join).
  const cxLogo = Math.floor((ENGINE_W - 152) / 2);
  const dragonY = 70;
  const wordmarkY = dragonY + 30;

  const cxBradleyLine = Math.floor((ENGINE_W - 144) / 2);
  const cxBradleySig = Math.floor((ENGINE_W - 112) / 2);
  const bradleyLineY = 80;
  const bradleySigY = bradleyLineY + 36;

  switch (state.phase) {
    case 'pause-pre-sirtech':
    case 'pause-between':
    case 'pause-pre-scroll':
    case 'title-hold':
    case 'done':
      // background only (titlepag for title-hold; black for the pauses)
      break;

    case 'sirtech-splash':
      blendSprite(dest, sprites[9], cxLogo, dragonY);
      blendSprite(dest, sprites[10], cxLogo, wordmarkY);
      break;

    case 'bradley-splash':
      blendSprite(dest, sprites[12], cxBradleyLine, bradleyLineY);
      blendSprite(dest, sprites[8], cxBradleySig, bradleySigY);
      break;

    case 'scroll':
    case 'post-scroll':
      for (const v of visibleScrollEntries(state.scrollPos)) {
        blendSprite(dest, sprites[v.descriptorIndex], v.col, v.y);
      }
      break;
  }
}

function fillBlack(buf: Uint8ClampedArray): void {
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = 0;
    buf[i + 1] = 0;
    buf[i + 2] = 0;
    buf[i + 3] = 0xff;
  }
}

/**
 * Composite a sprite over the destination buffer, respecting per-pixel alpha.
 * Transparent sprite pixels (alpha=0) leave the destination untouched.
 * Out-of-bounds destination pixels are clipped.
 */
function blendSprite(
  dest: Uint8ClampedArray,
  sprite: RenderedSprite | undefined,
  dx: number,
  dy: number,
): void {
  if (!sprite) return;
  const { width: sw, height: sh, rgba } = sprite;
  for (let y = 0; y < sh; y++) {
    const dstY = dy + y;
    if (dstY < 0 || dstY >= ENGINE_H) continue;
    for (let x = 0; x < sw; x++) {
      const srcIdx = (y * sw + x) * 4;
      if (rgba[srcIdx + 3] === 0) continue;
      const dstX = dx + x;
      if (dstX < 0 || dstX >= ENGINE_W) continue;
      const dstIdx = (dstY * ENGINE_W + dstX) * 4;
      dest[dstIdx] = rgba[srcIdx]!;
      dest[dstIdx + 1] = rgba[srcIdx + 1]!;
      dest[dstIdx + 2] = rgba[srcIdx + 2]!;
      dest[dstIdx + 3] = 0xff;
    }
  }
}

