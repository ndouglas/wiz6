// Phase 4 — Lifecycle tools.
//
// `dosbox_launch` spawns dosbox-x via DebuggerConsole and tracks the resulting
// child process. The launch itself is real; what cannot be driven from Node
// without node-pty + ncurses scraper (or a DOSBox-X TCP-debug-port patch) is
// the *debugger console* inside the running emulator. See debugger-console.ts
// for the gory details. The process lifecycle alone is enough to support
// "boot Wiz6 to a save state, run for N seconds, snapshot" workflows once
// the snapshot tools land.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { DebuggerConsole, DebuggerUnavailableError } from '../debugger-console.js';
import type { McpContext } from '../context.js';
import { errorResult, jsonResult, safeHandler } from '../tool-result.js';
import { resetSlotTracking } from '../dosbox/state.js';

const launchSchema = {
  savestate: z
    .string()
    .optional()
    .describe(
      'Optional save state name/path to boot from. Currently informational — DOSBox-X save-state autoload is configured in wiz6.conf, not via CLI args.',
    ),
  breakAtStart: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'When true, dosbox-x boots into the ncurses debugger paused at the first instruction. ' +
        'Default false. Note: on macOS the debugger is gated behind isatty(stdin); with ' +
        'breakAtStart=true from a piped child process (the realistic MCP case) the launch ' +
        'will fail with DebuggerUnavailableError. The dynamic tools (send_input, screenshot, ' +
        'save_state, load_state) route around the debugger entirely and work without it.',
    ),
  timeLimitSeconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Hard time limit; dosbox-x exits after N seconds via -time-limit.'),
};

const killSchema = {
  pid: z.number().int().positive().describe('PID returned by dosbox_launch.'),
};

const statusSchema = {
  pid: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Specific PID to query. Omit to get all tracked sessions.'),
};

export function registerLifecycleTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'dosbox_launch',
    {
      description:
        'Spawn DOSBox-X with the Wiz6 config. Returns the PID + status. Note: ' +
        'the interactive debugger inside DOSBox-X cannot be driven from Node ' +
        'without a pty + ncurses scraper (see Phase 5 stubs). This tool starts ' +
        'the process; use save-state-backed tools for memory inspection.',
      inputSchema: launchSchema,
    },
    safeHandler(async (args) => {
      const console_ = new DebuggerConsole({
        configPath: ctx.configPath,
        cwd: ctx.repoRoot,
        breakAtStart: args.breakAtStart,
        ...(args.timeLimitSeconds !== undefined && { timeLimitSeconds: args.timeLimitSeconds }),
      });
      try {
        await console_.launch();
      } catch (err) {
        if (err instanceof DebuggerUnavailableError) {
          // The process *did* start; the gate just refused the debugger.
          // Caller may still want the PID for kill-bookkeeping.
          // We can't reach the child object from outside DebuggerConsole here;
          // surface the error but keep the launched process so kill works.
          return errorResult(
            `DOSBox-X launched but debugger gate refused: ${err.message}`,
          );
        }
        throw err;
      }
      // The DebuggerConsole keeps the child internally. We need a PID for the
      // user-facing handle; we ask for it via a brittle private-field read.
      // The class doesn't expose `child.pid` directly; the cleanest exposure
      // is to keep the gate's existing API and use process.pid from inside
      // the class — but for v1 we keep it simple: read via cast.
      const innerChild = (console_ as unknown as { child: { pid?: number } | null }).child;
      const pid = innerChild?.pid ?? -1;
      if (pid < 0) {
        await console_.kill();
        return errorResult('DOSBox-X spawned but no PID assigned');
      }
      ctx.trackSession({
        pid,
        console_,
        exitCode: null,
        exitSignal: null,
        startedAt: Date.now(),
      });
      // DOSBox-X re-reads `saveslot=` from the [dosbox] config section on
      // each launch (defaults to 1). Re-anchor our slot-pointer tracker so
      // save/load chord cycling starts from the right slot.
      resetSlotTracking(1);
      return jsonResult({
        pid,
        status: 'running',
        configPath: ctx.configPath,
        note: 'Debugger driving requires Phase 9 dynamic backend (node-pty + ncurses scraper or DOSBox-X TCP patch).',
      });
    }),
  );

  server.registerTool(
    'dosbox_kill',
    {
      description: 'Terminate a previously-launched DOSBox-X. Idempotent.',
      inputSchema: killSchema,
    },
    safeHandler(async (args) => {
      const session = ctx.getSession(args.pid);
      if (!session) {
        return errorResult(`no tracked session with pid=${args.pid}`);
      }
      await session.console_.kill();
      ctx.removeSession(args.pid);
      return jsonResult({ ok: true, pid: args.pid });
    }),
  );

  server.registerTool(
    'dosbox_status',
    {
      description:
        'Get the running/exited status of a launched DOSBox-X process. ' +
        'Omit `pid` to list all tracked sessions.',
      inputSchema: statusSchema,
    },
    safeHandler(async (args) => {
      if (args.pid === undefined) {
        const sessions = ctx.listSessions().map((s) => ({
          pid: s.pid,
          running: s.console_.running,
          startedAt: new Date(s.startedAt).toISOString(),
        }));
        return jsonResult({ sessions });
      }
      const session = ctx.getSession(args.pid);
      if (!session) {
        return jsonResult({ running: false, tracked: false, pid: args.pid });
      }
      return jsonResult({
        running: session.console_.running,
        tracked: true,
        pid: args.pid,
        startedAt: new Date(session.startedAt).toISOString(),
      });
    }),
  );
}
