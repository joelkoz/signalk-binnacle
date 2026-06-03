import { describe, expect, it } from 'vitest';
import { bilinearAt, cellIndex, sampleGrid, timeBracket, type WeatherGrid } from './weather-grid';

const tiny: WeatherGrid = {
  lats: [0, 1],
  lons: [0, 1],
  times: [1000, 4000],
  windU: [
    [0, 2, 0, 2],
    [10, 10, 10, 10],
  ],
  windV: [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
};

describe('sampleGrid', () => {
  it('caps the grid to maxCells and covers the bbox corners', () => {
    const g = sampleGrid({ west: -10, south: 40, east: 10, north: 50 }, 64);
    expect(g.lats.length * g.lons.length).toBeLessThanOrEqual(64);
    expect(g.lons[0]).toBeCloseTo(-10, 6);
    expect(g.lons[g.lons.length - 1]).toBeCloseTo(10, 6);
    expect(g.lats[0]).toBeCloseTo(40, 6);
    expect(g.lats[g.lats.length - 1]).toBeCloseTo(50, 6);
  });

  it('numbers cells row-major from the lat and lon axes', () => {
    const g = sampleGrid({ west: 0, south: 0, east: 3, north: 3 }, 16);
    expect(cellIndex(g, 0, 0)).toBe(0);
    expect(cellIndex(g, 1, 0)).toBe(g.lons.length);
  });
});

describe('bilinearAt', () => {
  it('interpolates a variable inside a cell', () => {
    expect(bilinearAt(tiny, tiny.windU[0], 0.5, 0)).toBeCloseTo(1, 6);
  });
  it('returns undefined outside the grid', () => {
    expect(bilinearAt(tiny, tiny.windU[0], 5, 5)).toBeUndefined();
  });
});

describe('timeBracket', () => {
  it('returns the two indices and the fraction for a time between steps', () => {
    expect(timeBracket(tiny, 2500)).toEqual({ lo: 0, hi: 1, frac: 0.5 });
  });
  it('clamps before the first and after the last step', () => {
    expect(timeBracket(tiny, 0)).toEqual({ lo: 0, hi: 0, frac: 0 });
    expect(timeBracket(tiny, 9999)).toEqual({ lo: 1, hi: 1, frac: 0 });
  });
});
