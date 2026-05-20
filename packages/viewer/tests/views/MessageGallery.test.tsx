import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MessageGallery } from '../../src/views/MessageGallery.js';

const validDb = {
  id: 'msg',
  sourceFile: 'msg.dbs',
  treeSourceFile: 'misc.hdr',
  recordCount: 3,
  records: [
    { index: 0, compressedBytes: 4, decodedText: 'HUMAN' },
    { index: 1, compressedBytes: 12, decodedText: 'DWARF GNOME ELF' },
    { index: 2, compressedBytes: 0, decodedText: '' },
  ],
};

describe('MessageGallery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders heading with record count', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validDb), { status: 200 })));
    render(<MessageGallery url="/messages/msg.json" />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /msg.*3 records/i })).toBeInTheDocument();
    });
  });

  it('renders one row per record', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validDb), { status: 200 })));
    const { container } = render(<MessageGallery url="/messages/msg.json" />);
    await waitFor(() => {
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(3);
    });
    expect(screen.getByText('HUMAN')).toBeInTheDocument();
    expect(screen.getByText('DWARF GNOME ELF')).toBeInTheDocument();
  });

  it('filters records by text content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validDb), { status: 200 })));
    const { container } = render(<MessageGallery url="/messages/msg.json" />);
    await waitFor(() => {
      expect(container.querySelectorAll('tbody tr').length).toBe(3);
    });
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'GNOME' } });
    await waitFor(() => {
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
    });
    expect(screen.getByText('DWARF GNOME ELF')).toBeInTheDocument();
  });

  it('shows error message when load fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    render(<MessageGallery url="/messages/msg.json" />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });
});
