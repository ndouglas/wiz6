import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { EgaScreen, Palette } from '@wiz6/data';
import { decodeEgaScreen, renderEgaScreen } from '@wiz6/parser';
import { encodePngRgba } from '../lib/png.js';

export interface ExtractEgaScreenOpts {
  originalPath: string;
  outputPath: string;
  id: string;
  /** When true (default), also write a PNG render alongside the JSON. */
  emitPng?: boolean;
  /** Palette for PNG rendering. Defaults to standard EGA hardware palette. */
  palette?: Palette;
}

const HARDWARE_EGA_PALETTE: Palette = {
  name: 'ega-hardware-default',
  provenance: 'IBM EGA standard 16-color hardware default; used as fallback for PNG rendering when no palette is otherwise specified.',
  colors: [
    [0x00, 0x00, 0x00],
    [0x00, 0x00, 0xaa],
    [0x00, 0xaa, 0x00],
    [0x00, 0xaa, 0xaa],
    [0xaa, 0x00, 0x00],
    [0xaa, 0x00, 0xaa],
    [0xaa, 0x55, 0x00],
    [0xaa, 0xaa, 0xaa],
    [0x55, 0x55, 0x55],
    [0x55, 0x55, 0xff],
    [0x55, 0xff, 0x55],
    [0x55, 0xff, 0xff],
    [0xff, 0x55, 0x55],
    [0xff, 0x55, 0xff],
    [0xff, 0xff, 0x55],
    [0xff, 0xff, 0xff],
  ],
};

export function extractEgaScreen(opts: ExtractEgaScreenOpts): EgaScreen {
  const bytes = new Uint8Array(readFileSync(opts.originalPath));
  const decoded = decodeEgaScreen(bytes, {
    id: opts.id,
    sourceFile: basename(opts.originalPath),
  });
  const screen: EgaScreen = { ...decoded, palette: 'wiz6-main' };
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, JSON.stringify(screen, null, 2));

  if (opts.emitPng !== false) {
    const palette = opts.palette ?? HARDWARE_EGA_PALETTE;
    const rendered = renderEgaScreen(screen, palette);
    const pngPath = join(dirname(opts.outputPath), `${opts.id}.png`);
    writeFileSync(pngPath, encodePngRgba(rendered.width, rendered.height, rendered.rgba));
  }

  return screen;
}
