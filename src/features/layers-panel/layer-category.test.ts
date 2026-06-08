import { describe, expect, it } from 'vitest';
import type { LayerListItem } from '$shared/map';
import { CATEGORY_ORDER, layerCategory } from './layer-category';

const item = (overrides: Partial<LayerListItem>): LayerListItem => ({
  id: 'x',
  title: 'x',
  visible: true,
  opacity: 1,
  supportsOpacity: true,
  pinned: false,
  band: 'safety',
  ...overrides,
});

describe('layerCategory', () => {
  it('uses an overlay-declared category', () => {
    expect(layerCategory(item({ category: 'live' })).id).toBe('live');
    expect(layerCategory(item({ category: 'nav-aids' })).id).toBe('nav-aids');
    expect(layerCategory(item({ category: 'areas' })).id).toBe('areas');
  });

  it('falls back to a band-derived category when none is declared', () => {
    expect(layerCategory(item({ band: 'bathymetry' })).id).toBe('charts');
    expect(layerCategory(item({ band: 'basemap' })).id).toBe('charts');
    expect(layerCategory(item({ band: 'weather' })).id).toBe('ocean');
    expect(layerCategory(item({ band: 'traffic' })).id).toBe('live');
    expect(layerCategory(item({ band: 'routes' })).id).toBe('mine');
    expect(layerCategory(item({ band: 'track' })).id).toBe('mine');
  });

  it('ignores an unknown declared category so a typo never drops the layer', () => {
    expect(layerCategory(item({ category: 'bogus', band: 'safety' })).id).toBe('mine');
  });

  it('resolves a non-empty title for every category in the order', () => {
    for (const id of CATEGORY_ORDER) {
      expect(layerCategory(item({ category: id })).title).toBeTruthy();
    }
  });
});
