import { describe, expect, it, vi, beforeEach } from 'vitest';
import { loadFont } from '../src/data-loader.js';

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
    const font = await loadFont('/extracted/fonts/wfont0.json');
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
