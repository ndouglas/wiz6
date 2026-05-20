#!/usr/bin/env node
import { join } from 'node:path';
import { describePlan } from './index.js';
import { extractWfont } from './extractors/extract-wfont.js';
import { extractWfont4bpp } from './extractors/extract-wfont-4bpp.js';
import { extractWport } from './extractors/extract-wport.js';
import { extractEgaScreen } from './extractors/extract-ega-screen.js';
import { extractMessageDb } from './extractors/extract-message-db.js';
import { extractNewgameDb } from './extractors/extract-newgame-db.js';

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
} else if (subcommand === 'extract-portraits') {
  const originalDir = process.argv[3] ?? './original';
  const extractedDir = process.argv[4] ?? './extracted';

  for (const n of [1, 2, 3]) {
    const set = extractWport({
      originalPath: join(originalDir, `wport${n}.ega`),
      outputPath: join(extractedDir, 'portraits', `wport${n}.json`),
      id: `wport${n}`,
    });
    console.log(`wrote ${extractedDir}/portraits/wport${n}.json (${set.portraitCount} portraits)`);
  }
} else if (subcommand === 'extract-screens') {
  const originalDir = process.argv[3] ?? './original';
  const extractedDir = process.argv[4] ?? './extracted';

  for (const name of ['titlepag', 'graveyrd', 'dragonsc']) {
    const screen = extractEgaScreen({
      originalPath: join(originalDir, `${name}.ega`),
      outputPath: join(extractedDir, 'screens', `${name}.json`),
      id: name,
    });
    console.log(`wrote ${extractedDir}/screens/${name}.json (320×200, ${screen.trailer.length}-byte trailer)`);
  }
} else if (subcommand === 'extract-messages') {
  const originalDir = process.argv[3] ?? './original';
  const extractedDir = process.argv[4] ?? './extracted';
  const db = extractMessageDb({
    dbsPath: join(originalDir, 'msg.dbs'),
    treePath: join(originalDir, 'misc.hdr'),
    indexPath: join(originalDir, 'msg.hdr'),
    outputPath: join(extractedDir, 'messages', 'msg.json'),
    id: 'msg',
  });
  console.log(`wrote ${extractedDir}/messages/msg.json (${db.recordCount} records, ${db.indexedCount} indexed messages)`);
} else if (subcommand === 'extract-newgame') {
  const originalDir = process.argv[3] ?? './original';
  const extractedDir = process.argv[4] ?? './extracted';
  const db = extractNewgameDb({
    originalPath: join(originalDir, 'newgame.dbs'),
    outputPath: join(extractedDir, 'newgame', 'newgame.json'),
    id: 'newgame',
  });
  const nonempty = db.records.filter((r) => !r.empty).length;
  console.log(`wrote ${extractedDir}/newgame/newgame.json (${db.recordCount} records, ${nonempty} non-empty)`);
} else if (subcommand === 'plan' || subcommand === undefined) {
  const originalDir = process.argv[3] ?? './original';
  const plan = describePlan({ originalDir });
  console.log(JSON.stringify(plan, null, 2));
} else {
  console.error(`Unknown subcommand: ${subcommand}`);
  console.error(`Usage: wiz6-parse [plan|extract-fonts|extract-portraits|extract-screens|extract-messages|extract-newgame] [<originalDir> [<extractedDir>]]`);
  process.exit(2);
}
