import { StubBanner } from '../components/StubBanner.js';

export function QuestRecords() {
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Quest records</h1>
      <StubBanner
        stage="2f"
        description="three quest-data records (CAPTAIN MATEY, COSMIC FORGE, L'MONTES) with name slots, raw bytes, and embedded-string annotations."
      />
    </main>
  );
}
