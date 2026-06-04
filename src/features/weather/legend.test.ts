import { describe, expect, it } from 'vitest';
import { weatherLegend } from './legend';

describe('weatherLegend', () => {
  it('builds a wind speed gradient in knots', () => {
    const legend = weatherLegend('weather-wind', 'day');
    expect(legend?.title).toMatch(/wind/i);
    expect(legend?.gradient).toMatch(/linear-gradient/);
    expect(legend?.lowLabel).toBe('0.0');
    expect(legend?.highLabel).toBe('50.5');
  });

  it('builds a single isobar swatch for pressure', () => {
    const legend = weatherLegend('weather-pressure', 'day');
    expect(legend?.swatches).toHaveLength(1);
    expect(legend?.gradient).toBeUndefined();
  });

  it('builds gradients for waves, precipitation, and cloud', () => {
    for (const id of ['weather-waves', 'weather-precip', 'weather-cloud']) {
      expect(weatherLegend(id, 'day')?.gradient).toMatch(/linear-gradient/);
    }
  });

  it('builds a discrete intensity legend for the radar', () => {
    const legend = weatherLegend('weather-radar', 'day');
    expect(legend?.title).toMatch(/radar/i);
    expect(legend?.swatches?.length).toBeGreaterThan(1);
  });

  it('returns undefined for an unknown layer', () => {
    expect(weatherLegend('weather-unknown', 'day')).toBeUndefined();
  });
});
