import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes } from 'react-router-dom';
import { Suspense } from 'react';
import { routes } from '../src/router.js';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Suspense fallback={<p>loading</p>}>
        <Routes>{routes}</Routes>
      </Suspense>
    </MemoryRouter>,
  );
}

describe('router', () => {
  it.each([
    ['/', /wiz6 data explorer/i],
    ['/monsters', /monsters/i],
    ['/items', /items/i],
    ['/quest', /quest records/i],
    ['/screens', /screens/i],
    ['/portraits', /portraits/i],
    ['/fonts', /fonts/i],
    ['/msg', /messages/i],
    ['/newgame', /newgame/i],
    ['/files', /files/i],
  ])('mounts a page at %s with an h1 matching %s', async (path, headingPattern) => {
    renderAt(path);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: headingPattern }),
      ).toBeInTheDocument();
    });
  });
});
