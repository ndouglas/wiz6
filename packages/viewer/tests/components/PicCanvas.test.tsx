import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PicCanvas } from '../../src/components/PicCanvas.js';

describe('PicCanvas', () => {
  it('renders a canvas with the sprite dimensions × scale', () => {
    const rgba = new Uint8ClampedArray(8 * 8 * 4);
    const { container } = render(
      <PicCanvas width={8} height={8} rgba={rgba} scale={4} />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
    expect(canvas!.width).toBe(8 * 4);
    expect(canvas!.height).toBe(8 * 4);
  });

  it('paints the RGBA via putImageData and scales by drawing scaled copies', () => {
    const rgba = new Uint8ClampedArray(8 * 8 * 4);
    // Mark a known pixel — pixel (0,0) blue
    rgba[0] = 0x00; rgba[1] = 0x00; rgba[2] = 0xaa; rgba[3] = 0xff;
    // Spy on getContext to capture putImageData usage
    const putImageData = vi.fn();
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    const imageSmoothingEnabledSetter = vi.fn();
    const ctxStub: Partial<CanvasRenderingContext2D> = {
      putImageData,
      drawImage,
      fillRect,
      get imageSmoothingEnabled() { return false; },
      set imageSmoothingEnabled(v: boolean) { imageSmoothingEnabledSetter(v); },
      scale: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
    };
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(ctxStub);
    render(<PicCanvas width={8} height={8} rgba={rgba} scale={4} />);
    expect(putImageData).toHaveBeenCalled();
    // imageSmoothingEnabled should be disabled for pixel-art scaling
    expect(imageSmoothingEnabledSetter).toHaveBeenCalledWith(false);
  });

  it('uses default scale 1 when not specified', () => {
    const rgba = new Uint8ClampedArray(8 * 8 * 4);
    const { container } = render(
      <PicCanvas width={8} height={8} rgba={rgba} />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas!.width).toBe(8);
    expect(canvas!.height).toBe(8);
  });
});
