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
  it('renders the page heading and at least one rule', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: /house rules/i })).toBeInTheDocument();
    expect(screen.getByText(/pin bonus points to max/i)).toBeInTheDocument();
  });

  it('clicking the bonus-pin checkbox toggles the rule', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    const checkbox = screen.getByRole('checkbox', { name: /pin bonus points to max/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true); // default state
    fireEvent.click(checkbox);
    expect(getHouseRules().pinMaxBonusRoll).toBe(false);
    fireEvent.click(checkbox);
    expect(getHouseRules().pinMaxBonusRoll).toBe(true);
  });

  it('renders a Reset to stock button that flips QoLs off', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    const btn = screen.getByRole('button', { name: /reset to stock/i });
    fireEvent.click(btn);
    expect(getHouseRules().pinMaxBonusRoll).toBe(false);
  });

  it('renders a Reset to defaults button that flips QoLs back on', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    const stockBtn = screen.getByRole('button', { name: /reset to stock/i });
    fireEvent.click(stockBtn);
    const defaultBtn = screen.getByRole('button', { name: /reset to project defaults/i });
    fireEvent.click(defaultBtn);
    expect(getHouseRules().pinMaxBonusRoll).toBe(true);
  });

  it('shows the stock/QoL behavior tag next to each rule', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    // default state has pinMaxBonusRoll=true, which is the QoL (not stock).
    expect(screen.getByText(/^QoL$/i)).toBeInTheDocument();
  });
});
