import { describe, expect, it } from 'vitest';
import type { CurrentEvent, TideEvent } from '$entities/tides';
import {
  formatCurrentRate,
  formatTideHeight,
  formatTideHeightFeet,
  nextCurrentEvent,
  nowFraction,
  tideCurvePoints,
  upcomingEvents,
} from './tides-display';

const events: TideEvent[] = [
  { timeMs: 1000, heightMeters: 0.1, kind: 'low' },
  { timeMs: 3000, heightMeters: 0.5, kind: 'high' },
];

describe('tides-display', () => {
  it('formats heights in meters and feet', () => {
    expect(formatTideHeight(1.234)).toBe('1.23 m');
    expect(formatTideHeightFeet(1)).toBe('3.3 ft');
  });

  it('formats a current rate in knots from SI m/s', () => {
    expect(formatCurrentRate(0.5144)).toBe('1.0 kn');
  });

  it('returns only upcoming events, soonest first', () => {
    expect(upcomingEvents(events, 2000).map((e) => e.timeMs)).toEqual([3000]);
  });

  it('finds the next non-slack current event after a reference time', () => {
    const currents: CurrentEvent[] = [
      { timeMs: 1000, velocityMps: 0.5, directionDeg: 100, kind: 'flood' },
      { timeMs: 2000, velocityMps: 0, directionDeg: undefined, kind: 'slack' },
      { timeMs: 3000, velocityMps: 0.4, directionDeg: 280, kind: 'ebb' },
    ];
    expect(nextCurrentEvent(currents, 1500)?.kind).toBe('ebb');
    expect(nextCurrentEvent(currents, 4000)).toBeUndefined();
  });

  it('normalizes tide curve points to a 0..1 box', () => {
    const points = tideCurvePoints(events);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[1]).toEqual({ x: 1, y: 1 });
    expect(tideCurvePoints([])).toEqual([]);
  });

  it('locates now within the span, or undefined outside it', () => {
    expect(nowFraction(events, 2000)).toBeCloseTo(0.5);
    expect(nowFraction(events, 500)).toBeUndefined();
  });
});
