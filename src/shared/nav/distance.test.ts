import { describe, expect, it } from 'vitest';
import { haversineMeters } from './distance';

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters(36.8, -121.7, 36.8, -121.7)).toBe(0);
  });

  it('measures a known short hop within a meter', () => {
    // 0.001 deg of latitude is about 111.2 m; digits=1 pins it to within ~0.05 m.
    expect(haversineMeters(0, 0, 0.001, 0)).toBeCloseTo(111.19, 1);
  });
});
