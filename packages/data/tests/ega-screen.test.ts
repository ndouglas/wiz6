import { describe, expect, it } from 'vitest';
import { EgaScreenSchema } from '../src/schemas/ega-screen.js';

const validPlane = Array(8000).fill(0);
const validTrailer = Array(256).fill(0);

const validScreen = {
  id: 'titlepag',
  sourceFile: 'titlepag.ega',
  width: 320,
  height: 200,
  planes: [validPlane, validPlane, validPlane, validPlane],
  trailer: validTrailer,
};

describe('EgaScreenSchema', () => {
  it('accepts a valid screen', () => {
    expect(() => EgaScreenSchema.parse(validScreen)).not.toThrow();
  });

  it('rejects when there are not exactly 4 planes', () => {
    expect(() => EgaScreenSchema.parse({ ...validScreen, planes: [validPlane, validPlane, validPlane] })).toThrow();
  });

  it('rejects when a plane is not 8000 bytes', () => {
    const shortPlane = Array(7999).fill(0);
    expect(() => EgaScreenSchema.parse({ ...validScreen, planes: [shortPlane, validPlane, validPlane, validPlane] })).toThrow();
  });

  it('rejects when trailer is not 256 bytes', () => {
    expect(() => EgaScreenSchema.parse({ ...validScreen, trailer: Array(255).fill(0) })).toThrow();
  });

  it('rejects when width is not 320', () => {
    expect(() => EgaScreenSchema.parse({ ...validScreen, width: 321 })).toThrow();
  });

  it('rejects when height is not 200', () => {
    expect(() => EgaScreenSchema.parse({ ...validScreen, height: 201 })).toThrow();
  });

  it('rejects a byte > 255 in a plane', () => {
    const badPlane = [...validPlane];
    badPlane[0] = 256;
    expect(() => EgaScreenSchema.parse({ ...validScreen, planes: [badPlane, validPlane, validPlane, validPlane] })).toThrow();
  });

  it('rejects an empty id', () => {
    expect(() => EgaScreenSchema.parse({ ...validScreen, id: '' })).toThrow();
  });
});
