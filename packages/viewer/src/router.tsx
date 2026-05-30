import { lazy } from 'react';
import { Route } from 'react-router-dom';
import { GameLayout } from './layouts/GameLayout.js';
import { ExploreLayout } from './layouts/ExploreLayout.js';

const GameTitle = lazy(() =>
  import('./pages/game/GameTitle.js').then((m) => ({ default: m.GameTitle })),
);
const CastleScreen = lazy(() =>
  import('./pages/game/CastleScreen.js').then((m) => ({ default: m.CastleScreen })),
);
const CastleStub = lazy(() =>
  import('./pages/game/CastleStub.js').then((m) => ({ default: m.CastleStub })),
);
const RosterView = lazy(() =>
  import('./pages/game/RosterView.js').then((m) => ({ default: m.RosterView })),
);
const CreationPage = lazy(() =>
  import('./pages/roster/creation/CreationPage.js').then((m) => ({ default: m.CreationPage })),
);
const AddPartyPage = lazy(() =>
  import('./pages/castle/AddPartyPage.js').then((m) => ({ default: m.AddPartyPage })),
);
const DismissMemberPage = lazy(() =>
  import('./pages/castle/DismissMemberPage.js').then((m) => ({ default: m.DismissMemberPage })),
);
const ReviewMemberPage = lazy(() =>
  import('./pages/castle/ReviewMemberPage.js').then((m) => ({ default: m.ReviewMemberPage })),
);
const CharacterViewPage = lazy(() =>
  import('./pages/castle/CharacterViewPage.js').then((m) => ({ default: m.CharacterViewPage })),
);
const PcFilePage = lazy(() =>
  import('./pages/pc-file/PcFilePage.js').then((m) => ({ default: m.PcFilePage })),
);

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
const PicsIndex = lazy(() =>
  import('./pages/pics/PicsIndex.js').then((m) => ({ default: m.PicsIndex })),
);
const PicDetail = lazy(() =>
  import('./pages/pics/PicDetail.js').then((m) => ({ default: m.PicDetail })),
);
const SoundsPage = lazy(() =>
  import('./pages/SoundsPage.js').then((m) => ({ default: m.SoundsPage })),
);
const DocsPage = lazy(() =>
  import('./pages/DocsPage.js').then((m) => ({ default: m.DocsPage })),
);
const CalibratePalette = lazy(() =>
  import('./pages/CalibratePalette.js').then((m) => ({ default: m.CalibratePalette })),
);
const EngineeringNotes = lazy(() =>
  import('./pages/EngineeringNotes.js').then((m) => ({ default: m.EngineeringNotes })),
);
const OverlaysIndex = lazy(() =>
  import('./pages/overlays/OverlaysIndex.js').then((m) => ({ default: m.OverlaysIndex })),
);
const OverlayDetail = lazy(() =>
  import('./pages/overlays/OverlayDetail.js').then((m) => ({ default: m.OverlayDetail })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage.js').then((m) => ({ default: m.SettingsPage })),
);

export const routes = (
  <>
    <Route element={<GameLayout />}>
      <Route path="/" element={<GameTitle />} />
      <Route path="/castle" element={<CastleScreen />} />
      <Route path="/castle/character-menu" element={<CreationPage />} />
      <Route path="/castle/add-party" element={<AddPartyPage />} />
      <Route path="/castle/dismiss-member" element={<DismissMemberPage />} />
      <Route path="/castle/review-member" element={<ReviewMemberPage />} />
      <Route path="/castle/review-member/:slotIdx" element={<CharacterViewPage />} />
      <Route path="/castle/:stub" element={<CastleStub />} />
      <Route path="/roster" element={<RosterView />} />
      <Route path="/pc-file" element={<PcFilePage />} />
    </Route>
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="/explore" element={<ExploreLayout />}>
      <Route index element={<Landing />} />
      <Route path="monsters" element={<MonstersPage />} />
      <Route path="monsters/compare" element={<MonstersPage />} />
      <Route path="monsters/:slug" element={<MonstersPage />} />
      <Route path="items" element={<ItemsPage />} />
      <Route path="quest" element={<QuestRecords />} />
      <Route path="screens" element={<ScreensIndex />} />
      <Route path="portraits" element={<PortraitsIndex />} />
      <Route path="fonts" element={<FontsPage />} />
      <Route path="msg" element={<MsgPage />} />
      <Route path="newgame" element={<NewgamePage />} />
      <Route path="files" element={<FilesOverview />} />
      <Route path="pics" element={<PicsIndex />} />
      <Route path="pics/:name" element={<PicDetail />} />
      <Route path="sounds" element={<SoundsPage />} />
      <Route path="docs" element={<DocsPage />} />
      <Route path="docs/*" element={<DocsPage />} />
      <Route path="calibrate" element={<CalibratePalette />} />
      <Route path="notes" element={<EngineeringNotes />} />
      <Route path="overlays" element={<OverlaysIndex />} />
      <Route path="overlays/:slug" element={<OverlayDetail />} />
    </Route>
  </>
);
