import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PicSchema, WIZ6_MAIN, type Font, type Font4bpp, type Pic } from '@wiz6/data';
// NOTE: was EGA_DEFAULT before the per-scene AC->DAC palette fix.
// WIZ6_MAIN.colors[i] is the AC->DAC chain result for color attribute i
// under the engine's main-game AC palette. See
// docs/re/findings/menu-cursor-render-path.json.
import {
  renderEgaScreen,
  concatenatePicSegments,
  compositePicScript,
  createTileWindow,
  clearWindow,
  setCursor,
  puts,
  centeredPuts,
  renderTileWindow,
  visibleMenuOptions,
  type MainMenuOption,
  type MainMenuContext,
} from '@wiz6/parser';
import { loadEgaScreen, loadFont, loadFont4bpp } from '../../data-loader.js';
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
  // Slot 6 (GAME CONFIGURATION) in stock Wiz6 picked PC Speaker / AdLib / etc.
  // For the web port we repurpose it to mean "house rules / QoL toggles" and
  // route to /settings (modern web UI; outside the EGA viewport).
  6: { route: '/settings' },
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
  const [wfont0, setWfont0] = useState<Font | null>(null);

  // Web-port menu filtering:
  //  - slot 6 (GAME CONFIGURATION): kept visible; repurposed to navigate to
  //    /settings (house rules + QoL toggles) instead of the original audio-
  //    device picker. See ROUTE_BY_SLOT above.
  //  - slot 8 (QUIT GAME): there's no "quit to DOS" in a browser. The user
  //    closes the tab or navigates away. We keep slot 8 in the engine-model
  //    MAIN_MENU_OPTIONS for engine-faithfulness, just hide it here.
  const visible = useMemo(
    () => visibleMenuOptions(DEFAULT_CONTEXT).filter((opt) => opt.slot !== 8),
    [],
  );
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
        setDragonscRgba(renderEgaScreen(screen, WIZ6_MAIN).rgba);
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
        wfont3,
        wfont0,
        visible,
        selectedIdxRef.current,
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mon08Pic, mon08Decoded, dragonscRgba, wfont3, wfont0, visible]);

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
  wfont0: Font | null,
  menuOptions: readonly MainMenuOption[],
  selectedIdx: number,
): void {
  const buf = new Uint8ClampedArray(ENGINE_W * ENGINE_H * 4);
  // Start with the canvas filled in the neutral dark-gray that wraps the
  // gate / dungeon viewport on every side AND fills the bottom of the
  // screen down to y=200. The gate art + dragonsc strip + banner are
  // overlaid on top.
  // Engine writes color attribute 8 to the bordering pixels around the
  // dungeon viewport. Under WIZ6_MAIN AC, that's DAC[16] = dim gray.
  const GRAY = WIZ6_MAIN.colors[8] ?? [0x55, 0x55, 0x55];
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = GRAY[0]!;
    buf[i + 1] = GRAY[1]!;
    buf[i + 2] = GRAY[2]!;
    buf[i + 3] = 0xff;
  }

  // Top strip + gate art (FUN_07b7 calls — see wroot-window-heap-allocator
  // finding for the engine-derived positions).
  // dragonsc.ega is a full 320×200 image but has visible content from
  // rows 4..38. Per user reference, the gray ground starts at the TOP
  // edge of the dungeon viewport (y=32), so we crop dragonsc to rows
  // 0..31 only — the dragon-shape decorations dragonsc has at rows
  // 32..44 are covered by other windows in the engine's render and
  // shouldn't bleed into the gray sides.
  if (dragonscRgba) {
    const DRAGONSC_TOP_ROWS = 32;
    const bytes = ENGINE_W * DRAGONSC_TOP_ROWS * 4;
    buf.set(dragonscRgba.subarray(0, bytes));
  }
  if (mon08Pic && mon08Decoded) {
    compositePicScript(buf, ENGINE_W, ENGINE_H, 72, 32, [0], mon08Pic, mon08Decoded, WIZ6_MAIN);
    compositePicScript(buf, ENGINE_W, ENGINE_H, 160, 32, [1], mon08Pic, mon08Decoded, WIZ6_MAIN);
    compositePicScript(buf, ENGINE_W, ENGINE_H, 128, 49, [2], mon08Pic, mon08Decoded, WIZ6_MAIN);
    compositePicScript(buf, ENGINE_W, ENGINE_H, 160, 49, [3], mon08Pic, mon08Decoded, WIZ6_MAIN);
  }

  // Parity-gated water overlays from FUN_0732 slots 5 + 6:
  //   slot 5: desc 4 (devil + water column) at (208, 52)
  //   slot 6: desc 5 (water ripple strip)   at (72,  125)
  if (parity !== 0 && mon08Pic && mon08Decoded) {
    compositePicScript(buf, ENGINE_W, ENGINE_H, 208, 52, [4], mon08Pic, mon08Decoded, WIZ6_MAIN);
    compositePicScript(buf, ENGINE_W, ENGINE_H, 72, 125, [5], mon08Pic, mon08Decoded, WIZ6_MAIN);
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
    // wfont3 is a SPRITESHEET — every glyph slot is a complete 8×8 tile
    // with baked-in colors. Same shape appears at multiple slots with
    // different color schemes. See docs/re/findings/wfont-tile-system.json.
    //
    // The UI rendering uses an engine-faithful (char, attr) tile-window
    // model: tiles are placed via clearWindow / puts / centeredPuts and
    // then renderTileWindow blits each cell using the wfont selected by
    // the attribute byte's low nibble (attr_lo=3 → wfont3).

    // ---- Banner row at cell (0, 18) = screen (0, 144), 40×1 cells ----
    // Engine call: c61a(banner_window, "master options", 0, 0x12)
    //   c61a translates attr ≥ 0x10 by subtracting 0xF, so the underlying
    //   puts attr is 3 → wfont3. The string is centered with padding
    //   character 0x5F (banner-variant space).
    const fontSet = { font0: wfont0, font3: wfont3 };

    const banner = createTileWindow({ screenX: 0, screenY: 144, widthCells: 40, heightCells: 1 });
    clearWindow(banner, 0x5f, 0x03); // banner-variant space, wfont3
    // Banner string is 20 cells total: bat + 2 banner-spaces + "master" +
    // 1 banner-space + "options" + 2 banner-spaces + bat. Centered in 40
    // cells starts at col 10 and ends at col 29 — cursor advances to 30,
    // matching the live banner_window cursor we read from wbase.dgroup
    // at save time. (0x5F is the banner-variant space; 0x7F the banner-
    // variant bat icon.)
    centeredPuts(banner, '\x7f\x5f\x5fmaster\x5foptions\x5f\x5f\x7f', 0x12, 0x5f);
    renderTileWindow(banner, buf, ENGINE_W, ENGINE_H, fontSet, WIZ6_MAIN);

    // ---- Lower pane at cell (0, 19) = screen (0, 152), 40×5 cells ----
    // Engine call: ed5a(menu_text_window, 0x20, 3, 0) — clear with
    //   tile 0x20 (uniform dark-gray fill) at attr=3 (wfont3). Then for
    //   each visible menu option, set cursor + puts.
    // FUN_025c grid math (called from FUN_2b36 args 2, 1, 0x13, 4):
    //   cursor_X = (slot / 4) * 19 + 2  → col 0 at cell X=2; col 1 at X=21
    //   cursor_Y = (slot % 4) + 1       → 4 rows per column at Y=1..4
    const pane = createTileWindow({ screenX: 0, screenY: 152, widthCells: 40, heightCells: 5 });
    clearWindow(pane, 0x20, 0x03);
    pane.invertHighlight = true; // menu selection = black text on the colour bar
    const X_BASE = 2;
    const Y_BASE = 1;
    const X_STRIDE = 19;
    const ROWS_PER_COL = 4;
    for (let i = 0; i < menuOptions.length; i++) {
      const opt = menuOptions[i]!;
      const cx = Math.floor(i / ROWS_PER_COL) * X_STRIDE + X_BASE;
      const cy = (i % ROWS_PER_COL) + Y_BASE;
      setCursor(pane, cx, cy);
      // Selected option uses the highlight putchar (wbase pushes attr=-5).
      // Cell stores (char, 0x50): attr<<4 in the high nibble, 0 in the low
      // nibble dispatches the blit to ega.drv slot 1 (1bpp wfont0 text).
      // At render time: stroke → palette[0] (black), bg → palette[5]. Under
      // WIZ6_MAIN AC, AC[5]=0x16 → DAC[22] = (255, 255, 85) bright yellow.
      // Non-selected options use the normal text path at attr=3 → wfont3.
      // See docs/re/findings/menu-cursor-render-path.json.
      const attr = i === selectedIdx ? 0x50 : 0x03;
      puts(pane, opt.label, attr);
    }
    renderTileWindow(pane, buf, ENGINE_W, ENGINE_H, fontSet, WIZ6_MAIN);
  }

  ctx.putImageData(new ImageData(buf, ENGINE_W, ENGINE_H), 0, 0);
}
