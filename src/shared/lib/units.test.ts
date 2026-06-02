import { describe, expect, it } from 'vitest';
import {
  formatCpaNm,
  formatTcpaMin,
  metersPerSecondToKnots,
  metersToNauticalMiles,
  radiansToBearing,
} from './units';

describe('units', () => {
  it('converts meters per second to knots', () => {
    expect(metersPerSecondToKnots(1)).toBeCloseTo(1.943844, 5);
    expect(metersPerSecondToKnots(0)).toBe(0);
  });

  it('returns undefined for undefined input', () => {
    expect(metersPerSecondToKnots(undefined)).toBeUndefined();
    expect(radiansToBearing(undefined)).toBeUndefined();
  });

  it('converts radians to a normalized 0..360 degree bearing', () => {
    expect(radiansToBearing(0)).toBe(0);
    expect(radiansToBearing(Math.PI)).toBeCloseTo(180, 6);
    expect(radiansToBearing(2 * Math.PI)).toBeCloseTo(0, 6);
    expect(radiansToBearing(-Math.PI / 2)).toBeCloseTo(270, 6);
  });

  it('converts meters to nautical miles', () => {
    expect(metersToNauticalMiles(1852)).toBeCloseTo(1, 6);
  });

  it('formats CPA in nautical miles and TCPA in minutes', () => {
    expect(formatCpaNm(926)).toBe('0.50');
    expect(formatTcpaMin(600)).toBe('10');
    expect(formatTcpaMin(90, 1)).toBe('1.5');
  });
});
