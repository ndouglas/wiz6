// MCP server entry point.
//
// Builds an McpServer, registers the full Wiz6 tool surface, and exposes a
// `connect(transport)` helper that the CLI (`cli.ts`) drives over stdio and
// the tests drive over the in-process InMemoryTransport.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { McpContext, type McpContextOptions } from './context.js';
import { registerSymbolTools } from './tools/symbols.js';
import { registerLiveTools } from './tools/live.js';

export const SERVER_NAME = '@wiz6/mcp';
export const SERVER_VERSION = '0.0.0';

export interface BuiltServer {
  server: McpServer;
  context: McpContext;
}

/** Build a configured McpServer with every Wiz6 tool registered. */
export function buildServer(opts: McpContextOptions = {}): BuiltServer {
  const context = new McpContext(opts);
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  registerSymbolTools(server, context);
  registerLiveTools(server, context);

  return { server, context };
}

/** Connect the server to a transport. Returns the server for further use. */
export async function startServer(
  transport: Transport,
  opts: McpContextOptions = {},
): Promise<BuiltServer> {
  const built = buildServer(opts);
  await built.server.connect(transport);
  return built;
}
