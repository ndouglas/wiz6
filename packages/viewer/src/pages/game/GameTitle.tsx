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
    const tick = () => {
      const skipPressed = skipRef.current;
      skipRef.current = false;
      stateRef.current = stepIntro(stateRef.current, 1, { skipPressed });

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, ENGINE_W, ENGINE_H);
      drawFrame(ctx, stateRef.current, spritesByDesc, titlepagRgba);

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

function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: IntroState,
  sprites: RenderedSprite[],
  titlepagRgba: Uint8ClampedArray | null,
): void {
  const drawSprite = (descIdx: number, x: number, y: number) => {
    const s = sprites[descIdx];
    if (!s) return;
    const img = new ImageData(new Uint8ClampedArray(s.rgba), s.width, s.height);
    ctx.putImageData(img, x, y);
  };

  // Sir-Tech splash layout: dragon ABOVE wordmark, red-bar edges meeting.
  // Each is 152×32. Position so dragon's bottom red bar lines up with
  // wordmark's top red bar — they share one visual red strip.
  // Tuned by eye against the user's recollection; the engine's exact
  // positions are step-9's "2 hard-coded text token positions" which we
  // haven't pinned down to a coordinate pair yet.
  const cxLogo = Math.floor((ENGINE_W - 152) / 2);
  const dragonY = 70;
  const wordmarkY = dragonY + 30; // -2px overlap so red bars touch / blend

  // Bradley splash layout: tagline above signature, both centered.
  const cxBradleyLine = Math.floor((ENGINE_W - 144) / 2);
  const cxBradleySig = Math.floor((ENGINE_W - 112) / 2);
  const bradleyLineY = 80;
  const bradleySigY = bradleyLineY + 36;

  switch (state.phase) {
    case 'pause-pre-sirtech':
    case 'pause-between':
    case 'pause-pre-scroll':
      // black — already filled above
      break;

    case 'sirtech-splash':
      drawSprite(9, cxLogo, dragonY); // red dragon (top)
      drawSprite(10, cxLogo, wordmarkY); // SIR-TECH wordmark (below)
      break;

    case 'bradley-splash':
      drawSprite(12, cxBradleyLine, bradleyLineY); // "a Fantasy R-P Sim by"
      drawSprite(8, cxBradleySig, bradleySigY); // "D.M. Bradley"
      break;

    case 'scroll':
    case 'post-scroll': {
      // titlepag.scr as background (persists with the Wizardry logo); credit
      // sprites composite over it per visibleScrollEntries.
      if (titlepagRgba) {
        const bg = new ImageData(new Uint8ClampedArray(titlepagRgba), ENGINE_W, ENGINE_H);
        ctx.putImageData(bg, 0, 0);
      }
      for (const v of visibleScrollEntries(state.scrollPos)) {
        drawSprite(v.descriptorIndex, v.col, v.y);
      }
      break;
    }

    case 'done':
      break;
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
