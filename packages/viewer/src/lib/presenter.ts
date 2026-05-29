/**
 * Presenter — abstraction for the final canvas-render step.
 *
 * Composers produce 320×200 RGBA buffers. The Presenter takes those buffers
 * and renders them to the screen. Today there's one implementation
 * (CanvasPresenter, wrapping ctx.putImageData), but the interface exists
 * so that future shader/HD/WebGL backends drop in without changing every
 * page component.
 *
 * Design constraint: the Presenter only sees the final RGBA buffer; it
 * doesn't know about TileWindows or composers. This keeps composers
 * decoupled from the rendering backend.
 */
export interface Presenter {
  /** Render the given RGBA buffer to the presentation surface. */
  present(rgba: Uint8ClampedArray, width: number, height: number): void;
}

/** The default presenter — uses `ctx.putImageData` on a 2D canvas. */
export class CanvasPresenter implements Presenter {
  constructor(private readonly canvas: HTMLCanvasElement) {}

  present(rgba: Uint8ClampedArray, width: number, height: number): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return; // jsdom + headless safety
    // Allocate an ImageData ourselves rather than constructing it from the
    // Uint8ClampedArray directly — the latter trips a SharedArrayBuffer
    // type mismatch in the DOM lib types.
    const img = new ImageData(width, height);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);
  }
}
