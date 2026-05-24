// Phase 8 — Snapshot tools.
//
// `dosbox_list_saves` is REAL (filesystem listing). Everything that requires
// the running emulator (save_state, load_state, screenshot) is a STUB because
// it depends on Phase 9 dynamic driving — DOSBox-X writes save states in
// response to a debugger command we can't issue without the pty bridge.
//
// Decoding the existing CPU + Memory + VGA blobs out of a .sav for offline
// inspection is feasible without dynamic driving, but the user-facing
// screenshot tool needs *the current frame* which is buried in the VGA
// blob and isn't yet parsed.

import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { McpContext } from '../context.js';
import { errorResult, jsonResult, safeHandler, type JsonToolResult } from '../tool-result.js';

const SAVE_STUB_MESSAGE =
  'Writing a fresh save state requires sending the save command to a running ' +
  'DOSBox-X debugger. That needs the Phase 9 dynamic-driving backend.';
const LOAD_STUB_MESSAGE =
  'Loading a save state mid-run requires driving the debugger. Phase 9 ' +
  'backend dependency. As a workaround, configure the autoload-on-boot slot ' +
  'in tools/dosbox/wiz6.conf and re-launch via dosbox_launch.';
const SCREENSHOT_STUB_MESSAGE =
  'Screenshots require decoding the VGA framebuffer from the save-state hardware ' +
  'blob (separate from the Memory blob). That parser is not yet written.';

export function registerSnapshotTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'dosbox_list_saves',
    {
      description:
        'List available save states under tools/dosbox/save/*.sav. Returns path, ' +
        'slot number (parsed from filename if numeric), file size, and mtime.',
      inputSchema: {},
    },
    safeHandler((): JsonToolResult => {
      if (!existsSync(ctx.savesDir)) {
        return jsonResult({ saves: [], note: `${ctx.savesDir} does not exist` });
      }
      const saves: {
        path: string;
        slot: number | null;
        sizeBytes: number;
        mtime: string;
      }[] = [];
      for (const entry of readdirSync(ctx.savesDir)) {
        if (!entry.endsWith('.sav')) continue;
        const absPath = join(ctx.savesDir, entry);
        const stat = ctx.saveStat(absPath);
        const base = basename(entry, '.sav');
        const slot = /^\d+$/.test(base) ? parseInt(base, 10) : null;
        saves.push({ path: absPath, slot, sizeBytes: stat.sizeBytes, mtime: stat.mtime });
      }
      saves.sort((a, b) => (a.slot ?? Infinity) - (b.slot ?? Infinity));
      return jsonResult({ saves });
    }),
  );

  server.registerTool(
    'dosbox_save_state',
    {
      description: '[STUB] Create a new save state. ' + SAVE_STUB_MESSAGE,
      inputSchema: {
        slot: z.number().int().nonnegative().describe('Save slot index.'),
        source: z
          .string()
          .optional()
          .describe('Optional human label for the save.'),
      },
    },
    () => errorResult('dosbox_save_state: not implemented in v1. ' + SAVE_STUB_MESSAGE),
  );

  server.registerTool(
    'dosbox_load_state',
    {
      description: '[STUB] Restore a save state in a running DOSBox-X. ' + LOAD_STUB_MESSAGE,
      inputSchema: {
        slot: z.number().int().nonnegative(),
      },
    },
    () => errorResult('dosbox_load_state: not implemented in v1. ' + LOAD_STUB_MESSAGE),
  );

  server.registerTool(
    'dosbox_screenshot',
    {
      description: '[STUB] Capture the current frame as PNG. ' + SCREENSHOT_STUB_MESSAGE,
      inputSchema: {
        save: z.string(),
      },
    },
    () => errorResult('dosbox_screenshot: not implemented in v1. ' + SCREENSHOT_STUB_MESSAGE),
  );
}
