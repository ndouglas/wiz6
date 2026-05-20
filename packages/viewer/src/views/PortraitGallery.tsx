import { useEffect, useRef, useState } from 'react';
import type { Palette, PortraitSet } from '@wiz6/data';
import { loadPortraitSet } from '../data-loader.js';
import { WIZ6_PALETTE_1 } from '../palettes/wiz6-palette-1.js';

const TILE_PX = 8;
const TILES_PER_SIDE = 3;
const PORTRAIT_PX = TILE_PX * TILES_PER_SIDE; // 24
const ZOOM = 4;
const COLS = 7; // 7 portraits per display row (14 total → 2 rows)

// Standard EGA plane order: B (plane 0), G (plane 1), R (plane 2), I (plane 3).
function pixelColor(tile: number[], row: number, col: number): number {
  const blue = (tile[row] ?? 0) >> (7 - col) & 1;
  const green = (tile[8 + row] ?? 0) >> (7 - col) & 1;
  const red = (tile[16 + row] ?? 0) >> (7 - col) & 1;
  const intensity = (tile[24 + row] ?? 0) >> (7 - col) & 1;
  return (intensity << 3) | (red << 2) | (green << 1) | blue;
}

interface Props {
  url: string;
  palette?: Palette;
}

export function PortraitGallery({ url, palette = WIZ6_PALETTE_1 }: Props) {
  const [set, setSet] = useState<PortraitSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPortraitSet(url)
      .then((s) => {
        if (!cancelled) setSet(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!set || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const dispRows = Math.ceil(set.portraitCount / COLS);
    canvas.width = COLS * PORTRAIT_PX * ZOOM;
    canvas.height = dispRows * PORTRAIT_PX * ZOOM;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context not available');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let p = 0; p < set.portraitCount; p++) {
      const portrait = set.portraits[p];
      if (!portrait) continue;
      const px = (p % COLS) * PORTRAIT_PX;
      const py = Math.floor(p / COLS) * PORTRAIT_PX;
      for (let ty = 0; ty < TILES_PER_SIDE; ty++) {
        for (let tx = 0; tx < TILES_PER_SIDE; tx++) {
          const tile = portrait.tiles[ty * TILES_PER_SIDE + tx];
          if (!tile) continue;
          for (let r = 0; r < TILE_PX; r++) {
            for (let c = 0; c < TILE_PX; c++) {
              const colorIndex = pixelColor(tile, r, c);
              const rgb = palette.colors[colorIndex];
              if (!rgb) continue;
              const screenX = (px + tx * TILE_PX + c) * ZOOM;
              const screenY = (py + ty * TILE_PX + r) * ZOOM;
              ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
              ctx.fillRect(screenX, screenY, ZOOM, ZOOM);
            }
          }
        }
      }
    }
  }, [set, palette]);

  if (error) {
    return <div role="alert">Error: {error}</div>;
  }
  if (!set) {
    return <p>Loading…</p>;
  }
  return (
    <section>
      <h2>{set.id}</h2>
      <p>
        Source: <code>{set.sourceFile}</code> · {set.portraitCount} portraits · 24 × 24 4bpp · palette:{' '}
        <code>{palette.name}</code>
      </p>
      <canvas ref={canvasRef} role="img" aria-label="Portrait set" />
    </section>
  );
}
