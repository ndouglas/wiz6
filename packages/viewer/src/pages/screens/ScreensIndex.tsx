import { ScreenGallery } from '../../views/ScreenGallery.js';
import { ScreenAlignmentTool } from '../../views/ScreenAlignmentTool.js';
import { WIZ6_TITLE_PALETTE } from '../../palettes/index.js';

const SCREENS = ['titlepag', 'graveyrd', 'dragonsc'];

export function ScreensIndex() {
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Screens</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        EGA screen images. Lower section is the alignment tool — drag sliders to align planes
        manually.
      </p>
      {SCREENS.map((name) => (
        <ScreenGallery key={name} url={`/screens/${name}.json`} palette={WIZ6_TITLE_PALETTE} />
      ))}
      <h2 style={{ marginTop: 'var(--space-6)' }}>Alignment tool</h2>
      {SCREENS.map((name) => (
        <ScreenAlignmentTool key={name} url={`/screens/${name}.json`} />
      ))}
    </main>
  );
}
