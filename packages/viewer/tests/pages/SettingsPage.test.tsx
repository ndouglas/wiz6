import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from '../../src/pages/SettingsPage.js';
import { resetToDefaults, getHouseRules } from '../../src/lib/house-rules-store.js';

beforeEach(() => {
  window.localStorage.clear();
  resetToDefaults();
});

describe('SettingsPage', () => {
  it('renders the page heading', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: /house rules/i })).toBeInTheDocument();
  });

  it('renders a Reset to stock button', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /reset to stock/i })).toBeInTheDocument();
  });

  it('renders a Reset to defaults button', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /reset to project defaults/i })).toBeInTheDocument();
  });

  it('clicking Reset to stock updates house rules to stock values', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    const btn = screen.getByRole('button', { name: /reset to stock/i });
    fireEvent.click(btn);
    expect(getHouseRules().schemaVersion).toBe(1);
  });

  it('clicking Reset to defaults updates house rules to default values', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    const stockBtn = screen.getByRole('button', { name: /reset to stock/i });
    fireEvent.click(stockBtn);
    const defaultBtn = screen.getByRole('button', { name: /reset to project defaults/i });
    fireEvent.click(defaultBtn);
    expect(getHouseRules().schemaVersion).toBe(1);
  });
});
