import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PicSchema, EGA_DEFAULT, type Font, type Pic } from '@wiz6/data';
import {
  renderEgaScreen,
  concatenatePicSegments,
  compositePicScript,
  renderTextRun,
  visibleMenuOptions,
  type MainMenuOption,
  type MainMenuContext,
} from '@wiz6/parser';
import { loadEgaScreen, loadFont } from '../../data-loader.js';
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
  const [mon08Pic, setMon08Pic] = useState<Pic | null>(null);
  const [mon08Decoded, setMon08Decoded] = useState<number[] | null>(null);
  const [dragonscRgba, setDragonscRgba] = useState<Uint8ClampedArray | null>(null);
  const [wfont0, setWfont0] = useState<Font | null>(null);

  const visible = useMemo(() => visibleMenuOptions(DEFAULT_CONTEXT), []);
  const [selectedIdx, setSelectedIdx] = useState(0);
  // Mirror to a ref so the RAF tick + keyboard listener can both read it
  // without forcing the tick to re-bind on every cursor move.
  const selectedIdxRef = useRef(selectedIdx);
  selectedIdxRef.current = selectedIdx;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/pics/mon08.json');
        if (!res.ok) return;
        const text = await res.text();
        if (text.trimStart().startsWith('<')) return;
        const pic = PicSchema.parse(JSON.parse(text));
        if (cancelled) return;
        setMon08Pic(pic);
        setMon08Decoded(concatenatePicSegments(pic.segments));
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

  useEffect(() => {
    let cancelled = false;
    loadFont('/fonts/wfont0.json')
      .then((font) => {
        if (!cancelled) setWfont0(font);
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
      composeFrame(
        ctx,
        parity,
        dragonscRgba,
        mon08Pic,
        mon08Decoded,
        wfont0,
        visible,
        selectedIdxRef.current,
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mon08Pic, mon08Decoded, dragonscRgba, wfont0, visible]);

  const handleSelect = (opt: MainMenuOption) => {
    const target = ROUTE_BY_SLOT[opt.slot];
    if (!target) return;
    navigate(target.route);
  };

  // Keyboard navigation: ↑/↓ wrap-around through visible options; Enter activates.
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
  mon08Pic: Pic | null,
  mon08Decoded: number[] | null,
  wfont0: Font | null,
  menuOptions: readonly MainMenuOption[],
  selectedIdx: number,
): void {
  const buf = new Uint8ClampedArray(ENGINE_W * ENGINE_H * 4);
  for (let i = 0; i < buf.length; i += 4) buf[i + 3] = 0xff;

  // Static background: dragonsc top strip + engine FUN_07b7 unconditional
  // draws. Each f10c call in the engine renders a 1-element script [desc, 0]
  // at the documented screen position; ported via compositePicScript.
  // Engine-derived positions from wbase save 1 (true DGROUP 0x18048, see
  // docs/re/findings/wroot-window-heap-allocator.json):
  //   slot 1: desc 0 (gate left)  at (72,  32)
  //   slot 2: desc 1 (gate right) at (160, 32)
  //   slot 3: desc 2 (door L)     at (128, 49)
  //   slot 4: desc 3 (door R)     at (160, 49)
  if (dragonscRgba) buf.set(dragonscRgba);
  if (mon08Pic && mon08Decoded) {
    compositePicScript(buf, ENGINE_W, ENGINE_H, 72, 32, [0], mon08Pic, mon08Decoded, EGA_DEFAULT);
    compositePicScript(buf, ENGINE_W, ENGINE_H, 160, 32, [1], mon08Pic, mon08Decoded, EGA_DEFAULT);
    compositePicScript(buf, ENGINE_W, ENGINE_H, 128, 49, [2], mon08Pic, mon08Decoded, EGA_DEFAULT);
    compositePicScript(buf, ENGINE_W, ENGINE_H, 160, 49, [3], mon08Pic, mon08Decoded, EGA_DEFAULT);
  }

  // Parity-gated water overlays from FUN_0732 slots 5 + 6:
  //   slot 5: desc 4 (devil + water column) at (208, 52)
  //   slot 6: desc 5 (water ripple strip)   at (72,  125)
  if (parity !== 0 && mon08Pic && mon08Decoded) {
    compositePicScript(buf, ENGINE_W, ENGINE_H, 208, 52, [4], mon08Pic, mon08Decoded, EGA_DEFAULT);
    compositePicScript(buf, ENGINE_W, ENGINE_H, 72, 125, [5], mon08Pic, mon08Decoded, EGA_DEFAULT);
  }

  // Menu option text via wfont0 (the engine's ui_window_puts path). The
  // engine packs options into a 22-cell-wide window at cell (9, 4)
  // = screen (72, 32); we draw each option as one row inside it. Layout
  // is by-eye for now — full RE of FUN_025c's grid is TODO.
  // Selected option gets a brighter color + leading caret to mimic the
  // engine's inverted-attribute redraw.
  if (wfont0) {
    const rowH = 12; // pixels per menu row (one font-height + gap)
    const baseX = 80;
    const baseY = 145;
    for (let i = 0; i < menuOptions.length; i++) {
      const opt = menuOptions[i]!;
      const isSel = i === selectedIdx;
      const fg = isSel ? 14 /* yellow */ : 7 /* light gray */;
      const label = (isSel ? '» ' : '  ') + opt.label;
      renderTextRun(buf, ENGINE_W, ENGINE_H, baseX, baseY + i * rowH, label, wfont0, fg, EGA_DEFAULT);
    }
  }

  ctx.putImageData(new ImageData(buf, ENGINE_W, ENGINE_H), 0, 0);
}
