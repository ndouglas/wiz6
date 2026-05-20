import { useEffect, useRef, useState } from 'react';
import type { EgaScreen, Palette } from '@wiz6/data';
import { loadEgaScreen } from '../data-loader.js';
import { WIZ6_PALETTE_1 } from '../palettes/wiz6-palette-1.js';

const ZOOM = 2;

// Per-plane (dx, dy) offsets discovered empirically (Stage 1f.1, branch
// stage-1f-ega-screens). Each .ega file stores its 4 planes pre-shifted
// horizontally by 0/+64/+128/+192 pixels (with cyclic wrap on the row), plus
// small Y shifts. To produce a correct composite, we shift each plane back
// to position (0, 0) before sampling. The same offsets apply to all 3
// known screens (titlepag, graveyrd, dragonsc); see docs/re/ega-screen.md.
const PLANE_OFFSETS: { dx: number; dy: number }[] = [
  { dx: 0, dy: 0 },
  { dx: 64, dy: -5 },
  { dx: 128, dy: -10 },
  { dx: -128, dy: -14 },
];

// Read 1 bit from a plane after applying the plane's stored (dx, dy) shift.
// The screen coordinate (x, y) maps back to the plane's stored byte via
// cyclic-X-wrap and bounded-Y. Returns 0 outside the bounded Y range.
function bitAt(plane: number[], width: number, height: number, x: number, y: number, dx: number, dy: number): number {
  // The source pixel for screen coord (x, y) lives at plane coord (x - dx, y - dy).
  // X uses cyclic wrap; Y is bounded.
  const srcY = y - dy;
  if (srcY < 0 || srcY >= height) return 0;
  let srcX = (x - dx) % width;
  if (srcX < 0) srcX += width;
  const byteIdx = srcY * (width / 8) + (srcX >> 3);
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
        const b0 = bitAt(screen.planes[0] ?? [], screen.width, screen.height, x, y, PLANE_OFFSETS[0]!.dx, PLANE_OFFSETS[0]!.dy);
        const b1 = bitAt(screen.planes[1] ?? [], screen.width, screen.height, x, y, PLANE_OFFSETS[1]!.dx, PLANE_OFFSETS[1]!.dy);
        const b2 = bitAt(screen.planes[2] ?? [], screen.width, screen.height, x, y, PLANE_OFFSETS[2]!.dx, PLANE_OFFSETS[2]!.dy);
        const b3 = bitAt(screen.planes[3] ?? [], screen.width, screen.height, x, y, PLANE_OFFSETS[3]!.dx, PLANE_OFFSETS[3]!.dy);
        const colorIndex = (b3 << 3) | (b2 << 2) | (b1 << 1) | b0;
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
