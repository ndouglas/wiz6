import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeatmapRow } from '../../src/components/HeatmapRow.js';

describe('HeatmapRow', () => {
  it('renders one cell per value', () => {
    render(<HeatmapRow label="saves" values={[0, 25, 50, 75, 100]} startOffset={113} />);
    expect(screen.getAllByRole('cell').length).toBe(5);
  });

  it('shows the value inside each cell', () => {
    render(<HeatmapRow label="saves" values={[0, 25, 50, 75, 100]} startOffset={113} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('renders the label as a row header', () => {
    render(<HeatmapRow label="extendedSaves" values={[0]} startOffset={85} />);
    expect(screen.getByText('extendedSaves')).toBeInTheDocument();
  });

  it('annotates each cell with its byte offset via title attribute', () => {
    render(<HeatmapRow label="saves" values={[15, 40, 30, 10, 5]} startOffset={113} />);
    const firstCell = screen.getByText('15').closest('[role="cell"]')!;
    expect(firstCell).toHaveAttribute('title', expect.stringMatching(/byte 113/i));
    const lastCell = screen.getByText('5').closest('[role="cell"]')!;
    expect(lastCell).toHaveAttribute('title', expect.stringMatching(/byte 117/i));
  });

  it('marks the 125 immunity sentinel with the immunity class', () => {
    render(<HeatmapRow label="ext" values={[0, 125, 50]} startOffset={85} />);
    const immune = screen.getByText('125').closest('[role="cell"]')!;
    expect(immune.className).toMatch(/immunity/i);
  });
});
