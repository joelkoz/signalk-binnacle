import { describe, expect, it } from 'vitest';
import {
  kelvinToCelsius,
  metersPerSecondToKnots,
  metersToFeet,
  metersToNauticalMiles,
  radiansToDegrees,
} from './units';

describe('units', () => {
  it('converts meters per second to knots', () => {
    expect(metersPerSecondToKnots(1)).toBeCloseTo(1.943844, 5);
    expect(metersPerSecondToKnots(0)).toBe(0);
  });

  it('returns undefined for undefined input', () => {
    expect(metersPerSecondToKnots(undefined)).toBeUndefined();
    expect(radiansToDegrees(undefined)).toBeUndefined();
  });

  it('converts radians to a normalized 0..360 degree bearing', () => {
    expect(radiansToDegrees(0)).toBe(0);
    expect(radiansToDegrees(Math.PI)).toBeCloseTo(180, 6);
    expect(radiansToDegrees(2 * Math.PI)).toBeCloseTo(0, 6);
    expect(radiansToDegrees(-Math.PI / 2)).toBeCloseTo(270, 6);
  });

  it('converts kelvin to celsius', () => {
    expect(kelvinToCelsius(273.15)).toBeCloseTo(0, 6);
    expect(kelvinToCelsius(293.15)).toBeCloseTo(20, 6);
  });

  it('converts meters to feet', () => {
    expect(metersToFeet(1)).toBeCloseTo(3.28084, 5);
  });

  it('converts meters to nautical miles', () => {
    expect(metersToNauticalMiles(1852)).toBeCloseTo(1, 6);
  });
});
