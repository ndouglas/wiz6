import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NameStep } from '../../../../src/pages/roster/steps/NameStep.js';
import { createEmptyDraft } from '../../../../src/pages/roster/lib/draft.js';

describe('NameStep', () => {
  it('renders a name input', () => {
    const onUpdate = vi.fn();
    render(<NameStep draft={createEmptyDraft()} onUpdate={onUpdate} />);
    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument();
  });

  it('calls onUpdate when name is typed', () => {
    const onUpdate = vi.fn();
    render(<NameStep draft={createEmptyDraft()} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), { target: { value: 'ABC' } });
    expect(onUpdate).toHaveBeenCalledWith({ name: 'ABC' });
  });

  it('truncates input at 7 characters', () => {
    const onUpdate = vi.fn();
    render(<NameStep draft={createEmptyDraft()} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), { target: { value: 'TOOLONG12' } });
    expect(onUpdate).toHaveBeenCalledWith({ name: 'TOOLONG' });
  });

  it('shows the character counter', () => {
    render(<NameStep draft={{ ...createEmptyDraft(), name: 'AB' }} onUpdate={vi.fn()} />);
    expect(screen.getByText(/2 \/ 7/)).toBeInTheDocument();
  });
});
