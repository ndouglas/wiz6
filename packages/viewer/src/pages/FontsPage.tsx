import { useState } from 'react';
import { PALETTE_CATALOG, type PaletteName } from '@wiz6/data';
import { FontGallery } from '../views/FontGallery.js';
import { Font4bppGallery } from '../views/Font4bppGallery.js';

// Source the picker options from the @wiz6/data catalog so any palette added
// there is automatically available in the UI.
const PALETTE_OPTIONS: Array<{ name: PaletteName; label: string }> = Object.keys(
  PALETTE_CATALOG,
).map((name) => ({ name: name as PaletteName, label: name }));

// Default selection: the palette the extractor stamped on the 4bpp fonts.
// (See packages/cli/src/extractors/extract-wfont-4bpp.ts → palette: 'ega-default'.)
// Wiz6's font files use the bit-pattern permutation against the
// BIOS-default EGA palette; see docs/re/palette-discovery.md.
const DEFAULT_PALETTE: PaletteName = 'ega-default';

export function FontsPage() {
  const [selected, setSelected] = useState<PaletteName>(DEFAULT_PALETTE);
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Fonts</h1>
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
      <FontGallery url="/fonts/wfont0.json" />
      <Font4bppGallery url="/fonts/wfont1.json" palette={selected} />
      <Font4bppGallery url="/fonts/wfont2.json" palette={selected} />
      <Font4bppGallery url="/fonts/wfont3.json" palette={selected} />
      <Font4bppGallery url="/fonts/wfont4.json" palette={selected} />
    </main>
  );
}
