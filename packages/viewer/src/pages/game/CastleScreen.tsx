import { useEffect, useMemo, useRef, useState } from 'react';
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

/** Period of the parity flip (ms). Engine cadence per FUN_013b is ~10 input
 *  polls between flips; on a 486DX/33 that's roughly 400-600ms wall-clock.
 *  Tunable by feel — we don't aim for byte-precise emulator timing. */
const PARITY_FLIP_MS = 500;

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
  7: { route: '/', replay: true },
  8: { route: '/castle/quit' },
};

export function CastleScreen() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mon08Sprites, setMon08Sprites] = useState<RenderedSprite[] | null>(null);
  const [dragonscRgba, setDragonscRgba] = useState<Uint8ClampedArray | null>(null);

  const visible = useMemo(() => visibleMenuOptions(DEFAULT_CONTEXT), []);
  const [selectedIdx, setSelectedIdx] = useState(0);

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

  // RAF loop that flips the parity bit every PARITY_FLIP_MS and recomposites
  // the frame. Mirrors the engine's FUN_013b → FUN_07b7 cadence: parity==0
  // draws everything except the slot-5/6 overlays (water); parity==1 adds
  // them. Today the water-sprite positions aren't pinned down so the parity
  // toggle is a structural placeholder — once `wbase_load_font_table_entry(8,4)`
  // RE'd into our viewer assets, swap in the real overlay draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    let raf = 0;
    let lastFlip = performance.now();
    let parity = 0;

    const tick = (now: number) => {
      if (now - lastFlip >= PARITY_FLIP_MS) {
        parity = parity === 0 ? 1 : 0;
        lastFlip = now;
      }
      composeFrame(ctx, parity, dragonscRgba, mon08Sprites);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mon08Sprites, dragonscRgba]);

  const handleSelect = (opt: MainMenuOption) => {
    const target = ROUTE_BY_SLOT[opt.slot];
    if (!target) return;
    navigate(target.route);
  };

  // Keyboard navigation: ↑/↓ wrap-around through visible options; Enter activates.
  // Track selectedIdx via ref so the listener doesn't need to re-bind on every
  // arrow press — only `visible` matters for which options exist.
  const selectedIdxRef = useRef(selectedIdx);
  selectedIdxRef.current = selectedIdx;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % visible.length);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + visible.length) % visible.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const opt = visible[selectedIdxRef.current];
        if (opt) {
          const target = ROUTE_BY_SLOT[opt.slot];
          if (target) navigate(target.route);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, navigate]);

  const leftCol = visible.slice(0, 4);
  const rightCol = visible.slice(4);

  return (
    <main className={styles.page}>
      <h1 className={styles.srOnly}>Castle — Main Menu</h1>
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
      <ul className={styles.menu}>
        <div className={styles.menuCol}>
          {leftCol.map((opt, i) => (
            <MenuItem
              key={opt.slot}
              opt={opt}
              selected={i === selectedIdx}
              onClick={() => {
                setSelectedIdx(i);
                handleSelect(opt);
              }}
            />
          ))}
        </div>
        <div className={styles.menuCol}>
          {rightCol.map((opt, i) => {
            const idx = leftCol.length + i;
            return (
              <MenuItem
                key={opt.slot}
                opt={opt}
                selected={idx === selectedIdx}
                onClick={() => {
                  setSelectedIdx(idx);
                  handleSelect(opt);
                }}
              />
            );
          })}
        </div>
      </ul>
    </main>
  );
}

function MenuItem(props: { opt: MainMenuOption; selected: boolean; onClick: () => void }) {
  return (
    <li className={styles.menuItem}>
      <button
        type="button"
        className={`${styles.menuButton} ${props.selected ? styles.menuButtonSelected : ''}`}
        onClick={props.onClick}
      >
        {props.selected ? '▶ ' : '  '}
        {props.opt.label}
      </button>
    </li>
  );
}

function composeFrame(
  ctx: CanvasRenderingContext2D,
  parity: 0 | 1 | number,
  dragonscRgba: Uint8ClampedArray | null,
  mon08Sprites: RenderedSprite[] | null,
): void {
  const buf = new Uint8ClampedArray(ENGINE_W * ENGINE_H * 4);
  for (let i = 0; i < buf.length; i += 4) buf[i + 3] = 0xff;

  // Static background: dragonsc top strip + engine init draws (the 6
  // FUN_0984 background panels) — currently approximated by mon08 sprites.
  if (dragonscRgba) buf.set(dragonscRgba);
  if (mon08Sprites) {
    blendSprite(buf, mon08Sprites[0], 72, 36);
    blendSprite(buf, mon08Sprites[1], 72 + 88, 36);
    blendSprite(buf, mon08Sprites[2], 96, 50);
    blendSprite(buf, mon08Sprites[3], 96 + 32, 50);
  }

  // Parity-gated overlay (water columns): FUN_0732 slots 5+6 fire when
  // frame_parity != 0. Source positions/sprites are in wbase's per-asset
  // BSS tables which we haven't fully RE'd yet. For now: a 1-px-wide
  // vertical "shimmer" on the gate edges as a visible placeholder so we
  // can confirm the parity-flip timer is alive. Replace with real
  // wmon08-equivalent water sprites once the menu-asset table is mapped.
  if (parity !== 0 && mon08Sprites) {
    // Faint ripple on the gate's bottom edge.
    const shimmerY = 174;
    const shimmerColor = [80, 140, 200, 0xff] as const;
    for (let x = 96; x < 224; x += 4) {
      const i = (shimmerY * ENGINE_W + x) * 4;
      buf[i] = shimmerColor[0];
      buf[i + 1] = shimmerColor[1];
      buf[i + 2] = shimmerColor[2];
      buf[i + 3] = shimmerColor[3];
    }
  }

  ctx.putImageData(new ImageData(buf, ENGINE_W, ENGINE_H), 0, 0);
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
