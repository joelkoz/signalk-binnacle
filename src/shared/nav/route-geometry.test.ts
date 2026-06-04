import { describe, expect, it } from 'vitest';
import { degreesToRadians, knotsToMetersPerSecond } from '$shared/lib';
import {
  crossTrackErrorMeters,
  etaSeconds,
  rhumbBearingRad,
  rhumbDistanceMeters,
  vmgMps,
} from './route-geometry';

const NM = 1852;

describe('rhumbDistanceMeters', () => {
  it('measures about one nautical mile per minute of latitude due north', () => {
    const d = rhumbDistanceMeters(
      { latitude: 0, longitude: 0 },
      { latitude: 1 / 60, longitude: 0 },
    );
    expect(d).toBeGreaterThan(NM * 0.99);
    expect(d).toBeLessThan(NM * 1.01);
  });

  it('handles an antimeridian crossing as a short hop, not a near-global span', () => {
    const d = rhumbDistanceMeters(
      { latitude: 0, longitude: 179.99 },
      { latitude: 0, longitude: -179.99 },
    );
    expect(d).toBeLessThan(3 * NM);
  });
});

describe('rhumbBearingRad', () => {
  it('is 0 due north and about pi/2 due east', () => {
    expect(
      rhumbBearingRad({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }),
    ).toBeCloseTo(0, 3);
    expect(
      rhumbBearingRad({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }),
    ).toBeCloseTo(Math.PI / 2, 2);
  });
});

describe('crossTrackErrorMeters', () => {
  it('is zero on the leg and positive to starboard of it', () => {
    const from = { latitude: 0, longitude: 0 };
    const to = { latitude: 0, longitude: 1 }; // leg runs due east
    expect(Math.abs(crossTrackErrorMeters(from, to, { latitude: 0, longitude: 0.5 }))).toBeLessThan(
      1,
    );
    // A point south of an eastbound leg is to starboard (positive).
    expect(crossTrackErrorMeters(from, to, { latitude: -0.01, longitude: 0.5 })).toBeGreaterThan(0);
  });
});

describe('vmgMps', () => {
  it('equals boat speed when heading straight at the mark', () => {
    const v = vmgMps(
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 0 },
      knotsToMetersPerSecond(6),
      degreesToRadians(0),
    );
    expect(v).toBeCloseTo(knotsToMetersPerSecond(6), 5);
  });

  it('is negative when sailing away from the mark', () => {
    const v = vmgMps(
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 0 },
      knotsToMetersPerSecond(6),
      degreesToRadians(180),
    );
    expect(v).toBeLessThan(0);
  });
});

describe('etaSeconds', () => {
  it('is distance over speed', () => {
    expect(etaSeconds(1852, knotsToMetersPerSecond(6))).toBeCloseTo(
      1852 / knotsToMetersPerSecond(6),
      3,
    );
  });

  it('is undefined for a non-positive speed', () => {
    expect(etaSeconds(1852, 0)).toBeUndefined();
  });
});
