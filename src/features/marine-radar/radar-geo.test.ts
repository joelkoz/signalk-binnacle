import { describe, expect, it } from 'vitest';
import { metersToMercatorUnits, rangeQuadHalfExtent } from './radar-geo';

describe('metersToMercatorUnits', () => {
  it('scales by 1/cos(lat) so the projected radius stays a circle, not a cos(lat) ellipse', () => {
    const atEquator = metersToMercatorUnits(0);
    const at60 = metersToMercatorUnits(60);
    expect(at60 / atEquator).toBeCloseTo(2, 6);
  });

  it('matches the known equator value (1 / earth circumference)', () => {
    expect(metersToMercatorUnits(0)).toBeCloseTo(1 / 40075016.686, 15);
  });
});

describe('rangeQuadHalfExtent', () => {
  it('is the same scalar on both axes (isotropic), at 0, 45, and 60 degrees', () => {
    for (const lat of [0, 45, 60]) {
      const half = rangeQuadHalfExtent(lat, 3000);
      expect(half).toBeCloseTo(3000 * metersToMercatorUnits(lat), 12);
    }
  });
});
