import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import {
  decodePic,
  renderPicDescriptor,
  concatenatePicSegments,
} from '@wiz6/parser';
import { WIZ6_MAIN, type Pic } from '@wiz6/data';
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
  // .pic sprites render through the engine's AC->DAC chain. WIZ6_MAIN is the
  // chained RGB result for the main-game scenes (verified via Vga-blob
  // inspection across all captured saves). See docs/re/palette-discovery.md
  // and docs/re/findings/menu-cursor-render-path.json.
  const pic: Pic = { ...decoded, palette: 'wiz6-main' };
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(pic, null, 2));

  if (opts.emitPngs !== false) {
    const buffer = concatenatePicSegments(pic.segments);
    const pngDir = join(dirname(opts.outputPath), opts.id);
    mkdirSync(pngDir, { recursive: true });
    const sprites = pic.descriptors.map((d) => renderPicDescriptor(d, buffer, WIZ6_MAIN));
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
