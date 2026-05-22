import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PicSchema } from '@wiz6/data';
import {
  renderPicDescriptor,
  concatenatePicSegments,
  initialIntroState,
  stepIntro,
  visibleScrollEntries,
  type IntroState,
  type RenderedSprite,
} from '@wiz6/parser';
import styles from './GameTitle.module.css';

// Engine resolution. Coordinates from the intro sim are in engine pixels.
const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

export function GameTitle() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<IntroState>(initialIntroState());
  const skipRef = useRef(false);
  const [spritesByDesc, setSpritesByDesc] = useState<RenderedSprite[] | null>(null);

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
        // leave null; canvas just won't render
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // RAF loop: step the sim, draw the canvas, navigate on done.
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

      // Draw
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, ENGINE_W, ENGINE_H);
      const state = stateRef.current;
      drawFrame(ctx, state, spritesByDesc);

      if (state.phase === 'done') {
        navigate('/castle');
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spritesByDesc, navigate]);

  // Skip handling: any click or key toggles skipPressed for next frame.
  useEffect(() => {
    const onKey = () => {
      skipRef.current = true;
    };
    const onClick = () => {
      skipRef.current = true;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
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
): void {
  const drawSprite = (descIdx: number, x: number, y: number) => {
    const s = sprites[descIdx];
    if (!s) return;
    // Build an ImageData from the sprite's RGBA buffer and blit at (x, y).
    // Clip negative-x/y so partial off-screen sprites still draw correctly.
    const img = new ImageData(new Uint8ClampedArray(s.rgba), s.width, s.height);
    ctx.putImageData(img, x, y);
  };

  switch (state.phase) {
    case 'splash-pause-short':
      // First moments — black screen. (In the engine: kbd_flush, load PIC.)
      break;

    case 'splash-display':
    case 'splash-pause-long': {
      // Static "splash" display. Best guess from the user's recollection: this
      // is the Sir-Tech / red-dragon screen with the "Fantasy Role-Playing
      // Simulation by D.M. Bradley" tagline.
      //
      // From the credits.pic descriptor inventory:
      //   desc 10 = SIR-TECH wordmark (152×32)
      //   desc 9  = red dragon         (152×32)
      //   desc 12 = "a Fantasy R-P Sim by" tagline (144×32)
      //   desc 8  = "D.M. Bradley" signature (112×24)
      //
      // Layout these centered. Engine step 9 says "draw 2 text tokens at
      // hard-coded positions" — we approximate with 4-element splash for now;
      // refine once we have a DOSBox trace of step 9's actual call args.
      const cx = ENGINE_W / 2;
      drawSprite(10, Math.floor(cx - 152 / 2), 60); // SIR-TECH
      drawSprite(9, Math.floor(cx - 152 / 2), 95); // red dragon
      drawSprite(12, Math.floor(cx - 144 / 2), 140); // "Fantasy R-P Sim by"
      drawSprite(8, Math.floor(cx - 112 / 2), 165); // "D.M. Bradley"
      break;
    }

    case 'scroll': {
      // Per-entry positions from the sim's layout solver. Entries are returned
      // in back-to-front order (i=8 first).
      const visible = visibleScrollEntries(state.scrollPos);
      for (const v of visible) {
        drawSprite(v.descriptorIndex, v.col, v.y);
      }
      break;
    }

    case 'post-scroll': {
      // Same as the final scroll frame, plus a "press any key" hint could
      // go here once we know which token the engine renders for that.
      const visible = visibleScrollEntries(state.scrollPos);
      for (const v of visible) {
        drawSprite(v.descriptorIndex, v.col, v.y);
      }
      break;
    }

    case 'done':
      break;
  }
}
