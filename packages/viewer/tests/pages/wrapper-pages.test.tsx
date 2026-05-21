import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FontsPage } from '../../src/pages/FontsPage.js';
import { MsgPage } from '../../src/pages/MsgPage.js';
import { NewgamePage } from '../../src/pages/NewgamePage.js';
import { PortraitsIndex } from '../../src/pages/portraits/PortraitsIndex.js';
import { ScreensIndex } from '../../src/pages/screens/ScreensIndex.js';

function setupFetchSpy() {
  const spy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderInRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('wrapper pages', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('FontsPage fetches all five font assets', async () => {
    const spy = setupFetchSpy();
    renderInRouter(<FontsPage />);
    await waitFor(() => {
      const urls = spy.mock.calls.map((c) => c[0]);
      expect(urls).toContain('/fonts/wfont0.json');
      expect(urls).toContain('/fonts/wfont1.json');
      expect(urls).toContain('/fonts/wfont2.json');
      expect(urls).toContain('/fonts/wfont3.json');
      expect(urls).toContain('/fonts/wfont4.json');
    });
  });

  it('MsgPage fetches /messages/msg.json', async () => {
    const spy = setupFetchSpy();
    renderInRouter(<MsgPage />);
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('/messages/msg.json');
    });
  });

  it('NewgamePage fetches /newgame/newgame.json', async () => {
    const spy = setupFetchSpy();
    renderInRouter(<NewgamePage />);
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('/newgame/newgame.json');
    });
  });

  it('PortraitsIndex fetches all three portrait sets', async () => {
    const spy = setupFetchSpy();
    renderInRouter(<PortraitsIndex />);
    await waitFor(() => {
      const urls = spy.mock.calls.map((c) => c[0]);
      expect(urls).toContain('/portraits/wport1.json');
      expect(urls).toContain('/portraits/wport2.json');
      expect(urls).toContain('/portraits/wport3.json');
    });
  });

  it('ScreensIndex fetches all three screen assets', async () => {
    const spy = setupFetchSpy();
    renderInRouter(<ScreensIndex />);
    await waitFor(() => {
      const urls = spy.mock.calls.map((c) => c[0]);
      expect(urls).toContain('/screens/titlepag.json');
      expect(urls).toContain('/screens/graveyrd.json');
      expect(urls).toContain('/screens/dragonsc.json');
    });
  });
});
