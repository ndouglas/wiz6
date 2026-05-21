import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SectionCard } from '../../src/components/SectionCard.js';

function renderCard(props: { title: string; to: string; description: string; meta?: string }) {
  return render(
    <MemoryRouter>
      <SectionCard {...props} />
    </MemoryRouter>,
  );
}

describe('SectionCard', () => {
  it('renders title, description, and link', () => {
    renderCard({ title: 'Monsters', to: '/monsters', description: 'Bestiary deep dive' });
    const link = screen.getByRole('link', { name: /monsters/i });
    expect(link).toHaveAttribute('href', '/monsters');
    expect(screen.getByText('Bestiary deep dive')).toBeInTheDocument();
  });

  it('shows the optional meta line when provided', () => {
    renderCard({
      title: 'Monsters',
      to: '/monsters',
      description: 'Bestiary',
      meta: '250 monsters · 189 filled',
    });
    expect(screen.getByText('250 monsters · 189 filled')).toBeInTheDocument();
  });

  it('omits the meta line when not provided', () => {
    renderCard({ title: 'Monsters', to: '/monsters', description: 'Bestiary' });
    expect(screen.queryByText(/filled/i)).not.toBeInTheDocument();
  });
});
