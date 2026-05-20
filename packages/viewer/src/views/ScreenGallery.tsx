import { useEffect, useRef, useState } from 'react';
import type { EgaScreen, Palette } from '@wiz6/data';
import { loadEgaScreen } from '../data-loader.js';
import { WIZ6_PALETTE_1 } from '../palettes/wiz6-palette-1.js';

const ZOOM = 2;

// Standard EGA plane order: B (plane 0), G (plane 1), R (plane 2), I (plane 3).
function pixelColor(planes: number[][], rowByteIndex: number, bitIndex: number): number {
  const b = ((planes[0]?.[rowByteIndex] ?? 0) >> bitIndex) & 1;
  const g = ((planes[1]?.[rowByteIndex] ?? 0) >> bitIndex) & 1;
  const r = ((planes[2]?.[rowByteIndex] ?? 0) >> bitIndex) & 1;
  const i = ((planes[3]?.[rowByteIndex] ?? 0) >> bitIndex) & 1;
  return (i << 3) | (r << 2) | (g << 1) | b;
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
      for (let xByte = 0; xByte < screen.width / 8; xByte++) {
        const rowByteIndex = y * (screen.width / 8) + xByte;
        for (let bit = 0; bit < 8; bit++) {
          const bitIndex = 7 - bit;
          const colorIndex = pixelColor(screen.planes, rowByteIndex, bitIndex);
          const rgb = palette.colors[colorIndex];
          if (!rgb) continue;
          if (rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0) continue;
          const screenX = (xByte * 8 + bit) * ZOOM;
          const screenY = y * ZOOM;
          ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
          ctx.fillRect(screenX, screenY, ZOOM, ZOOM);
        }
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
