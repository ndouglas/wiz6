import { useEffect, useRef, useState } from 'react';
import type { Font } from '@wiz6/data';
import { loadFont } from '../data-loader.js';

const GLYPH_PX = 8;
const CELL_PX = 8;
const ZOOM = 4;
const COLS = 16;

interface Props {
  url: string;
}

export function FontGallery({ url }: Props) {
  const [font, setFont] = useState<Font | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFont(url)
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
    ctx.fillStyle = '#fff';
    for (let g = 0; g < font.glyphCount; g++) {
      const gx = (g % COLS) * CELL_PX;
      const gy = Math.floor(g / COLS) * CELL_PX;
      const glyph = font.glyphs[g];
      if (!glyph) continue;
      for (let r = 0; r < GLYPH_PX; r++) {
        const byte = glyph[r];
        if (byte === undefined) continue;
        for (let c = 0; c < GLYPH_PX; c++) {
          if ((byte >> (7 - c)) & 1) {
            ctx.fillRect((gx + c) * ZOOM, (gy + r) * ZOOM, ZOOM, ZOOM);
          }
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
        Source: <code>{font.sourceFile}</code> · {font.glyphCount} glyphs
      </p>
      <canvas ref={canvasRef} role="img" aria-label="Font glyph grid" />
    </section>
  );
}
