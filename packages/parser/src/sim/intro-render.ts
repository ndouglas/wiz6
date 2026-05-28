/**
 * Pure intro-frame compositor — renders one 320×200 RGBA frame of the
 * title/credits sequence for a given IntroState. No DOM, no canvas, no I/O.
 *
 * Extracted from GameTitle so the exact element placements (splash sprite
 * positions, the Wizardry wordmark coords, the credit-scroll layout) can be
 * pixel-parity-tested against the engine's committed framebuffer fixtures
 * (tools/parity/screen-parity.test.ts). GameTitle drives this each RAF frame.
 *
 * Sprite indices are descriptor indices into credits.pic (token − 1). The
 * splash/wordmark coordinates are the engine's absolute screen pixels.
 */

import type { RenderedSprite } from '../formats/pic-render.js';
import type { IntroState } from './intro-sequence.js';
import { visibleScrollEntries } from './intro-sequence.js';

const ENGINE_W = 320;
const ENGINE_H = 200;

// Splash sprite positions — pixel-exact vs the engine framebuffer fixtures
// (verified to 100% by tools/parity/intro-parity.test.ts; the earlier
// centered-guess values sat the logos ~18-28px too low).
// Sir-Tech splash: dragon above the SIR-TECH wordmark.
const SIRTECH_X = 84;
const SIRTECH_DRAGON_Y = 52;
const SIRTECH_WORDMARK_Y = 84;

// Bradley splash: "A Fantasy Role-Playing Simulation by" line above the
// D.W. Bradley signature (the two are NOT centered identically).
const BRADLEY_LINE_X = 91;
const BRADLEY_SIG_X = 107;
const BRADLEY_LINE_Y = 52;
const BRADLEY_SIG_Y = 82;

// Wizardry wordmark (top + bottom) at their CREDITS_SCROLL_ENTRIES[0]/[1]
// fieldB positions (col=0x4c, y=0x43 and 0x63) during the pre-scroll hang.
const WIZARDRY_X = 0x4c;
const WIZARDRY_TOP_Y = 0x43;
const WIZARDRY_BOTTOM_Y = 0x63;

/**
 * Compose one intro frame into a fresh RGBA buffer (ENGINE_W*ENGINE_H*4).
 *
 * @param state         Current IntroState (only `phase` + `scrollPos` are read).
 * @param sprites       credits.pic descriptors rendered to RGBA (index = token−1).
 * @param titlepagRgba  titlepag.scr rendered to RGBA, or null (black background).
 */
export function composeIntroFrame(
  state: IntroState,
  sprites: RenderedSprite[],
  titlepagRgba: Uint8ClampedArray | null,
): Uint8ClampedArray {
  const dest = new Uint8ClampedArray(ENGINE_W * ENGINE_H * 4);
  fillBlack(dest);

  // titlepag is the background from when the Wizardry wordmark appears
  // (title-hold) through the post-scroll hold. Copy RGB only and keep the
  // opaque alpha from fillBlack — renderEgaScreen marks index-0 (black) pixels
  // transparent, but a displayed framebuffer is fully opaque (the engine's is).
  if (
    (state.phase === 'title-hold' ||
      state.phase === 'wizardry-hang' ||
      state.phase === 'scroll' ||
      state.phase === 'post-scroll') &&
    titlepagRgba
  ) {
    for (let i = 0; i < dest.length; i += 4) {
      dest[i] = titlepagRgba[i]!;
      dest[i + 1] = titlepagRgba[i + 1]!;
      dest[i + 2] = titlepagRgba[i + 2]!;
    }
  }

  switch (state.phase) {
    case 'pause-pre-sirtech':
    case 'pause-between':
    case 'pause-pre-scroll':
    case 'title-hold':
    case 'done':
      break; // background only

    case 'sirtech-splash':
      blendSprite(dest, sprites[9], SIRTECH_X, SIRTECH_DRAGON_Y);
      blendSprite(dest, sprites[10], SIRTECH_X, SIRTECH_WORDMARK_Y);
      break;

    case 'bradley-splash':
      blendSprite(dest, sprites[12], BRADLEY_LINE_X, BRADLEY_LINE_Y);
      blendSprite(dest, sprites[8], BRADLEY_SIG_X, BRADLEY_SIG_Y);
      break;

    case 'wizardry-hang':
      blendSprite(dest, sprites[6], WIZARDRY_X, WIZARDRY_TOP_Y);
      blendSprite(dest, sprites[7], WIZARDRY_X, WIZARDRY_BOTTOM_Y);
      break;

    case 'scroll':
    case 'post-scroll':
      for (const v of visibleScrollEntries(state.scrollPos)) {
        blendSprite(dest, sprites[v.descriptorIndex], v.col, v.y);
      }
      break;
  }

  return dest;
}

function fillBlack(buf: Uint8ClampedArray): void {
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = 0;
    buf[i + 1] = 0;
    buf[i + 2] = 0;
    buf[i + 3] = 0xff;
  }
}

/** Composite a sprite over `dest`, respecting per-pixel alpha; clips OOB. */
function blendSprite(
  dest: Uint8ClampedArray,
  sprite: RenderedSprite | undefined,
  dx: number,
  dy: number,
): void {
  if (!sprite) return;
  const { width: sw, height: sh, rgba } = sprite;
  for (let y = 0; y < sh; y++) {
    const dstY = dy + y;
    if (dstY < 0 || dstY >= ENGINE_H) continue;
    for (let x = 0; x < sw; x++) {
      const srcIdx = (y * sw + x) * 4;
      if (rgba[srcIdx + 3] === 0) continue;
      const dstX = dx + x;
      if (dstX < 0 || dstX >= ENGINE_W) continue;
      const dstIdx = (dstY * ENGINE_W + dstX) * 4;
      dest[dstIdx] = rgba[srcIdx]!;
      dest[dstIdx + 1] = rgba[srcIdx + 1]!;
      dest[dstIdx + 2] = rgba[srcIdx + 2]!;
      dest[dstIdx + 3] = 0xff;
    }
  }
}
