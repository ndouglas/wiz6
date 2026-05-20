#!/usr/bin/env node
import { join } from 'node:path';
import { describePlan } from './index.js';
import { extractWfont } from './extractors/extract-wfont.js';
import { extractWfont4bpp } from './extractors/extract-wfont-4bpp.js';

const subcommand = process.argv[2];

if (subcommand === 'extract-fonts') {
  const originalDir = process.argv[3] ?? './original';
  const extractedDir = process.argv[4] ?? './extracted';

  const wfont0 = extractWfont({
    originalPath: join(originalDir, 'wfont0.ega'),
    outputPath: join(extractedDir, 'fonts', 'wfont0.json'),
    id: 'wfont0',
  });
  console.log(`wrote ${extractedDir}/fonts/wfont0.json (${wfont0.glyphCount} glyphs, 1bpp)`);

  for (const n of [1, 2, 3, 4]) {
    const font = extractWfont4bpp({
      originalPath: join(originalDir, `wfont${n}.ega`),
      outputPath: join(extractedDir, 'fonts', `wfont${n}.json`),
      id: `wfont${n}`,
    });
    console.log(`wrote ${extractedDir}/fonts/wfont${n}.json (${font.glyphCount} glyphs, 4bpp)`);
  }
} else if (subcommand === 'plan' || subcommand === undefined) {
  const originalDir = process.argv[3] ?? './original';
  const plan = describePlan({ originalDir });
  console.log(JSON.stringify(plan, null, 2));
} else {
  console.error(`Unknown subcommand: ${subcommand}`);
  console.error(`Usage: wiz6-parse [plan|extract-fonts] [<originalDir> [<extractedDir>]]`);
  process.exit(2);
}
