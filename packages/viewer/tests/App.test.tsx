import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/App.js';

const valid1bpp = {
  id: 'wfont0',
  sourceFile: 'wfont0.ega',
  glyphCount: 1,
  glyphs: [[0, 0, 0, 0, 0, 0, 0, 0]],
};

const valid4bpp = {
  id: 'wfontN',
  sourceFile: 'wfontN.ega',
  glyphCount: 1,
  glyphs: [Array(32).fill(0)],
};

const validPortraitSet = {
  id: 'wportN',
  sourceFile: 'wportN.ega',
  portraitCount: 1,
  portraits: [
    {
      index: 0,
      tiles: Array.from({ length: 9 }, () => Array(32).fill(0)),
    },
  ],
};

const validScreen = {
  id: 'screenN',
  sourceFile: 'screenN.ega',
  width: 320,
  height: 200,
  planes: [Array(8000).fill(0), Array(8000).fill(0), Array(8000).fill(0), Array(8000).fill(0)],
  trailer: Array(768).fill(0),
};

const validMessageDb = {
  id: 'msg',
  sourceFile: 'msg.dbs',
  treeSourceFile: 'misc.hdr',
  indexSourceFile: 'msg.hdr',
  recordCount: 1,
  records: [{ index: 0, compressedBytes: 4, decodedText: 'HELLO' }],
  indexedCount: 1,
  indexedMessages: [{
    index: 0,
    byteOffset: 0,
    charOffset: 0,
    raw: 0,
    sectionIndex: 0,
    decodedText: 'HELLO',
  }],
};

const validNewgameDb = {
  id: 'newgame',
  sourceFile: 'newgame.dbs',
  recordCount: 1,
  records: [{ index: 0, bytes: Array(64).fill(0), empty: true }],
};

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('newgame/')) return new Response(JSON.stringify(validNewgameDb), { status: 200 });
      if (url.includes('messages/')) return new Response(JSON.stringify(validMessageDb), { status: 200 });
      if (url.includes('screens/')) return new Response(JSON.stringify(validScreen), { status: 200 });
      if (url.includes('portraits/')) return new Response(JSON.stringify(validPortraitSet), { status: 200 });
      if (url.includes('wfont0')) return new Response(JSON.stringify(valid1bpp), { status: 200 });
      return new Response(JSON.stringify(valid4bpp), { status: 200 });
    }));
  });

  it('renders the viewer heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /wiz6 viewer/i })).toBeInTheDocument();
  });

  it('renders a palette picker with four options', () => {
    render(<App />);
    expect(screen.getByRole('radio', { name: /wiz6-main/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /wiz6-dungeon/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /ega-default/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /wiz6-title/i })).toBeInTheDocument();
  });

  it('defaults the picker to wiz6-title', () => {
    render(<App />);
    expect(screen.getByRole('radio', { name: /wiz6-title/i })).toBeChecked();
  });

  it('switching the picker changes the picker state', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /ega-default/i }));
    expect(screen.getByRole('radio', { name: /ega-default/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /wiz6-title/i })).not.toBeChecked();
  });
});
