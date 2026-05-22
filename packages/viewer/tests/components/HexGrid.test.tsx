import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HexGrid } from '../../src/components/HexGrid.js';
import { MONSTER_BYTE_MAP } from '../../src/lib/monster-byte-map.js';

const ZEROS = Array(158).fill(0);

describe('HexGrid', () => {
  it('renders one cell per byte', () => {
    render(<HexGrid bytes={ZEROS} byteMap={MONSTER_BYTE_MAP} />);
    expect(screen.getAllByRole('cell').length).toBe(158);
  });

  it('renders hex value in each cell (two lowercase hex digits)', () => {
    const bytes = ZEROS.slice();
    bytes[0] = 0xab;
    bytes[127] = 0x0f;
    render(<HexGrid bytes={bytes} byteMap={MONSTER_BYTE_MAP} />);
    expect(screen.getAllByText('ab').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('0f').length).toBeGreaterThanOrEqual(1);
  });

  it('annotates each cell with its byte offset via title attribute', () => {
    render(<HexGrid bytes={ZEROS} byteMap={MONSTER_BYTE_MAP} />);
    const firstCell = screen.getAllByRole('cell')[0]!;
    expect(firstCell.getAttribute('title')).toMatch(/byte 0/i);
    const acCell = screen.getAllByRole('cell')[126]!;
    expect(acCell.getAttribute('title')).toMatch(/byte 126.*monster ?ac|monsterAC/i);
  });

  it('marks cells in the highlighted field range', () => {
    render(<HexGrid bytes={ZEROS} byteMap={MONSTER_BYTE_MAP} highlightedField="saveTable" />);
    // saveTable lives at bytes 113-117 (5 cells)
    const cells = screen.getAllByRole('cell');
    const highlighted = cells.filter((c) => c.className.match(/highlight/i));
    expect(highlighted.length).toBe(5);
  });

  it('fires onHover with the byte offset on mouse enter', () => {
    const onHover = vi.fn();
    render(<HexGrid bytes={ZEROS} byteMap={MONSTER_BYTE_MAP} onHover={onHover} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.mouseEnter(cells[42]!);
    expect(onHover).toHaveBeenCalledWith(42);
  });

  it('fires onHover with null on mouse leave', () => {
    const onHover = vi.fn();
    render(<HexGrid bytes={ZEROS} byteMap={MONSTER_BYTE_MAP} onHover={onHover} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.mouseLeave(cells[42]!);
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it('renders a legend listing each group present in the byte map', () => {
    render(<HexGrid bytes={ZEROS} byteMap={MONSTER_BYTE_MAP} showLegend />);
    expect(screen.getByText(/legend/i)).toBeInTheDocument();
    for (const label of ['core', 'attack', 'save', 'sprite', 'family', 'meta']) {
      expect(screen.getByText(new RegExp(`\\b${label}\\b`, 'i'))).toBeInTheDocument();
    }
  });
});
