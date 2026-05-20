import { describe, expect, it, vi, beforeEach } from 'vitest';
import { loadFont, loadFont4bpp, loadPortraitSet, loadEgaScreen, loadMessageDb } from '../src/data-loader.js';

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

const validScreen = {
  id: 'titlepag',
  sourceFile: 'titlepag.ega',
  width: 320,
  height: 200,
  planes: [Array(8000).fill(0), Array(8000).fill(0), Array(8000).fill(0), Array(8000).fill(0)],
  trailer: Array(768).fill(0),
};

describe('loadEgaScreen', () => {
  it('fetches and validates an EGA screen JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validScreen), { status: 200 })));
    const screen = await loadEgaScreen('/screens/titlepag.json');
    expect(screen.id).toBe('titlepag');
    expect(screen.width).toBe(320);
    expect(screen.height).toBe(200);
    expect(screen.planes).toHaveLength(4);
  });

  it('throws if the fetch response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    await expect(loadEgaScreen('/missing.json')).rejects.toThrow(/404/);
  });

  it('throws if the payload does not validate against EgaScreenSchema', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 200 })));
    await expect(loadEgaScreen('/bad.json')).rejects.toThrow();
  });
});

const validMessageDb = {
  id: 'msg',
  sourceFile: 'msg.dbs',
  treeSourceFile: 'misc.hdr',
  recordCount: 1,
  records: [{ index: 0, compressedBytes: 4, decodedText: 'HELLO' }],
};

describe('loadMessageDb', () => {
  it('fetches and validates a message db', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validMessageDb), { status: 200 })));
    const db = await loadMessageDb('/messages/msg.json');
    expect(db.id).toBe('msg');
    expect(db.recordCount).toBe(1);
    expect(db.records[0]?.decodedText).toBe('HELLO');
  });

  it('throws if the fetch response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    await expect(loadMessageDb('/missing.json')).rejects.toThrow(/404/);
  });

  it('throws on a payload that does not validate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 200 })));
    await expect(loadMessageDb('/bad.json')).rejects.toThrow();
  });
});
