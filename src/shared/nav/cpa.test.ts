import { describe, expect, it } from 'vitest';
import { computeCpa } from './cpa';

// Own vessel at the equator and prime meridian, stationary unless stated.
const own = { latitude: 0, longitude: 0, sogMps: 0, cogRad: 0 };

describe('computeCpa', () => {
  it('a target closing head-on reports the meeting point and time', () => {
    // Target 1852 m due north, steaming due south at 5 m/s, own vessel stationary.
    // They meet at the own position in 1852 / 5 = 370.4 s, cpa near 0.
    const target = { latitude: 1852 / 111320, longitude: 0, sogMps: 5, cogRad: Math.PI };
    const r = computeCpa(own, target);
    expect(r.closing).toBe(true);
    expect(r.tcpaSeconds).toBeGreaterThan(360);
    expect(r.tcpaSeconds).toBeLessThan(381);
    expect(r.cpaMeters).toBeLessThan(20);
  });

  it('a target steaming away is not closing', () => {
    const target = { latitude: 1852 / 111320, longitude: 0, sogMps: 5, cogRad: 0 };
    const r = computeCpa(own, target);
    expect(r.closing).toBe(false);
  });

  it('a parallel target on a constant offset keeps its beam distance', () => {
    // Target 926 m due east, both steaming due north at 5 m/s: range stays near 926 m.
    const movingOwn = { latitude: 0, longitude: 0, sogMps: 5, cogRad: 0 };
    const target = { latitude: 0, longitude: 926 / 111320, sogMps: 5, cogRad: 0 };
    const r = computeCpa(movingOwn, target);
    expect(r.cpaMeters).toBeGreaterThan(900);
    expect(r.cpaMeters).toBeLessThan(952);
  });

  it('handles a pair straddling the antimeridian as a short range', () => {
    // Own at lon 179.99, target at lon -179.99: a true separation near the equator
    // of about 2.2 km, not the ~360-degree bogus offset of an unnormalized delta.
    const stationaryOwn = { latitude: 0, longitude: 179.99, sogMps: 0, cogRad: 0 };
    const target = { latitude: 0, longitude: -179.99, sogMps: 5, cogRad: 270 * (Math.PI / 180) };
    const r = computeCpa(stationaryOwn, target);
    expect(r.cpaMeters).toBeLessThan(3000);
  });
});
