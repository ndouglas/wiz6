import { useEffect, useRef } from 'react';
import styles from './PicCanvas.module.css';

interface PicCanvasProps {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  scale?: number;
  className?: string;
  /** Optional checker-board background for transparency. Default true. */
  showTransparencyBg?: boolean;
  /**
   * If provided, the canvas reports click coordinates in unscaled (image-native)
   * pixel space — (0,0) at top-left, integer x/y. Out-of-bounds clicks are clamped.
   */
  onPixelClick?: (x: number, y: number) => void;
}

export function PicCanvas({
  width,
  height,
  rgba,
  scale = 1,
  className,
  showTransparencyBg = true,
  onPixelClick,
}: PicCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scaledW = width * scale;
    const scaledH = height * scale;
    canvas.width = scaledW;
    canvas.height = scaledH;
    ctx.imageSmoothingEnabled = false;

    if (showTransparencyBg) {
      // Light/dark checker pattern at the unscaled resolution, then drawn over
      ctx.fillStyle = 'rgb(40,40,40)';
      ctx.fillRect(0, 0, scaledW, scaledH);
      ctx.fillStyle = 'rgb(60,60,60)';
      const tile = Math.max(4 * scale, 4);
      for (let y = 0; y < scaledH; y += tile) {
        for (let x = 0; x < scaledW; x += tile) {
          if (((x / tile) + (y / tile)) % 2 === 0) {
            ctx.fillRect(x, y, tile, tile);
          }
        }
      }
    }

    // Paint the unscaled image into an off-screen canvas, then drawImage at scale.
    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    const offCtx = off.getContext('2d');
    if (!offCtx) return;
    const imageData = new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, width, height);
    offCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(off, 0, 0, scaledW, scaledH);
  }, [width, height, rgba, scale, showTransparencyBg]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!onPixelClick) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * height);
    onPixelClick(
      Math.max(0, Math.min(width - 1, x)),
      Math.max(0, Math.min(height - 1, y)),
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={width * scale}
      height={height * scale}
      className={`${styles.canvas} ${className ?? ''}`}
      onClick={onPixelClick ? handleClick : undefined}
      style={onPixelClick ? { cursor: 'crosshair' } : undefined}
    />
  );
}
