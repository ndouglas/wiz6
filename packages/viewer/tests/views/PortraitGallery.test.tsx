import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PortraitGallery } from '../../src/views/PortraitGallery.js';
import { EGA_PALETTE } from '../../src/palettes/index.js';

const blankTile = Array(32).fill(0);

const tinyPortraitSet = {
  id: 'wport1',
  sourceFile: 'wport1.ega',
  portraitCount: 2,
  portraits: [
    { index: 0, tiles: Array.from({ length: 9 }, () => [...blankTile]) },
    {
      index: 1,
      tiles: Array.from({ length: 9 }, (_, t) =>
        // Sparse: only first byte of tile is non-zero, varying per tile
        Array(32).fill(0).map((_, b) => (b === 0 ? (t + 1) & 0xff : 0)),
      ),
    },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('PortraitGallery', () => {
  it('renders a loading state then the canvas after fetch resolves', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(tinyPortraitSet), { status: 200 })));
    render(<PortraitGallery url="/portraits/wport1.json" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('img', { name: /portrait set/i })).toBeInTheDocument());
    expect(screen.getAllByText(/wport1/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 portraits/)).toBeInTheDocument();
  });

  it('accepts and renders with a custom palette prop', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(tinyPortraitSet), { status: 200 })));
    render(<PortraitGallery url="/portraits/wport1.json" palette={EGA_PALETTE} />);
    await waitFor(() => expect(screen.getByRole('img', { name: /portrait set/i })).toBeInTheDocument());
  });

  it('renders an error message if loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    render(<PortraitGallery url="/portraits/wport1.json" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/500/));
  });
});
