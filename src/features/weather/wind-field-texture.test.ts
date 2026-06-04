import { describe, expect, it } from 'vitest';
import type { WeatherGrid } from '$entities/weather';
import { windFieldTexture } from './wind-field-texture';

// A 2x2 grid, lats south-to-north [10, 20], lons west-to-east [0, 30]. cellIndex = latRow*2 + lonCol.
function grid(u: number[][], v: number[][]): WeatherGrid {
  return {
    lats: [10, 20],
    lons: [0, 30],
    times: [0, 3_600_000],
    windU: u,
    windV: v,
  } as WeatherGrid;
}
const bracket = { lo: 0, hi: 0, frac: 0 };

describe('windFieldTexture', () => {
  it('returns undefined when wind is absent', () => {
    expect(windFieldTexture(grid([], []), bracket)).toBeUndefined();
  });

  it('encodes u and v to bytes over their range, with bounds and south-first rows', () => {
    const u = [[-5, 5, -5, 5]];
    const v = [[0, 0, 10, 10]];
    const f = windFieldTexture(grid(u, v), bracket);
    expect(f).toBeDefined();
    if (!f) return;
    expect(f.width).toBe(2);
    expect(f.height).toBe(2);
    expect([f.west, f.south, f.east, f.north]).toEqual([0, 10, 30, 20]);
    expect(f.uMin).toBe(-5);
    expect(f.uMax).toBe(5);
    expect(f.vMin).toBe(0);
    expect(f.vMax).toBe(10);
    expect(f.data[0]).toBe(0);
    expect(f.data[4]).toBe(255);
    expect(f.data[3]).toBe(255);
  });

  it('marks NaN (land) cells with alpha 0', () => {
    const u = [[Number.NaN, 1, 1, 1]];
    const v = [[Number.NaN, 1, 1, 1]];
    const f = windFieldTexture(grid(u, v), bracket);
    expect(f?.data[3]).toBe(0);
    expect(f?.data[7]).toBe(255);
  });
});
