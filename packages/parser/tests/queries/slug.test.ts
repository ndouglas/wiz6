import { describe, expect, it } from 'vitest';
import { slugify } from '../../src/queries/slug.js';

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('GIANT RAT')).toBe('giant-rat');
  });

  it('collapses internal whitespace', () => {
    expect(slugify('GIANT   RAT')).toBe('giant-rat');
  });

  it('strips leading and trailing whitespace', () => {
    expect(slugify('  GIANT RAT  ')).toBe('giant-rat');
  });

  it('drops punctuation except hyphens between words', () => {
    expect(slugify("L'MONTES")).toBe('lmontes');
    expect(slugify('* B E L A *')).toBe('b-e-l-a');
    expect(slugify('GUARDIAN=ROCK')).toBe('guardian-rock');
    expect(slugify('AMEN-TUT-BUTT')).toBe('amen-tut-butt');
  });

  it('returns an empty string for empty input', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
  });

  it('is idempotent', () => {
    const slug = slugify('GIANT RAT');
    expect(slugify(slug)).toBe(slug);
  });
});
