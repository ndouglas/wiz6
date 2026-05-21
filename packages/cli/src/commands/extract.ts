import { parseArgs } from 'node:util';
import { join } from 'node:path';
import {
  extractWfont,
  extractWfont4bpp,
  extractWport,
  extractEgaScreen,
  extractMessageDb,
  extractNewgameDb,
  extractScenarioDb,
} from '@wiz6/parser';
import { resolveOriginalDir } from '../lib/loaders.js';
import type { CliIO } from '../index.js';

interface ExtractOpts {
  cwd: string;
  io: CliIO;
}

type TypeName = 'fonts' | 'portraits' | 'screens' | 'messages' | 'newgame' | 'scenario';
const ALL_TYPES: TypeName[] = ['fonts', 'portraits', 'screens', 'messages', 'newgame', 'scenario'];

const USAGE = `usage: wiz6 extract <type|--all> [flags]

types:
  fonts        wfont0.ega (1bpp) + wfont1-4 (4bpp)
  portraits    wport1-3 (NPC portrait sets)
  screens      titlepag, graveyrd, dragonsc EGA screens
  messages     msg.dbs (Huffman-decoded text)
  newgame      newgame.dbs (character creation templates)
  scenario     scenario.dbs (XP tables, items, monsters, quest data)
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
