import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import {
  decodePic,
  renderPicDescriptor,
  concatenatePicSegments,
} from '@wiz6/parser';
import { EGA_DEFAULT, type Pic } from '@wiz6/data';
import { encodePngRgba, encodeContactSheetPng } from '../lib/png.js';

export interface ExtractPicOpts {
  originalPath: string;
  outputPath: string;
  id: string;
  /** When true, also write rendered PNGs for each descriptor + a contact sheet. */
  emitPngs?: boolean;
}

export function extractPic(opts: ExtractPicOpts): Pic {
  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const decoded = decodePic(bytes, {
    id: opts.id,
    sourceFile: basename(opts.originalPath),
  });
  // .pic sprites render against the BIOS-default EGA palette; the renderer
  // permutes file bit-patterns via EGA_FILE_INDEX_PERMUTATION. See
  // docs/re/palette-discovery.md.
  const pic: Pic = { ...decoded, palette: 'ega-default' };
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(pic, null, 2));

  if (opts.emitPngs !== false) {
    const buffer = concatenatePicSegments(pic.segments);
    const pngDir = join(dirname(opts.outputPath), opts.id);
    mkdirSync(pngDir, { recursive: true });
    const sprites = pic.descriptors.map((d) => renderPicDescriptor(d, buffer, EGA_DEFAULT));
    for (let i = 0; i < sprites.length; i++) {
      const sprite = sprites[i]!;
      const padded = String(i).padStart(2, '0');
      const png = encodePngRgba(sprite.width, sprite.height, sprite.rgba);
      writeFileSync(join(pngDir, `desc-${padded}.png`), png);
    }
    if (sprites.length > 0) {
      const sheet = encodeContactSheetPng(sprites, { cols: 4, gap: 8 });
      writeFileSync(join(pngDir, 'sheet.png'), sheet);
    }
  }

  return pic;
}
