/**
 * MazeView component test — mounts the component and confirms it renders a
 * canvas without throwing. Only checks mounting; does NOT verify rendered
 * pixels (the pixel-exact gate lives in tools/parity/maze-corridor-parity.test.ts).
 * Canvas drawing uses the global getContext stub from tests/setup.ts.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MazeView } from '../../src/pages/game/MazeView.js';

function renderMazeView() {
  return render(
    <MemoryRouter initialEntries={['/game/maze']}>
      <Routes>
        <Route path="/game/maze" element={<MazeView />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MazeView', () => {
  it('mounts without throwing and renders a canvas', () => {
    const { container } = renderMazeView();
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
    expect(canvas!.width).toBe(320);
    expect(canvas!.height).toBe(200);
  });

  it('renders the screen reader heading', () => {
    const { getByRole } = renderMazeView();
    expect(getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
