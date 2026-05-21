import { StubBanner } from '../components/StubBanner.js';

export function FilesOverview() {
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Files</h1>
      <StubBanner
        stage="2f"
        description="per-file section layouts and a scenario.dbs region bar showing what is and isn't decoded yet."
      />
    </main>
  );
}
