// packages/viewer/tests/pages/roster/creation/ega/CreationCanvas.test.tsx
//
// Smoke test for CreationCanvas.
//
// jsdom's canvas is non-functional for pixel ops, so we only assert:
//   1. A <canvas> element is rendered in the document.
//   2. It has width=320 and height=200.
//   3. The component does not throw when getContext('2d') returns null (jsdom).
//
// Pixel correctness is covered by B3's renderCreationFrame RGBA snapshot test.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CreationCanvas } from '../../../../../src/pages/roster/creation/ega/CreationCanvas.js';
import { WIZ6_MAIN } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';

// Minimal stub FontSet — all fonts null. renderCreationFrame handles an empty
// windows array by returning a plain background-filled buffer (no glyph lookup).
const STUB_FONT_SET: FontSet = {
  font0: null,
  font1: null,
  font2: null,
  font3: null,
  font4: null,
};

describe('CreationCanvas', () => {
  it('renders a <canvas> with width=320 and height=200', () => {
    const { container } = render(
      <CreationCanvas windows={[]} fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
    expect(canvas!.width).toBe(320);
    expect(canvas!.height).toBe(200);
  });

  it('does not throw when getContext returns null (jsdom)', () => {
    // jsdom returns null for getContext('2d') by default.
    expect(() =>
      render(
        <CreationCanvas windows={[]} fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} />,
      ),
    ).not.toThrow();
  });

  it('accepts an optional scale prop without crashing', () => {
    const { container } = render(
      <CreationCanvas windows={[]} fontSet={STUB_FONT_SET} palette={WIZ6_MAIN} scale={2} />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });
});
