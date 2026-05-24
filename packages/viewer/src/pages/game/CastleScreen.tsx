import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PicSchema, EGA_DEFAULT, type Font4bpp, type Pic } from '@wiz6/data';
import {
  renderEgaScreen,
  concatenatePicSegments,
  compositePicScript,
  renderTextRun4bpp,
  visibleMenuOptions,
  type MainMenuOption,
  type MainMenuContext,
} from '@wiz6/parser';
import { loadEgaScreen, loadFont4bpp } from '../../data-loader.js';
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
  const [wfont3, setWfont3] = useState<Font4bpp | null>(null);

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
    loadFont4bpp('/fonts/wfont3.json')
      .then((font) => {
        if (!cancelled) setWfont3(font);
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
        wfont3,
        visible,
        selectedIdxRef.current,
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mon08Pic, mon08Decoded, dragonscRgba, wfont3, visible]);

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

  return (
    <main className={styles.page}>
      <h1 className={styles.srOnly}>Castle — Main Menu</h1>
      <p className={styles.srOnly}>
        Use arrow keys to navigate, Enter to select.
        {visible[selectedIdx] ? ` Currently selected: ${visible[selectedIdx]!.label}.` : ''}
      </p>
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
    </main>
  );
}

function composeFrame(
  ctx: CanvasRenderingContext2D,
  parity: 0 | 1 | number,
  dragonscRgba: Uint8ClampedArray | null,
  mon08Pic: Pic | null,
  mon08Decoded: number[] | null,
  wfont3: Font4bpp | null,
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

  // Menu UI bottom band — three stacked windows per the engine's heap walk
  // (docs/re/findings/wroot-window-heap-allocator.json):
  //   y=144..152 px : BANNER row, attr=0x0E (yellow). "MASTER OPTIONS" with
  //                   bat glyphs (wfont3 char 0x7F) on either side; cursor
  //                   was at col 30 at save time = matches centered 18-char
  //                   layout "\x7F MASTER OPTIONS \x7F".
  //   y=152..192 px : LOWER PANE, attr=0x04 (red) background under attr=0x0F
  //                   (white) text overlay. The menu options live here.
  //   y=192..200 px : STATUS row, attr=0x03 (cyan). Empty in this save.
  //
  // FUN_025c's grid math (wbase 0x028F..0x02AC, called from FUN_2b36 with
  // args (2, 1, 0x13, 4)) puts option text at:
  //   cursor_X = (slot / 4) * 19 + 2   → col 0 at cell X=2; col 1 at X=21
  //   cursor_Y = (slot % 4) + 1        → 4 rows per column at Y=1..4
  // Cells are 8 px relative to the lower pane's top-left.
  if (wfont3) {
    const cellW = 8;
    const cellH = 8;
    // EGA color 8 = dark gray (the "neutral gray" background per user obs).
    const GRAY = EGA_DEFAULT.colors[8] ?? [0x55, 0x55, 0x55];
    const BLACK = EGA_DEFAULT.colors[0] ?? [0, 0, 0];

    // ---- Banner row (y=144..152, 8 px tall) ----
    // Gray background with 1-px black separator lines top + bottom; text
    // " {bat} MASTER OPTIONS {bat} " centered. Bat glyph is wfont3 char
    // 0x18 (dark-gray-bodied bat shape). Banner cursor was at col 30 at
    // save time = 18 visible chars starting at col 11 → 13 (off-by-2
    // here matches the 2 leading spaces).
    fillRect(buf, 0, 144, ENGINE_W, 8, GRAY);
    fillRect(buf, 0, 144, ENGINE_W, 1, BLACK); // top separator
    fillRect(buf, 0, 151, ENGINE_W, 1, BLACK); // bottom separator
    const banner = '\x18 MASTER OPTIONS \x18';
    const bannerX = ((40 - banner.length) >> 1) * cellW;
    renderTextRun4bpp(buf, ENGINE_W, ENGINE_H, bannerX, 144, banner, wfont3, EGA_DEFAULT);

    // ---- Lower pane (y=152..192) ----
    // Same neutral-gray fill so the banner reads as a stripe inside a
    // unified gray panel.
    const PANE_X = 0;
    const PANE_Y = 152;
    const PANE_W = 320;
    const PANE_H = 40;
    fillRect(buf, PANE_X, PANE_Y, PANE_W, PANE_H, GRAY);

    // FUN_025c grid math: (slot/4)*19+2 = cursor X cell; (slot%4)+1 = Y cell.
    const X_BASE = 2;
    const Y_BASE = 1;
    const X_STRIDE = 19;
    const ROWS_PER_COL = 4;
    for (let i = 0; i < menuOptions.length; i++) {
      const opt = menuOptions[i]!;
      const cursorX = Math.floor(i / ROWS_PER_COL) * X_STRIDE + X_BASE;
      const cursorY = (i % ROWS_PER_COL) + Y_BASE;
      const textX = PANE_X + cursorX * cellW;
      const textY = PANE_Y + cursorY * cellH;
      renderTextRun4bpp(buf, ENGINE_W, ENGINE_H, textX, textY, opt.label, wfont3, EGA_DEFAULT);
      // Selection highlight: invert the row band to a brighter bg so the
      // user can see which option is active. Engine uses an inverted-
      // attribute redraw; we approximate by drawing a light-gray bar
      // behind the text and re-rendering the text on top.
      if (i === selectedIdx) {
        const lightGray = EGA_DEFAULT.colors[7] ?? [0xaa, 0xaa, 0xaa];
        fillRect(buf, textX - 1, textY, opt.label.length * cellW + 2, cellH, lightGray);
        renderTextRun4bpp(buf, ENGINE_W, ENGINE_H, textX, textY, opt.label, wfont3, EGA_DEFAULT);
      }
    }
  }

  ctx.putImageData(new ImageData(buf, ENGINE_W, ENGINE_H), 0, 0);
}

function fillRect(
  buf: Uint8ClampedArray,
  x: number,
  y: number,
  w: number,
  h: number,
  color: readonly [number, number, number],
): void {
  const [r, g, b] = color;
  for (let py = y; py < y + h && py < ENGINE_H; py++) {
    for (let px = x; px < x + w && px < ENGINE_W; px++) {
      const idx = (py * ENGINE_W + px) * 4;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = 0xff;
    }
  }
}
