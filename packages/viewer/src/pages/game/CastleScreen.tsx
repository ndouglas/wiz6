import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PicSchema,
  WIZ6_MAIN,
  type ActivePartyMember,
  type Font,
  type Font4bpp,
  type Pic,
  type PortraitSet,
} from '@wiz6/data';
import {
  renderEgaScreen,
  concatenatePicSegments,
  visibleMenuOptions,
  type MainMenuContext,
} from '@wiz6/parser';
import { loadEgaScreen, loadFont, loadFont4bpp, loadPortraitSet } from '../../data-loader.js';
import { readActiveParty } from '../../lib/active-party-store.js';
import { readRoster } from '../../lib/roster-store.js';
import { composeCastleFrame } from './castle-frame.js';
import styles from './CastleScreen.module.css';

const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

/** Period of the parity flip (ms). Engine cadence per FUN_013b is ~10 input
 *  polls between flips; on a 486DX/33 that's roughly 400-600ms wall-clock.
 *  Tunable by feel — we don't aim for byte-precise emulator timing. */
const PARITY_FLIP_MS = 500;

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
  const [wfont1, setWfont1] = useState<Font4bpp | null>(null);
  const [wfont0, setWfont0] = useState<Font | null>(null);

  // Web-port menu filtering:
  //  - slot 6 (GAME CONFIGURATION): kept visible; repurposed to navigate to
  //    /settings (house rules + QoL toggles) instead of the original audio-
  //    device picker. See ROUTE_BY_SLOT above.
  //  - slot 8 (QUIT GAME): there's no "quit to DOS" in a browser. The user
  //    closes the tab or navigates away. We keep slot 8 in the engine-model
  //    MAIN_MENU_OPTIONS for engine-faithfulness, just hide it here.
  const visible = useMemo(() => {
    const ctx: MainMenuContext = {
      partySize: readActiveParty().members.length,
      pcFileHasUnloadedChars: readRoster().characters.length > 0,
    };
    return visibleMenuOptions(ctx).filter((opt) => opt.slot !== 8);
  }, []);
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
    loadFont4bpp('/fonts/wfont1.json')
      .then((font) => {
        if (!cancelled) setWfont1(font);
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
      const buf = composeCastleFrame(
        parity,
        dragonscRgba,
        mon08Pic,
        mon08Decoded,
        wfont3,
        wfont0,
        visible,
        selectedIdxRef.current,
        wfont1,
      );
      // Allocate ArrayBuffer-backed ImageData + copy; passing the
      // Uint8ClampedArray to the ctor trips the lib.dom ArrayBufferLike types.
      const img = new ImageData(ENGINE_W, ENGINE_H);
      img.data.set(buf);
      ctx.putImageData(img, 0, 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mon08Pic, mon08Decoded, dragonscRgba, wfont3, wfont1, wfont0, visible]);

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

