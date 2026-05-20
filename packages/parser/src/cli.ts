#!/usr/bin/env node
import { join } from 'node:path';
import { describePlan } from './index.js';
import { extractWfont } from './extractors/extract-wfont.js';

const subcommand = process.argv[2];

if (subcommand === 'extract-fonts') {
  const originalDir = process.argv[3] ?? './original';
  const extractedDir = process.argv[4] ?? './extracted';
  const font = extractWfont({
    originalPath: join(originalDir, 'wfont0.ega'),
    outputPath: join(extractedDir, 'fonts', 'wfont0.json'),
    id: 'wfont0',
  });
  console.log(`wrote ${extractedDir}/fonts/wfont0.json (${font.glyphCount} glyphs)`);
} else if (subcommand === 'plan' || subcommand === undefined) {
  const originalDir = process.argv[3] ?? './original';
  const plan = describePlan({ originalDir });
  console.log(JSON.stringify(plan, null, 2));
} else {
  console.error(`Unknown subcommand: ${subcommand}`);
  console.error(`Usage: wiz6-parse [plan|extract-fonts] [<originalDir> [<extractedDir>]]`);
  process.exit(2);
}
