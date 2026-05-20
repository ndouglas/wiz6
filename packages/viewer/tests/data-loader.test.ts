import { describe, expect, it, vi, beforeEach } from 'vitest';
import { loadFont, loadFont4bpp, loadPortraitSet } from '../src/data-loader.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

const validFont = {
  id: 'wfont0',
  sourceFile: 'wfont0.ega',
  glyphCount: 1,
  glyphs: [[0, 0, 0, 0, 0, 0, 0, 0]],
};

describe('loadFont', () => {
  it('fetches the JSON and returns a typed Font', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validFont), { status: 200 })));
    const font = await loadFont('/fonts/wfont0.json');
    expect(font.id).toBe('wfont0');
    expect(font.glyphCount).toBe(1);
  });

  it('throws if the fetch response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    await expect(loadFont('/missing.json')).rejects.toThrow(/404/);
  });

  it('throws if the payload does not validate against the schema', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 200 })));
    await expect(loadFont('/bad.json')).rejects.toThrow();
  });
});

const valid4bppFont = {
  id: 'wfont1',
  sourceFile: 'wfont1.ega',
  glyphCount: 1,
  glyphs: [Array(32).fill(0)],
};

describe('loadFont4bpp', () => {
  it('fetches and validates a 4bpp font JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(valid4bppFont), { status: 200 })));
    const font = await loadFont4bpp('/fonts/wfont1.json');
    expect(font.id).toBe('wfont1');
    expect(font.glyphCount).toBe(1);
  });

  it('throws if the fetch response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    await expect(loadFont4bpp('/missing.json')).rejects.toThrow(/404/);
  });

  it('throws if the payload does not validate against Font4bppSchema', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 200 })));
    await expect(loadFont4bpp('/bad.json')).rejects.toThrow();
  });
});

const validPortraitSet = {
  id: 'wport1',
  sourceFile: 'wport1.ega',
  portraitCount: 1,
  portraits: [
    {
      index: 0,
      tiles: Array.from({ length: 9 }, () => Array(32).fill(0)),
    },
  ],
};

describe('loadPortraitSet', () => {
  it('fetches and validates a portrait set JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validPortraitSet), { status: 200 })));
    const set = await loadPortraitSet('/portraits/wport1.json');
    expect(set.id).toBe('wport1');
    expect(set.portraitCount).toBe(1);
  });

  it('throws if the fetch response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    await expect(loadPortraitSet('/missing.json')).rejects.toThrow(/404/);
  });

  it('throws if the payload does not validate against PortraitSetSchema', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 200 })));
    await expect(loadPortraitSet('/bad.json')).rejects.toThrow();
  });
});
