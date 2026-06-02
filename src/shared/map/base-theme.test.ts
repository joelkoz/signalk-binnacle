import { describe, expect, it } from 'vitest';
import { applyBaseTheme, baseLayerPaint, captureBaseTheme, restoreBaseTheme } from './base-theme';
import { mapThemePaint } from './map-theme';

const paint = mapThemePaint('night-red');

// A minimal MapLibre-shaped stub: it stores paint and layout values so capture and restore can
// round-trip them.
function fakeStyleMap(layers: Array<Record<string, unknown>>) {
  const paintStore = new Map<string, unknown>();
  const layoutStore = new Map<string, unknown>();
  return {
    getStyle: () => ({ layers }),
    getPaintProperty: (id: string, prop: string) => paintStore.get(`${id}|${prop}`),
    setPaintProperty: (id: string, prop: string, value: unknown) =>
      paintStore.set(`${id}|${prop}`, value),
    getLayoutProperty: (id: string, prop: string) => layoutStore.get(`${id}|${prop}`),
    setLayoutProperty: (id: string, prop: string, value: unknown) =>
      layoutStore.set(`${id}|${prop}`, value),
  };
}

describe('baseLayerPaint', () => {
  it('recolors the background', () => {
    expect(baseLayerPaint({ id: 'background', type: 'background' }, paint)).toEqual({
      property: 'background-color',
      color: paint.background,
    });
  });

  it('recolors fills, lines, and extrusions by source layer', () => {
    expect(baseLayerPaint({ id: 'water', type: 'fill', 'source-layer': 'water' }, paint)).toEqual({
      property: 'fill-color',
      color: paint.water,
    });
    expect(
      baseLayerPaint(
        { id: 'road_motorway', type: 'line', 'source-layer': 'transportation' },
        paint,
      ),
    ).toEqual({ property: 'line-color', color: paint.road });
    expect(baseLayerPaint({ id: 'park', type: 'fill', 'source-layer': 'park' }, paint)).toEqual({
      property: 'fill-color',
      color: paint.landcover,
    });
    expect(
      baseLayerPaint({ id: 'landuse_residential', type: 'fill', 'source-layer': 'landuse' }, paint),
    ).toEqual({ property: 'fill-color', color: paint.land });
    expect(
      baseLayerPaint({ id: 'boundary_2', type: 'line', 'source-layer': 'boundary' }, paint),
    ).toEqual({ property: 'line-color', color: paint.boundary });
    expect(
      baseLayerPaint(
        { id: 'building-3d', type: 'fill-extrusion', 'source-layer': 'building' },
        paint,
      ),
    ).toEqual({ property: 'fill-extrusion-color', color: paint.land });
  });

  it('splits aeroway into apron land and runway road by geometry type', () => {
    expect(
      baseLayerPaint({ id: 'aeroway_fill', type: 'fill', 'source-layer': 'aeroway' }, paint),
    ).toEqual({ property: 'fill-color', color: paint.land });
    expect(
      baseLayerPaint({ id: 'aeroway_runway', type: 'line', 'source-layer': 'aeroway' }, paint),
    ).toEqual({ property: 'line-color', color: paint.road });
  });

  it('recolors every symbol text to the label color', () => {
    expect(
      baseLayerPaint({ id: 'label_city', type: 'symbol', 'source-layer': 'place' }, paint),
    ).toEqual({ property: 'text-color', color: paint.label });
  });

  it('leaves rasters and unknown source layers untouched', () => {
    expect(baseLayerPaint({ id: 'natural_earth', type: 'raster' }, paint)).toBeNull();
    expect(
      baseLayerPaint({ id: 'mystery', type: 'fill', 'source-layer': 'who_knows' }, paint),
    ).toBeNull();
  });
});

describe('captureBaseTheme and restoreBaseTheme', () => {
  it('restores the source colors after a recolor (day shows the real map)', () => {
    const layers = [
      { id: 'background', type: 'background' },
      { id: 'water', type: 'fill', 'source-layer': 'water' },
      { id: 'label_city', type: 'symbol', 'source-layer': 'place' },
      { id: 'mystery', type: 'fill', 'source-layer': 'who_knows' },
    ];
    const map = fakeStyleMap(layers);
    // Seed the source-style values.
    map.setPaintProperty('background', 'background-color', '#f8f4f0');
    map.setPaintProperty('water', 'fill-color', 'rgb(158,189,255)');
    map.setLayoutProperty('water', 'fill-pattern', 'wetland');
    map.setPaintProperty('label_city', 'text-color', '#333333');
    map.setPaintProperty('label_city', 'text-halo-color', '#ffffff');

    // biome-ignore lint/suspicious/noExplicitAny: minimal map stub for the test
    const snapshot = captureBaseTheme(map as any, mapThemePaint('day'));
    // biome-ignore lint/suspicious/noExplicitAny: minimal map stub for the test
    applyBaseTheme(map as any, mapThemePaint('night-red'));
    expect(map.getPaintProperty('background', 'background-color')).toBe('#000000');
    expect(map.getLayoutProperty('water', 'fill-pattern')).toBeUndefined();

    // biome-ignore lint/suspicious/noExplicitAny: minimal map stub for the test
    restoreBaseTheme(map as any, snapshot);
    expect(map.getPaintProperty('background', 'background-color')).toBe('#f8f4f0');
    expect(map.getPaintProperty('water', 'fill-color')).toBe('rgb(158,189,255)');
    expect(map.getLayoutProperty('water', 'fill-pattern')).toBe('wetland');
    expect(map.getPaintProperty('label_city', 'text-halo-color')).toBe('#ffffff');
  });
});
