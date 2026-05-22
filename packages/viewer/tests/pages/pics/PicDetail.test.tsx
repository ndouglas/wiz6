import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PicDetail } from '../../../src/pages/pics/PicDetail.js';

const SAMPLE = {
  id: 'mon01',
  sourceFile: 'mon01.pic',
  segments: [
    {
      segmentIndex: 0,
      encodedOffset: 0,
      encodedLength: 10,
      ops: [
        { type: 'lit', bytes: [0x58, 0x02, 0x03, 0x05, 0xff, 0x7f] },
        { type: 'run', count: 18, fillByte: 0x00 },
      ],
      decodedBytes: [
        0x58, 0x02, 0x03, 0x05, 0xff, 0x7f,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ],
      header: { pos: 0x0258, width: 3, height: 5 },
    },
    {
      segmentIndex: 1,
      encodedOffset: 10,
      encodedLength: 4,
      ops: [{ type: 'lit', bytes: [0x12] }],
      decodedBytes: [0x12],
      header: null,
    },
  ],
  totalBytes: 4469,
};

function renderDetail(name = 'mon01') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith(`/pics/${name}.json`)) {
        return new Response(JSON.stringify(SAMPLE), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }),
  );
  return render(
    <MemoryRouter initialEntries={[`/pics/${name}`]}>
      <Routes>
        <Route path="/pics/:name" element={<PicDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PicDetail', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders the filename as h1', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /mon01/i })).toBeInTheDocument();
    });
  });

  it('renders the segment count + total bytes', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/2 segments/i)).toBeInTheDocument();
      expect(screen.getByText(/4,?469 bytes/i)).toBeInTheDocument();
    });
  });

  it('renders a row per segment', async () => {
    renderDetail();
    await waitFor(() => {
      const rows = screen.getAllByRole('row');
      // 2 segment rows + 1 header row
      expect(rows.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('renders the parsed header (pos, w, h) for segment 0', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/0x0258/i)).toBeInTheDocument();
      expect(screen.getByText(/^3\s*[×x]\s*5$/i)).toBeInTheDocument();
    });
  });

  it('shows "no header" for segments with header=null', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/no header/i)).toBeInTheDocument();
    });
  });

  it('shows decoded bytes as hex (first few)', async () => {
    renderDetail();
    await waitFor(() => {
      // The first segment's decoded bytes start 58 02 03 05 ff 7f
      expect(screen.getByText(/58 02 03 05/i)).toBeInTheDocument();
    });
  });
});
