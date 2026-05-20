import { useEffect, useRef, useState } from 'react';
import type { Font4bpp } from '@wiz6/data';
import { loadFont4bpp } from '../data-loader.js';
import { EGA_PALETTE } from '../ega-palette.js';

const GLYPH_PX = 8;
const CELL_PX = 8;
const ZOOM = 4;
const COLS = 16;

interface Props {
  url: string;
}

// Wizardry's wfont*.ega plane order is B, R, G, I — *not* the standard EGA
// hardware order of B, G, R, I. Confirmed empirically: with the standard order
// in-game magenta renders as cyan, red renders as green, etc. Swapping the
// contribution of file planes 1 and 2 in the output color index restores the
// in-game appearance.
function pixelColor(glyph: number[], row: number, col: number): number {
  const blue = (glyph[row] ?? 0) >> (7 - col) & 1;       // file plane 0 = blue
  const red = (glyph[8 + row] ?? 0) >> (7 - col) & 1;    // file plane 1 = red
  const green = (glyph[16 + row] ?? 0) >> (7 - col) & 1; // file plane 2 = green
  const intensity = (glyph[24 + row] ?? 0) >> (7 - col) & 1; // file plane 3 = intensity
  return (intensity << 3) | (red << 2) | (green << 1) | blue;
}

export function Font4bppGallery({ url }: Props) {
  const [font, setFont] = useState<Font4bpp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFont4bpp(url)
      .then((f) => {
        if (!cancelled) setFont(f);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!font || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rows = Math.ceil(font.glyphCount / COLS);
    canvas.width = COLS * CELL_PX * ZOOM;
    canvas.height = rows * CELL_PX * ZOOM;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context not available');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let g = 0; g < font.glyphCount; g++) {
      const gx = (g % COLS) * CELL_PX;
      const gy = Math.floor(g / COLS) * CELL_PX;
      const glyph = font.glyphs[g];
      if (!glyph) continue;
      for (let r = 0; r < GLYPH_PX; r++) {
        for (let c = 0; c < GLYPH_PX; c++) {
          const colorIndex = pixelColor(glyph, r, c);
          const rgb = EGA_PALETTE[colorIndex];
          if (!rgb) continue;
          ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
          ctx.fillRect((gx + c) * ZOOM, (gy + r) * ZOOM, ZOOM, ZOOM);
        }
      }
    }
  }, [font]);

  if (error) {
    return <div role="alert">Error: {error}</div>;
  }
  if (!font) {
    return <p>Loading…</p>;
  }
  return (
    <section>
      <h2>{font.id}</h2>
      <p>
        Source: <code>{font.sourceFile}</code> · {font.glyphCount} glyphs · 4bpp
      </p>
      <canvas ref={canvasRef} role="img" aria-label="4bpp font glyph grid" />
    </section>
  );
}
