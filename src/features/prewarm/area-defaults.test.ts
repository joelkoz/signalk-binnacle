import { CHART_SOURCES } from 'signalk-chart-sources';
import { describe, expect, it } from 'vitest';
import { defaultSelection } from './area-defaults.js';
import { DETAIL_PRESETS, presetForRange, rangeForPreset } from './detail-level.js';

const byId = Object.fromEntries(CHART_SOURCES.map((s) => [s.id, s]));
const pick = (...ids: string[]) => ids.map((id) => byId[id]);

describe('defaultSelection', () => {
  it('picks the US chart, seamarks, and the base map, dropping facets and specialists', () => {
    const covering = pick(
      'depth-noaa-enc',
      'depth-noaa-enc-quality',
      'depth-bluetopo',
      'depth-gebco',
      'seamark',
      'bound-eez',
      'mpa-noaa',
      'basemap',
    );
    expect(defaultSelection(covering)).toEqual(['depth-noaa-enc', 'seamark', 'basemap']);
  });

  it('picks the EU chart, seamarks, and the base map', () => {
    const covering = pick(
      'depth-emodnet',
      'depth-emodnet-quality',
      'seamark',
      'mpa-emodnet',
      'basemap',
    );
    expect(defaultSelection(covering)).toEqual(['depth-emodnet', 'seamark', 'basemap']);
  });

  it('offshore with only coarse depth defaults to seamarks and the base map, no depth', () => {
    const covering = pick('depth-gebco', 'seamark', 'bound-eez', 'basemap');
    expect(defaultSelection(covering)).toEqual(['seamark', 'basemap']);
  });
});

describe('detail-level presets', () => {
  it('maps a preset to its zoom range', () => {
    expect(rangeForPreset('coastal')).toEqual([6, 12]);
    expect(rangeForPreset('overview')).toEqual([5, 9]);
    expect(rangeForPreset('harbor')).toEqual([6, 15]);
  });

  it('resolves a matching range to a preset and a non-matching one to custom', () => {
    expect(presetForRange(6, 12)).toBe('coastal');
    expect(presetForRange(5, 9)).toBe('overview');
    expect(presetForRange(7, 11)).toBe('custom');
  });

  it('exposes three presets', () => {
    expect(DETAIL_PRESETS.map((p) => p.key)).toEqual(['overview', 'coastal', 'harbor']);
  });
});
