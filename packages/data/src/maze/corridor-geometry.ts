/**
 * RE'd geometry for the zone-0 first-person corridor view.
 * Source: live DGROUP reads (docs/re/findings/wmaze-uv-texture.json):
 *   convergence columns @0x42 (left) / @0x4a (right); viewport from the engine
 *   frame. Per-depth screen columns of the corridor opening (depth 0..3).
 */
export const MAZE_VIEWPORT = { x: 72, y: 32, w: 176, h: 112 } as const;
export const CONVERGE_LEFT = [0, 104, 128, 144] as const;
export const CONVERGE_RIGHT = [0, 216, 192, 176] as const;
export const CORRIDOR_CENTER_X = 160;
