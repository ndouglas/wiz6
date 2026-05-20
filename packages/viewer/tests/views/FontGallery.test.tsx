import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FontGallery } from '../../src/views/FontGallery.js';

const tinyFont = {
  id: 'wfont0',
  sourceFile: 'wfont0.ega',
  glyphCount: 2,
  glyphs: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0xff, 0, 0, 0, 0, 0, 0, 0xff],
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('FontGallery', () => {
  it('renders a loading state then the canvas after fetch resolves', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(tinyFont), { status: 200 })));
    render(<FontGallery url="/extracted/fonts/wfont0.json" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('img', { name: /font glyph grid/i })).toBeInTheDocument());
    expect(screen.getAllByText(/wfont0/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 glyphs/)).toBeInTheDocument();
  });

  it('renders an error message if loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    render(<FontGallery url="/extracted/fonts/wfont0.json" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/500/));
  });
});
