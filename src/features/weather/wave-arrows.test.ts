import { describe, expect, it } from 'vitest';
import type { WeatherGrid } from '$entities/weather';
import { waveArrowFeatures } from './wave-arrows';

function grid(): WeatherGrid {
  const cells = 16; // 4x4 so the stride keeps at least one arrow
  return {
    lats: [0, 1, 2, 3],
    lons: [0, 1, 2, 3],
    times: [0],
    windU: [new Array(cells).fill(0)],
    windV: [new Array(cells).fill(0)],
    waveHeight: [new Array(cells).fill(2)],
    waveDirection: [new Array(cells).fill(0)], // from north -> travels south
    wavePeriod: [new Array(cells).fill(6)],
  };
}

const bracket = { lo: 0, hi: 0, frac: 0 };

describe('waveArrowFeatures', () => {
  it('emits sparse arrows', () => {
    const fc = waveArrowFeatures(grid(), bracket);
    expect(fc.features.length).toBeGreaterThan(0);
    expect(fc.features.length).toBeLessThan(16);
  });

  it('skips cells whose height is missing', () => {
    const g = grid();
    g.waveHeight = [new Array(16).fill(Number.NaN)];
    expect(waveArrowFeatures(g, bracket).features).toHaveLength(0);
  });

  it('is empty without wave data', () => {
    const g = grid();
    g.waveDirection = undefined;
    expect(waveArrowFeatures(g, bracket).features).toHaveLength(0);
  });
});
