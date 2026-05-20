import { useState } from 'react';
import type { Palette } from '@wiz6/data';
import { FontGallery } from './views/FontGallery.js';
import { Font4bppGallery } from './views/Font4bppGallery.js';
import { PortraitGallery } from './views/PortraitGallery.js';
import { ScreenGallery } from './views/ScreenGallery.js';
import { ScreenAlignmentTool } from './views/ScreenAlignmentTool.js';
import { EGA_PALETTE, WIZ6_PALETTE_1, WIZ6_PALETTE_2, type PaletteName } from './palettes/index.js';

const PALETTE_BY_NAME: Record<PaletteName, Palette> = {
  'wiz6-main': WIZ6_PALETTE_1,
  'wiz6-dungeon': WIZ6_PALETTE_2,
  'ega-default': EGA_PALETTE,
};

const PICKER_OPTIONS: { name: PaletteName; label: string }[] = [
  { name: 'wiz6-main', label: 'wiz6-main (default)' },
  { name: 'wiz6-dungeon', label: 'wiz6-dungeon' },
  { name: 'ega-default', label: 'ega-default (raw)' },
];

export function App() {
  const [selected, setSelected] = useState<PaletteName>('wiz6-main');
  const palette = PALETTE_BY_NAME[selected];

  return (
    <main>
      <h1>Wiz6 Viewer</h1>
      <fieldset>
        <legend>4bpp palette</legend>
        {PICKER_OPTIONS.map(({ name, label }) => (
          <label key={name} style={{ marginRight: '1em' }}>
            <input
              type="radio"
              name="palette"
              value={name}
              checked={selected === name}
              onChange={() => setSelected(name)}
            />{' '}
            {label}
          </label>
        ))}
      </fieldset>
      <FontGallery url="/fonts/wfont0.json" />
      <Font4bppGallery url="/fonts/wfont1.json" palette={palette} />
      <Font4bppGallery url="/fonts/wfont2.json" palette={palette} />
      <Font4bppGallery url="/fonts/wfont3.json" palette={palette} />
      <Font4bppGallery url="/fonts/wfont4.json" palette={palette} />
      <PortraitGallery url="/portraits/wport1.json" palette={palette} />
      <PortraitGallery url="/portraits/wport2.json" palette={palette} />
      <PortraitGallery url="/portraits/wport3.json" palette={palette} />
      <ScreenGallery url="/screens/titlepag.json" palette={palette} />
      <ScreenGallery url="/screens/graveyrd.json" palette={palette} />
      <ScreenGallery url="/screens/dragonsc.json" palette={palette} />
      <h2 style={{ marginTop: '2em', borderTop: '2px solid #888', paddingTop: '1em' }}>
        Screen alignment tool — drag sliders to align planes manually
      </h2>
      <ScreenAlignmentTool url="/screens/titlepag.json" />
      <ScreenAlignmentTool url="/screens/graveyrd.json" />
      <ScreenAlignmentTool url="/screens/dragonsc.json" />
    </main>
  );
}
