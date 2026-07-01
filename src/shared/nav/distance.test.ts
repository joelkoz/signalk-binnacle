import { describe, expect, it } from 'vitest';
import { geodesicCircleRing, haversineMeters } from './distance';

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters(36.8, -121.7, 36.8, -121.7)).toBe(0);
  });

  it('measures a known short hop within a meter', () => {
    // 0.001 deg of latitude is about 111.2 m; digits=1 pins it to within ~0.05 m.
    expect(haversineMeters(0, 0, 0.001, 0)).toBeCloseTo(111.19, 1);
  });
});

describe('geodesicCircleRing', () => {
  it('returns a closed ring (first point equals last)', () => {
    const ring = geodesicCircleRing(36.8, -121.7, 50);
    expect(ring.length).toBe(65);
    expect(ring[0][0]).toBeCloseTo(ring[64][0], 9);
    expect(ring[0][1]).toBeCloseTo(ring[64][1], 9);
  });

  it('places every point at the requested radius from the center', () => {
    const ring = geodesicCircleRing(59.9, 10.7, 80, 16);
    for (const [lon, lat] of ring) {
      expect(haversineMeters(59.9, 10.7, lat, lon)).toBeCloseTo(80, 3);
    }
  });

  it('stays exact at high latitude where a flat circle would distort', () => {
    const ring = geodesicCircleRing(78, 15, 60, 8);
    for (const [lon, lat] of ring) {
      expect(haversineMeters(78, 15, lat, lon)).toBeCloseTo(60, 3);
    }
  });
});
