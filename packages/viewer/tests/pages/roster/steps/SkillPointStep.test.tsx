import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SkillPointStep } from '../../../../src/pages/roster/steps/SkillPointStep.js';
import { createEmptyDraft, STARTER_SKILL_POINTS } from '../../../../src/pages/roster/lib/draft.js';

function fighterDraft() {
  return { ...createEmptyDraft(), raceIdx: 0, classIdx: 0 };
}

describe('SkillPointStep', () => {
  it('shows the unspent pool', () => {
    render(<SkillPointStep draft={fighterDraft()} onUpdate={vi.fn()} />);
    expect(screen.getByText(new RegExp(`${STARTER_SKILL_POINTS}.*unspent`, 'i'))).toBeInTheDocument();
  });

  it('renders only skills available to the class', () => {
    render(<SkillPointStep draft={fighterDraft()} onUpdate={vi.fn()} />);
    const buttons = screen.queryAllByRole('button', { name: /\+/ });
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('clicking + increments the skill points entry', () => {
    const onUpdate = vi.fn();
    render(<SkillPointStep draft={fighterDraft()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getAllByRole('button', { name: /\+/ })[0]!);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      skillPoints: expect.any(Object),
    }));
  });
});
