import { describe, expect, it } from 'vitest';
import { weatherLegend } from './legend';

describe('weatherLegend', () => {
  it('builds a wind speed ramp in knots', () => {
    const legend = weatherLegend('weather-wind', 'day');
    expect(legend?.title).toMatch(/wind/i);
    expect(legend?.swatches.length).toBeGreaterThan(2);
    expect(legend?.swatches[0].color).toMatch(/rgba?\(/);
  });

  it('builds a single isobar swatch for pressure', () => {
    const legend = weatherLegend('weather-pressure', 'day');
    expect(legend?.swatches).toHaveLength(1);
  });

  it('builds ramps for waves, precipitation, and cloud', () => {
    for (const id of ['weather-waves', 'weather-precip', 'weather-cloud']) {
      expect(weatherLegend(id, 'day')?.swatches.length).toBeGreaterThan(2);
    }
  });

  it('returns undefined for an unknown layer', () => {
    expect(weatherLegend('weather-unknown', 'day')).toBeUndefined();
  });
});
