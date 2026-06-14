import type { CircleLayerSpecification, GeoJSONSource, LineLayerSpecification } from 'maplibre-gl';

import type { CourseGuidance } from '$entities/course';
import type { OwnVessel } from '$entities/vessel';
import { latLonToLonLat as toLonLat } from '$shared/geo';
import {
  DARK_SCRIM,
  emptyFeatureCollection,
  featureCollection,
  type MapThemePaint,
  mapThemePaint,
  type OverlayContext,
  type OverlayModule,
  removeLayersAndSources,
  rgbaCss,
  setLayersVisibility,
} from '$shared/map';

const LINE_SRC = 'binnacle-course-line-src';
const POINT_SRC = 'binnacle-course-point-src';
const LINE_LAYER = 'binnacle-course-line';
const POINT_LAYER = 'binnacle-course-point';
const BAND = 'routes';
const LAYERS = [LINE_LAYER, POINT_LAYER];

const LINE_WIDTH = 3;
// A slightly larger circle so the destination reads as a distinct target, not just a waypoint dot.
const POINT_RADIUS = 6;
const POINT_STROKE_WIDTH = 1.5;

export interface CourseOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

export function createCourseOverlay(guidance: CourseGuidance, vessel: OwnVessel): CourseOverlay {
  let paint: MapThemePaint = mapThemePaint('day');
  // Dirty-check signature: "vesselLng,vesselLat|destLng,destLat" or "" for empty.
  let lastSignature = '';

  function setLineData(ctx: OverlayContext, data: GeoJSON.FeatureCollection): void {
    (ctx.map.getSource(LINE_SRC) as GeoJSONSource | undefined)?.setData(data);
  }

  function setPointData(ctx: OverlayContext, data: GeoJSON.FeatureCollection): void {
    (ctx.map.getSource(POINT_SRC) as GeoJSONSource | undefined)?.setData(data);
  }

  function clearBoth(ctx: OverlayContext): void {
    if (lastSignature === '') return;
    lastSignature = '';
    setLineData(ctx, emptyFeatureCollection());
    setPointData(ctx, emptyFeatureCollection());
  }

  return {
    id: 'course',
    title: 'Course',
    band: BAND,
    supportsOpacity: true,
    defaultVisible: true,
    layerIds: LAYERS,
    add(ctx) {
      // Reset the dirty-check so a reattach (after a base-style swap emptied the sources)
      // repopulates them on the next sync instead of staying blank.
      lastSignature = '';

      const before = ctx.beforeIdFor(BAND);

      for (const id of [LINE_SRC, POINT_SRC]) {
        if (!ctx.map.getSource(id)) {
          ctx.map.addSource(id, { type: 'geojson', data: emptyFeatureCollection() });
        }
      }

      // Line first so it sits below the destination circle in the stack.
      if (!ctx.map.getLayer(LINE_LAYER)) {
        const layer: LineLayerSpecification = {
          id: LINE_LAYER,
          type: 'line',
          source: LINE_SRC,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': paint.select,
            'line-width': LINE_WIDTH,
            // Dashed so the course line reads as a live projection, distinct from a saved route leg.
            'line-dasharray': [2, 1],
          },
        };
        ctx.map.addLayer(layer, before);
      }

      if (!ctx.map.getLayer(POINT_LAYER)) {
        const layer: CircleLayerSpecification = {
          id: POINT_LAYER,
          type: 'circle',
          source: POINT_SRC,
          paint: {
            'circle-radius': POINT_RADIUS,
            'circle-color': paint.select,
            'circle-stroke-color': rgbaCss(DARK_SCRIM),
            'circle-stroke-width': POINT_STROKE_WIDTH,
          },
        };
        ctx.map.addLayer(layer, before);
      }
    },
    sync(ctx) {
      if (!guidance.active) {
        clearBoth(ctx);
        return;
      }
      const dest = guidance.nextPosition;
      const pos = vessel.position;
      if (!dest || !pos) {
        clearBoth(ctx);
        return;
      }

      // Build the signature from the raw fields so the common unchanged-frame path returns before
      // allocating any coordinate arrays or feature objects.
      const signature = `${pos.longitude},${pos.latitude}|${dest.longitude},${dest.latitude}`;
      if (signature === lastSignature) return;
      lastSignature = signature;

      const vesselCoord = toLonLat(pos);
      const destCoord = toLonLat(dest);
      setLineData(
        ctx,
        featureCollection([
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [vesselCoord, destCoord] },
            properties: {},
          },
        ]),
      );
      setPointData(
        ctx,
        featureCollection([
          { type: 'Feature', geometry: { type: 'Point', coordinates: destCoord }, properties: {} },
        ]),
      );
    },
    applyTheme(ctx, next) {
      paint = next;
      ctx.map.setPaintProperty(LINE_LAYER, 'line-color', paint.select);
      ctx.map.setPaintProperty(POINT_LAYER, 'circle-color', paint.select);
    },
    setVisible(ctx, visible) {
      setLayersVisibility(ctx.map, LAYERS, visible);
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(LINE_LAYER, 'line-opacity', opacity);
      ctx.map.setPaintProperty(POINT_LAYER, 'circle-opacity', opacity);
      ctx.map.setPaintProperty(POINT_LAYER, 'circle-stroke-opacity', opacity);
    },
    remove(ctx) {
      removeLayersAndSources(ctx.map, LAYERS, [LINE_SRC, POINT_SRC]);
    },
  };
}
