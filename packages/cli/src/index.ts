import { runListCommand } from './commands/list.js';
import { runShowCommand } from './commands/show.js';

export interface CliIO {
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

const USAGE = `usage: wiz6 <subcommand> [args]

subcommands:
  list <type>             list records of a given type (e.g. monsters)
  show <type> <id>        show a single record by slug or index
  grep <pattern>          find a string or hex pattern across .dbs files
  extract <type|--all>    extract data tables to JSON

global flags:
  --original <dir>        path to ./original (default: ./original)
  --extracted <dir>       output dir for extract (default: ./extracted)
  -h, --help              this help

examples:
  wiz6 list monsters --class 2 --sort xp --dir desc
  wiz6 show monster wraith
  wiz6 grep QUEEQUEG
  wiz6 extract scenario
`;

export function run(argv: readonly string[], io: CliIO): number {
  if (argv.length === 0) {
    io.writeErr(USAGE);
    return 1;
  }
  const first = argv[0];
  if (first === '--help' || first === '-h') {
    io.write(USAGE);
    return 0;
  }
  if (first === 'list') {
    return runListCommand(argv.slice(1), { cwd: process.cwd(), io });
  }
  if (first === 'show') {
    return runShowCommand(argv.slice(1), { cwd: process.cwd(), io });
  }
  // Subcommands will be wired up in subsequent tasks.
  io.writeErr(`unknown subcommand: ${first}\n\n${USAGE}`);
  return 1;
}
