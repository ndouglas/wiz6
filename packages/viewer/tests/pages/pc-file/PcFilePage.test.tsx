import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PcFilePage } from '../../../src/pages/pc-file/PcFilePage.js';
import { setStockPreset } from '../../../src/lib/presets-store.js';

const mk = (name: string) => ({
  id: name,
  name,
  race: 0,
  class: 0,
  level: 1,
  savedOldLevel: 0,
  xp: 0,
  gold: 0,
  conditions: new Array(10).fill(0),
  dead: false,
  paralyzed: false,
  attributes: { str: 10, int: 10, pie: 10, vit: 10, dex: 10, spd: 10, per: 10, kar: 10 },
  schoolMana: new Array(6).fill(0),
  schoolManaMax: new Array(6).fill(0),
  skills: new Array(30).fill(0),
  reaction: 50,
  sex: 0 as const,
  portraitIndex: 0,
});

beforeEach(() => {
  window.localStorage.clear();
  setStockPreset([mk('THESUS')]);
});

describe('PcFilePage', () => {
  it('renders the Presets and PC File panes and the Stock preset', () => {
    render(<MemoryRouter><PcFilePage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /presets/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /pc file/i })).toBeInTheDocument();
    expect(screen.getByText('THESUS')).toBeInTheDocument();
  });

  it('shows no "add to party" control (party is engine-only; informational note is allowed)', () => {
    render(<MemoryRouter><PcFilePage /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /party/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /party/i })).toBeNull();
  });
});
