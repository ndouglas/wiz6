import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppShell } from './App.js';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  </StrictMode>,
);
