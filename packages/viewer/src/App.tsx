import { Suspense, useEffect } from 'react';
import { Routes } from 'react-router-dom';
import { routes } from './router.js';
import { ClearStateButton } from './components/ClearStateButton.js';
import { MuteToggle } from './components/MuteToggle.js';
import { SettingsLink } from './components/SettingsLink.js';
import { installAudioUnlockListener } from './lib/audio.js';
import { setStockPreset } from './lib/presets-store.js';
import { PcFileJsonSchema } from '@wiz6/data';
import './theme/theme.css';

export function AppShell() {
  // Browser autoplay policy blocks AudioContext until a user gesture. Install
  // the unlock listener once at the app root so audio works on any route —
  // not only after passing through pages (Title / Sounds) that install it
  // locally. Without this, screens like creation's dup-name modal stay silent.
  useEffect(() => installAudioUnlockListener(), []);

  // Load the built-in Stock preset from the generated static asset at startup.
  useEffect(() => {
    let cancelled = false;
    fetch('/presets/stock.json')
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setStockPreset(PcFileJsonSchema.parse(j).characters); })
      .catch((e) => console.warn('stock preset load failed', e));
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <Suspense fallback={<p style={{ padding: 'var(--space-5)' }}>loading…</p>}>
        <Routes>{routes}</Routes>
      </Suspense>
      <ClearStateButton />
      <SettingsLink />
      <MuteToggle />
    </>
  );
}
