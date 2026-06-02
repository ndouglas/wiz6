// Symbol tools — backend-agnostic name↔address lookups over the SymbolIndex.
//
// These don't touch the emulator at all (no save state, no live harness); they
// query the in-memory SymbolIndex built from the findings docs. Kept after the
// dosbox-pure consolidation that removed the save-state inspection tools.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { McpContext } from '../context.js';
import { errorResult, jsonResult, safeHandler, type JsonToolResult } from '../tool-result.js';

export function registerSymbolTools(server: McpServer, ctx: McpContext): void {
  // -------- dosbox_resolve_symbol -----------------------------------------
  server.registerTool(
    'dosbox_resolve_symbol',
    {
      description:
        'Look up a symbol by name or by (binary, address). At least one of `name` ' +
        'or `address` must be provided. Returns all matching entries.',
      inputSchema: {
        name: z.string().optional().describe('Exact symbol name (case-sensitive).'),
        binary: z.string().optional().describe('Restrict to one binary, e.g. "wroot.exe".'),
        address: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe('Image/file offset for the (binary, address) lookup.'),
      },
    },
    safeHandler((args): JsonToolResult => {
      if (args.name === undefined && args.address === undefined) {
        return errorResult('must provide `name` or `address` (or both).');
      }
      let entries = args.name ? [...ctx.symbols.allByName(args.name)] : [...ctx.symbols.entries];
      if (args.binary !== undefined) {
        entries = entries.filter((e) => e.binary === args.binary);
      }
      if (args.address !== undefined) {
        entries = entries.filter((e) => e.address === args.address);
      }
      // Augment each entry with a `typed_addr` field — a {space, offset}
      // pair that maps SymbolEntry.binary to the corresponding segment space.
      const augmented = entries.map((e) => ({
        ...e,
        typed_addr: { space: e.binary, offset: `0x${e.address.toString(16)}` },
      }));
      return jsonResult({ count: augmented.length, entries: augmented });
    }),
  );

  // -------- dosbox_list_symbols -------------------------------------------
  server.registerTool(
    'dosbox_list_symbols',
    {
      description:
        'List symbols, optionally filtered by binary, name prefix, or address range. ' +
        'Returns up to 500 entries by default to keep payloads bounded.',
      inputSchema: {
        binary: z.string().optional(),
        namePrefix: z.string().optional(),
        addressMin: z.number().int().nonnegative().optional(),
        addressMax: z.number().int().nonnegative().optional(),
        limit: z.number().int().positive().max(5000).optional(),
      },
    },
    safeHandler((args): JsonToolResult => {
      let entries = [...ctx.symbols.entries];
      if (args.binary !== undefined) {
        entries = entries.filter((e) => e.binary === args.binary);
      }
      if (args.namePrefix !== undefined) {
        entries = entries.filter((e) => e.name.startsWith(args.namePrefix!));
      }
      if (args.addressMin !== undefined) {
        entries = entries.filter((e) => e.address >= args.addressMin!);
      }
      if (args.addressMax !== undefined) {
        entries = entries.filter((e) => e.address <= args.addressMax!);
      }
      const limit = args.limit ?? 500;
      const truncated = entries.length > limit;
      const result = entries.slice(0, limit);
      return jsonResult({
        count: result.length,
        totalMatching: entries.length,
        truncated,
        entries: result,
      });
    }),
  );
}
