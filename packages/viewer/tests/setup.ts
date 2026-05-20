import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom does not implement HTMLCanvasElement.getContext. Stub it with a minimal
// no-op 2D context covering only the methods/properties the viewer uses, so
// canvas-drawing code can run during tests without producing real pixels.
HTMLCanvasElement.prototype.getContext = vi.fn((contextId: string) => {
  if (contextId !== '2d') return null;
  return {
    imageSmoothingEnabled: false,
    fillStyle: '#000',
    fillRect: () => undefined,
  } as unknown as CanvasRenderingContext2D;
}) as unknown as HTMLCanvasElement['getContext'];
