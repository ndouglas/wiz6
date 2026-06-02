// End-to-end test for the MCP server (dosbox-pure / live backend).
//
// Spawns the server + an in-process client via InMemoryTransport.createLinkedPair,
// then exercises the remaining tool surface:
//
//   - tools/list returns every expected tool name (live + symbol tools only)
//   - dosbox_resolve_symbol finds ui_window_create at wroot 0x11A (no emulator)
//   - dosbox_list_symbols returns bounded entries (no emulator)
//   - a live smoke (launch → step → state → read_struct) driven through the
//     registered MCP handlers, gated on the built `./host` harness binary.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { buildServer } from '../src/server.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
// The live harness binary, built by tools/libretro/build.sh. The live smoke is
// gated on it existing so the suite stays green on a fresh checkout / CI box
// that hasn't built the core.
const HOST_BIN = resolve(REPO_ROOT, 'tools', 'libretro', 'host');
const haveHost = existsSync(HOST_BIN);

// Names every tool registration should expose. Updated alongside src/tools/*.
const EXPECTED_TOOL_NAMES = [
  // symbols (backend-agnostic SymbolIndex)
  'dosbox_resolve_symbol',
  'dosbox_list_symbols',
  // live (dosbox-pure harness)
  'dosbox_live_launch',
  'dosbox_live_kill',
  'dosbox_live_step',
  'dosbox_live_key',
  'dosbox_live_batch',
  'dosbox_live_state',
  'dosbox_live_read',
  'dosbox_live_read_struct',
  'dosbox_live_find',
  'dosbox_live_screenshot',
  'dosbox_live_serialize',
  'dosbox_live_unserialize',
];

interface ToolTextContent {
  type: 'text';
  text: string;
}

interface ToolCallResultLike {
  content: ToolTextContent[];
  structuredContent?: unknown;
  isError?: boolean;
}

function parseJsonContent(result: ToolCallResultLike): unknown {
  expect(result.content.length).toBeGreaterThan(0);
  const text = result.content[0]!.text;
  return JSON.parse(text);
}

describe('MCP server end-to-end', () => {
  let client: Client;
  let serverClose: () => Promise<void>;

  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const { server } = buildServer({ cwd: REPO_ROOT });
    await server.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);
    serverClose = async () => {
      await server.close();
    };
  });

  afterAll(async () => {
    if (haveHost) {
      // Tear down the live session the smoke may have launched.
      await client.callTool({ name: 'dosbox_live_kill', arguments: {} }).catch(() => {});
    }
    if (serverClose) await serverClose();
  });

  it('lists exactly the expected tool surface', async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();
    for (const expected of EXPECTED_TOOL_NAMES) {
      expect(names, `missing tool: ${expected}`).toContain(expected);
    }
    // No leftover save-state / GUI-driving tools.
    expect(names).not.toContain('dosbox_inspect_save');
    expect(names).not.toContain('dosbox_read_memory');
    expect(names).not.toContain('dosbox_launch');
    expect(names).not.toContain('dosbox_set_breakpoint');
    expect(names).not.toContain('dosbox_list_saves');
  });

  it('dosbox_resolve_symbol finds ui_window_create at wroot 0x11A', async () => {
    const result = (await client.callTool({
      name: 'dosbox_resolve_symbol',
      arguments: { name: 'ui_window_create' },
    })) as ToolCallResultLike;
    expect(result.isError).not.toBe(true);
    const payload = parseJsonContent(result) as {
      count: number;
      entries: { binary: string; address: number; name: string }[];
    };
    expect(payload.count).toBeGreaterThan(0);
    const wrootEntry = payload.entries.find((e) => e.binary === 'wroot.exe');
    expect(wrootEntry).toBeDefined();
    expect(wrootEntry!.address).toBe(0x11a);
  });

  it('dosbox_list_symbols returns bounded entries', async () => {
    const result = (await client.callTool({
      name: 'dosbox_list_symbols',
      arguments: { binary: 'wroot.exe', limit: 5 },
    })) as ToolCallResultLike;
    expect(result.isError).not.toBe(true);
    const payload = parseJsonContent(result) as {
      count: number;
      entries: { binary: string }[];
    };
    expect(payload.count).toBeLessThanOrEqual(5);
    expect(payload.entries.every((e) => e.binary === 'wroot.exe')).toBe(true);
  });

  it.skipIf(!haveHost)(
    'live smoke: launch → step → state → read_struct via registered handlers',
    async () => {
      const launch = (await client.callTool({
        name: 'dosbox_live_launch',
        arguments: { bootFrames: 3000 },
      })) as ToolCallResultLike;
      expect(launch.isError).not.toBe(true);
      const launchPayload = parseJsonContent(launch) as { ok: boolean; gameState: number };
      expect(launchPayload.ok).toBe(true);

      const step = (await client.callTool({
        name: 'dosbox_live_step',
        arguments: { frames: 60 },
      })) as ToolCallResultLike;
      expect(step.isError).not.toBe(true);

      const state = (await client.callTool({
        name: 'dosbox_live_state',
        arguments: {},
      })) as ToolCallResultLike;
      expect(state.isError).not.toBe(true);
      const statePayload = parseJsonContent(state) as { dgroupBase: number; gameState: number };
      expect(statePayload.dgroupBase).toBeGreaterThan(0);

      // read_struct reuses the shared BssStruct registry against live bytes.
      const rs = (await client.callTool({
        name: 'dosbox_live_read_struct',
        arguments: { structName: 'sound_table_entry', address: 0x3344 },
      })) as ToolCallResultLike;
      expect(rs.isError).not.toBe(true);
      const rsPayload = parseJsonContent(rs) as { structName: string; decoded: unknown };
      expect(rsPayload.structName).toBe('sound_table_entry');
      expect(rsPayload.decoded).toBeTruthy();
    },
    60_000,
  );
});
