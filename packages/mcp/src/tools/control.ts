// Phase 5 — Control tools.
//
// `dosbox_send_input` is REAL — it drives DOSBox-X by synthesising macOS key
// events via a long-lived Swift helper child process. See dosbox/input.ts and
// dosbox/helper-client.ts.
//
// The remaining tools (pause/resume/step/step_over/run_until) are still stubs
// because they require driving DOSBox-X's interactive ncurses debugger, which
// needs either node-pty + a vt100 screen scraper OR a DOSBox-X patch exposing
// a TCP debug port. Neither is in scope for v1. See:
//
//   - docs/superpowers/specs/2026-05-23-dosbox-mcp.md § "Bridge to DOSBox-X"
//   - packages/mcp/src/debugger-console.ts top-of-file rationale
//   - TODO.md #Q-G (dynamic-driving backend)

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getHelperClient, type McpContext } from '../context.js';
import { sendMacro } from '../dosbox/input.js';
import { errorResult, jsonResult, safeHandler } from '../tool-result.js';

const BLOCKED_MESSAGE =
  'Blocked on Phase 9 dynamic-driving backend. DOSBox-X uses an ncurses ' +
  'debugger UI; driving it from Node needs either node-pty + a vt100 ' +
  'screen scraper OR a DOSBox-X patch exposing a TCP debug port. See ' +
  'docs/superpowers/specs/2026-05-23-dosbox-mcp.md § "Bridge to DOSBox-X" ' +
  'and TODO.md #Q-G. Use save-state-backed inspection tools for v1.';

function stub(name: string): () => ReturnType<typeof errorResult> {
  return () => errorResult(`${name}: not implemented in v1. ${BLOCKED_MESSAGE}`);
}

export function registerControlTools(server: McpServer, _ctx: McpContext): void {
  server.registerTool(
    'dosbox_send_input',
    {
      description:
        'Send a key macro to the running DOSBox-X window. Tokens are ' +
        'whitespace-delimited (e.g. "down down enter") and case-insensitive ' +
        'aliases like "down" → ArrowDown are recognised. Quoted segments ' +
        '("hello") are expanded to per-character keystrokes. The DOSBox-X ' +
        'window is focused for the duration of the call and prior focus is ' +
        'restored on exit.',
      inputSchema: {
        keys: z.string().describe('Key macro string, e.g. "down down enter".'),
      },
    },
    safeHandler(async ({ keys }) => {
      try {
        await sendMacro(getHelperClient(), keys);
        return jsonResult({ ok: true, keysSent: keys });
      } catch (e) {
        return errorResult(`dosbox_send_input: ${(e as Error).message}`);
      }
    }),
  );

  server.registerTool(
    'dosbox_pause',
    {
      description: '[STUB] Pause the emulator. ' + BLOCKED_MESSAGE,
      inputSchema: { pid: z.number().int().positive().optional() },
    },
    stub('dosbox_pause'),
  );

  server.registerTool(
    'dosbox_resume',
    {
      description: '[STUB] Resume the emulator from a debugger break. ' + BLOCKED_MESSAGE,
      inputSchema: { pid: z.number().int().positive().optional() },
    },
    stub('dosbox_resume'),
  );

  server.registerTool(
    'dosbox_step',
    {
      description: '[STUB] Single-step the CPU. ' + BLOCKED_MESSAGE,
      inputSchema: { n: z.number().int().positive().optional().describe('Instruction count.') },
    },
    stub('dosbox_step'),
  );

  server.registerTool(
    'dosbox_step_over',
    {
      description: '[STUB] Step over the next call. ' + BLOCKED_MESSAGE,
      inputSchema: {},
    },
    stub('dosbox_step_over'),
  );

  server.registerTool(
    'dosbox_run_until',
    {
      description:
        '[STUB] Run until a condition is satisfied (e.g. *0x363a == 0x0d). ' + BLOCKED_MESSAGE,
      inputSchema: {
        condition: z.string().describe('Predicate string, e.g. "*0x363a == 0x0d".'),
      },
    },
    stub('dosbox_run_until'),
  );
}
