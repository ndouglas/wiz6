import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReviewStep } from '../../../../src/pages/roster/steps/ReviewStep.js';
import { createEmptyDraft } from '../../../../src/pages/roster/lib/draft.js';

beforeEach(() => {
  window.localStorage.clear();
});

function readyDraft() {
  return {
    ...createEmptyDraft(),
    name: 'HERO',
    raceIdx: 0,
    classIdx: 0,
    bonusPool: 6,
    attributes: { str: 9, iq: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 },
    bonusDistribution: { str: 6, iq: 0, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0 },
    skillPoints: { 0: 10 },
    karma: 7,
    karmaRolled: true,
  };
}

describe('ReviewStep', () => {
  it('renders the character summary', () => {
    const onCreate = vi.fn();
    render(<MemoryRouter><ReviewStep draft={readyDraft()} onCreate={onCreate} /></MemoryRouter>);
    expect(screen.getByText(/HERO/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
  });

  it('Create button calls onCreate', () => {
    const onCreate = vi.fn();
    render(<MemoryRouter><ReviewStep draft={readyDraft()} onCreate={onCreate} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(onCreate).toHaveBeenCalled();
  });
});
