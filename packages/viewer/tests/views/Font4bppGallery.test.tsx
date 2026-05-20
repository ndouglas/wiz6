import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Font4bppGallery } from '../../src/views/Font4bppGallery.js';

const tinyFont = {
  id: 'wfont1',
  sourceFile: 'wfont1.ega',
  glyphCount: 2,
  glyphs: [
    Array(32).fill(0),
    [
      0xff, 0, 0, 0, 0, 0, 0, 0,
      0xff, 0, 0, 0, 0, 0, 0, 0,
      0xff, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
    ],
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Font4bppGallery', () => {
  it('renders a loading state then the canvas after fetch resolves', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(tinyFont), { status: 200 })));
    render(<Font4bppGallery url="/fonts/wfont1.json" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('img', { name: /4bpp font glyph grid/i })).toBeInTheDocument());
    expect(screen.getAllByText(/wfont1/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 glyphs/)).toBeInTheDocument();
  });

  it('renders an error message if loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    render(<Font4bppGallery url="/fonts/wfont1.json" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/500/));
  });
});
