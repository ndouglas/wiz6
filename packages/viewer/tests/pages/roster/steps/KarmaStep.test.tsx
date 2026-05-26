import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KarmaStep } from '../../../../src/pages/roster/steps/KarmaStep.js';
import { createEmptyDraft } from '../../../../src/pages/roster/lib/draft.js';

describe('KarmaStep', () => {
  it('auto-rolls karma on mount when karmaRolled is false', () => {
    const onUpdate = vi.fn();
    render(<KarmaStep draft={createEmptyDraft()} onUpdate={onUpdate} />);
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ karma: expect.any(Number), karmaRolled: true }),
    );
  });

  it('does not re-roll when karmaRolled is already true', () => {
    const onUpdate = vi.fn();
    render(<KarmaStep draft={{ ...createEmptyDraft(), karma: 5, karmaRolled: true }} onUpdate={onUpdate} />);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('shows the karma value', () => {
    render(<KarmaStep draft={{ ...createEmptyDraft(), karma: 12, karmaRolled: true }} onUpdate={vi.fn()} />);
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it('Reroll button updates karma and sets karmaRolled', () => {
    const onUpdate = vi.fn();
    render(<KarmaStep draft={{ ...createEmptyDraft(), karma: 5, karmaRolled: true }} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /reroll/i }));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ karma: expect.any(Number), karmaRolled: true }),
    );
  });
});
