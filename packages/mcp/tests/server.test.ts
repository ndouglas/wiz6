// End-to-end test for the MCP server.
//
// Spawns the server + an in-process client via InMemoryTransport.createLinkedPair,
// then exercises a representative cross-section of the tool surface:
//
//   - tools/list returns every expected tool name
//   - dosbox_inspect_save on the bundled 1.sav reports game_state=0
//   - dosbox_read_struct decodes a sound_table_entry at DGROUP 0x3344
//   - dosbox_resolve_symbol finds ui_window_create at wroot 0x11A
//   - dosbox_list_saves returns the bundled save
//   - a STUB tool surfaces isError:true with a clear message
//
// The slow live-launch path (dosbox_launch against a real DOSBox-X binary)
// is opt-in via WIZ6_MCP_SLOW=1.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { buildServer } from '../src/server.js';
import { _clearDgroupCacheForTests } from '../src/dgroup.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SAVE_STATE = resolve(REPO_ROOT, 'tools', 'dosbox', 'save', '1.sav');
const EXTRACT_SCRIPT = resolve(REPO_ROOT, 'tools', 'parity', 'extract.py');

const haveSaveState = existsSync(SAVE_STATE) && existsSync(EXTRACT_SCRIPT);

// Names every tool registration should expose. Updated alongside src/tools/*.
const EXPECTED_TOOL_NAMES = [
  // lifecycle
  'dosbox_launch',
  'dosbox_kill',
  'dosbox_status',
  // control (all stubs)
  'dosbox_send_input',
  'dosbox_pause',
  'dosbox_resume',
  'dosbox_step',
  'dosbox_step_over',
  'dosbox_run_until',
  // inspection
  'dosbox_read_memory',
  'dosbox_read_struct',
  'dosbox_resolve_symbol',
  'dosbox_list_symbols',
  'dosbox_inspect_save',
  'dosbox_find_pattern',
  'dosbox_get_state_machine',
  'dosbox_read_palette_registers',
  'dosbox_identify_palette',
  'dosbox_get_registers',
  'dosbox_get_call_chain',
  // breakpoints (all stubs)
  'dosbox_set_breakpoint',
  'dosbox_clear_breakpoint',
  'dosbox_list_breakpoints',
  // snapshots
  'dosbox_list_saves',
  'dosbox_save_state',
  'dosbox_load_state',
  'dosbox_screenshot',
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
    _clearDgroupCacheForTests();
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
    if (serverClose) await serverClose();
  });

  it('lists every expected tool', async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();
    for (const expected of EXPECTED_TOOL_NAMES) {
      expect(names, `missing tool: ${expected}`).toContain(expected);
    }
  });

  it.skipIf(!haveSaveState)(
    'dosbox_inspect_save reads main-menu state correctly from 1.sav',
    async () => {
      // 1.sav: user-captured manual save while at the Wiz6 main menu.
      // game_state should be 0x4 (wbase.ovr main menu). DGROUP base is at
      // phys 0x16B30 (paragraph-aligned, segment 0x16B3). Anchor is the
      // wroot overlay-name table at DGROUP 0x1AEE which survives all
      // overlay loads.
      const result = (await client.callTool({
        name: 'dosbox_inspect_save',
        arguments: { save: '1.sav' },
      })) as ToolCallResultLike;
      expect(result.isError).not.toBe(true);
      const payload = parseJsonContent(result) as {
        game_state: number;
        dgroup_base: number;
        party_size: number;
      };
      expect(payload.game_state).toBe(0x4);
      expect(payload.dgroup_base).toBe(0x16b30);
      expect(payload.party_size).toBe(0);
    },
  );

  it.skipIf(!haveSaveState)(
    'dosbox_read_struct decodes a sound_table_entry at DGROUP 0x3344 in 1.sav',
    async () => {
      const result = (await client.callTool({
        name: 'dosbox_read_struct',
        arguments: {
          save: '1.sav',
          structName: 'sound_table_entry',
          address: 0x3344,
        },
      })) as ToolCallResultLike;
      expect(result.isError).not.toBe(true);
      const payload = parseJsonContent(result) as {
        structName: string;
        bytes: number;
        decoded: Record<string, unknown>;
      };
      expect(payload.structName).toBe('sound_table_entry');
      expect(payload.bytes).toBe(12);
      expect(payload.decoded).toHaveProperty('alias_id');
      expect(payload.decoded).toHaveProperty('buf_lo');
      expect(payload.decoded).toHaveProperty('buf_hi');
    },
  );

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

  it.skipIf(!haveSaveState)('dosbox_list_saves enumerates 1.sav', async () => {
    const result = (await client.callTool({
      name: 'dosbox_list_saves',
      arguments: {},
    })) as ToolCallResultLike;
    expect(result.isError).not.toBe(true);
    const payload = parseJsonContent(result) as {
      saves: { path: string; slot: number | null }[];
    };
    expect(payload.saves.some((s) => s.slot === 1)).toBe(true);
  });

  it.skipIf(!haveSaveState)(
    'dosbox_identify_palette finds an exact ega-default match in 3.sav',
    async () => {
      const result = (await client.callTool({
        name: 'dosbox_identify_palette',
        arguments: { save: '3.sav' },
      })) as ToolCallResultLike;
      expect(result.isError).not.toBe(true);
      const payload = parseJsonContent(result) as {
        best_match: { name: string; distance: number; exact: boolean };
        all_candidates: { name: string; distance: number }[];
      };
      // 3.sav: autodrive-captured mid-intro, wroot loaded, DAC still at the
      // BIOS-EGA default (the engine doesn't reprogram the palette during
      // state-1 — that happens later, in main-menu / dungeon scenes which
      // the current autodrive doesn't reach).
      expect(payload.best_match.name).toBe('ega-default');
      expect(payload.best_match.distance).toBe(0);
      expect(payload.best_match.exact).toBe(true);
      const wiz6Main = payload.all_candidates.find((c) => c.name === 'wiz6-main');
      expect(wiz6Main?.distance).toBeGreaterThan(0);
    },
  );

  it('stub tool surfaces isError:true with a clear message', async () => {
    const result = (await client.callTool({
      name: 'dosbox_set_breakpoint',
      arguments: { target: 'ui_window_create' },
    })) as ToolCallResultLike;
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/not implemented/i);
  });
});
