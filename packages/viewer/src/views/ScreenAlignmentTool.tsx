import { useEffect, useRef, useState } from 'react';
import type { EgaScreen } from '@wiz6/data';
import { loadEgaScreen } from '../data-loader.js';
import { WIZ6_TITLE_PALETTE } from '../palettes/wiz6-title.js';

const ZOOM = 2;
type RenderMode = 'layers' | 'composite';

// Each plane gets its own bright distinct color for the discrete-layer view.
const LAYER_COLORS: [number, number, number][] = [
  [255, 255, 255], // plane 0 = white (reference / silhouette)
  [80, 255, 80],   // plane 1 = green
  [255, 80, 80],   // plane 2 = red
  [120, 160, 255], // plane 3 = blue
];

// Per-plane split-offset configuration: each plane has a (dx, dy) for columns
// in [0, splitX), and a second (dx2, dy2) for columns in [splitX, width).
// Default splitX = width (i.e., no split — the right offset never applies).
interface SplitOffset {
  dx: number;
  dy: number;
  dx2: number;
  dy2: number;
  splitX: number;
}

const DEFAULT_OFFSET: SplitOffset = { dx: 0, dy: 0, dx2: 0, dy2: 0, splitX: 320 };

// Canonical per-plane offsets discovered in Stage 1f.1 — seeded into each new
// session of the alignment tool so the user starts at a good baseline instead
// of redoing the manual alignment work.
const SEEDED_OFFSETS: SplitOffset[] = [
  { dx:    0, dy:   0, dx2:    0, dy2:   0, splitX: 320 },
  { dx:  +64, dy:  -5, dx2:  +64, dy2:  -5, splitX: 320 },
  { dx: +128, dy: -10, dx2: +128, dy2: -10, splitX: 320 },
  { dx: -128, dy: -14, dx2: -128, dy2: -14, splitX: 320 },
];

interface Props {
  url: string;
}

// Compute the source pixel coordinate (srcX, srcY) for a given displayed
// pixel (x, y) under a SplitOffset. Returns null if outside (when wrapping
// is disabled and the source coord would be out of bounds).
function sourceCoord(
  x: number,
  y: number,
  off: SplitOffset,
  width: number,
  height: number,
  wrapX: boolean,
  wrapY: boolean,
): [number, number] | null {
  // Pick which half of the split this displayed-pixel belongs to.
  const inRight = x >= off.splitX;
  const dx = inRight ? off.dx2 : off.dx;
  const dy = inRight ? off.dy2 : off.dy;
  let srcX = x - dx;
  let srcY = y - dy;
  if (wrapX) {
    srcX = ((srcX % width) + width) % width;
  } else if (srcX < 0 || srcX >= width) {
    return null;
  }
  if (wrapY) {
    srcY = ((srcY % height) + height) % height;
  } else if (srcY < 0 || srcY >= height) {
    return null;
  }
  return [srcX, srcY];
}

function bitAt(plane: number[], width: number, srcX: number, srcY: number): number {
  const bytesPerRow = width / 8;
  const byteIdx = srcY * bytesPerRow + (srcX >> 3);
  const bitIdx = 7 - (srcX & 7);
  return ((plane[byteIdx] ?? 0) >> bitIdx) & 1;
}

export function ScreenAlignmentTool({ url }: Props) {
  const [screen, setScreen] = useState<EgaScreen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offsets, setOffsets] = useState<SplitOffset[]>(() =>
    SEEDED_OFFSETS.map((o) => ({ ...o })),
  );
  const [planeVisible, setPlaneVisible] = useState<boolean[]>([true, true, true, true]);
  const [wrapX, setWrapX] = useState<boolean>(true);
  const [wrapY, setWrapY] = useState<boolean>(false);
  const [renderMode, setRenderMode] = useState<RenderMode>('composite');
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

    if (renderMode === 'composite') {
      // For each displayed pixel, sample all 4 planes at their (split) source
      // coords and combine to a 4bpp color index, then look up wiz6-title.
      for (let y = 0; y < screen.height; y++) {
        for (let x = 0; x < screen.width; x++) {
          let colorIndex = 0;
          for (let p = 0; p < 4; p++) {
            if (!planeVisible[p]) continue;
            const plane = screen.planes[p];
            if (!plane) continue;
            const off = offsets[p] ?? DEFAULT_OFFSET;
            const src = sourceCoord(x, y, off, screen.width, screen.height, wrapX, wrapY);
            if (!src) continue;
            const bit = bitAt(plane, screen.width, src[0], src[1]);
            colorIndex |= bit << p;
          }
          if (colorIndex === 0) continue;
          const rgb = WIZ6_TITLE_PALETTE.colors[colorIndex];
          if (!rgb) continue;
          ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
          ctx.fillRect(x * ZOOM, y * ZOOM, ZOOM, ZOOM);
        }
      }
    } else {
      // Discrete-layers mode: each visible plane drawn as its layer color.
      for (let p = 0; p < 4; p++) {
        if (!planeVisible[p]) continue;
        const plane = screen.planes[p];
        if (!plane) continue;
        const off = offsets[p] ?? DEFAULT_OFFSET;
        const [cr, cg, cb] = LAYER_COLORS[p] ?? [255, 255, 255];
        ctx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`;
        for (let y = 0; y < screen.height; y++) {
          for (let x = 0; x < screen.width; x++) {
            const src = sourceCoord(x, y, off, screen.width, screen.height, wrapX, wrapY);
            if (!src) continue;
            const bit = bitAt(plane, screen.width, src[0], src[1]);
            if (bit) {
              ctx.fillRect(x * ZOOM, y * ZOOM, ZOOM, ZOOM);
            }
          }
        }
      }
    }
  }, [screen, offsets, planeVisible, wrapX, wrapY, renderMode]);

  if (error) return <p>Failed to load {url}: {error}</p>;

  const updateField = (p: number, field: keyof SplitOffset, value: number) => {
    setOffsets((prev) => prev.map((o, i) => (i === p ? { ...o, [field]: value } : o)));
  };

  const toggleVisible = (p: number) => {
    setPlaneVisible((prev) => prev.map((v, i) => (i === p ? !v : v)));
  };

  const resetAll = () => {
    setOffsets(SEEDED_OFFSETS.map((o) => ({ ...o })));
    setPlaneVisible([true, true, true, true]);
  };

  const resetToZero = () => {
    setOffsets([
      { ...DEFAULT_OFFSET },
      { ...DEFAULT_OFFSET },
      { ...DEFAULT_OFFSET },
      { ...DEFAULT_OFFSET },
    ]);
    setPlaneVisible([true, true, true, true]);
  };

  return (
    <section>
      <h2>{screen ? `${screen.id} (alignment tool)` : url}</h2>
      <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', border: '1px solid #444' }} />
      <div style={{ marginTop: '0.5em' }}>
        <button onClick={resetAll}>Reset to Stage 1f.1 baseline</button>{' '}
        <button onClick={resetToZero}>Zero all offsets</button>{' '}
        <label style={{ marginLeft: '1em' }}>
          render:{' '}
          <select value={renderMode} onChange={(e) => setRenderMode(e.target.value as RenderMode)}>
            <option value="layers">discrete layers</option>
            <option value="composite">composite (wiz6-title palette)</option>
          </select>
        </label>{' '}
        <label style={{ marginLeft: '1em' }}>
          <input type="checkbox" checked={wrapX} onChange={() => setWrapX(!wrapX)} /> wrap X
        </label>{' '}
        <label style={{ marginLeft: '0.5em' }}>
          <input type="checkbox" checked={wrapY} onChange={() => setWrapY(!wrapY)} /> wrap Y
        </label>
      </div>
      {[0, 1, 2, 3].map((p) => {
        const [cr, cg, cb] = LAYER_COLORS[p] ?? [255, 255, 255];
        const off = offsets[p] ?? DEFAULT_OFFSET;
        const hasSplit = off.splitX < (screen?.width ?? 320);
        return (
          <div
            key={p}
            style={{
              borderLeft: `8px solid rgb(${cr}, ${cg}, ${cb})`,
              padding: '0.25em 0.5em',
              margin: '0.25em 0',
              background: '#1a1a1a',
              color: '#ddd',
              fontFamily: 'monospace',
              fontSize: '0.85em',
            }}
          >
            <div>
              <label style={{ marginRight: '1em' }}>
                <input
                  type="checkbox"
                  checked={planeVisible[p] ?? true}
                  onChange={() => toggleVisible(p)}
                />{' '}
                plane {p}
              </label>
              <label style={{ marginRight: '1em' }}>
                dx{' '}
                <input
                  type="range"
                  min={-160}
                  max={160}
                  step={1}
                  value={off.dx}
                  onChange={(e) => updateField(p, 'dx', Number(e.target.value))}
                  style={{ width: '240px', verticalAlign: 'middle' }}
                />{' '}
                <input
                  type="number"
                  min={-320}
                  max={320}
                  step={1}
                  value={off.dx}
                  onChange={(e) => updateField(p, 'dx', Number(e.target.value))}
                  style={{ width: '55px' }}
                />
              </label>
              <label>
                dy{' '}
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={1}
                  value={off.dy}
                  onChange={(e) => updateField(p, 'dy', Number(e.target.value))}
                  style={{ width: '180px', verticalAlign: 'middle' }}
                />{' '}
                <input
                  type="number"
                  min={-200}
                  max={200}
                  step={1}
                  value={off.dy}
                  onChange={(e) => updateField(p, 'dy', Number(e.target.value))}
                  style={{ width: '55px' }}
                />
              </label>
            </div>
            <div style={{ marginTop: '0.2em', opacity: hasSplit ? 1 : 0.6 }}>
              <label style={{ marginRight: '1em' }}>
                splitX{' '}
                <input
                  type="number"
                  min={0}
                  max={screen?.width ?? 320}
                  step={1}
                  value={off.splitX}
                  onChange={(e) => updateField(p, 'splitX', Number(e.target.value))}
                  style={{ width: '55px' }}
                />{' '}
                <span style={{ color: '#888' }}>(= width disables split)</span>
              </label>
              <label style={{ marginRight: '1em' }}>
                dx₂{' '}
                <input
                  type="range"
                  min={-160}
                  max={160}
                  step={1}
                  value={off.dx2}
                  onChange={(e) => updateField(p, 'dx2', Number(e.target.value))}
                  disabled={!hasSplit}
                  style={{ width: '240px', verticalAlign: 'middle' }}
                />{' '}
                <input
                  type="number"
                  min={-320}
                  max={320}
                  step={1}
                  value={off.dx2}
                  onChange={(e) => updateField(p, 'dx2', Number(e.target.value))}
                  disabled={!hasSplit}
                  style={{ width: '55px' }}
                />
              </label>
              <label>
                dy₂{' '}
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={1}
                  value={off.dy2}
                  onChange={(e) => updateField(p, 'dy2', Number(e.target.value))}
                  disabled={!hasSplit}
                  style={{ width: '180px', verticalAlign: 'middle' }}
                />{' '}
                <input
                  type="number"
                  min={-200}
                  max={200}
                  step={1}
                  value={off.dy2}
                  onChange={(e) => updateField(p, 'dy2', Number(e.target.value))}
                  disabled={!hasSplit}
                  style={{ width: '55px' }}
                />
              </label>
            </div>
          </div>
        );
      })}
      <details style={{ marginTop: '0.5em' }}>
        <summary>Copy offsets as JSON</summary>
        <pre style={{ background: '#1a1a1a', color: '#0f0', padding: '0.5em', overflow: 'auto' }}>
          {JSON.stringify({ id: screen?.id, offsets }, null, 2)}
        </pre>
      </details>
    </section>
  );
}
