import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BonusRollStep } from '../../../../src/pages/roster/steps/BonusRollStep.js';
import { createEmptyDraft, MAX_BONUS_POINTS } from '../../../../src/pages/roster/lib/draft.js';
import { resetToDefaults, resetToStock } from '../../../../src/lib/house-rules-store.js';

beforeEach(() => {
  window.localStorage.clear();
  resetToDefaults(); // pinMaxBonusRoll = true by default
});

describe('BonusRollStep', () => {
  it('with pinMaxBonusRoll = true (default), shows the max value and accepts it', () => {
    const onUpdate = vi.fn();
    render(<BonusRollStep draft={createEmptyDraft()} onUpdate={onUpdate} />);
    expect(screen.getByText(new RegExp(`${MAX_BONUS_POINTS}`))).toBeInTheDocument();
    expect(onUpdate).toHaveBeenCalledWith({ bonusPool: MAX_BONUS_POINTS });
  });

  it('with pinMaxBonusRoll = false (stock), shows a roll button', () => {
    resetToStock();
    render(<BonusRollStep draft={createEmptyDraft()} onUpdate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /roll/i })).toBeInTheDocument();
  });

  it('with stock mode, clicking Roll updates bonusPool', () => {
    resetToStock();
    const onUpdate = vi.fn();
    render(<BonusRollStep draft={createEmptyDraft()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /roll/i }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ bonusPool: expect.any(Number) }));
  });
});
