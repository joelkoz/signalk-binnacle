import { describe, expect, it } from 'vitest';
import { MeasureStore } from '$entities/measure';
import type { OverlayContext } from '$shared/map';
import { createFakeMap } from '$shared/testing/fake-map';
import { createMeasureOverlay } from './measure-overlay';

function ctxFor(map: ReturnType<typeof createFakeMap>): OverlayContext {
  return { map: map as never, beforeIdFor: () => undefined };
}

function setup() {
  const measure = new MeasureStore();
  const map = createFakeMap();
  const overlay = createMeasureOverlay(measure);
  return { measure, map, overlay, ctx: ctxFor(map) };
}

function features(map: ReturnType<typeof createFakeMap>): GeoJSON.Feature[] {
  return (map.sources.get('binnacle-measure')?.data as GeoJSON.FeatureCollection).features;
}

describe('measure overlay', () => {
  it('renders nothing while no measurement is in progress', () => {
    const { overlay, map, ctx } = setup();
    overlay.add(ctx);
    overlay.sync(ctx);
    expect(features(map)).toHaveLength(0);
  });

  it('renders vertices, the line, and the total label on the last point', () => {
    const { measure, overlay, map, ctx } = setup();
    overlay.add(ctx);
    measure.start();
    measure.add({ latitude: 0, longitude: 0 });
    measure.add({ latitude: 0.001, longitude: 0 });
    overlay.sync(ctx);
    const all = features(map);
    expect(all.filter((f) => f.geometry.type === 'Point')).toHaveLength(2);
    expect(all.filter((f) => f.geometry.type === 'LineString')).toHaveLength(1);
    const labeled = all.find((f) => f.properties?.label);
    expect(labeled?.properties?.label).toBe('111 m');
  });

  it('scales the line, the vertices, and the label with the overlay opacity', () => {
    const { overlay, map, ctx } = setup();
    overlay.add(ctx);
    overlay.setOpacity?.(ctx, 0.4);
    expect(map.setPaintProperty).toHaveBeenCalledWith('binnacle-measure-line', 'line-opacity', 0.4);
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'binnacle-measure-vertex',
      'circle-opacity',
      0.4,
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'binnacle-measure-vertex',
      'circle-stroke-opacity',
      0.4,
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'binnacle-measure-label',
      'text-opacity',
      0.4,
    );
  });

  it('clears once the tool stops', () => {
    const { measure, overlay, map, ctx } = setup();
    overlay.add(ctx);
    measure.start();
    measure.add({ latitude: 0, longitude: 0 });
    overlay.sync(ctx);
    measure.stop();
    overlay.sync(ctx);
    expect(features(map)).toHaveLength(0);
  });
});
