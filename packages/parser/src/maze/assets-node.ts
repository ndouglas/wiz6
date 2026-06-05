/**
 * assets-node.ts — NODE-ONLY maze asset loaders (use `node:zlib`).
 *
 * Kept separate from assets.ts so the @wiz6/parser barrel (re-exported into the
 * browser viewer) does NOT transitively import `node:zlib`. Only Node-side
 * consumers (the parity tests) import this module directly.
 */

import { gunzipSync } from 'node:zlib';
import corridorBg from './__fixtures__/maze-corridor-background.json' with { type: 'json' };

/**
 * Load the engine's OR-blit BACKGROUND compose page for the maze-corridor frame
 * (zone-0, facing 0). 4-plane EGA page (4 * PLANE_STRIDE = 0x8000 bytes), suitable
 * as the `page` arg of renderMazeViewport.
 *
 * This is the engine's actual composed page, read deterministically from the
 * committed serialize-state (no live capture). It reproduces the maze-corridor
 * viewport BYTE-EXACT (100%, the first full-viewport gate —
 * tests/maze/maze-corridor-viewport-parity.test.ts). The from-on-disk-asset
 * placement-list generator that would let composeBackground rebuild this page from
 * the floor/ceiling/window assets is tracked work (still blocked — see
 * docs/re/findings/maze-background-fromasset.json).
 */
export function loadMazeCorridorBackgroundPage(): Uint8Array {
  const gz = Uint8Array.from(Buffer.from(corridorBg.pageGzB64, 'base64'));
  return new Uint8Array(gunzipSync(gz));
}
