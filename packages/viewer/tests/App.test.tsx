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

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('portraits/')) return new Response(JSON.stringify(validPortraitSet), { status: 200 });
      if (url.includes('wfont0')) return new Response(JSON.stringify(valid1bpp), { status: 200 });
      return new Response(JSON.stringify(valid4bpp), { status: 200 });
    }));
  });

  it('renders the viewer heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /wiz6 viewer/i })).toBeInTheDocument();
  });

  it('renders a palette picker with three options', () => {
    render(<App />);
    expect(screen.getByRole('radio', { name: /wiz6-main/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /wiz6-dungeon/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /ega-default/i })).toBeInTheDocument();
  });

  it('defaults the picker to wiz6-main', () => {
    render(<App />);
    expect(screen.getByRole('radio', { name: /wiz6-main/i })).toBeChecked();
  });

  it('switching the picker changes the picker state', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /ega-default/i }));
    expect(screen.getByRole('radio', { name: /ega-default/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /wiz6-main/i })).not.toBeChecked();
  });
});
