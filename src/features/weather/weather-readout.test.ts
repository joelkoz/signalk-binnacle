import { describe, expect, it } from 'vitest';
import type { WeatherGrid } from '$entities/weather';
import { readoutAt } from './weather-readout';

const grid: WeatherGrid = {
  lats: [0, 1],
  lons: [0, 1],
  times: [1000, 4000],
  windU: [
    [-10, -10, -10, -10],
    [0, 0, 0, 0],
  ],
  windV: [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
};

describe('readoutAt', () => {
  it('returns SI speed and a from-direction at a point', () => {
    const r = readoutAt(grid, 0.5, 0.5, 0);
    expect(r?.speedMs).toBeCloseTo(10, 4);
    expect(r?.fromRad).toBeCloseTo(Math.PI / 2, 4); // wind toward the west comes from the east
  });
  it('returns undefined outside the grid', () => {
    expect(readoutAt(grid, 9, 9, 0)).toBeUndefined();
  });
});
