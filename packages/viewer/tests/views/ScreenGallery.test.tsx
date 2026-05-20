import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ScreenGallery } from '../../src/views/ScreenGallery.js';

const validScreen = {
  id: 'titlepag',
  sourceFile: 'titlepag.ega',
  width: 320,
  height: 200,
  planes: [Array(8000).fill(0), Array(8000).fill(0), Array(8000).fill(0), Array(8000).fill(0)],
  trailer: Array(768).fill(0),
};

describe('ScreenGallery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a heading with the screen id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validScreen), { status: 200 })));
    render(<ScreenGallery url="/screens/titlepag.json" />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /titlepag/i })).toBeInTheDocument();
    });
  });

  it('renders a canvas at the right size', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validScreen), { status: 200 })));
    const { container } = render(<ScreenGallery url="/screens/titlepag.json" />);
    await waitFor(() => {
      const canvas = container.querySelector('canvas');
      expect(canvas).not.toBeNull();
      // ZOOM = 2 in the component
      expect(canvas?.width).toBe(640);
      expect(canvas?.height).toBe(400);
    });
  });

  it('shows error text when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    render(<ScreenGallery url="/screens/missing.json" />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });
});
