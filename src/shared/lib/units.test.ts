import { describe, expect, it } from 'vitest';
import {
  formatClockTime,
  formatCpaNm,
  formatMetersOrNm,
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

describe('formatMetersOrNm', () => {
  it('reads whole meters under a nautical mile, nautical miles beyond', () => {
    expect(formatMetersOrNm(93.4)).toBe('93 m');
    expect(formatMetersOrNm(1851)).toBe('1851 m');
    expect(formatMetersOrNm(1852)).toBe('1.00 nm');
    expect(formatMetersOrNm(4260)).toBe('2.30 nm');
  });

  it('reads the placeholder for an absent value', () => {
    expect(formatMetersOrNm(undefined)).toBe('--');
    expect(formatMetersOrNm(null)).toBe('--');
  });
});

describe('formatClockTime', () => {
  it('reads hour and minute by default, and adds seconds on opt-in', () => {
    // Locale-dependent rendering, so assert the field count, not exact text.
    const at = Date.UTC(2026, 5, 11, 14, 32, 5);
    expect(formatClockTime(at).match(/\d+/g)).toHaveLength(2);
    expect(formatClockTime(at, { seconds: true }).match(/\d+/g)).toHaveLength(3);
  });
});
