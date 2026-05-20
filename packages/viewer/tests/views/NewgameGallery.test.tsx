import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { NewgameGallery } from '../../src/views/NewgameGallery.js';

const validDb = {
  id: 'newgame',
  sourceFile: 'newgame.dbs',
  recordCount: 4,
  records: [
    { index: 0, bytes: Array(64).fill(0).map((_, i) => i === 0 ? 0xab : 0), empty: false },
    { index: 1, bytes: Array(64).fill(0), empty: true },
    { index: 2, bytes: Array(64).fill(0).map((_, i) => i === 5 ? 0xff : 0), empty: false },
    { index: 3, bytes: Array(64).fill(0), empty: true },
  ],
};

describe('NewgameGallery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders heading with counts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validDb), { status: 200 })));
    render(<NewgameGallery url="/newgame/newgame.json" />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /newgame.*4 × 64-byte records.*2 non-empty/i })).toBeInTheDocument();
    });
  });

  it('hides empty records by default', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validDb), { status: 200 })));
    const { container } = render(<NewgameGallery url="/newgame/newgame.json" />);
    await waitFor(() => {
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(2); // only the 2 non-empty records
    });
  });

  it('shows empty records when toggle is unchecked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validDb), { status: 200 })));
    const { container } = render(<NewgameGallery url="/newgame/newgame.json" />);
    await waitFor(() => {
      expect(container.querySelectorAll('tbody tr').length).toBe(2);
    });
    fireEvent.click(screen.getByLabelText(/hide empty records/i));
    await waitFor(() => {
      expect(container.querySelectorAll('tbody tr').length).toBe(4);
    });
  });

  it('jumps to a specific record by index', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validDb), { status: 200 })));
    const { container } = render(<NewgameGallery url="/newgame/newgame.json" />);
    await waitFor(() => {
      expect(container.querySelectorAll('tbody tr').length).toBe(2);
    });
    fireEvent.change(screen.getByPlaceholderText(/0\.\.778/), { target: { value: '2' } });
    await waitFor(() => {
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
    });
  });

  it('shows error on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    render(<NewgameGallery url="/newgame/missing.json" />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });
});
