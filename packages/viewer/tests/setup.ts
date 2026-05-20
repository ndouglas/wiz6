import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

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
  } as unknown as CanvasRenderingContext2D;
}) as unknown as HTMLCanvasElement['getContext'];
