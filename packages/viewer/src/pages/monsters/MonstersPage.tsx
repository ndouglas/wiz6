import { StubBanner } from '../../components/StubBanner.js';

export function MonstersPage() {
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Monsters</h1>
      <StubBanner
        stage="2b"
        description="split-view rogue's gallery with search, filters, six detail tabs, byte-field highlighting, compare mode, and family-grouped view."
      />
    </main>
  );
}
