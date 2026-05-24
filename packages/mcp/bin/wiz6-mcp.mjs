#!/usr/bin/env node
// `wiz6-mcp` launcher — uses tsx so the MCP server can import TypeScript
// sources directly from @wiz6/data / @wiz6/cli without each workspace
// package needing its own dist/ build. The actual server entry point is
// `src/cli.ts`; this shim just wires up the loader and exec()s it.

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const cliEntry = resolve(here, '..', 'src', 'cli.ts');
const require = createRequire(import.meta.url);
const tsxBin = require.resolve('tsx/cli');

const child = spawn(process.execPath, [tsxBin, cliEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
