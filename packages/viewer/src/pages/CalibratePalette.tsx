import { useEffect, useMemo, useRef, useState } from 'react';
import type { Palette } from '@wiz6/data';
import { PALETTE_CATALOG, WIZ6_MAIN } from '@wiz6/data';
import { renderPicDescriptor, concatenatePicSegments } from '@wiz6/parser';
import { PicCanvas } from '../components/PicCanvas.js';
import { usePic } from '../lib/hooks/usePic.js';
import styles from './CalibratePalette.module.css';

const PIC_OPTIONS = [
  'mon00', 'mon01', 'mon02', 'mon03', 'mon04', 'mon05', 'mon06', 'mon07',
  'mon08', 'mon09', 'mon10', 'mon11', 'mon12', 'mon13', 'mon14', 'mon15',
  'mon16', 'mon17', 'mon18', 'mon19', 'mon20', 'mon21', 'mon22', 'mon23',
  'mon24', 'mon25', 'mon26', 'mon27', 'mon28', 'mon29', 'mon30', 'mon31',
  'mon32', 'mon33', 'mon34', 'mon35', 'mon36', 'mon37', 'mon38', 'mon39',
  'mon40', 'mon41', 'mon42', 'mon43', 'mon44', 'mon45', 'mon46', 'mon47',
  'mon48', 'mon49', 'mon50', 'mon51', 'mon52', 'mon53', 'mon54', 'mon55',
  'mon56', 'mon57', 'mon58', 'mon59', 'mon60',
  'credits',
];

function rgbToHex(rgb: readonly [number, number, number]): string {
  const [r, g, b] = rgb;
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

function clonePaletteColors(p: Palette): Array<[number, number, number]> {
  return p.colors.map((c) => [c[0], c[1], c[2]] as [number, number, number]);
}

interface EyedropperProps {
  onPick: (rgb: [number, number, number]) => void;
  activeIndex: number;
}

function ImageEyedropper({ onPick, activeIndex }: EyedropperProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hovered, setHovered] = useState<[number, number, number] | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [scale, setScale] = useState(2);

  function loadFile(file: File) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      setImgLoaded(true);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  }

  function onPaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items);
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          loadFile(file);
          break;
        }
      }
    }
  }

  function pixelAt(e: React.MouseEvent<HTMLCanvasElement>): [number, number, number] | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    const px = ctx.getImageData(x, y, 1, 1).data;
    return [px[0]!, px[1]!, px[2]!];
  }

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rgb = pixelAt(e);
    if (rgb) setHovered(rgb);
  }

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rgb = pixelAt(e);
    if (rgb) onPick(rgb);
  }

  return (
    <div className={styles.dropper}>
      <div className={styles.dropperControls}>
        <input type="file" accept="image/*" onChange={onFileChange} />
        <label className={styles.zoomField}>
          <span>zoom</span>
          <input
            type="range"
            min={1}
            max={6}
            step={1}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          />
          <span>{scale}×</span>
        </label>
      </div>
      <div
        className={styles.dropZone}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onPaste={onPaste}
        tabIndex={0}
      >
        {!imgLoaded && (
          <p className={styles.dropHint}>
            Drop an image here, paste (Cmd-V) one from the clipboard, or use the file
            picker above. Then click any pixel to set color index{' '}
            <strong>{activeIndex}</strong>.
          </p>
        )}
        <canvas
          ref={canvasRef}
          className={styles.dropperCanvas}
          style={{
            display: imgLoaded ? 'block' : 'none',
            imageRendering: 'pixelated',
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            cursor: 'crosshair',
          }}
          onMouseMove={onMove}
          onMouseLeave={() => setHovered(null)}
          onClick={onClick}
        />
      </div>
      {hovered && (
        <div className={styles.dropperReadout}>
          <span
            className={styles.dropperSwatch}
            style={{ background: rgbToHex(hovered) }}
          />
          <code>
            ({hovered[0]}, {hovered[1]}, {hovered[2]}) — {rgbToHex(hovered)}
          </code>
          <span className={styles.dropperTarget}>→ index {activeIndex}</span>
        </div>
      )}
    </div>
  );
}

export function CalibratePalette() {
  const [picId, setPicId] = useState<string>('mon57');
  const [descIdx, setDescIdx] = useState<number>(0);
  const [colors, setColors] = useState<Array<[number, number, number]>>(() =>
    clonePaletteColors(WIZ6_MAIN),
  );
  const [activeIndex, setActiveIndex] = useState<number>(2);
  const [spriteScale, setSpriteScale] = useState<number>(3);

  const { data, loading, error } = usePic(picId);

  useEffect(() => {
    setDescIdx(0);
  }, [picId]);

  const decodedBuffer = useMemo(
    () => (data ? concatenatePicSegments(data.segments) : []),
    [data],
  );

  const palette = useMemo<Palette>(
    () => ({
      name: 'calibration',
      provenance: 'live-edited via /explore/calibrate',
      colors: colors as Palette['colors'],
    }),
    [colors],
  );

  const rendered = useMemo(() => {
    if (!data || data.descriptors.length === 0) return null;
    const d = data.descriptors[Math.min(descIdx, data.descriptors.length - 1)];
    if (!d) return null;
    return renderPicDescriptor(d, decodedBuffer, palette);
  }, [data, decodedBuffer, descIdx, palette]);

  const usedIndices = useMemo(() => {
    if (!data || !rendered) return new Set<number>();
    const d = data.descriptors[Math.min(descIdx, data.descriptors.length - 1)];
    if (!d) return new Set<number>();
    const used = new Set<number>();
    const cellW = d.width;
    const cellH = d.height;
    let atlasOffset = d.pos;
    for (let cy = 0; cy < cellH; cy++) {
      for (let cx = 0; cx < cellW; cx++) {
        const bitIdx = cy * cellW + cx;
        const byteIdx = bitIdx >> 3;
        const bitInByte = bitIdx & 7;
        const populated =
          byteIdx < d.mask.length && ((d.mask[byteIdx] ?? 0) & (1 << bitInByte)) !== 0;
        if (!populated) continue;
        if (atlasOffset + 32 > decodedBuffer.length) {
          atlasOffset += 32;
          continue;
        }
        for (let row = 0; row < 8; row++) {
          const pB = decodedBuffer[atlasOffset + row] ?? 0;
          const pG = decodedBuffer[atlasOffset + 8 + row] ?? 0;
          const pR = decodedBuffer[atlasOffset + 16 + row] ?? 0;
          const pI = decodedBuffer[atlasOffset + 24 + row] ?? 0;
          for (let col = 0; col < 8; col++) {
            const bit = 7 - col;
            const c =
              ((pB >> bit) & 1) |
              (((pG >> bit) & 1) << 1) |
              (((pR >> bit) & 1) << 2) |
              (((pI >> bit) & 1) << 3);
            used.add(c);
          }
        }
        atlasOffset += 32;
      }
    }
    return used;
  }, [data, decodedBuffer, descIdx, rendered]);

  function setColor(i: number, rgb: [number, number, number]) {
    setColors((prev) => {
      const next = prev.map((c) => [c[0], c[1], c[2]] as [number, number, number]);
      next[i] = rgb;
      return next;
    });
  }

  function loadPreset(name: string) {
    const preset = PALETTE_CATALOG[name];
    if (preset) setColors(clonePaletteColors(preset));
  }

  function exportPalette(): string {
    const lines = colors.map((c, i) => {
      const used = usedIndices.has(i) ? '' : '  // (unused in current sprite)';
      return `  [${c[0]}, ${c[1]}, ${c[2]}],${used}`;
    });
    return `[\n${lines.join('\n')}\n]`;
  }

  const descriptorCount = data?.descriptors.length ?? 0;

  return (
    <main className={styles.wrapper}>
      <h1>Palette Calibration</h1>
      <p className={styles.intro}>
        Pick a sprite, drop a DOSBox screenshot of the same sprite, click on a pixel
        to assign its RGB to the currently-active palette index. Adjust until our render
        matches the original.
      </p>

      <div className={styles.controls}>
        <label className={styles.field}>
          <span>Sprite</span>
          <select value={picId} onChange={(e) => setPicId(e.target.value)}>
            {PIC_OPTIONS.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Descriptor</span>
          <select
            value={descIdx}
            onChange={(e) => setDescIdx(Number(e.target.value))}
            disabled={descriptorCount === 0}
          >
            {Array.from({ length: descriptorCount }, (_, i) => (
              <option key={i} value={i}>#{i}</option>
            ))}
          </select>
        </label>

        <div className={styles.presetGroup}>
          <span className={styles.presetLabel}>Presets:</span>
          {Object.keys(PALETTE_CATALOG).map((name) => (
            <button
              key={name}
              type="button"
              className={styles.presetBtn}
              onClick={() => loadPreset(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.previewCol}>
          <h2>Our render</h2>
          <label className={styles.zoomField}>
            <span>zoom</span>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={spriteScale}
              onChange={(e) => setSpriteScale(Number(e.target.value))}
            />
            <span>{spriteScale}×</span>
          </label>
          <div className={styles.spriteHolder}>
            {loading && <p>loading…</p>}
            {error && <p className={styles.error}>{error.message}</p>}
            {rendered && (
              <PicCanvas
                width={rendered.width}
                height={rendered.height}
                rgba={rendered.rgba}
                scale={spriteScale}
              />
            )}
            {!rendered && !loading && !error && <p>no sprite data</p>}
          </div>
        </div>

        <div className={styles.eyedropperCol}>
          <h2>Reference image (eyedropper)</h2>
          <ImageEyedropper
            activeIndex={activeIndex}
            onPick={(rgb) => setColor(activeIndex, rgb)}
          />
        </div>

        <div className={styles.swatchCol}>
          <h2>Palette (16 logical colors)</h2>
          <p className={styles.swatchHelp}>
            Click an index to make it the eyedropper target. The active index is
            highlighted. Used indices are bright; unused ones (not in the current
            sprite) are dimmed.
          </p>
          <div className={styles.swatchGrid}>
            {colors.map((rgb, i) => {
              const used = usedIndices.has(i);
              const active = i === activeIndex;
              return (
                <div
                  key={i}
                  className={[
                    styles.swatch,
                    used ? '' : styles.swatchUnused,
                    active ? styles.swatchActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setActiveIndex(i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setActiveIndex(i);
                  }}
                >
                  <span className={styles.swatchIdx}>{i}</span>
                  <input
                    type="color"
                    value={rgbToHex(rgb)}
                    onChange={(e) => setColor(i, hexToRgb(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className={styles.swatchRgb}>
                    ({rgb[0]}, {rgb[1]}, {rgb[2]})
                  </span>
                </div>
              );
            })}
          </div>

          <h2>Export</h2>
          <textarea
            className={styles.export}
            readOnly
            value={exportPalette()}
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className={styles.hint}>
            Click textarea to select all, copy, paste into a palette file under
            <code> packages/data/src/palettes/ </code>.
          </p>
        </div>
      </div>
    </main>
  );
}
