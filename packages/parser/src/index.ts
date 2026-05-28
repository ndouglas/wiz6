export { decodeWfont, type DecodeWfontOpts } from './formats/wfont.js';
export { decodeWfont4bpp, type DecodeWfont4bppOpts } from './formats/wfont-4bpp.js';
export { decodeWport, type DecodeWportOpts } from './formats/wport.js';
export { decodeEgaScreen, type DecodeEgaScreenOpts } from './formats/ega-screen.js';
export {
  decodeMessageDb,
  huffmanDecode,
  type DecodeMessageDbOpts,
} from './formats/message-db.js';
export { decodeNewgameDb, type DecodeNewgameDbOpts } from './formats/newgame-db.js';
export { decodeScenarioDb, type DecodeScenarioDbOpts } from './formats/scenario-db.js';
export { decodePic, type DecodePicOpts } from './formats/pic.js';
export { decodeSnd, SND_SAMPLE_RATE_HZ, type DecodeSndOpts } from './formats/snd.js';
export {
  renderPicDescriptor,
  concatenatePicSegments,
  compositePicDescriptor,
  compositePicScript,
  type RenderedSprite,
} from './formats/pic-render.js';
export { renderTextRun, measureTextRun } from './formats/wfont-render.js';
export { renderTextRun4bpp } from './formats/wfont-4bpp-render.js';
export {
  createTileWindow,
  clearWindow,
  setCursor,
  puts,
  centeredPuts,
  setHighlightInvert,
  renderTileWindow,
  type TileWindow,
  type FontSet,
} from './ui/tile-window.js';
export { renderEgaScreen } from './formats/ega-screen-render.js';
export { EGA_FILE_INDEX_PERMUTATION } from './formats/ega-permutation.js';
export {
  encodeSave,
  decodeSave,
  encodeSaveBase64,
  decodeSaveBase64,
} from './formats/save-codec.js';

export {
  encodeRoster,
  decodeRoster,
  encodeRosterBase64,
  decodeRosterBase64,
} from './formats/roster-codec.js';

export { decodePcfile } from './formats/pcfile.js';
export { encodeCharacterRecord } from './formats/encode-character-record.js';

export {
  slugify,
} from './queries/slug.js';

export { expandOfLigature } from './queries/name-format.js';

export {
  monsterSlug,
  monsterDisplayName,
  findMonsterBySlug,
  searchMonsters,
  filterMonsters,
  sortMonsters,
  familyKey,
  uniqueFilterValues,
  formatLevelRange,
  formatHpDice,
  formatAttackDice,
  type MonsterFilter,
  type MonsterSortField,
  type SortDir,
  type UniqueFilterValues,
} from './queries/monsters.js';

export {
  initialIntroState,
  stepIntro,
  visibleScrollEntries,
  type IntroPhase,
  type IntroState,
  type IntroInputs,
  type VisibleEntry,
} from './sim/intro-sequence.js';
export { composeIntroFrame } from './sim/intro-render.js';
export {
  MAIN_MENU_OPTIONS,
  isOptionEnabled,
  visibleMenuOptions,
  type MainMenuSlot,
  type MainMenuDestination,
  type MainMenuOption,
  type MainMenuContext,
} from './sim/main-menu.js';
export {
  CREDITS_SCROLL_ENTRIES,
  SCROLL_STEP_PER_FRAME,
  SCROLL_TERMINAL_POS,
  PHASE_FRAMES_PAUSE_PRE_SIRTECH,
  PHASE_FRAMES_SIRTECH_SPLASH,
  PHASE_FRAMES_PAUSE_BETWEEN_SPLASHES,
  PHASE_FRAMES_BRADLEY_SPLASH,
  PHASE_FRAMES_PAUSE_PRE_SCROLL,
  PHASE_FRAMES_POST_SCROLL,
  SCROLL_RAF_STEP_RATIO,
  type CreditScrollEntry,
} from './sim/intro-constants.js';

