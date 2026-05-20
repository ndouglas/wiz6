import { useEffect, useRef, useState } from 'react';
import type { EgaScreen } from '@wiz6/data';
import { loadEgaScreen } from '../data-loader.js';

const ZOOM = 2;

// Each plane gets its own bright distinct color for the discrete-layer view.
const LAYER_COLORS: [number, number, number][] = [
  [255, 255, 255], // plane 0 = white (reference / silhouette)
  [80, 255, 80],   // plane 1 = green
  [255, 80, 80],   // plane 2 = red
  [120, 160, 255], // plane 3 = blue
];

interface Props {
  url: string;
}

interface Offset {
  dx: number;
  dy: number;
}

export function ScreenAlignmentTool({ url }: Props) {
  const [screen, setScreen] = useState<EgaScreen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offsets, setOffsets] = useState<Offset[]>([
    { dx: 0, dy: 0 },
    { dx: 0, dy: 0 },
    { dx: 0, dy: 0 },
    { dx: 0, dy: 0 },
  ]);
  const [planeVisible, setPlaneVisible] = useState<boolean[]>([true, true, true, true]);
  const [wrapX, setWrapX] = useState<boolean>(true);
  const [wrapY, setWrapY] = useState<boolean>(false);
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

    const bytesPerRow = screen.width / 8;
    for (let p = 0; p < 4; p++) {
      if (!planeVisible[p]) continue;
      const plane = screen.planes[p];
      if (!plane) continue;
      const off = offsets[p] ?? { dx: 0, dy: 0 };
      const [cr, cg, cb] = LAYER_COLORS[p] ?? [255, 255, 255];
      ctx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`;
      for (let y = 0; y < screen.height; y++) {
        for (let xByte = 0; xByte < bytesPerRow; xByte++) {
          const b = plane[y * bytesPerRow + xByte] ?? 0;
          if (b === 0) continue;
          for (let bit = 0; bit < 8; bit++) {
            if (b & (0x80 >> bit)) {
              let dstXpx = xByte * 8 + bit + off.dx;
              let dstYpx = y + off.dy;
              if (wrapX) {
                dstXpx = ((dstXpx % screen.width) + screen.width) % screen.width;
              } else if (dstXpx < 0 || dstXpx >= screen.width) {
                continue;
              }
              if (wrapY) {
                dstYpx = ((dstYpx % screen.height) + screen.height) % screen.height;
              } else if (dstYpx < 0 || dstYpx >= screen.height) {
                continue;
              }
              ctx.fillRect(dstXpx * ZOOM, dstYpx * ZOOM, ZOOM, ZOOM);
            }
          }
        }
      }
    }
  }, [screen, offsets, planeVisible]);

  if (error) return <p>Failed to load {url}: {error}</p>;

  const updateOffset = (p: number, axis: 'dx' | 'dy', value: number) => {
    setOffsets((prev) => prev.map((o, i) => (i === p ? { ...o, [axis]: value } : o)));
  };

  const toggleVisible = (p: number) => {
    setPlaneVisible((prev) => prev.map((v, i) => (i === p ? !v : v)));
  };

  const resetAll = () => {
    setOffsets([
      { dx: 0, dy: 0 },
      { dx: 0, dy: 0 },
      { dx: 0, dy: 0 },
      { dx: 0, dy: 0 },
    ]);
    setPlaneVisible([true, true, true, true]);
  };

  return (
    <section>
      <h2>{screen ? `${screen.id} (alignment tool)` : url}</h2>
      <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', border: '1px solid #444' }} />
      <div style={{ marginTop: '0.5em' }}>
        <button onClick={resetAll}>Reset all offsets</button>{' '}
        <label style={{ marginLeft: '1em' }}>
          <input type="checkbox" checked={wrapX} onChange={() => setWrapX(!wrapX)} /> wrap X
        </label>{' '}
        <label style={{ marginLeft: '0.5em' }}>
          <input type="checkbox" checked={wrapY} onChange={() => setWrapY(!wrapY)} /> wrap Y
        </label>
      </div>
      {[0, 1, 2, 3].map((p) => {
        const [cr, cg, cb] = LAYER_COLORS[p] ?? [255, 255, 255];
        const off = offsets[p] ?? { dx: 0, dy: 0 };
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
            }}
          >
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
                onChange={(e) => updateOffset(p, 'dx', Number(e.target.value))}
                style={{ width: '300px', verticalAlign: 'middle' }}
              />{' '}
              <input
                type="number"
                min={-160}
                max={160}
                step={1}
                value={off.dx}
                onChange={(e) => updateOffset(p, 'dx', Number(e.target.value))}
                style={{ width: '60px' }}
              />
            </label>
            <label>
              dy{' '}
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                value={off.dy}
                onChange={(e) => updateOffset(p, 'dy', Number(e.target.value))}
                style={{ width: '200px', verticalAlign: 'middle' }}
              />{' '}
              <input
                type="number"
                min={-100}
                max={100}
                step={1}
                value={off.dy}
                onChange={(e) => updateOffset(p, 'dy', Number(e.target.value))}
                style={{ width: '60px' }}
              />
            </label>
          </div>
        );
      })}
      <details style={{ marginTop: '0.5em' }}>
        <summary>Copy offsets as JSON</summary>
        <pre style={{ background: '#1a1a1a', color: '#0f0', padding: '0.5em' }}>
          {JSON.stringify({ id: screen?.id, offsets }, null, 2)}
        </pre>
      </details>
    </section>
  );
}
