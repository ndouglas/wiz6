// Phase 8 — Snapshot tools.
//
// All four tools are REAL:
//   - `dosbox_list_saves`: filesystem listing under tools/dosbox/save/.
//   - `dosbox_save_state` / `dosbox_load_state`: drive DOSBox-X's stock
//     F12+./F12+,/F12+s/F12+l host-key chords via the Swift helper.
//   - `dosbox_screenshot`: send F12+p to DOSBox-X, poll the captures
//     directory for the newest PNG, return the bytes inline.
//
// The dynamic-driving tools depend on a running DOSBox-X window on macOS —
// they spawn a long-lived Swift helper to synthesise CGEvent key events and
// focus the DOSBox-X window. See dosbox/{helper-client,input,window,
// screenshot,state}.ts.

import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getHelperClient, type McpContext } from '../context.js';
import { resolveCapturesDir } from '../dosbox/captures-dir.js';
import { captureScreenshot } from '../dosbox/screenshot.js';
import { waitForStableFrame } from '../dosbox/stable-frame.js';
import { loadStateFromSlot, saveStateToSlot } from '../dosbox/state.js';
import {
  errorResult,
  imageResult,
  jsonResult,
  safeHandler,
  type ImageToolResult,
  type JsonToolResult,
} from '../tool-result.js';

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
      description:
        'Save DOSBox-X state to slot N (1..10) by driving F12+. (cycle next) / ' +
        'F12+, (cycle prev) to navigate, then F12+s (save) on the focused window. ' +
        'Waits for tools/dosbox/save/N.sav mtime to advance before returning. ' +
        'Prior window focus is restored on exit.',
      inputSchema: {
        slot: z.number().int().min(1).max(10).describe('Save slot index (1..10).'),
        source: z
          .string()
          .optional()
          .describe('Optional human label for the save. Currently informational.'),
      },
    },
    safeHandler(async ({ slot }): Promise<JsonToolResult> => {
      try {
        await saveStateToSlot(getHelperClient(), slot, ctx.savesDir);
        return jsonResult({ ok: true, slot, path: join(ctx.savesDir, `${slot}.sav`) });
      } catch (e) {
        return errorResult(`dosbox_save_state: ${(e as Error).message}`);
      }
    }),
  );

  server.registerTool(
    'dosbox_load_state',
    {
      description:
        'Load DOSBox-X state from slot N (1..10) by driving F12+. / F12+, ' +
        '(cycle) and F12+l (load) on the focused window. Prior window focus ' +
        'is restored on exit.',
      inputSchema: {
        slot: z.number().int().min(1).max(10).describe('Save slot index (1..10).'),
      },
    },
    safeHandler(async ({ slot }): Promise<JsonToolResult> => {
      try {
        await loadStateFromSlot(getHelperClient(), slot);
        return jsonResult({ ok: true, slot });
      } catch (e) {
        return errorResult(`dosbox_load_state: ${(e as Error).message}`);
      }
    }),
  );

  server.registerTool(
    'dosbox_screenshot',
    {
      description:
        'Capture the current DOSBox-X frame as PNG. Drives F12+p on the ' +
        'focused window, polls captures= from tools/dosbox/wiz6.conf ' +
        'for the newest .png, and returns the bytes inline as an image content ' +
        'block. Prior window focus is restored on exit. ' +
        'Pass settle=true to wait until N consecutive frames are byte-identical ' +
        'before returning (useful when capturing mid-transition screens).',
      inputSchema: {
        save: z
          .string()
          .optional()
          .describe(
            'Currently informational — screenshots capture the live emulator frame, not a save state.',
          ),
        settle: z
          .boolean()
          .optional()
          .describe(
            'When true, poll until N consecutive frames are byte-identical before returning. ' +
            'Defaults to false (single capture).',
          ),
        stableCount: z
          .number()
          .int()
          .min(2)
          .optional()
          .describe('Number of consecutive identical frames required when settle=true (default 3).'),
      },
    },
    safeHandler(async ({ settle, stableCount }): Promise<ImageToolResult | JsonToolResult> => {
      try {
        const capturesDir = resolveCapturesDir(ctx.configPath);
        const client = getHelperClient();
        const bytes = settle
          ? await waitForStableFrame(() => captureScreenshot(client, capturesDir), {
              stableCount: stableCount ?? 3,
            })
          : await captureScreenshot(client, capturesDir);
        return imageResult(bytes, 'image/png');
      } catch (e) {
        return errorResult(`dosbox_screenshot: ${(e as Error).message}`);
      }
    }),
  );
}
