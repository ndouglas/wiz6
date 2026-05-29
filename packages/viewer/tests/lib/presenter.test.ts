import { describe, expect, it, vi } from 'vitest';
import { CanvasPresenter } from '../../src/lib/presenter.js';

describe('CanvasPresenter', () => {
  it('calls putImageData with the given RGBA buffer', () => {
    const putImageData = vi.fn();
    const canvas = {
      getContext: vi.fn(() => ({ putImageData })),
    } as unknown as HTMLCanvasElement;

    const presenter = new CanvasPresenter(canvas);
    const buf = new Uint8ClampedArray(320 * 200 * 4);
    buf[0] = 0xff;
    presenter.present(buf, 320, 200);

    expect(putImageData).toHaveBeenCalledTimes(1);
    const arg = putImageData.mock.calls[0]?.[0] as ImageData;
    expect(arg).toBeInstanceOf(ImageData);
    expect(arg.width).toBe(320);
    expect(arg.height).toBe(200);
    expect(arg.data[0]).toBe(0xff);
  });

  it('is a no-op if the canvas has no 2D context (jsdom guard)', () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    const presenter = new CanvasPresenter(canvas);
    // Should not throw.
    presenter.present(new Uint8ClampedArray(4), 1, 1);
  });
});
