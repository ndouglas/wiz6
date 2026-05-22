import { deflateSync } from 'node:zlib';

// Minimal PNG encoder for 8-bit RGBA images. Output is a valid PNG that any
// image viewer / browser can open. Used to dump rendered sprites from the
// .pic extractor so they can be inspected without booting the viewer.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function writeU32BE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  writeU32BE(out, 0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + data.length);
  writeU32BE(out, 8 + data.length, crc32(crcInput));
  return out;
}

/**
 * Encode an RGBA image into a PNG file. `rgba` is row-major, 4 bytes per pixel
 * (R, G, B, A). Output is a complete PNG byte stream including the 8-byte
 * signature.
 */
export function encodePngRgba(
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
): Uint8Array {
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `encodePngRgba: expected ${width * height * 4} bytes, got ${rgba.length}`,
    );
  }

  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = new Uint8Array(13);
  writeU32BE(ihdr, 0, width);
  writeU32BE(ihdr, 4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type 6 = truecolor + alpha
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // IDAT: prepend filter byte (0 = None) to each scanline, then deflate.
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const dstRow = y * (stride + 1);
    raw[dstRow] = 0; // filter: None
    const srcRow = y * stride;
    for (let i = 0; i < stride; i++) {
      raw[dstRow + 1 + i] = rgba[srcRow + i] ?? 0;
    }
  }
  const idatData = new Uint8Array(deflateSync(raw));
  const idatChunk = makeChunk('IDAT', idatData);

  const iendChunk = makeChunk('IEND', new Uint8Array(0));

  const total = sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const out = new Uint8Array(total);
  let off = 0;
  out.set(sig, off);
  off += sig.length;
  out.set(ihdrChunk, off);
  off += ihdrChunk.length;
  out.set(idatChunk, off);
  off += idatChunk.length;
  out.set(iendChunk, off);
  return out;
}

/**
 * Pack multiple same-or-different-sized RGBA sprites into a single contact-sheet
 * image. Sprites are laid out in a grid with `cols` columns; cells are sized to
 * fit the largest sprite, with `gap` pixels of transparent padding between cells.
 * Returns the encoded PNG bytes.
 */
export function encodeContactSheetPng(
  sprites: ReadonlyArray<{ width: number; height: number; rgba: Uint8Array | Uint8ClampedArray }>,
  opts: { cols?: number; gap?: number; background?: readonly [number, number, number, number] } = {},
): Uint8Array {
  const cols = opts.cols ?? 4;
  const gap = opts.gap ?? 8;
  const bg = opts.background ?? [0, 0, 0, 0xff];

  const rows = Math.ceil(sprites.length / cols);
  const cellW = sprites.reduce((m, s) => Math.max(m, s.width), 1);
  const cellH = sprites.reduce((m, s) => Math.max(m, s.height), 1);
  const sheetW = cols * cellW + (cols + 1) * gap;
  const sheetH = rows * cellH + (rows + 1) * gap;

  const sheet = new Uint8Array(sheetW * sheetH * 4);
  // Fill background.
  for (let i = 0; i < sheetW * sheetH; i++) {
    sheet[i * 4] = bg[0]!;
    sheet[i * 4 + 1] = bg[1]!;
    sheet[i * 4 + 2] = bg[2]!;
    sheet[i * 4 + 3] = bg[3]!;
  }

  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Center sprite within its cell.
    const x0 = gap + col * (cellW + gap) + Math.floor((cellW - s.width) / 2);
    const y0 = gap + row * (cellH + gap) + Math.floor((cellH - s.height) / 2);
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const srcIdx = (y * s.width + x) * 4;
        const a = s.rgba[srcIdx + 3] ?? 0;
        if (a === 0) continue; // skip transparent pixels (preserve bg)
        const dstIdx = ((y0 + y) * sheetW + (x0 + x)) * 4;
        sheet[dstIdx] = s.rgba[srcIdx] ?? 0;
        sheet[dstIdx + 1] = s.rgba[srcIdx + 1] ?? 0;
        sheet[dstIdx + 2] = s.rgba[srcIdx + 2] ?? 0;
        sheet[dstIdx + 3] = 0xff;
      }
    }
  }

  return encodePngRgba(sheetW, sheetH, sheet);
}
