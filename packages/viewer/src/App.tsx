import { FontGallery } from './views/FontGallery.js';
import { Font4bppGallery } from './views/Font4bppGallery.js';

export function App() {
  return (
    <main>
      <h1>Wiz6 Viewer</h1>
      <FontGallery url="/fonts/wfont0.json" />
      <Font4bppGallery url="/fonts/wfont1.json" />
      <Font4bppGallery url="/fonts/wfont2.json" />
      <Font4bppGallery url="/fonts/wfont3.json" />
      <Font4bppGallery url="/fonts/wfont4.json" />
    </main>
  );
}
