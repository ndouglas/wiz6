import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ItemsPage } from '../../src/pages/items/ItemsPage.js';
import { QuestRecords } from '../../src/pages/QuestRecords.js';
import { FilesOverview } from '../../src/pages/FilesOverview.js';

function renderInRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('stub pages', () => {
  it.each([
    [ItemsPage, /items/i],
    [QuestRecords, /quest records/i],
    [FilesOverview, /files/i],
  ])('renders an h1 matching %s', (Comp, pattern) => {
    renderInRouter(<Comp />);
    expect(screen.getByRole('heading', { level: 1, name: pattern })).toBeInTheDocument();
  });

  it.each([ItemsPage, QuestRecords, FilesOverview])(
    'shows a "coming in stage" banner',
    (Comp) => {
      renderInRouter(<Comp />);
      expect(screen.getByText(/coming in stage/i)).toBeInTheDocument();
    },
  );
});
