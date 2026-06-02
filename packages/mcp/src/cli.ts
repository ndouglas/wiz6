#!/usr/bin/env node
// `wiz6-mcp` — entry point for the Wiz6 DOSBox-X MCP server.
//
// Speaks MCP over stdio; diagnostic logs to stderr as JSON lines. This file
// is not invoked directly — see `packages/mcp/bin/wiz6-mcp.mjs` for the
// tsx-launcher shim that resolves workspace TS sources. MCP client config:
//
//   {
//     "mcpServers": {
//       "wiz6": {
//         "command": "/abs/path/to/wiz6/packages/mcp/bin/wiz6-mcp.mjs",
//         "cwd": "/abs/path/to/wiz6"
//       }
//     }
//   }

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { startServer } from './server.js';

function logJson(event: Record<string, unknown>): void {
  process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`);
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  const { server } = await startServer(transport, { cwd: process.cwd() });
  logJson({ level: 'info', msg: 'wiz6-mcp started', cwd: process.cwd() });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logJson({ level: 'info', msg: 'shutting down', signal });
    try {
      await server.close();
    } catch (err) {
      logJson({ level: 'error', msg: 'shutdown error (server.close)', err: String(err) });
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  process.stderr.write(
    `${JSON.stringify({
      ts: new Date().toISOString(),
      level: 'fatal',
      msg: 'wiz6-mcp failed to start',
      err: err instanceof Error ? err.message : String(err),
    })}\n`,
  );
  process.exit(1);
});
