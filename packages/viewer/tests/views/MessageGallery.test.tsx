import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MessageGallery } from '../../src/views/MessageGallery.js';

const validDb = {
  id: 'msg',
  sourceFile: 'msg.dbs',
  treeSourceFile: 'misc.hdr',
  indexSourceFile: 'msg.hdr',
  recordCount: 3,
  records: [
    { index: 0, compressedBytes: 4, decodedText: 'HUMAN' },
    { index: 1, compressedBytes: 12, decodedText: 'DWARF GNOME ELF' },
    { index: 2, compressedBytes: 0, decodedText: '' },
  ],
  indexedCount: 2,
  indexedMessages: [
    { index: 0, byteOffset: 100, charOffset: 0, raw: 5, sectionIndex: 0, decodedText: 'HUMAN', cleanedText: 'HUMAN' },
    { index: 1, byteOffset: 119, charOffset: 5, raw: 14, sectionIndex: 0, decodedText: 'DWARF GNOME ELF', cleanedText: 'DWARF GNOME ELF' },
  ],
};

describe('MessageGallery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders heading with both indexed and record counts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validDb), { status: 200 })));
    render(<MessageGallery url="/messages/msg.json" />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /msg.*2 indexed messages.*3 raw records/i })).toBeInTheDocument();
    });
  });

  it('defaults to the indexed-messages view and renders one row per message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validDb), { status: 200 })));
    const { container } = render(<MessageGallery url="/messages/msg.json" />);
    await waitFor(() => {
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(2);
    });
    expect(screen.getByText('HUMAN')).toBeInTheDocument();
    expect(screen.getByText('DWARF GNOME ELF')).toBeInTheDocument();
  });

  it('switches to the raw-records view', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validDb), { status: 200 })));
    const { container } = render(<MessageGallery url="/messages/msg.json" />);
    await waitFor(() => {
      expect(container.querySelectorAll('tbody tr').length).toBe(2);
    });
    fireEvent.click(screen.getByLabelText(/raw msg.dbs records/i));
    await waitFor(() => {
      expect(container.querySelectorAll('tbody tr').length).toBe(3);
    });
  });

  it('filters indexed messages by text content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validDb), { status: 200 })));
    const { container } = render(<MessageGallery url="/messages/msg.json" />);
    await waitFor(() => {
      expect(container.querySelectorAll('tbody tr').length).toBe(2);
    });
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'GNOME' } });
    await waitFor(() => {
      expect(container.querySelectorAll('tbody tr').length).toBe(1);
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
