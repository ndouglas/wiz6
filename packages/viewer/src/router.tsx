import { lazy } from 'react';
import { Route } from 'react-router-dom';

const Landing = lazy(() => import('./pages/Landing.js').then((m) => ({ default: m.Landing })));
const MonstersPage = lazy(() =>
  import('./pages/monsters/MonstersPage.js').then((m) => ({ default: m.MonstersPage })),
);
const ItemsPage = lazy(() =>
  import('./pages/items/ItemsPage.js').then((m) => ({ default: m.ItemsPage })),
);
const QuestRecords = lazy(() =>
  import('./pages/QuestRecords.js').then((m) => ({ default: m.QuestRecords })),
);
const ScreensIndex = lazy(() =>
  import('./pages/screens/ScreensIndex.js').then((m) => ({ default: m.ScreensIndex })),
);
const PortraitsIndex = lazy(() =>
  import('./pages/portraits/PortraitsIndex.js').then((m) => ({ default: m.PortraitsIndex })),
);
const FontsPage = lazy(() =>
  import('./pages/FontsPage.js').then((m) => ({ default: m.FontsPage })),
);
const MsgPage = lazy(() =>
  import('./pages/MsgPage.js').then((m) => ({ default: m.MsgPage })),
);
const NewgamePage = lazy(() =>
  import('./pages/NewgamePage.js').then((m) => ({ default: m.NewgamePage })),
);
const FilesOverview = lazy(() =>
  import('./pages/FilesOverview.js').then((m) => ({ default: m.FilesOverview })),
);

export const routes = (
  <>
    <Route path="/" element={<Landing />} />
    <Route path="/monsters" element={<MonstersPage />} />
    <Route path="/monsters/compare" element={<MonstersPage />} />
    <Route path="/monsters/:slug" element={<MonstersPage />} />
    <Route path="/items" element={<ItemsPage />} />
    <Route path="/quest" element={<QuestRecords />} />
    <Route path="/screens" element={<ScreensIndex />} />
    <Route path="/portraits" element={<PortraitsIndex />} />
    <Route path="/fonts" element={<FontsPage />} />
    <Route path="/msg" element={<MsgPage />} />
    <Route path="/newgame" element={<NewgamePage />} />
    <Route path="/files" element={<FilesOverview />} />
  </>
);
