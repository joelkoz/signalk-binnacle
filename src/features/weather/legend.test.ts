import { describe, expect, it } from 'vitest';
import { weatherLegend } from './legend';

describe('weatherLegend', () => {
  it('builds a wind speed gradient with whole-knot end labels', () => {
    const legend = weatherLegend('weather-wind', 'day');
    expect(legend?.title).toMatch(/wind/i);
    expect(legend?.gradient).toMatch(/linear-gradient/);
    expect(legend?.lowLabel).toBe('0');
    expect(legend?.highLabel).toBe('50');
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

  it('builds a discrete intensity legend for the radar, honest about the nowcast', () => {
    const legend = weatherLegend('weather-radar', 'day');
    expect(legend?.title).toMatch(/radar/i);
    expect(legend?.swatches?.length).toBeGreaterThan(1);
    // "live radar" would overstate the extrapolated newest frames.
    expect(legend?.note).toMatch(/nowcast/);
  });

  it('labels cloud cover in whole percent', () => {
    expect(weatherLegend('weather-cloud', 'day')?.highLabel).toBe('100');
  });

  it('returns undefined for an unknown layer', () => {
    expect(weatherLegend('weather-unknown', 'day')).toBeUndefined();
  });
});
