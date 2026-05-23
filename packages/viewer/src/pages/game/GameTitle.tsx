import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PicSchema, type EgaScreen } from '@wiz6/data';
import {
  renderPicDescriptor,
  concatenatePicSegments,
  initialIntroState,
  stepIntro,
  visibleScrollEntries,
  type IntroState,
  type RenderedSprite,
} from '@wiz6/parser';
import { loadEgaScreen } from '../../data-loader.js';
import { WIZ6_TITLE_PALETTE } from '../../palettes/index.js';
import styles from './GameTitle.module.css';

const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

/**
 * Engine (col, y) values from the scroll entry table appear to be absolute
 * screen coordinates, not window-relative — entry 0 caps at y=3 (Wizardry
 * logo top) which puts it 3px below the top edge of the screen. No offset
 * needed; renderer just maps engine coords 1:1 to canvas coords.
 */
const CREDIT_WINDOW_X = 0;
const CREDIT_WINDOW_Y = 0;

export function GameTitle() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<IntroState>(initialIntroState());
  const skipRef = useRef(false);
  const [spritesByDesc, setSpritesByDesc] = useState<RenderedSprite[] | null>(null);
  const [titlepagRgba, setTitlepagRgba] = useState<Uint8ClampedArray | null>(null);

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
        const rendered = pic.descriptors.map((d) => renderPicDescriptor(d, decoded));
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
        const rgba = renderEgaScreenToRgba(screen, WIZ6_TITLE_PALETTE);
        setTitlepagRgba(rgba);
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

    const tick = () => {
      const skipPressed = skipRef.current;
      skipRef.current = false;
      stateRef.current = stepIntro(stateRef.current, 1, { skipPressed });

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

  // Background per phase.
  if ((state.phase === 'scroll' || state.phase === 'post-scroll') && titlepagRgba) {
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
    case 'done':
      // background only
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
        blendSprite(
          dest,
          sprites[v.descriptorIndex],
          v.col + CREDIT_WINDOW_X,
          v.y + CREDIT_WINDOW_Y,
        );
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

/**
 * Render an EGA screen to row-major RGBA bytes using the per-plane shift
 * pattern that ScreenGallery uses (discovered in Stage 1f.3). Color 0 is
 * treated as transparent (alpha 0) so any underlying canvas content shows
 * through; for our intro we draw on a black background so transparent ==
 * black in practice.
 */
function renderEgaScreenToRgba(
  screen: EgaScreen,
  palette: { colors: ReadonlyArray<readonly [number, number, number]> },
): Uint8ClampedArray {
  const { width: w, height: h, planes } = screen;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let idx = 0;
      for (let p = 0; p < 4; p++) {
        const plane = planes[p];
        if (!plane) continue;
        const shiftX = (64 * p) % w;
        const shiftY = -5 * p;
        const yDrop = x < shiftX ? 1 : 0;
        const srcY = y - shiftY - yDrop;
        if (srcY < 0 || srcY >= h) continue;
        const srcX = (((x - shiftX) % w) + w) % w;
        const bytesPerRow = w / 8;
        const byteIdx = srcY * bytesPerRow + (srcX >> 3);
        const bitIdx = 7 - (srcX & 7);
        const bit = ((plane[byteIdx] ?? 0) >> bitIdx) & 1;
        idx |= bit << p;
      }
      const offset = (y * w + x) * 4;
      if (idx === 0) {
        out[offset] = 0;
        out[offset + 1] = 0;
        out[offset + 2] = 0;
        out[offset + 3] = 0;
      } else {
        const rgb = palette.colors[idx] ?? [0, 0, 0];
        out[offset] = rgb[0];
        out[offset + 1] = rgb[1];
        out[offset + 2] = rgb[2];
        out[offset + 3] = 0xff;
      }
    }
  }
  return out;
}
