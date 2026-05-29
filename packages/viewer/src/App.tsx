import { Suspense, useEffect } from 'react';
import { Routes } from 'react-router-dom';
import { routes } from './router.js';
import { ClearStateButton } from './components/ClearStateButton.js';
import { MuteToggle } from './components/MuteToggle.js';
import { SettingsLink } from './components/SettingsLink.js';
import { installAudioUnlockListener } from './lib/audio.js';
import './theme/theme.css';

export function AppShell() {
  // Browser autoplay policy blocks AudioContext until a user gesture. Install
  // the unlock listener once at the app root so audio works on any route —
  // not only after passing through pages (Title / Sounds) that install it
  // locally. Without this, screens like creation's dup-name modal stay silent.
  useEffect(() => installAudioUnlockListener(), []);

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
