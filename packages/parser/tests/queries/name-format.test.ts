import { describe, expect, it } from 'vitest';
import { expandOfLigature } from '../../src/queries/name-format.js';

describe('expandOfLigature', () => {
  it('replaces = between two words with OF', () => {
    expect(expandOfLigature('KNIGHT=DEATH')).toBe('KNIGHT OF DEATH');
    expect(expandOfLigature('GUARDIAN=ROCK')).toBe('GUARDIAN OF ROCK');
    expect(expandOfLigature('HELLCAT=FIRE')).toBe('HELLCAT OF FIRE');
  });

  it('handles multi-word right side', () => {
    expect(expandOfLigature('BOOK=THE DAMNED')).toBe('BOOK OF THE DAMNED');
    expect(expandOfLigature('KEY=WIZARD CAVE')).toBe('KEY OF WIZARD CAVE');
  });

  it('handles multiple = in one string', () => {
    // synthetic; real data likely doesn't have this but the function should be safe
    expect(expandOfLigature('A=B=C')).toBe('A OF B OF C');
  });

  it('handles leading or trailing =', () => {
    expect(expandOfLigature('=DEATH')).toBe('OF DEATH');
    expect(expandOfLigature('KNIGHT=')).toBe('KNIGHT OF');
  });

  it('collapses extra whitespace', () => {
    expect(expandOfLigature('A  =  B')).toBe('A OF B');
  });

  it('passes through unaffected strings', () => {
    expect(expandOfLigature('GIANT RAT')).toBe('GIANT RAT');
    expect(expandOfLigature('')).toBe('');
    expect(expandOfLigature('PIT FIEND')).toBe('PIT FIEND');
  });
});
