import { useState } from 'react';
import type { Palette } from '@wiz6/data';
import { PortraitGallery } from '../../views/PortraitGallery.js';
import {
  EGA_PALETTE,
  WIZ6_PALETTE_1,
  WIZ6_PALETTE_2,
  WIZ6_TITLE_PALETTE,
  type PaletteName,
} from '../../palettes/index.js';

const PALETTE_BY_NAME: Record<PaletteName, Palette> = {
  'wiz6-main': WIZ6_PALETTE_1,
  'wiz6-dungeon': WIZ6_PALETTE_2,
  'ega-default': EGA_PALETTE,
  'wiz6-title': WIZ6_TITLE_PALETTE,
};

const PICKER_OPTIONS: { name: PaletteName; label: string }[] = [
  { name: 'wiz6-title', label: 'wiz6-title (default)' },
  { name: 'wiz6-main', label: 'wiz6-main' },
  { name: 'wiz6-dungeon', label: 'wiz6-dungeon' },
  { name: 'ega-default', label: 'ega-default (raw)' },
];

export function PortraitsIndex() {
  const [selected, setSelected] = useState<PaletteName>('wiz6-title');
  const palette = PALETTE_BY_NAME[selected];
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Portraits</h1>
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
      <PortraitGallery url="/portraits/wport1.json" palette={palette} />
      <PortraitGallery url="/portraits/wport2.json" palette={palette} />
      <PortraitGallery url="/portraits/wport3.json" palette={palette} />
    </main>
  );
}
