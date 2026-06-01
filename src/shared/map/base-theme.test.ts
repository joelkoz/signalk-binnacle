import { describe, expect, it } from 'vitest';
import { baseLayerPaint } from './base-theme';
import { mapThemePaint } from './map-theme';

const paint = mapThemePaint('night-red');

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
