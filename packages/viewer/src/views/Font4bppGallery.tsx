import { useEffect, useRef, useState } from 'react';
import type { Font4bpp, Palette, PaletteName } from '@wiz6/data';
import { PALETTE_CATALOG, EGA_DEFAULT } from '@wiz6/data';
import { EGA_FILE_INDEX_PERMUTATION } from '@wiz6/parser';
import { loadFont4bpp } from '../data-loader.js';

const GLYPH_PX = 8;
const CELL_PX = 8;
const ZOOM = 4;
const COLS = 16;

// Standard EGA plane order: B (plane 0), G (plane 1), R (plane 2), I (plane 3).
// The COLORS rendered depend on the palette prop. Default is the Wizardry main
// palette discovered in wroot.exe (see docs/re/palette-discovery.md).
function pixelColor(glyph: number[], row: number, col: number): number {
  const blue = (glyph[row] ?? 0) >> (7 - col) & 1;
  const green = (glyph[8 + row] ?? 0) >> (7 - col) & 1;
  const red = (glyph[16 + row] ?? 0) >> (7 - col) & 1;
  const intensity = (glyph[24 + row] ?? 0) >> (7 - col) & 1;
  return (intensity << 3) | (red << 2) | (green << 1) | blue;
}

interface Props {
  url: string;
  palette?: PaletteName | Palette;
}

export function Font4bppGallery({ url, palette = EGA_DEFAULT }: Props) {
  const [font, setFont] = useState<Font4bpp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const resolvedPalette: Palette =
    typeof palette === 'string'
      ? (PALETTE_CATALOG[palette] ?? PALETTE_CATALOG['ega-default']!)
      : palette;

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
          const fileIdx = pixelColor(glyph, r, c);
          const egaIdx = EGA_FILE_INDEX_PERMUTATION[fileIdx]!;
          const rgb = resolvedPalette.colors[egaIdx];
          if (!rgb) continue;
          ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
          ctx.fillRect((gx + c) * ZOOM, (gy + r) * ZOOM, ZOOM, ZOOM);
        }
      }
    }
  }, [font, resolvedPalette]);

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
        Source: <code>{font.sourceFile}</code> · {font.glyphCount} glyphs · 4bpp · palette: <code>{resolvedPalette.name}</code>
      </p>
      <canvas ref={canvasRef} role="img" aria-label="4bpp font glyph grid" />
    </section>
  );
}
