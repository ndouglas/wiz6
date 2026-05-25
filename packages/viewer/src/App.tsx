import { Suspense } from 'react';
import { Routes } from 'react-router-dom';
import { routes } from './router.js';
import { MuteToggle } from './components/MuteToggle.js';
import './theme/theme.css';

export function AppShell() {
  return (
    <>
      <Suspense fallback={<p style={{ padding: 'var(--space-5)' }}>loading…</p>}>
        <Routes>{routes}</Routes>
      </Suspense>
      <MuteToggle />
    </>
  );
}
