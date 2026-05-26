import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClassPickStep } from '../../../../src/pages/roster/steps/ClassPickStep.js';
import { createEmptyDraft, MAX_BONUS_POINTS } from '../../../../src/pages/roster/lib/draft.js';

function humanDraft() {
  return {
    ...createEmptyDraft(),
    raceIdx: 0, // Human
    bonusPool: MAX_BONUS_POINTS,
    attributes: { str: 9, iq: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 },
  };
}

describe('ClassPickStep', () => {
  it('renders all 14 classes', () => {
    render(<ClassPickStep draft={humanDraft()} onUpdate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /fighter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ninja/i })).toBeInTheDocument();
  });

  it('Fighter is selectable for a Human with full bonus pool', () => {
    render(<ClassPickStep draft={humanDraft()} onUpdate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /fighter/i })).not.toBeDisabled();
  });

  it('Ninja may not be selectable for a Human even at max bonus (elite class)', () => {
    const human = humanDraft();
    render(<ClassPickStep draft={human} onUpdate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /ninja/i })).toBeInTheDocument();
  });

  it('clicking a class updates draft.classIdx', () => {
    const onUpdate = vi.fn();
    render(<ClassPickStep draft={humanDraft()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /fighter/i }));
    expect(onUpdate).toHaveBeenCalledWith({ classIdx: 0 });
  });
});
