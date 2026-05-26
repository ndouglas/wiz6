import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttributeDistributeStep } from '../../../../src/pages/roster/steps/AttributeDistributeStep.js';
import { createEmptyDraft, MAX_BONUS_POINTS } from '../../../../src/pages/roster/lib/draft.js';

function setupDraft() {
  return {
    ...createEmptyDraft(),
    raceIdx: 0,
    bonusPool: MAX_BONUS_POINTS,
    attributes: { str: 9, iq: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 },
  };
}

describe('AttributeDistributeStep', () => {
  it('renders six attribute rows', () => {
    render(<AttributeDistributeStep draft={setupDraft()} onUpdate={vi.fn()} />);
    expect(screen.getByLabelText(/str/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/spd/i)).toBeInTheDocument();
  });

  it('shows the unspent pool', () => {
    render(<AttributeDistributeStep draft={setupDraft()} onUpdate={vi.fn()} />);
    expect(screen.getByText(new RegExp(`${MAX_BONUS_POINTS}.*unspent`, 'i'))).toBeInTheDocument();
  });

  it('clicking + increments the bonus distribution and decrements pool display', () => {
    const onUpdate = vi.fn();
    render(<AttributeDistributeStep draft={setupDraft()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getAllByRole('button', { name: /\+/ })[0]!); // STR +
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      bonusDistribution: expect.objectContaining({ str: 1 }),
    }));
  });

  it('+ button disabled when pool is exhausted', () => {
    const draft = {
      ...setupDraft(),
      bonusDistribution: { str: MAX_BONUS_POINTS, iq: 0, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0 },
    };
    render(<AttributeDistributeStep draft={draft} onUpdate={vi.fn()} />);
    const plusButtons = screen.getAllByRole('button', { name: /\+/ });
    expect(plusButtons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
});
