import { describe, expect, it } from 'vitest';
import { renderEgaScreen } from '../../src/formats/ega-screen-render.js';
import { WIZ6_MAIN } from '@wiz6/data';
import type { EgaScreen } from '@wiz6/data';

// Build a screen where the only plane bit set is at (planeIdx, srcByte, srcBit).
// We use a full-width 320×200 screen because the source-coordinate transform
// (cyclic horizontal rotation, vertical drop) is parameterised on the screen
// dimensions; faking a tiny screen would change the source coords.
function emptyPlane(): number[] {
  return new Array(8000).fill(0);
}

function makeScreen(planes: number[][]): EgaScreen {
  return {
    id: 'test',
    sourceFile: 'test.ega',
    width: 320,
    height: 200,
    planes,
    trailer: new Array(768).fill(0),
  };
}

// At display (x=0, y=5) the source coord transform for plane p maps to:
//   shiftX = (64 * p) % 320, shiftY = -5 * p
//   yDrop  = (x < shiftX) ? 1 : 0 = (0 < shiftX) ? 1 : 0
//   srcY   = y - shiftY - yDrop = 5 + 5p - yDrop
//   srcX   = ((x - shiftX) % width + width) % width
// For p=0:  shiftX=0, yDrop=0, srcY=5, srcX=0       — byte 5*40+0=200, MSB
// For p=1:  shiftX=64, yDrop=1, srcY=5+5-1=9, srcX=320-64=256 — byte 9*40+32=392, MSB

describe('renderEgaScreen — file pixel value is framebuffer color attribute', () => {
  it('renders file bit-pattern 0x1 as WIZ6_MAIN.colors[1] = white', () => {
    // Set only plane 0 at the source coord that maps to display (0, 5).
    const p0 = emptyPlane();
    p0[200] = 0x80;
    const screen = makeScreen([p0, emptyPlane(), emptyPlane(), emptyPlane()]);
    const out = renderEgaScreen(screen, WIZ6_MAIN);
    // Display pixel (0, 5) → byte offset (5 * 320 + 0) * 4 = 6400
    const off = (5 * 320 + 0) * 4;
    // File pixel value 1 → palette.colors[1] = WIZ6_MAIN[1] = (255,255,255) white
    expect(Array.from(out.rgba.subarray(off, off + 4))).toEqual([255, 255, 255, 255]);
  });

  it('renders file bit-pattern 0x2 as WIZ6_MAIN.colors[2] = light blue', () => {
    // Set only plane 1 at the source coord that maps to display (0, 5).
    const p1 = emptyPlane();
    p1[392] = 0x80;
    const screen = makeScreen([emptyPlane(), p1, emptyPlane(), emptyPlane()]);
    const out = renderEgaScreen(screen, WIZ6_MAIN);
    const off = (5 * 320 + 0) * 4;
    // File pixel 2 → WIZ6_MAIN[2] = (85, 85, 255) light blue
    expect(Array.from(out.rgba.subarray(off, off + 4))).toEqual([85, 85, 255, 255]);
  });
});
