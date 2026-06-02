// Live tools — drive + inspect the RUNNING game via the dosbox-pure harness.
//
// The interactive face of the libretro backend (vs the save-state inspection
// tools). One persistent harness session per MCP process; streaming (one
// command) and batching (a sequence) both supported. Inspection reuses the same
// BssStruct registry as dosbox_read_struct, fed live bytes from the harness.
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../context.js';
import { safeHandler, jsonResult } from '../tool-result.js';
import { LiveSession } from '../live/live-session.js';

let session: LiveSession | null = null;
function getSession(ctx: McpContext): LiveSession {
  if (!session) session = new LiveSession(ctx.structs);
  return session;
}

const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex');

export function registerLiveTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'dosbox_live_launch',
    {
      description: 'Boot a live dosbox-pure game session (default to the title screen). ' +
        'Returns the game state. Subsequent live tools drive/inspect this session.',
      inputSchema: { bootFrames: z.number().int().positive().optional() },
    },
    safeHandler(async (args: { bootFrames?: number | undefined }) => {
      const s = getSession(ctx);
      await s.launch(args.bootFrames ?? 3000);
      return jsonResult({ ok: true, ...(await s.state()) });
    }),
  );

  server.registerTool(
    'dosbox_live_kill',
    { description: 'Terminate the live game session.', inputSchema: {} },
    safeHandler(async () => { session?.close(); session = null; return jsonResult({ ok: true }); }),
  );

  server.registerTool(
    'dosbox_live_step',
    { description: 'Advance N emulated frames.', inputSchema: { frames: z.number().int().positive() } },
    safeHandler(async (args: { frames: number }) => { await getSession(ctx).step(args.frames); return jsonResult({ ok: true }); }),
  );

  server.registerTool(
    'dosbox_live_key',
    {
      description: 'Send a key (arrows/enter/esc/space/a-z). mode: tap (default) | down | up.',
      inputSchema: { key: z.string(), mode: z.enum(['down', 'up', 'tap']).optional() },
    },
    safeHandler(async (args: { key: string; mode?: 'down' | 'up' | 'tap' | undefined }) => {
      await getSession(ctx).key(args.key, args.mode ?? 'tap');
      return jsonResult({ ok: true });
    }),
  );

  server.registerTool(
    'dosbox_live_batch',
    {
      description: 'Run a batch of raw harness commands (e.g. ["key down tap","step 60","key enter tap"]); ' +
        'returns each reply in order.',
      inputSchema: { commands: z.array(z.string()) },
    },
    safeHandler(async (args: { commands: string[] }) => jsonResult({ replies: await getSession(ctx).batch(args.commands) })),
  );

  server.registerTool(
    'dosbox_live_state',
    { description: 'Live game_state + party_size + resolved DGROUP base.', inputSchema: {} },
    safeHandler(async () => jsonResult({ ...(await getSession(ctx).state()) })),
  );

  server.registerTool(
    'dosbox_live_read',
    {
      description: 'Read bytes from live memory. `address` is DGROUP-relative unless dgroupRelative=false ' +
        '(then it is a raw guest-physical address). Returns hex.',
      inputSchema: {
        address: z.number().int().nonnegative(),
        len: z.number().int().positive(),
        dgroupRelative: z.boolean().optional(),
      },
    },
    safeHandler(async (args: { address: number; len: number; dgroupRelative?: boolean | undefined }) => {
      const bytes = await getSession(ctx).read(args.address, args.len, args.dgroupRelative ?? true);
      return jsonResult({ address: args.address, len: args.len, hex: toHex(bytes) });
    }),
  );

  server.registerTool(
    'dosbox_live_read_struct',
    {
      description: 'Decode a BssStruct from live memory at a DGROUP-relative offset (e.g. ' +
        'character_record @ 0x43e8 for party slot 0). Same registry as dosbox_read_struct.',
      inputSchema: { structName: z.string(), address: z.number().int().nonnegative() },
    },
    safeHandler(async (args: { structName: string; address: number }) =>
      jsonResult({ structName: args.structName, address: args.address, decoded: await getSession(ctx).readStruct(args.structName, args.address) })),
  );

  server.registerTool(
    'dosbox_live_find',
    {
      description: 'Find a byte pattern (hex, spaces optional) in live memory; returns guest-physical offset or -1.',
      inputSchema: { hex: z.string() },
    },
    safeHandler(async (args: { hex: string }) => jsonResult({ offset: await getSession(ctx).find(args.hex) })),
  );

  server.registerTool(
    'dosbox_live_screenshot',
    {
      description: 'Capture the live 320x200 framebuffer as raw RGBA to `path`. Returns dimensions.',
      inputSchema: { path: z.string() },
    },
    safeHandler(async (args: { path: string }) => jsonResult({ path: args.path, ...(await getSession(ctx).screenshot(args.path)) })),
  );

  server.registerTool(
    'dosbox_live_serialize',
    { description: 'Save the live session state to `path`.', inputSchema: { path: z.string() } },
    safeHandler(async (args: { path: string }) => { await getSession(ctx).serialize(args.path); return jsonResult({ ok: true, path: args.path }); }),
  );
  server.registerTool(
    'dosbox_live_unserialize',
    { description: 'Restore the live session state from `path`.', inputSchema: { path: z.string() } },
    safeHandler(async (args: { path: string }) => { await getSession(ctx).unserialize(args.path); return jsonResult({ ok: true, path: args.path }); }),
  );
}
