export {
  DebuggerConsole,
  DebuggerUnavailableError,
  NotImplementedError,
  SaveStateBridge,
  bpCommand,
  formatSegOff,
  memdumpBinCommand,
  DEFAULT_DOSBOX_X_PATH,
  MACOS_TTY_GATE_MESSAGE,
} from './debugger-console.js';
export type { DebuggerConsoleOptions } from './debugger-console.js';

export { buildServer, startServer, SERVER_NAME, SERVER_VERSION } from './server.js';
export type { BuiltServer } from './server.js';

export { McpContext } from './context.js';
export type { McpContextOptions, LaunchedSession } from './context.js';

export {
  resolveDgroupBase,
  dgroupOffsetToPhysical,
  DGROUP_ANCHOR_HEX,
} from './dgroup.js';

export { buildSegmentMap, _clearSegmentMapCacheForTests } from './segments.js';

export { loadSymbolIndex, findFindingsDir, readNamingPassDocs } from './symbols-loader.js';
export type { LoadSymbolsOpts } from './symbols-loader.js';
