import { useState } from 'react';
import { PALETTE_CATALOG, type PaletteName } from '@wiz6/data';
import { PortraitGallery } from '../../views/PortraitGallery.js';

// Source the picker options from the @wiz6/data catalog so any palette added
// there is automatically available in the UI.
const PALETTE_OPTIONS: Array<{ name: PaletteName; label: string }> = Object.keys(
  PALETTE_CATALOG,
).map((name) => ({ name: name as PaletteName, label: name }));

// Default selection: the palette the extractor stamped on the portraits.
// (See packages/cli/src/extractors/extract-wport.ts → palette: 'ega-default'.)
// Wiz6's portrait files use the bit-pattern permutation against the
// BIOS-default EGA palette; see docs/re/palette-discovery.md.
const DEFAULT_PALETTE: PaletteName = 'ega-default';

export function PortraitsIndex() {
  const [selected, setSelected] = useState<PaletteName>(DEFAULT_PALETTE);
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Portraits</h1>
      <fieldset>
        <legend>4bpp palette</legend>
        {PALETTE_OPTIONS.map(({ name, label }) => (
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
      <PortraitGallery url="/portraits/wport1.json" palette={selected} />
      <PortraitGallery url="/portraits/wport2.json" palette={selected} />
      <PortraitGallery url="/portraits/wport3.json" palette={selected} />
    </main>
  );
}
