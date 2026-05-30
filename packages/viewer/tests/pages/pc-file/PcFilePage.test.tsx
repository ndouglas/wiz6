import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
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

  it('copying a preset character adds it to the PC File (fresh id, de-duped by name)', () => {
    render(<MemoryRouter><PcFilePage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /copy THESUS/i }));
    // PC File pane now lists THESUS
    const pcfile = screen.getByRole('region', { name: /pc file/i });
    expect(within(pcfile).getByText('THESUS')).toBeInTheDocument();
    // copying again is skipped (name dedupe) — still one THESUS in PC File
    fireEvent.click(screen.getByRole('button', { name: /copy THESUS/i }));
    expect(within(pcfile).getAllByText('THESUS')).toHaveLength(1);
  });

  it('Save as preset snapshots the PC File into a new custom preset', () => {
    render(<MemoryRouter><PcFilePage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /copy THESUS/i }));
    fireEvent.click(screen.getByRole('button', { name: /save as preset/i }));
    // a prompt/name field appears; submit "My Set"
    fireEvent.change(screen.getByLabelText(/preset name/i), { target: { value: 'My Set' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(screen.getByText('My Set')).toBeInTheDocument();
  });

  it('delete removes a custom preset but not the Stock preset', () => {
    render(<MemoryRouter><PcFilePage /></MemoryRouter>);
    // first, create a custom preset via save-as-preset
    fireEvent.click(screen.getByRole('button', { name: /copy THESUS/i }));
    fireEvent.click(screen.getByRole('button', { name: /save as preset/i }));
    fireEvent.change(screen.getByLabelText(/preset name/i), { target: { value: 'DeleteMe' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(screen.getByText('DeleteMe')).toBeInTheDocument();
    // delete the custom preset
    fireEvent.click(screen.getByRole('button', { name: /delete DeleteMe/i }));
    expect(screen.queryByText('DeleteMe')).toBeNull();
    // Stock still present (no delete button for it)
    expect(screen.queryByRole('button', { name: /delete Stock Characters/i })).toBeNull();
  });

  it('copy all from preset copies every character in that preset', () => {
    setStockPreset([mk('THESUS'), mk('ERIN')]);
    render(<MemoryRouter><PcFilePage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /copy all from Stock Characters/i }));
    const pcfile = screen.getByRole('region', { name: /pc file/i });
    expect(within(pcfile).getByText('THESUS')).toBeInTheDocument();
    expect(within(pcfile).getByText('ERIN')).toBeInTheDocument();
  });
});
