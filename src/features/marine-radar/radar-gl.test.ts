import { describe, expect, it } from 'vitest';
import { quadVertices } from './radar-gl';

describe('quadVertices', () => {
  it('covers the mercator square corners with local coords spanning -1..1', () => {
    const v = quadVertices(0.5, 0.5, 0.1);
    expect(v).toHaveLength(24);
    const xs = [v[0], v[4], v[8], v[12], v[16], v[20]];
    expect(Math.min(...xs)).toBeCloseTo(0.4, 6);
    expect(Math.max(...xs)).toBeCloseTo(0.6, 6);
    const locals = [v[2], v[6], v[10], v[14], v[18], v[22]];
    expect(Math.min(...locals)).toBeCloseTo(-1, 6);
    expect(Math.max(...locals)).toBeCloseTo(1, 6);
  });
});
