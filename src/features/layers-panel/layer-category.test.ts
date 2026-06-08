import { describe, expect, it } from 'vitest';
import type { LayerListItem } from '$shared/map';
import { CATEGORY_DEFAULT_OPEN, CATEGORY_ORDER, layerCategory } from './layer-category';

const item = (id: string, band: LayerListItem['band']): LayerListItem => ({
  id,
  title: id,
  visible: true,
  opacity: 1,
  supportsOpacity: true,
  pinned: false,
  band,
});

describe('layerCategory', () => {
  it('maps the chart and ocean bands to their own sections', () => {
    expect(layerCategory(item('depth-gebco', 'bathymetry')).id).toBe('charts');
    expect(layerCategory(item('chart-x', 'basemap')).id).toBe('charts');
    expect(layerCategory(item('gibs-sst', 'weather')).id).toBe('ocean');
  });

  it('splits the overlay rows into live, navigation aids, areas, and own data', () => {
    expect(layerCategory(item('ais', 'traffic')).id).toBe('live');
    expect(layerCategory(item('tides', 'safety')).id).toBe('live');
    expect(layerCategory(item('seamark', 'safety')).id).toBe('nav-aids');
    expect(layerCategory(item('mpa-noaa', 'safety')).id).toBe('areas');
    expect(layerCategory(item('bound-eez', 'safety')).id).toBe('areas');
    expect(layerCategory(item('routes', 'routes')).id).toBe('mine');
    expect(layerCategory(item('notes', 'routes')).id).toBe('mine');
    expect(layerCategory(item('track', 'track')).id).toBe('mine');
  });

  it('falls an unknown overlay into the own-data bucket so it is never hidden', () => {
    expect(layerCategory(item('future-overlay', 'safety')).id).toBe('mine');
  });

  it('keeps the category order and default-open keys in sync', () => {
    for (const id of CATEGORY_ORDER) {
      expect(id in CATEGORY_DEFAULT_OPEN).toBe(true);
    }
    expect(Object.keys(CATEGORY_DEFAULT_OPEN).sort()).toEqual([...CATEGORY_ORDER].sort());
  });
});
