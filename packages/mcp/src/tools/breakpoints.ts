// Phase 7 — Breakpoint tools.
//
// Setting / clearing breakpoints requires sending commands to the running
// DOSBox-X debugger, which is the same Phase 9 dynamic-driving blocker that
// the Phase 5 control tools wait on. The *symbol resolution* part of the
// problem ("name → address") is already solved by Phase 2 — use
// `dosbox_resolve_symbol` to convert a name to an address before passing it
// to a future real breakpoint backend.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { McpContext } from '../context.js';
import { errorResult } from '../tool-result.js';

const BLOCKED_MESSAGE =
  'Breakpoint *resolution* works via dosbox_resolve_symbol (Phase 2), but ' +
  '*setting* breakpoints requires the Phase 9 dynamic-driving backend ' +
  '(node-pty + ncurses scraper OR DOSBox-X TCP debug-port patch). See ' +
  'docs/superpowers/specs/2026-05-23-dosbox-mcp.md.';

export function registerBreakpointTools(server: McpServer, _ctx: McpContext): void {
  server.registerTool(
    'dosbox_set_breakpoint',
    {
      description:
        '[STUB] Set an execution breakpoint at a symbol name or numeric address. ' +
        BLOCKED_MESSAGE,
      inputSchema: {
        target: z
          .string()
          .describe('Symbol name (preferred) or numeric address as hex string ("0x209b").'),
        binary: z.string().optional().describe('Restrict symbol resolution to this binary.'),
      },
    },
    () => errorResult('dosbox_set_breakpoint: not implemented in v1. ' + BLOCKED_MESSAGE),
  );

  server.registerTool(
    'dosbox_clear_breakpoint',
    {
      description: '[STUB] Clear a breakpoint by ID. ' + BLOCKED_MESSAGE,
      inputSchema: {
        id: z.number().int().nonnegative(),
      },
    },
    () => errorResult('dosbox_clear_breakpoint: not implemented in v1. ' + BLOCKED_MESSAGE),
  );

  server.registerTool(
    'dosbox_list_breakpoints',
    {
      description: '[STUB] List active breakpoints. ' + BLOCKED_MESSAGE,
      inputSchema: {},
    },
    () => errorResult('dosbox_list_breakpoints: not implemented in v1. ' + BLOCKED_MESSAGE),
  );
}
