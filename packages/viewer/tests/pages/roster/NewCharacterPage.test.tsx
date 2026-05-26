// packages/viewer/tests/pages/roster/NewCharacterPage.test.tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NewCharacterPage } from '../../../src/pages/roster/NewCharacterPage.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('NewCharacterPage wizard shell', () => {
  it('renders the page heading and the first step (Name)', () => {
    render(<MemoryRouter><NewCharacterPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: /create character/i })).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 9/i)).toBeInTheDocument();
    expect(screen.getAllByText(/name/i).length).toBeGreaterThan(0);
  });

  it('Back button is disabled on step 1', () => {
    render(<MemoryRouter><NewCharacterPage /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
  });

  it('Next button is disabled when current step is invalid', () => {
    render(<MemoryRouter><NewCharacterPage /></MemoryRouter>);
    // Name step starts empty -> invalid.
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });
});
