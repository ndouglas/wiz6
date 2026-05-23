import { useState } from 'react';
import type { Palette } from '@wiz6/data';
import { EGA_DEFAULT } from '@wiz6/data';
import { FontGallery } from '../views/FontGallery.js';
import { Font4bppGallery } from '../views/Font4bppGallery.js';
import {
  EGA_PALETTE,
  WIZ6_PALETTE_1,
  WIZ6_PALETTE_2,
  type PaletteName,
} from '../palettes/index.js';

const PALETTE_BY_NAME: Record<PaletteName, Palette> = {
  'wiz6-main': WIZ6_PALETTE_1,
  'wiz6-dungeon': WIZ6_PALETTE_2,
  'ega-default': EGA_PALETTE,
  'wiz6-title': EGA_DEFAULT,
};

const PICKER_OPTIONS: { name: PaletteName; label: string }[] = [
  { name: 'wiz6-title', label: 'wiz6-title (default)' },
  { name: 'wiz6-main', label: 'wiz6-main' },
  { name: 'wiz6-dungeon', label: 'wiz6-dungeon' },
  { name: 'ega-default', label: 'ega-default (raw)' },
];

export function FontsPage() {
  const [selected, setSelected] = useState<PaletteName>('wiz6-title');
  const palette = PALETTE_BY_NAME[selected];
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Fonts</h1>
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
    </main>
  );
}
