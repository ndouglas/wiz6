import { StubBanner } from '../../components/StubBanner.js';

export function ItemsPage() {
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Items</h1>
      <StubBanner
        stage="2e"
        description="sortable, filterable items table with detail panel, raw-bytes view, and XP-tables panel."
      />
    </main>
  );
}
