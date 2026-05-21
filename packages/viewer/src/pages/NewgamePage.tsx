import { NewgameGallery } from '../views/NewgameGallery.js';

export function NewgamePage() {
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Newgame</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        779 × 64-byte records from <code>newgame.dbs</code> (character-creation templates).
      </p>
      <NewgameGallery url="/newgame/newgame.json" />
    </main>
  );
}
