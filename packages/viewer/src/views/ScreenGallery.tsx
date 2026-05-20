import { useEffect, useRef, useState } from 'react';
import type { EgaScreen, Palette } from '@wiz6/data';
import { loadEgaScreen } from '../data-loader.js';
import { WIZ6_PALETTE_1 } from '../palettes/wiz6-palette-1.js';

const ZOOM = 2;

/**
 * Per-plane source-coordinate transform for the 32 KB EGA screen files.
 *
 * Each .ega screen file stores its 4 EGA planes with PER-PLANE PRE-APPLIED
 * SHIFTS: plane P's bytes correspond to the source image shifted by
 * `shiftX = 64 * P` pixels horizontally (cyclically) and `shiftY = -5 * P`
 * rows vertically. Because the storage uses a byte-level cyclic rotation
 * of the entire 8000-byte plane buffer rather than a per-row rotation, the
 * data rolls across row boundaries at the shift column — manifesting as
 * an additional ONE-ROW Y shift for columns LEFT of the wrap.
 *
 * Discovered in Stage 1f.3 by interactive alignment in the
 * ScreenAlignmentTool. The same pattern produces pixel-accurate composites
 * for all three known screens (titlepag, graveyrd, dragonsc).
 *
 * The WHY of the per-plane shift pattern is still open — see
 * docs/re/ega-screen.md "Why the planes are pre-shifted".
 */
function sourceCoordForPlane(
  planeIdx: number,
  x: number,
  y: number,
  width: number,
  height: number,
): { srcX: number; srcY: number } | null {
  const shiftX = (64 * planeIdx) % width;
  const shiftY = -5 * planeIdx;
  const yDrop = x < shiftX ? 1 : 0;
  const srcY = y - shiftY - yDrop;
  if (srcY < 0 || srcY >= height) return null;
  const srcX = ((x - shiftX) % width + width) % width;
  return { srcX, srcY };
}

function bitAt(plane: number[], width: number, srcX: number, srcY: number): number {
  const bytesPerRow = width / 8;
  const byteIdx = srcY * bytesPerRow + (srcX >> 3);
  const bitIdx = 7 - (srcX & 7);
  return ((plane[byteIdx] ?? 0) >> bitIdx) & 1;
}

interface Props {
  url: string;
  palette?: Palette;
}

export function ScreenGallery({ url, palette = WIZ6_PALETTE_1 }: Props) {
  const [screen, setScreen] = useState<EgaScreen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadEgaScreen(url)
      .then((s) => {
        if (!cancelled) setScreen(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!screen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = screen.width * ZOOM;
    canvas.height = screen.height * ZOOM;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context not available');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < screen.height; y++) {
      for (let x = 0; x < screen.width; x++) {
        let colorIndex = 0;
        for (let p = 0; p < 4; p++) {
          const plane = screen.planes[p];
          if (!plane) continue;
          const src = sourceCoordForPlane(p, x, y, screen.width, screen.height);
          if (!src) continue;
          const bit = bitAt(plane, screen.width, src.srcX, src.srcY);
          colorIndex |= bit << p;
        }
        if (colorIndex === 0) continue;
        const rgb = palette.colors[colorIndex];
        if (!rgb) continue;
        ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
        ctx.fillRect(x * ZOOM, y * ZOOM, ZOOM, ZOOM);
      }
    }
  }, [screen, palette]);

  if (error) return <p>Failed to load {url}: {error}</p>;

  return (
    <section>
      <h2>{screen ? screen.id : url}</h2>
      <canvas ref={canvasRef} style={{ imageRendering: 'pixelated' }} />
    </section>
  );
}
