import { describe, expect, it } from 'vitest';
import { normalizeBounds } from './bounds';

describe('normalizeBounds', () => {
  it('passes a normal box straight through', () => {
    expect(normalizeBounds([-122, 36, -121, 37])).toEqual([
      [-122, 36],
      [-121, 37],
    ]);
  });

  it('rejects a box with any non-finite coordinate', () => {
    expect(normalizeBounds([Number.NaN, 0, 1, 1])).toBeNull();
    expect(normalizeBounds([0, 0, Number.POSITIVE_INFINITY, 1])).toBeNull();
  });

  it('fits an antimeridian-crossing box by unwrapping east past west', () => {
    const corners = normalizeBounds([170, 0, -170, 10]);
    expect(corners).not.toBeNull();
    const [[w], [e]] = corners as [[number, number], [number, number]];
    expect(w).toBe(170);
    expect(e).toBe(190);
    expect(e).toBeGreaterThan(w);
  });

  it('pads a zero-area point box so it has a real extent', () => {
    const corners = normalizeBounds([5, 5, 5, 5]);
    expect(corners).not.toBeNull();
    const [[w, s], [e, n]] = corners as [[number, number], [number, number]];
    expect(w).toBeLessThan(5);
    expect(e).toBeGreaterThan(5);
    expect(s).toBeLessThan(5);
    expect(n).toBeGreaterThan(5);
  });
});
