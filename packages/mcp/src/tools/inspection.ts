// Phase 6 — Inspection tools.
//
// Most of these are REAL against save-state snapshots via SaveStateBridge.
// A few (palette registers, live CPU registers, call chain) are STUBS
// because they need data DOSBox-X stores in its hardware-state blob that
// we haven't decoded a parser for. They're documented inline.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { decodeBssStruct, PALETTE_CATALOG } from '@wiz6/data';

import type { McpContext } from '../context.js';
import { dgroupOffsetToPhysical, resolveDgroupBase } from '../dgroup.js';
import {
  bytesToHexPairs,
  errorResult,
  jsonResult,
  safeHandler,
  type JsonToolResult,
} from '../tool-result.js';
import { parseVgaPaletteFromSave } from '../vga-palette.js';

// ---------------------------------------------------------------------------
// Game-state table — copied from CLAUDE.md "Engine architecture" section.
// Keeping it inline here means the MCP server doesn't depend on docs/ being
// parsed at runtime. The values + handler overlays match the CLAUDE.md table
// verbatim; update both if the table evolves.
// ---------------------------------------------------------------------------

interface GameStateEntry {
  value: number;
  overlay: string;
  description: string;
}

const GAME_STATE_TABLE: readonly GameStateEntry[] = [
  { value: 0x00, overlay: 'winit.ovr', description: 'Load disk headers' },
  { value: 0x01, overlay: 'winit.ovr', description: 'Title page + credits' },
  { value: 0x02, overlay: 'winit.ovr', description: 'Load fonts/portraits + create UI' },
  { value: 0x04, overlay: 'wbase.ovr', description: 'Main menu' },
  { value: 0x05, overlay: 'wmaze.ovr', description: 'Dungeon traversal' },
  { value: 0x06, overlay: 'wmaze.ovr', description: 'Dungeon traversal' },
  { value: 0x08, overlay: 'winit.ovr', description: 'Graveyard / TPK recovery' },
  { value: 0x0a, overlay: 'wmele.ovr', description: 'Combat: init encounter' },
  { value: 0x0b, overlay: 'wmele.ovr', description: 'Combat: per-round redraw' },
  { value: 0x0c, overlay: 'wpops.ovr', description: 'Combat: action selection' },
  { value: 0x0d, overlay: 'wmexe.ovr', description: 'Combat: action resolution' },
  { value: 0x0e, overlay: 'wmele.ovr', description: 'Combat: end-of-round cleanup' },
  { value: 0x0f, overlay: 'wtrea.ovr', description: 'Post-combat treasure' },
  { value: 0x11, overlay: 'wpcvw.ovr', description: 'Character view' },
  { value: 0x13, overlay: 'wdopt.ovr', description: 'Dungeon: cast spell' },
  { value: 0x14, overlay: 'wdopt.ovr', description: 'Dungeon: use item' },
  { value: 0x15, overlay: 'wtrea.ovr', description: 'In-dungeon chest encounter' },
  { value: 0x16, overlay: 'wpcvw.ovr', description: 'Post-combat bulk level-up' },
  { value: 0x17, overlay: 'wmaze.ovr', description: 'Dungeon traversal' },
];

const GAME_STATE_MAP = new Map<number, GameStateEntry>(
  GAME_STATE_TABLE.map((e) => [e.value, e]),
);

const GAME_STATE_DGROUP_OFFSET = 0x363a;
const PARTY_SIZE_DGROUP_OFFSET = 0x43ce;
const PARTY_ARRAY_DGROUP_OFFSET = 0x43e8;
const CHARACTER_RECORD_STRIDE = 0x1b0;
const MAX_PARTY_SLOTS = 6;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

const STUB_REGISTERS_MESSAGE =
  'CPU register decoding from DOSBox-X save states requires a parser for the ' +
  'multi-MB CPU blob layout, which is version-sensitive and not yet written. ' +
  'For live registers, the dynamic-driving backend (Phase 9) is the right path.';

const STUB_CALL_CHAIN_MESSAGE =
  'Call-chain walking requires live CPU + stack memory, both of which need the ' +
  'dynamic-driving backend. Tracked as a follow-up to #017 Phase 6.';

export function registerInspectionTools(server: McpServer, ctx: McpContext): void {
  // -------- dosbox_read_memory --------------------------------------------
  server.registerTool(
    'dosbox_read_memory',
    {
      description:
        'Read raw physical-memory bytes from a save state. Returns space-separated ' +
        'lowercase hex pairs. Use `dosbox_read_struct` for typed reads.',
      inputSchema: {
        save: z.string().describe('Save state path, filename, or slot number.'),
        offset: z.number().int().nonnegative().describe('Physical-memory offset.'),
        len: z.number().int().positive().describe('Byte count.'),
      },
    },
    safeHandler((args): JsonToolResult => {
      const { bridge } = ctx.bridgeFor(args.save);
      const bytes = bridge.readPhysical(args.offset, args.len);
      return jsonResult({
        offset: args.offset,
        len: args.len,
        bytes_hex: bytesToHexPairs(bytes),
      });
    }),
  );

  // -------- dosbox_read_struct --------------------------------------------
  server.registerTool(
    'dosbox_read_struct',
    {
      description:
        'Decode a BssStruct from save-state memory. Address may be given as a ' +
        'DGROUP-relative offset (`address`) or resolved via `symbolName` ' +
        '(looked up in the SymbolIndex). Returns the decoded fields + source provenance.',
      inputSchema: {
        save: z.string().describe('Save state path, filename, or slot number.'),
        structName: z
          .string()
          .describe('BssStruct name, e.g. "character_record", "sound_table_entry".'),
        address: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe('DGROUP-relative offset (preferred when known).'),
        symbolName: z
          .string()
          .optional()
          .describe('Symbol name to resolve via the SymbolIndex (alternative to `address`).'),
        binary: z
          .string()
          .optional()
          .describe('Optional binary scope for symbol lookup, e.g. "wroot.exe".'),
      },
    },
    safeHandler((args): JsonToolResult => {
      const struct = ctx.structs.get(args.structName);
      if (!struct) {
        return errorResult(
          `unknown struct: ${args.structName}. Known: ${Array.from(ctx.structs.keys()).join(', ')}`,
        );
      }
      const { bridge, absPath } = ctx.bridgeFor(args.save);

      let dgroupOffset: number;
      let source: string;
      if (args.address !== undefined) {
        dgroupOffset = args.address;
        source = `explicit address 0x${args.address.toString(16)}`;
      } else if (args.symbolName !== undefined) {
        const matches = ctx.symbols.allByName(args.symbolName);
        if (matches.length === 0) {
          return errorResult(`no symbol named ${args.symbolName}`);
        }
        const filtered = args.binary
          ? matches.filter((m) => m.binary === args.binary)
          : matches;
        if (filtered.length === 0) {
          return errorResult(
            `symbol ${args.symbolName} exists but not in binary ${args.binary}`,
          );
        }
        const sym = filtered[0]!;
        dgroupOffset = sym.address;
        source = `symbol ${sym.name} (${sym.binary} @ 0x${sym.address.toString(16)})`;
      } else {
        return errorResult('must provide either `address` or `symbolName`');
      }

      const physical = dgroupOffsetToPhysical(bridge, absPath, dgroupOffset);
      const bytes = bridge.readPhysical(physical, struct.bytes);
      const decoded = decodeBssStruct(struct, bytes, 0, ctx.structs);
      return jsonResult({
        structName: struct.name,
        dgroupOffset,
        physicalOffset: physical,
        bytes: struct.bytes,
        source,
        decoded,
      });
    }),
  );

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
      return jsonResult({ count: entries.length, entries });
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

  // -------- dosbox_inspect_save -------------------------------------------
  server.registerTool(
    'dosbox_inspect_save',
    {
      description:
        'Quick summary of a save state: game state, DGROUP base, party slot names, ' +
        'memory size. Use this first to decide "is this the right save?".',
      inputSchema: {
        save: z.string().describe('Save state path, filename, or slot number.'),
      },
    },
    safeHandler((args): JsonToolResult => {
      const { bridge, absPath } = ctx.bridgeFor(args.save);
      const stat = ctx.saveStat(absPath);
      const dgroupBase = resolveDgroupBase(bridge, absPath);

      // game_state: u16 LE at DGROUP+0x363a
      const gsBytes = bridge.readPhysical(dgroupBase + GAME_STATE_DGROUP_OFFSET, 2);
      const gameState = gsBytes[0]! | (gsBytes[1]! << 8);
      const gsEntry = GAME_STATE_MAP.get(gameState);

      // party_size: u16 LE at DGROUP+0x43ce. The engine uses this as the
      // valid-slot count; clamp to MAX_PARTY_SLOTS.
      const psBytes = bridge.readPhysical(dgroupBase + PARTY_SIZE_DGROUP_OFFSET, 2);
      const rawPartySize = psBytes[0]! | (psBytes[1]! << 8);
      const partySize = Math.min(Math.max(rawPartySize, 0), MAX_PARTY_SLOTS);

      // Names: first 12 bytes of each slot (NUL-terminated ASCII).
      const partyNames: string[] = [];
      for (let i = 0; i < MAX_PARTY_SLOTS; i++) {
        const slotAddr =
          dgroupBase + PARTY_ARRAY_DGROUP_OFFSET + i * CHARACTER_RECORD_STRIDE;
        const nameBytes = bridge.readPhysical(slotAddr, 12);
        let end = 0;
        while (end < 12 && nameBytes[end] !== 0) end++;
        partyNames.push(new TextDecoder('ascii').decode(nameBytes.subarray(0, end)));
      }

      return jsonResult({
        path: absPath,
        sizeBytes: stat.sizeBytes,
        mtime: stat.mtime,
        game_state: gameState,
        game_state_hex: `0x${gameState.toString(16)}`,
        game_state_overlay: gsEntry?.overlay ?? '(unknown)',
        game_state_description: gsEntry?.description ?? '(unknown)',
        dgroup_base: dgroupBase,
        dgroup_base_hex: `0x${dgroupBase.toString(16)}`,
        party_size: partySize,
        party_size_raw: rawPartySize,
        party_names: partyNames,
      });
    }),
  );

  // -------- dosbox_find_pattern -------------------------------------------
  server.registerTool(
    'dosbox_find_pattern',
    {
      description:
        'Locate a byte pattern in save-state physical memory. Returns the first ' +
        'match offset or -1. Use for anchoring on known templates / strings.',
      inputSchema: {
        save: z.string(),
        hex: z
          .string()
          .describe('Hex pattern, e.g. "53 4f 55 4e 44 30 30 2e 53 4e 44 00".'),
      },
    },
    safeHandler((args): JsonToolResult => {
      const { bridge } = ctx.bridgeFor(args.save);
      const offset = bridge.findPattern(args.hex);
      return jsonResult({ offset, found: offset >= 0 });
    }),
  );

  // -------- dosbox_get_state_machine --------------------------------------
  server.registerTool(
    'dosbox_get_state_machine',
    {
      description:
        'Read the engine state machine: value of `*0x363a` (game_state word) + ' +
        'inferred active overlay per the dispatch table in CLAUDE.md.',
      inputSchema: {
        save: z.string(),
      },
    },
    safeHandler((args): JsonToolResult => {
      const { bridge, absPath } = ctx.bridgeFor(args.save);
      const dgroupBase = resolveDgroupBase(bridge, absPath);
      const gsBytes = bridge.readPhysical(dgroupBase + GAME_STATE_DGROUP_OFFSET, 2);
      const gameState = gsBytes[0]! | (gsBytes[1]! << 8);
      const entry = GAME_STATE_MAP.get(gameState);
      return jsonResult({
        game_state: gameState,
        game_state_hex: `0x${gameState.toString(16)}`,
        overlay_loaded: entry?.overlay ?? null,
        description: entry?.description ?? null,
        // last_transition_addr would require live CPU/stack inspection.
        last_transition_addr: null,
        note:
          entry === undefined
            ? 'Game state value not in the documented dispatch table. ' +
              'See CLAUDE.md "Engine architecture" / Overlay state machine.'
            : undefined,
      });
    }),
  );

  // -------- dosbox_read_palette_registers --------------------------------
  server.registerTool(
    'dosbox_read_palette_registers',
    {
      description:
        'Decode the VGA DAC palette from a DOSBox-X save-state Vga blob. Returns the ' +
        '256-entry DAC as RGB triples (6-bit values, 0..63) plus an optional shadow DAC ' +
        '(DOSBox-X stores two copies — stored + live). Used to answer "is wiz6-main / ' +
        'wiz6-dungeon active in this save?" by comparing DAC entries against the known ' +
        'palette tables in @wiz6/data.',
      inputSchema: { save: z.string() },
    },
    safeHandler(({ save }): JsonToolResult => {
      const savePath = ctx.resolveSavePath(save);
      const state = parseVgaPaletteFromSave(savePath);
      if (!state) {
        return errorResult(
          `dosbox_read_palette_registers: could not locate VGA DAC palette in ${savePath}. ` +
            "The Vga blob layout may have shifted in a newer DOSBox-X build; update vga-palette.ts's signature scan.",
        );
      }
      return jsonResult({
        save: savePath,
        dac_offset_in_vga_blob: state.dacOffset,
        dac: state.dac,
        note:
          'DAC values are 6-bit (0..63). To convert to 8-bit RGB, use v8 = (v6 << 2) | (v6 >> 4). ' +
          "Entries 0-15 are what wiz6-main / wiz6-dungeon palettes overwrite; compare against @wiz6/data's palette tables.",
      });
    }),
  );

  // -------- dosbox_identify_palette --------------------------------------
  server.registerTool(
    'dosbox_identify_palette',
    {
      description:
        'Compare a save state\'s live DAC (entries 0-15) against the known palette ' +
        'catalog in @wiz6/data (ega-default, wiz6-main, wiz6-dungeon). Returns the best ' +
        'match plus its distance score (sum of per-channel absolute differences). ' +
        'Distance 0 = exact match. Designed for the #Q-F investigation: feed save states ' +
        'captured at each game-state boundary, see which palette is active where.',
      inputSchema: { save: z.string() },
    },
    safeHandler(({ save }): JsonToolResult => {
      const savePath = ctx.resolveSavePath(save);
      const state = parseVgaPaletteFromSave(savePath);
      if (!state) {
        return errorResult(
          `dosbox_identify_palette: could not locate VGA DAC in ${savePath}.`,
        );
      }
      // VGA 6-bit → 8-bit via bit-replication.
      const to8 = (v6: number): number => (v6 << 2) | (v6 >> 4);
      const liveRgb8: Array<[number, number, number]> = state.dac
        .slice(0, 16)
        .map(([r, g, b]) => [to8(r), to8(g), to8(b)]);
      const matches = Object.values(PALETTE_CATALOG).map((p) => {
        let dist = 0;
        for (let i = 0; i < 16; i++) {
          const [pr, pg, pb] = p.colors[i]!;
          const [lr, lg, lb] = liveRgb8[i]!;
          dist += Math.abs(lr - pr) + Math.abs(lg - pg) + Math.abs(lb - pb);
        }
        return { name: p.name, distance: dist, exact: dist === 0 };
      });
      matches.sort((a, b) => a.distance - b.distance);
      return jsonResult({
        save: savePath,
        best_match: matches[0],
        all_candidates: matches,
        live_rgb_8bit: liveRgb8,
      });
    }),
  );

  // -------- dosbox_get_registers (STUB) -----------------------------------
  server.registerTool(
    'dosbox_get_registers',
    {
      description: '[STUB] Read CPU registers. ' + STUB_REGISTERS_MESSAGE,
      inputSchema: { save: z.string() },
    },
    () => errorResult('dosbox_get_registers: not implemented. ' + STUB_REGISTERS_MESSAGE),
  );

  // -------- dosbox_get_call_chain (STUB) ----------------------------------
  server.registerTool(
    'dosbox_get_call_chain',
    {
      description: '[STUB] Walk the call stack + resolve return addresses. ' + STUB_CALL_CHAIN_MESSAGE,
      inputSchema: {
        save: z.string(),
        depth: z.number().int().positive().optional(),
      },
    },
    () => errorResult('dosbox_get_call_chain: not implemented. ' + STUB_CALL_CHAIN_MESSAGE),
  );
}
