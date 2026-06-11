import { describe, it, expect } from 'vitest';
import { moveReviewCursor } from '../../src/maze/review-picker.js';
const OCC = [0, 1, 3]; // THESUS, LYSANDR, TEMPEST
describe('REVIEW WHO? picker nav (cursor -1=EXIT, 0..5=slot; clamp)', () => {
  it('matches the measured transitions', () => {
    expect(moveReviewCursor(-1, 'down', OCC)).toBe(0);
    expect(moveReviewCursor(-1, 'up', OCC)).toBe(-1);
    expect(moveReviewCursor(-1, 'left', OCC)).toBe(-1);
    expect(moveReviewCursor(0, 'down', OCC)).toBe(1);
    expect(moveReviewCursor(0, 'right', OCC)).toBe(3);
    expect(moveReviewCursor(0, 'up', OCC)).toBe(-1);
    expect(moveReviewCursor(3, 'left', OCC)).toBe(0);
    expect(moveReviewCursor(1, 'up', OCC)).toBe(0);
    expect(moveReviewCursor(1, 'down', OCC)).toBe(1); // slot2 empty -> clamp
    expect(moveReviewCursor(3, 'down', OCC)).toBe(3); // slot4 empty -> clamp
  });
});
