import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpellPickStep } from '../../../../src/pages/roster/steps/SpellPickStep.js';
import { createEmptyDraft } from '../../../../src/pages/roster/lib/draft.js';

function mageDraft() {
  return { ...createEmptyDraft(), raceIdx: 1, classIdx: 1 };
}

describe('SpellPickStep', () => {
  it('Mage sees 2-pick mode', () => {
    render(<SpellPickStep draft={mageDraft()} onUpdate={vi.fn()} />);
    expect(screen.getByText(/0 of 2 spells picked/i)).toBeInTheDocument();
  });

  it('clicking a spell adds it to starterSpells', () => {
    const onUpdate = vi.fn();
    render(<SpellPickStep draft={mageDraft()} onUpdate={onUpdate} />);
    const firstSpell = screen.getAllByRole('button', { name: /Fire|Water|Air|Earth|Mental|Divine/i })[0]!;
    fireEvent.click(firstSpell);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      starterSpells: expect.arrayContaining([expect.objectContaining({ bookIdx: 0 })]),
    }));
  });

  it('Fighter sees a "no spells" message', () => {
    render(<SpellPickStep draft={{ ...createEmptyDraft(), classIdx: 0 }} onUpdate={vi.fn()} />);
    expect(screen.getByText(/no starter spells/i)).toBeInTheDocument();
  });
});
