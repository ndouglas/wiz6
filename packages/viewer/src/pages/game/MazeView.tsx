import { useEffect, useRef } from 'react';
import { CanvasPresenter } from '../../lib/presenter.js';
import { composeMazeFrame } from './compose-maze-frame.js';
import styles from './CastleScreen.module.css';

const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

/**
 * MazeView — presents the pixel-exact maze corridor frame (320×200) in the
 * browser. Uses the same CanvasPresenter / RAF mechanism as CastleScreen; no
 * async asset loads required because composeMazeFrame() is fully synchronous
 * (static chrome + pure viewport composer, backed by the committed
 * maze-corridor-tiles.json asset bundled at build time).
 */
export function MazeView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const presenter = new CanvasPresenter(canvas);
    let raf = 0;

    const tick = () => {
      const buf = composeMazeFrame();
      presenter.present(new Uint8ClampedArray(buf.buffer), ENGINE_W, ENGINE_H);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <main className={styles.page}>
      <h1 className={styles.srOnly}>Dungeon — Maze View</h1>
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
          aria-label="Wizardry VI dungeon corridor"
        />
      </div>
    </main>
  );
}
