import { describe, expect, it } from 'vitest';
import { CAPTURE_MARGIN_M, capturedRadius, MIN_RADIUS_M } from './anchor-geometry';

describe('capturedRadius', () => {
  it('adds the margin and rounds up to a whole meter', () => {
    expect(capturedRadius(34.2)).toBe(Math.ceil(34.2 + CAPTURE_MARGIN_M));
  });

  it('never returns less than the minimum radius', () => {
    expect(capturedRadius(0)).toBeGreaterThanOrEqual(MIN_RADIUS_M);
  });
});
