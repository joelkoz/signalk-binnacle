import { describe, expect, it } from 'vitest';
import { headingLineFeature, rangeRingFeatures } from './radar-vectors';

describe('rangeRingFeatures', () => {
  it('produces one closed ring per requested ring', () => {
    const fc = rangeRingFeatures({ latitude: 0, longitude: 0 }, 3000, 3);
    expect(fc.features).toHaveLength(3);
    const ring = fc.features[0].geometry as GeoJSON.LineString;
    expect(ring.coordinates[0]).toEqual(ring.coordinates[ring.coordinates.length - 1]);
  });
});

describe('headingLineFeature', () => {
  it('draws a line from the center outward', () => {
    const f = headingLineFeature({ latitude: 0, longitude: 0 }, 0, 3000);
    const line = f.geometry as GeoJSON.LineString;
    expect(line.coordinates[0]).toEqual([0, 0]);
    expect(line.coordinates[1][1]).toBeGreaterThan(0);
    expect(Math.abs(line.coordinates[1][0])).toBeLessThan(1e-6);
  });
});
