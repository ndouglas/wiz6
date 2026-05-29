/**
 * CreationCanvas — thin React canvas component for wpcmk creation screens.
 *
 * Composites an array of TileWindows into a 320×200 EGA frame via
 * `renderCreationFrame`, then paints it to a <canvas> with putImageData.
 *
 * Mirrors CastleScreen's canvas conventions:
 *   - useRef<HTMLCanvasElement>(null) + useEffect for drawing
 *   - null-ctx guard so jsdom smoke tests don't throw
 *   - integer CSS scaling + imageRendering: 'pixelated'
 *
 * Props are the minimal rendering inputs: windows, fontSet, palette.
 * Scale defaults to 3× (matching CastleScreen's SCALE=3).
 */

import { useEffect, useRef } from 'react';
import type { FontSet, TileWindow } from '@wiz6/parser';
import type { Palette } from '@wiz6/data';
import { CanvasPresenter } from '../../../../lib/presenter.js';
import { renderCreationFrame } from './render-frame.js';

const ENGINE_W = 320;
const ENGINE_H = 200;
const DEFAULT_SCALE = 3;

export interface CreationCanvasProps {
  /** TileWindows to render, in paint order (first = bottom). */
  windows: TileWindow[];
  /** Font set for glyph lookup — see loadCreationFontSet. */
  fontSet: FontSet;
  /** EGA palette — typically WIZ6_MAIN. */
  palette: Palette;
  /** Integer CSS scale multiplier. Defaults to 3. */
  scale?: number;
}

export function CreationCanvas({ windows, fontSet, palette, scale = DEFAULT_SCALE }: CreationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const presenter = new CanvasPresenter(canvas);
    const rgba = renderCreationFrame(windows, fontSet, palette);
    presenter.present(rgba, ENGINE_W, ENGINE_H);
  }, [windows, fontSet, palette]);

  return (
    <canvas
      ref={canvasRef}
      width={ENGINE_W}
      height={ENGINE_H}
      style={{
        width: ENGINE_W * scale,
        height: ENGINE_H * scale,
        imageRendering: 'pixelated',
        background: '#000',
      }}
      aria-label="Wizardry VI character creation"
    />
  );
}
