import { describe, expect, it } from 'vitest';
import type { LayerListItem } from '$shared/map';
import { CATEGORY_ORDER, clampReorderSlot, layerCategory } from './layer-category';

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
      expect(layerCategory(item({ category: id })).title).toMatch(/\S/);
    }
  });
});

describe('clampReorderSlot', () => {
  // Two "mine" rows, two "live" rows, one "charts" row, in panel order (top of the map first).
  const movable = [
    item({ id: 'route', category: 'mine' }),
    item({ id: 'track', category: 'mine' }),
    item({ id: 'ais', category: 'live' }),
    item({ id: 'tides', category: 'live' }),
    item({ id: 'chart', category: 'charts' }),
  ];

  it('passes through a slot inside the row category span', () => {
    // With 'ais' removed, 'tides' sits at index 2; slots 2 and 3 keep ais in the live bucket.
    expect(clampReorderSlot(movable, 'ais', 2)).toBe(2);
    expect(clampReorderSlot(movable, 'ais', 3)).toBe(3);
  });

  it('clamps a slot that would cross into the bucket above', () => {
    // Slot 0 would drop 'ais' above the mine rows; clamp to the top of the live span.
    expect(clampReorderSlot(movable, 'ais', 0)).toBe(2);
    expect(clampReorderSlot(movable, 'tides', 1)).toBe(2);
  });

  it('clamps a slot that would cross into the bucket below', () => {
    // Slot 4 would drop 'ais' below the chart row; clamp to just under the live span.
    expect(clampReorderSlot(movable, 'ais', 4)).toBe(3);
  });

  it('keeps a single-row bucket at its own slot', () => {
    expect(clampReorderSlot(movable, 'chart', 0)).toBe(4);
    expect(clampReorderSlot(movable, 'chart', 5)).toBe(4);
  });

  it('clamps within the top bucket', () => {
    expect(clampReorderSlot(movable, 'route', 3)).toBe(1);
    expect(clampReorderSlot(movable, 'track', 0)).toBe(0);
  });

  it('returns the slot unchanged for an unknown id', () => {
    expect(clampReorderSlot(movable, 'ghost', 3)).toBe(3);
  });
});
