import { ScreenAlignmentTool } from '../../views/ScreenAlignmentTool.js';
import { RECommentary } from '../../components/RECommentary.js';

const SCREENS = ['titlepag', 'graveyrd', 'dragonsc'];

export function ScreensIndex() {
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Screens</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        EGA screen alignment tool — drag sliders to align planes manually.
      </p>
      <RECommentary
        label="About these screens"
        intro="Notes on the .ega screen format and the engine palettes that surprised us during the per-scene-palette pass."
        cardIds={['two-palettes-never-used', 'title-scroll-cpu-bound']}
      />
      {SCREENS.map((name) => (
        <ScreenAlignmentTool key={name} url={`/screens/${name}.json`} />
      ))}
    </main>
  );
}
