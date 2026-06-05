import {
  FontSchema,
  Font4bppSchema,
  PortraitSetSchema,
  type Font,
  type Font4bpp,
  type PortraitSet,
} from '@wiz6/data';
import { EgaScreenSchema, type EgaScreen } from '@wiz6/data';
import { MessageDbSchema, type MessageDb } from '@wiz6/data';
import { NewgameDbSchema, type NewgameDb } from '@wiz6/data';
import { ScenarioDbSchema, type ScenarioDb } from '@wiz6/data';
import { DungeonLevelSchema, type DungeonLevel } from '@wiz6/data';
import {
  decodeMazeAssets,
  type MazeAssetsRaw,
  type CapturedSpansTable,
  type NewgameViewports,
} from '@wiz6/parser';
import { type MazeRenderAssets } from '@wiz6/data';

export async function loadFont(url: string): Promise<Font> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  const json: unknown = await response.json();
  return FontSchema.parse(json);
}

export async function loadFont4bpp(url: string): Promise<Font4bpp> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  const json: unknown = await response.json();
  return Font4bppSchema.parse(json);
}

export async function loadPortraitSet(url: string): Promise<PortraitSet> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  const json: unknown = await response.json();
  return PortraitSetSchema.parse(json);
}

export async function loadEgaScreen(url: string): Promise<EgaScreen> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load EGA screen from ${url}: ${res.status}`);
  }
  const data: unknown = await res.json();
  return EgaScreenSchema.parse(data);
}

export async function loadMessageDb(url: string): Promise<MessageDb> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load message db from ${url}: ${res.status}`);
  }
  const data: unknown = await res.json();
  return MessageDbSchema.parse(data);
}

export async function loadNewgameDb(url: string): Promise<NewgameDb> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load newgame db from ${url}: ${res.status}`);
  }
  const data: unknown = await res.json();
  return NewgameDbSchema.parse(data);
}

export async function loadScenarioDb(url: string): Promise<ScenarioDb> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load scenario db from ${url}: ${res.status}`);
  }
  const data: unknown = await res.json();
  return ScenarioDbSchema.parse(data);
}

/**
 * Browser loader for the maze render assets (atlas + piece descriptors). Fetches
 * the committed extracted/maze/assets.json (served via Vite publicDir) and decodes
 * it via the shared isomorphic decoder — no node:zlib, byte-identical to the
 * node-side loadMazeAssets().
 */
export async function loadMazeAssets(): Promise<MazeRenderAssets> {
  const url = '/maze/assets.json';
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load maze assets from ${url}: ${res.status}`);
  }
  const data = (await res.json()) as MazeAssetsRaw;
  return decodeMazeAssets(data);
}

/**
 * Browser loader for the Task-C2 captured wall spans (per-view-config engine-
 * settled span lists). Fetches the committed extracted/maze/wall-spans.json
 * (served via Vite publicDir). Passed into renderMazeViewport as opts.capturedSpans
 * so the live render shows the 15 byte-exact view-cases (best-efforts the rest).
 * Loaded as-is — same shape as tools/parity/fixtures/engine/maze-wall-spans.json.
 */
export async function loadMazeWallSpans(): Promise<CapturedSpansTable> {
  const url = '/maze/wall-spans.json';
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load maze wall spans from ${url}: ${res.status}`);
  }
  const data: unknown = await res.json();
  // CapturedSpansTable is an internal pipeline type (not a persisted @wiz6/data
  // domain schema), so we fail-fast on the shape at this I/O boundary rather than
  // accept a raw cast — a malformed committed fixture should surface here, not as
  // a silently-wrong render. (The lookup is graceful on a missing CASE, but the
  // TABLE itself must be well-formed.)
  const cases = (data as { cases?: unknown })?.cases;
  if (
    !cases ||
    !Array.isArray(cases) ||
    !cases.every(
      (c) =>
        c &&
        typeof (c as { configKey?: unknown }).configKey === 'string' &&
        Array.isArray((c as { spans?: unknown }).spans),
    )
  ) {
    throw new Error(`Malformed maze wall spans from ${url}: expected { cases: CapturedSpanCase[] }`);
  }
  return data as CapturedSpansTable;
}

/**
 * Browser loader for the scripted-entry oracle viewports (Task 2). Fetches the
 * committed extracted/maze/newgame-viewports.json (served via Vite publicDir)
 * and decodes each base64 entry into a Uint8Array (176×112 palette-index buffer).
 *
 * Returns a Record<number, Uint8Array> keyed by gy (117..121). The viewer passes
 * this to oracleViewportForGy() to composite the gate pixels during the scripted
 * entry sequence instead of the live renderer (which cannot draw the banked gate
 * byte-exact).
 */
export async function loadNewgameViewports(): Promise<NewgameViewports> {
  const url = '/maze/newgame-viewports.json';
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load newgame viewports from ${url}: ${res.status}`);
  }
  const data: unknown = await res.json();
  // Fail-fast guard: must be an object with string keys whose values are base64
  // strings (each decoding to exactly VW*VH = 19712 bytes).
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`Malformed newgame viewports from ${url}: expected Record<string, base64>`);
  }
  const VW = 176, VH = 112;
  const EXPECTED = VW * VH;
  const out: NewgameViewports = {};
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    const gy = Number(key);
    if (!Number.isFinite(gy)) {
      throw new Error(`Malformed newgame viewports from ${url}: non-numeric key "${key}"`);
    }
    if (typeof val !== 'string') {
      throw new Error(`Malformed newgame viewports from ${url}: gy=${gy} value is not a string`);
    }
    const buf = Uint8Array.from(atob(val), (c) => c.charCodeAt(0));
    if (buf.length !== EXPECTED) {
      throw new Error(
        `Malformed newgame viewports from ${url}: gy=${gy} buffer length ${buf.length}, expected ${EXPECTED}`,
      );
    }
    out[gy] = buf;
  }
  return out;
}

export async function loadDungeonLevel(id: number): Promise<DungeonLevel> {
  const url = `/maze/level-${id}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load dungeon level ${id} from ${url}: ${res.status}`);
  }
  const data: unknown = await res.json();
  return DungeonLevelSchema.parse(data);
}
