import { describe, expect, it } from 'vitest';
import type { WeatherGrid } from '$entities/weather';
import { waveFieldRgba } from './wave-field';

function grid(): WeatherGrid {
  const cells = 4; // 2x2
  return {
    lats: [0, 1],
    lons: [0, 1],
    times: [0],
    windU: [new Array(cells).fill(0)],
    windV: [new Array(cells).fill(0)],
    waveHeight: [[5, 5, Number.NaN, Number.NaN]],
  };
}

const bracket = { lo: 0, hi: 0, frac: 0 };

describe('waveFieldRgba', () => {
  it('builds an RGBA buffer at grid resolution, north up', () => {
    const f = waveFieldRgba(grid(), bracket, 'day');
    expect(f?.width).toBe(2);
    expect(f?.height).toBe(2);
    expect(f?.data.length).toBe(2 * 2 * 4);
    // Canvas row 0 is the northernmost grid row (lats[1]), which is the NaN row -> alpha 0.
    expect(f?.data[3]).toBe(0);
    // The southern row (lats[0]) has height 5 -> alpha > 0.
    const southAlpha = f?.data[(1 * 2 + 0) * 4 + 3] ?? 0;
    expect(southAlpha).toBeGreaterThan(0);
  });

  it('is empty without wave data', () => {
    const g = grid();
    g.waveHeight = undefined;
    expect(waveFieldRgba(g, bracket, 'day')).toBeUndefined();
  });
});
