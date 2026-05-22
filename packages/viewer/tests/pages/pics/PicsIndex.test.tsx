import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PicsIndex } from '../../../src/pages/pics/PicsIndex.js';

const SAMPLE_PIC = {
  id: 'mon00',
  sourceFile: 'mon00.pic',
  segments: [
    {
      segmentIndex: 0,
      encodedOffset: 0,
      encodedLength: 9,
      ops: [{ type: 'lit', bytes: [0x58, 0x02] }],
      decodedBytes: [0x58, 0x02],
    },
  ],
  descriptors: [],
  totalBytes: 1166,
};

function renderIndex() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const id = url.replace(/^.*\/(.+)\.json$/, '$1');
      return new Response(JSON.stringify({ ...SAMPLE_PIC, id }), { status: 200 });
    }),
  );
  return render(
    <MemoryRouter initialEntries={['/explore/pics']}>
      <PicsIndex />
    </MemoryRouter>,
  );
}

describe('PicsIndex', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders the h1', async () => {
    renderIndex();
    expect(screen.getByRole('heading', { level: 1, name: /pics/i })).toBeInTheDocument();
  });

  it('renders 60 cards (59 monster files + credits)', async () => {
    renderIndex();
    await waitFor(() => {
      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThanOrEqual(60);
    });
  });

  it('each card links to its detail page', async () => {
    renderIndex();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /mon00/i })).toHaveAttribute('href', '/explore/pics/mon00');
      expect(screen.getByRole('link', { name: /credits/i })).toHaveAttribute('href', '/explore/pics/credits');
    });
  });
});
