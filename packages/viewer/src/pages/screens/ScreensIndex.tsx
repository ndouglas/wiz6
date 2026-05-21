import { ScreenAlignmentTool } from '../../views/ScreenAlignmentTool.js';

const SCREENS = ['titlepag', 'graveyrd', 'dragonsc'];

export function ScreensIndex() {
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Screens</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        EGA screen alignment tool — drag sliders to align planes manually.
      </p>
      {SCREENS.map((name) => (
        <ScreenAlignmentTool key={name} url={`/screens/${name}.json`} />
      ))}
    </main>
  );
}
