import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

// jsdom's Blob (v25) does not implement .text() or .arrayBuffer() — polyfill them.
if (typeof Blob !== 'undefined' && typeof (Blob.prototype as { text?: unknown }).text === 'undefined') {
  (Blob.prototype as { text?: () => Promise<string> }).text = function (this: Blob): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
if (typeof Blob !== 'undefined' && typeof (Blob.prototype as { arrayBuffer?: unknown }).arrayBuffer === 'undefined') {
  (Blob.prototype as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
import { cleanup } from '@testing-library/react';

// jsdom does not implement URL.createObjectURL / revokeObjectURL. Stub them so
// vi.spyOn(URL, 'createObjectURL') works in export tests without throwing.
if (typeof URL.createObjectURL === 'undefined') {
  (URL as unknown as { createObjectURL: (obj: unknown) => string }).createObjectURL = (_obj: unknown) => 'blob:stub';
}
if (typeof URL.revokeObjectURL === 'undefined') {
  (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = (_url: string) => undefined;
}

// Ensure React Testing Library DOM is cleaned up after every test.
// (Auto-cleanup may not fire in all ESM + jsdom configurations.)
afterEach(() => {
  cleanup();
});

// jsdom does not implement HTMLCanvasElement.getContext. Stub it with a minimal
// no-op 2D context covering only the methods/properties the viewer uses, so
// canvas-drawing code can run during tests without producing real pixels.
HTMLCanvasElement.prototype.getContext = vi.fn((contextId: string) => {
  if (contextId !== '2d') return null;
  return {
    imageSmoothingEnabled: false,
    fillStyle: '#000',
    fillRect: () => undefined,
    putImageData: () => undefined,
    drawImage: () => undefined,
    scale: () => undefined,
    save: () => undefined,
    restore: () => undefined,
  } as unknown as CanvasRenderingContext2D;
}) as unknown as HTMLCanvasElement['getContext'];

// jsdom does not implement ImageData. Provide a minimal constructor-compatible
// polyfill so PicCanvas (and any other code that calls `new ImageData(...)`)
// can run during tests. The stubbed CanvasRenderingContext2D doesn't actually
// inspect the instance, so just preserving the data/width/height fields is enough.
if (typeof globalThis.ImageData === 'undefined') {
  class ImageDataPolyfill {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace: PredefinedColorSpace = 'srgb';
    constructor(
      dataOrWidth: Uint8ClampedArray | number,
      widthOrHeight: number,
      maybeHeight?: number,
    ) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = maybeHeight ?? dataOrWidth.length / 4 / widthOrHeight;
      } else {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      }
    }
  }
  (globalThis as unknown as { ImageData: typeof ImageData }).ImageData =
    ImageDataPolyfill as unknown as typeof ImageData;
}
