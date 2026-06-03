import { describe, expect, it } from 'vitest';
import { layerGroup } from './layer-group';

describe('layerGroup', () => {
  it('groups base and bathymetry as charts, weather on its own, the rest as overlays', () => {
    expect(layerGroup('basemap')).toBe('Charts and Depth');
    expect(layerGroup('bathymetry')).toBe('Charts and Depth');
    expect(layerGroup('weather')).toBe('Weather');
    expect(layerGroup('traffic')).toBe('Overlays');
    expect(layerGroup('vessel')).toBe('Overlays');
  });
});
