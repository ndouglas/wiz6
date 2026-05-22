import type { Manifest } from '@wiz6/data';

export { decodeWfont, type DecodeWfontOpts } from './formats/wfont.js';
export { decodeWfont4bpp, type DecodeWfont4bppOpts } from './formats/wfont-4bpp.js';
export { decodeWport, type DecodeWportOpts } from './formats/wport.js';
export { decodeEgaScreen, type DecodeEgaScreenOpts } from './formats/ega-screen.js';
export {
  decodeMessageDb,
  huffmanDecode,
  cleanIndexedText,
  type DecodeMessageDbOpts,
} from './formats/message-db.js';
export { decodeNewgameDb, type DecodeNewgameDbOpts } from './formats/newgame-db.js';
export { decodeScenarioDb, type DecodeScenarioDbOpts } from './formats/scenario-db.js';
export { decodePic, type DecodePicOpts } from './formats/pic.js';
export {
  renderPicDescriptor,
  concatenatePicSegments,
  EGA_PALETTE,
  type RenderedSprite,
} from './formats/pic-render.js';

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
export {
  CREDITS_SCROLL_ENTRIES,
  SCROLL_STEP_PER_FRAME,
  SCROLL_TERMINAL_POS,
  TITLE_HOLD_FRAMES_SHORT,
  TITLE_HOLD_FRAMES_LONG,
  POST_SCROLL_HOLD_FRAMES,
  type CreditScrollEntry,
} from './sim/intro-constants.js';

export interface Plan {
  originalDir: string;
  schemaVersion: Manifest['schemaVersion'];
  steps: string[];
}

export function describePlan(opts: { originalDir: string }): Plan {
  return {
    originalDir: opts.originalDir,
    schemaVersion: 1,
    steps: [],
  };
}
