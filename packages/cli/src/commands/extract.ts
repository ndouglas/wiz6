import { parseArgs } from 'node:util';
import { readdirSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { extractWfont } from '../extractors/extract-wfont.js';
import { extractWfont4bpp } from '../extractors/extract-wfont-4bpp.js';
import { extractWport } from '../extractors/extract-wport.js';
import { extractEgaScreen } from '../extractors/extract-ega-screen.js';
import { extractMessageDb } from '../extractors/extract-message-db.js';
import { extractNewgameDb } from '../extractors/extract-newgame-db.js';
import { extractScenarioDb } from '../extractors/extract-scenario-db.js';
import { extractPcfile } from '../extractors/extract-pcfile.js';
import { extractPic } from '../extractors/extract-pic.js';
import { extractSnd } from '../extractors/extract-snd.js';
import { extractDocs } from '../extractors/extract-docs.js';
import { extractMazeLevel } from '../extractors/maze-level.js';
import { loadMazeAssetsRaw } from '@wiz6/parser';
import { resolveOriginalDir } from '../lib/loaders.js';
import type { CliIO } from '../index.js';

interface ExtractOpts {
  cwd: string;
  io: CliIO;
}

type TypeName =
  | 'fonts'
  | 'portraits'
  | 'screens'
  | 'messages'
  | 'newgame'
  | 'scenario'
  | 'pcfile'
  | 'pics'
  | 'sounds'
  | 'docs'
  | 'maze-levels';
const ALL_TYPES: TypeName[] = [
  'fonts',
  'portraits',
  'screens',
  'messages',
  'newgame',
  'scenario',
  'pcfile',
  'pics',
  'sounds',
  'docs',
  'maze-levels',
];

const USAGE = `usage: wiz6 extract <type|--all> [flags]

types:
  fonts        wfont0.ega (1bpp) + wfont1-4 (4bpp)
  portraits    wport1-3 (NPC portrait sets)
  screens      titlepag, graveyrd, dragonsc EGA screens (+ rendered .png)
  messages     msg.dbs (Huffman-decoded text)
  newgame      newgame.dbs (character creation templates)
  scenario     scenario.dbs (XP tables, items, monsters, quest data)
  pcfile       pcfile.dbs (character save slots)
  pics         mon00-mon58 + credits.pic (full decode, per-descriptor PNGs + contact sheet)
  sounds       sound00-sound38.snd (raw bytes + decoded metadata JSON)
  docs         copy docs/**/*.md into extracted/docs/ with a manifest
  maze-levels  dungeon levels (level-0.json) from scenario.dbs bank 2
  --all        extract all of the above

flags:
  --original <dir>    default ./original
  --extracted <dir>   default ./extracted
`;

function extractOneType(
  type: TypeName,
  originalDir: string,
  extractedDir: string,
  io: CliIO,
): void {
  switch (type) {
    case 'fonts': {
      const wf0 = extractWfont({
        originalPath: join(originalDir, 'wfont0.ega'),
        outputPath: join(extractedDir, 'fonts', 'wfont0.json'),
        id: 'wfont0',
      });
      io.write(`wrote ${extractedDir}/fonts/wfont0.json (${wf0.glyphCount} glyphs, 1bpp)\n`);
      for (const n of [1, 2, 3, 4]) {
        const f = extractWfont4bpp({
          originalPath: join(originalDir, `wfont${n}.ega`),
          outputPath: join(extractedDir, 'fonts', `wfont${n}.json`),
          id: `wfont${n}`,
        });
        io.write(`wrote ${extractedDir}/fonts/wfont${n}.json (${f.glyphCount} glyphs, 4bpp)\n`);
      }
      return;
    }
    case 'portraits':
      for (const n of [1, 2, 3]) {
        const set = extractWport({
          originalPath: join(originalDir, `wport${n}.ega`),
          outputPath: join(extractedDir, 'portraits', `wport${n}.json`),
          id: `wport${n}`,
        });
        io.write(
          `wrote ${extractedDir}/portraits/wport${n}.json (${set.portraitCount} portraits)\n`,
        );
      }
      return;
    case 'screens':
      for (const name of ['titlepag', 'graveyrd', 'dragonsc']) {
        const scr = extractEgaScreen({
          originalPath: join(originalDir, `${name}.ega`),
          outputPath: join(extractedDir, 'screens', `${name}.json`),
          id: name,
        });
        io.write(`wrote ${extractedDir}/screens/${name}.json (${scr.width}x${scr.height})\n`);
      }
      return;
    case 'messages': {
      const m = extractMessageDb({
        dbsPath: join(originalDir, 'msg.dbs'),
        treePath: join(originalDir, 'misc.hdr'),
        indexPath: join(originalDir, 'msg.hdr'),
        outputPath: join(extractedDir, 'messages', 'msg.json'),
        id: 'msg',
      });
      io.write(
        `wrote ${extractedDir}/messages/msg.json (${m.recordCount} records, ${m.indexedCount} indexed messages)\n`,
      );
      return;
    }
    case 'newgame': {
      const n = extractNewgameDb({
        originalPath: join(originalDir, 'newgame.dbs'),
        outputPath: join(extractedDir, 'newgame', 'newgame.json'),
        id: 'newgame',
      });
      const nonEmpty = n.records.filter((r) => !r.empty).length;
      io.write(
        `wrote ${extractedDir}/newgame/newgame.json (${n.recordCount} records, ${nonEmpty} non-empty)\n`,
      );
      return;
    }
    case 'scenario': {
      const s = extractScenarioDb({
        originalPath: join(originalDir, 'scenario.dbs'),
        outputPath: join(extractedDir, 'scenario', 'scenario.json'),
        id: 'scenario',
      });
      const nonemptyItems = s.items.filter((it) => !it.empty).length;
      io.write(
        `wrote ${extractedDir}/scenario/scenario.json (${s.xpTables.length} XP tables, ${s.itemCount} item slots [${nonemptyItems} non-empty], ${s.unknownTail.length}-byte tail)\n`,
      );
      return;
    }
    case 'pcfile': {
      const pc = extractPcfile({
        originalPath: join(originalDir, 'pcfile.dbs'),
        outputPath: join(extractedDir, 'pcfile', 'pcfile.json'),
      });
      const populated = pc.slots.filter((s) => s.populated).length;
      io.write(
        `wrote ${extractedDir}/pcfile/pcfile.json (${populated} populated slots of ${pc.header.slotCount})\n`,
      );
      return;
    }
    case 'pics': {
      const entries = readdirSync(originalDir)
        .filter((f) => f.endsWith('.pic'))
        .sort();
      for (const f of entries) {
        const id = f.replace(/\.pic$/, '');
        const pic = extractPic({
          originalPath: join(originalDir, f),
          outputPath: join(extractedDir, 'pics', `${id}.json`),
          id,
        });
        io.write(
          `wrote ${extractedDir}/pics/${id}.json (${pic.segments.length} segments, ${pic.totalBytes} bytes)\n`,
        );
      }
      return;
    }
    case 'sounds': {
      const entries = readdirSync(originalDir)
        .filter((f) => f.toLowerCase().endsWith('.snd'))
        .sort();
      for (const f of entries) {
        const id = f.replace(/\.snd$/i, '');
        const meta = extractSnd({
          originalPath: join(originalDir, f),
          outputDir: join(extractedDir, 'sounds'),
          id,
        });
        io.write(
          `wrote ${extractedDir}/sounds/${f} (${meta.compression}, ${meta.sampleCount} samples @ ${meta.sampleRateHz} Hz)\n`,
        );
      }
      return;
    }
    case 'docs': {
      // Only ship the RE notes — superpowers/ contains plans/specs that are
      // internal scaffolding noise. RE docs are the project's "public" knowledge.
      const repoRoot = join(originalDir, '..');
      const manifest = extractDocs({
        docsDir: join(repoRoot, 'docs', 're'),
        outputDir: join(extractedDir, 'docs'),
      });
      io.write(`wrote ${extractedDir}/docs/manifest.json (${manifest.entries.length} markdown files)\n`);
      return;
    }
    case 'maze-levels': {
      // Level 0 = the starting dungeon (zone 0). More levels added as RE progresses.
      const level = extractMazeLevel({
        originalDir,
        outputPath: join(extractedDir, 'maze', 'level-0.json'),
        levelId: 0,
      });
      let nz = 0;
      for (const region of level.mazeBlock.regions)
        for (const c of region)
          if (c.north || c.west || c.special4 || c.orient2 || c.pit) nz++;
      io.write(
        `wrote ${extractedDir}/maze/level-0.json (${level.mazeBlock.regions.length} regions, ${nz} non-empty cells)\n`,
      );
      // Browser-ready maze render assets (atlas + piece descriptors) — same JSON
      // shape as the parser fixture; the viewer fetches + decodes via the shared
      // isomorphic decoder (decodeMazeAssets), guaranteeing byte-identical assets.
      const assetsRaw = loadMazeAssetsRaw();
      const assetsPath = join(extractedDir, 'maze', 'assets.json');
      mkdirSync(dirname(assetsPath), { recursive: true });
      writeFileSync(assetsPath, JSON.stringify(assetsRaw, null, 2));
      io.write(
        `wrote ${extractedDir}/maze/assets.json (${assetsRaw.pieceDescriptors.length} piece descriptors)\n`,
      );
      // Browser-ready copy of the Task-C2 captured wall spans (per-view-config
      // engine-settled span lists). This is committed ground truth (captured via
      // tools/libretro/capture-maze-wall-spans.ts, NOT derived from original/), so
      // we COPY the fixture rather than regenerate it — keeping the browser-served
      // /maze/wall-spans.json in lock-step with the parity gate's fixture.
      const repoRoot = join(originalDir, '..');
      const spansSrc = join(
        repoRoot,
        'tools',
        'parity',
        'fixtures',
        'engine',
        'maze-wall-spans.json',
      );
      const spansDst = join(extractedDir, 'maze', 'wall-spans.json');
      if (existsSync(spansSrc)) {
        copyFileSync(spansSrc, spansDst);
        io.write(`wrote ${extractedDir}/maze/wall-spans.json (captured wall spans, Task C2)\n`);
      } else {
        io.write(`skip ${extractedDir}/maze/wall-spans.json (fixture not found at ${spansSrc})\n`);
      }
      return;
    }
  }
}

export function runExtractCommand(args: readonly string[], opts: ExtractOpts): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      options: {
        original: { type: 'string' },
        extracted: { type: 'string' },
        all: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: true,
    });
  } catch (err) {
    opts.io.writeErr(`bad args: ${(err as Error).message}\n${USAGE}`);
    return 1;
  }

  const wantsAll = parsed.values.all === true;
  const type = parsed.positionals[0] as TypeName | undefined;

  if (!wantsAll && !type) {
    opts.io.writeErr(USAGE);
    return 1;
  }
  if (type && !ALL_TYPES.includes(type)) {
    opts.io.writeErr(`unknown type: ${type}\n\n${USAGE}`);
    return 1;
  }

  let originalDir: string;
  try {
    originalDir = resolveOriginalDir({
      cwd: opts.cwd,
      override: (parsed.values.original as string | undefined) ?? null,
    });
  } catch (err) {
    opts.io.writeErr(`${(err as Error).message}\n`);
    return 1;
  }
  const extractedDir =
    (parsed.values.extracted as string | undefined) ?? join(opts.cwd, 'extracted');

  const types: TypeName[] = wantsAll ? ALL_TYPES : [type!];
  for (const t of types) {
    extractOneType(t, originalDir, extractedDir, opts.io);
  }
  return 0;
}
