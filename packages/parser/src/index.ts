import type { Manifest } from '@wiz6/data';

export { decodeWfont, type DecodeWfontOpts } from './formats/wfont.js';
export { extractWfont, type ExtractWfontOpts } from './extractors/extract-wfont.js';
export { decodeWfont4bpp, type DecodeWfont4bppOpts } from './formats/wfont-4bpp.js';
export { extractWfont4bpp, type ExtractWfont4bppOpts } from './extractors/extract-wfont-4bpp.js';
export { decodeWport, type DecodeWportOpts } from './formats/wport.js';
export { extractWport, type ExtractWportOpts } from './extractors/extract-wport.js';
export { decodeEgaScreen, type DecodeEgaScreenOpts } from './formats/ega-screen.js';
export { extractEgaScreen, type ExtractEgaScreenOpts } from './extractors/extract-ega-screen.js';
export {
  decodeMessageDb,
  huffmanDecode,
  cleanIndexedText,
  type DecodeMessageDbOpts,
} from './formats/message-db.js';
export { extractMessageDb, type ExtractMessageDbOpts } from './extractors/extract-message-db.js';
export { decodeNewgameDb, type DecodeNewgameDbOpts } from './formats/newgame-db.js';
export { extractNewgameDb, type ExtractNewgameDbOpts } from './extractors/extract-newgame-db.js';
export { decodeScenarioDb, type DecodeScenarioDbOpts } from './formats/scenario-db.js';
export { extractScenarioDb, type ExtractScenarioDbOpts } from './extractors/extract-scenario-db.js';

export {
  slugify,
} from './queries/slug.js';

export {
  monsterSlug,
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
