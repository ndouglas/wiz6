import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PicSchema, EGA_DEFAULT } from '@wiz6/data';
import {
  renderPicDescriptor,
  renderEgaScreen,
  concatenatePicSegments,
  visibleMenuOptions,
  type MainMenuOption,
  type MainMenuContext,
  type RenderedSprite,
} from '@wiz6/parser';
import { loadEgaScreen } from '../../data-loader.js';
import styles from './CastleScreen.module.css';

const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

/**
 * Default party context for first-launch (no party loaded, characters
 * available in PCFILE.DBS). Drives which menu options are visible.
 * Will become dynamic once save-load is implemented.
 */
const DEFAULT_CONTEXT: MainMenuContext = {
  partySize: 0,
  pcFileHasUnloadedChars: true,
};

const ROUTE_BY_SLOT: Record<number, { route: string; replay?: boolean }> = {
  0: { route: '/castle/add-party' },
  1: { route: '/castle/choose-leader' },
  2: { route: '/castle/character-menu' },
  3: { route: '/castle/remove-party' },
  4: { route: '/castle/resume' },
  5: { route: '/castle/character-menu' },
  6: { route: '/castle/configuration' },
  7: { route: '/', replay: true }, // SHOW TITLE PAGE — re-enter intro
  8: { route: '/castle/quit' },
};

export function CastleScreen() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mon08Sprites, setMon08Sprites] = useState<RenderedSprite[] | null>(null);
  const [dragonscRgba, setDragonscRgba] = useState<Uint8ClampedArray | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/pics/mon08.json');
        if (!res.ok) return;
        const text = await res.text();
        if (text.trimStart().startsWith('<')) return;
        const pic = PicSchema.parse(JSON.parse(text));
        const decoded = concatenatePicSegments(pic.segments);
        const rendered = pic.descriptors.map((d) => renderPicDescriptor(d, decoded, EGA_DEFAULT));
        if (!cancelled) setMon08Sprites(rendered);
      } catch {
        /* leave null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadEgaScreen('/screens/dragonsc.json')
      .then((screen) => {
        if (cancelled) return;
        setDragonscRgba(renderEgaScreen(screen, EGA_DEFAULT).rgba);
      })
      .catch(() => {
        /* leave null */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Compose the canvas scene whenever assets land. Re-renders are cheap (one
  // frame) so we don't worry about RAF — main menu is static art.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const buf = new Uint8ClampedArray(ENGINE_W * ENGINE_H * 4);
    // Fill opaque black baseline.
    for (let i = 0; i < buf.length; i += 4) buf[i + 3] = 0xff;

    // Background: dragonsc (which only paints the top strip; rest stays black).
    if (dragonscRgba) buf.set(dragonscRgba);

    // Composite mon08 sprites: arched gate (descs 0+1 side by side) centered,
    // red devil (desc 4) on top of the gate's right side. Positions tuned by
    // eye to match the user's screenshot reference; engine's exact x,y for
    // these draws isn't pinned down yet (wbase_menu_draw_decoration_frame).
    if (mon08Sprites) {
      // Arched gate centered: total width 88*2=176, screen width 320, so left=72.
      blendSprite(buf, mon08Sprites[0], 72, 36); // gate left
      blendSprite(buf, mon08Sprites[1], 72 + 88, 36); // gate right with devil silhouette
      // Door panels inside the arch (texture):
      blendSprite(buf, mon08Sprites[2], 96, 50);
      blendSprite(buf, mon08Sprites[3], 96 + 32, 50);
    }

    ctx.putImageData(new ImageData(buf, ENGINE_W, ENGINE_H), 0, 0);
  }, [mon08Sprites, dragonscRgba]);

  const visible = visibleMenuOptions(DEFAULT_CONTEXT);

  const handleSelect = (opt: MainMenuOption) => {
    const target = ROUTE_BY_SLOT[opt.slot];
    if (!target) return;
    navigate(target.route);
  };

  // Layout: 4 left-column items, remaining on right column (matches screenshot).
  const leftCol = visible.slice(0, 4);
  const rightCol = visible.slice(4);

  return (
    <main className={styles.page}>
      <h1 className={styles.srOnly}>Castle — Master Options</h1>
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
          aria-label="Wizardry VI castle entrance"
        />
      </div>
      <div className={styles.banner}>MASTER OPTIONS</div>
      <ul className={styles.menu}>
        <div className={styles.menuCol}>
          {leftCol.map((opt) => (
            <li key={opt.slot} className={styles.menuItem}>
              <button type="button" className={styles.menuButton} onClick={() => handleSelect(opt)}>
                {opt.label}
              </button>
            </li>
          ))}
        </div>
        <div className={styles.menuCol}>
          {rightCol.map((opt) => (
            <li key={opt.slot} className={styles.menuItem}>
              <button type="button" className={styles.menuButton} onClick={() => handleSelect(opt)}>
                {opt.label}
              </button>
            </li>
          ))}
        </div>
      </ul>
    </main>
  );
}

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
