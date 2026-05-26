import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RaceStep } from '../../../../src/pages/roster/steps/RaceStep.js';
import { createEmptyDraft } from '../../../../src/pages/roster/lib/draft.js';

describe('RaceStep', () => {
  it('renders all 11 races', () => {
    render(<RaceStep draft={createEmptyDraft()} onUpdate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /human/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mook/i })).toBeInTheDocument();
  });

  it('on click, calls onUpdate with raceIdx and base attributes', () => {
    const onUpdate = vi.fn();
    render(<RaceStep draft={createEmptyDraft()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /human/i }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      raceIdx: 0,
      attributes: expect.objectContaining({ str: 9, iq: 8, pie: 8, vit: 9, dex: 9, spd: 8, per: 8, kar: 0 }),
    }));
  });

  it('highlights the selected race', () => {
    render(<RaceStep draft={{ ...createEmptyDraft(), raceIdx: 2 }} onUpdate={vi.fn()} />);
    const dwarf = screen.getByRole('button', { name: /dwarf/i });
    expect(dwarf.getAttribute('aria-pressed')).toBe('true');
  });
});
