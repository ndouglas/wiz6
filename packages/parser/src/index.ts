import type { Manifest } from '@wiz6/data';

export { decodeWfont, type DecodeWfontOpts } from './formats/wfont.js';
export { extractWfont, type ExtractWfontOpts } from './extractors/extract-wfont.js';
export { decodeWfont4bpp, type DecodeWfont4bppOpts } from './formats/wfont-4bpp.js';
export { extractWfont4bpp, type ExtractWfont4bppOpts } from './extractors/extract-wfont-4bpp.js';
export { decodeWport, type DecodeWportOpts } from './formats/wport.js';
export { extractWport, type ExtractWportOpts } from './extractors/extract-wport.js';
export { decodeEgaScreen, type DecodeEgaScreenOpts } from './formats/ega-screen.js';

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
