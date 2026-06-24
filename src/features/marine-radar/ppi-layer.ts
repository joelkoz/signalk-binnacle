import type {
  CustomLayerInterface,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
  Map as MapLibreMap,
} from 'maplibre-gl';
import maplibregl from 'maplibre-gl';
import type { LatLon } from '$shared/geo';
import {
  emptyFeatureCollection,
  type MapThemePaint,
  type OverlayContext,
  type OverlayModule,
  removeLayersAndSources,
  setSourceData,
} from '$shared/map';
import { themedColorTable } from './legend-theme';
import type { MarineRadarStore } from './marine-radar-store.svelte';
import type { RadarFrame } from './radar-frame-core';
import { rangeQuadHalfExtent } from './radar-geo';
import { RadarGl } from './radar-gl';
import { headingLineFeature, rangeRingFeatures } from './radar-vectors';

export const RADAR_ECHO_LAYER_ID = 'marine-radar-echo';
export const RADAR_RINGS_LAYER_ID = 'marine-radar-rings';
const RINGS_SOURCE_ID = 'marine-radar-rings-src';
const RANGE_RINGS = 3;
// Cap the live-picture repaint at ~20 fps; the worker integrates spokes faster than the eye needs.
const STEP_MS = 50;

function matrixOf(args: unknown): number[] {
  if (Array.isArray(args)) return args;
  const data = (args as { defaultProjectionData?: { mainMatrix?: number[] } })
    .defaultProjectionData;
  return data?.mainMatrix ?? [];
}

export interface PpiLayer extends OverlayModule {
  sync(ctx: OverlayContext): void;
  pushFrame(frame: RadarFrame): void;
}

// The marine radar echo as a MapLibre custom WebGL layer (polar texture unwrapped in a shader,
// positioned by the mercator helper, heading as a uniform), plus a range-ring and heading-line
// GeoJSON layer above it. Modeled on features/weather/wind-overlay.ts. Off by default; in the traffic
// band so it reads with the live overlays and lands in the "Traffic and live data" panel category.
export function createPpiLayer(
  store: MarineRadarStore,
  getCenter: () => LatLon | undefined,
): PpiLayer {
  let gl: RadarGl | undefined;
  let theme: MapThemePaint['theme'] = 'day';
  let opacity = 1;
  let visible = false;
  let frame: RadarFrame | undefined;
  let dirty = false;
  let legendVersion = '';
  let lastRepaint = 0;

  function applyLegend(): void {
    const legend = store.selected?.legend;
    if (gl && legend) gl.setLegend(themedColorTable(legend, theme));
  }

  function throttledRepaint(ctx: OverlayContext): void {
    if (document.hidden) return;
    const now = performance.now();
    if (now - lastRepaint < STEP_MS) return;
    lastRepaint = now;
    ctx.map.triggerRepaint();
  }

  function addEcho(ctx: OverlayContext): void {
    const layer: CustomLayerInterface = {
      id: RADAR_ECHO_LAYER_ID,
      type: 'custom',
      onAdd(_map: MapLibreMap, glCtx: WebGL2RenderingContext) {
        gl = new RadarGl(glCtx);
        applyLegend();
        gl.setOpacity(opacity);
      },
      render(_glCtx: WebGLRenderingContext | WebGL2RenderingContext, args: unknown) {
        if (!gl || !visible) return;
        const center = getCenter();
        if (!frame || !center) return;
        const matrix = matrixOf(args);
        if (matrix.length < 16) return;
        if (dirty) {
          gl.setData(frame.buffer, frame.spokesPerRev, frame.maxSpokeLen);
          if (frame.heading !== undefined) gl.setHeading(frame.heading);
          dirty = false;
        }
        const mc = maplibregl.MercatorCoordinate.fromLngLat({
          lng: center.longitude,
          lat: center.latitude,
        });
        gl.render(matrix, mc.x, mc.y, rangeQuadHalfExtent(center.latitude, frame.range));
        throttledRepaint(ctx);
      },
      onRemove() {
        gl?.dispose();
        gl = undefined;
      },
    };
    ctx.map.addLayer(layer, ctx.beforeIdFor('traffic'));
  }

  function addRings(ctx: OverlayContext): void {
    if (!ctx.map.getSource(RINGS_SOURCE_ID)) {
      const src: GeoJSONSourceSpecification = { type: 'geojson', data: emptyFeatureCollection() };
      ctx.map.addSource(RINGS_SOURCE_ID, src);
    }
    if (!ctx.map.getLayer(RADAR_RINGS_LAYER_ID)) {
      const layer: LineLayerSpecification = {
        id: RADAR_RINGS_LAYER_ID,
        type: 'line',
        source: RINGS_SOURCE_ID,
        layout: { visibility: visible ? 'visible' : 'none' },
        paint: { 'line-color': '#33ff66', 'line-width': 1, 'line-opacity': 0.5 },
      };
      ctx.map.addLayer(layer, ctx.beforeIdFor('traffic'));
    }
  }

  function syncRings(ctx: OverlayContext): void {
    const center = getCenter();
    if (!center || !frame) {
      setSourceData(ctx.map, RINGS_SOURCE_ID, emptyFeatureCollection());
      return;
    }
    const rings = rangeRingFeatures(center, frame.range, RANGE_RINGS);
    if (frame.heading !== undefined) {
      rings.features.push(headingLineFeature(center, frame.heading, frame.range));
    }
    setSourceData(ctx.map, RINGS_SOURCE_ID, rings);
  }

  return {
    id: 'marine-radar',
    title: 'Radar',
    band: 'traffic',
    supportsOpacity: true,
    defaultVisible: false,
    available: () => store.radars.length > 0,
    unavailableHint:
      'No radar detected. Install a Signal K radar provider (mayara or signalk-radar) to see the radar picture.',
    manageable: true,
    layerIds: [RADAR_ECHO_LAYER_ID, RADAR_RINGS_LAYER_ID],
    add(ctx) {
      addEcho(ctx);
      addRings(ctx);
    },
    pushFrame(next) {
      frame = next;
      dirty = true;
    },
    reset() {
      dirty = true;
      legendVersion = '';
    },
    sync(ctx) {
      const version = store.selectedId ?? '';
      if (version !== legendVersion) {
        legendVersion = version;
        applyLegend();
      }
      syncRings(ctx);
      if (visible) ctx.map.triggerRepaint();
    },
    remove(ctx) {
      removeLayersAndSources(
        ctx.map,
        [RADAR_ECHO_LAYER_ID, RADAR_RINGS_LAYER_ID],
        [RINGS_SOURCE_ID],
      );
    },
    setVisible(ctx, value) {
      visible = value;
      if (ctx.map.getLayer(RADAR_RINGS_LAYER_ID)) {
        ctx.map.setLayoutProperty(RADAR_RINGS_LAYER_ID, 'visibility', value ? 'visible' : 'none');
      }
      if (value) ctx.map.triggerRepaint();
    },
    setOpacity(ctx, value) {
      opacity = value;
      gl?.setOpacity(value);
      if (ctx.map.getLayer(RADAR_RINGS_LAYER_ID)) {
        ctx.map.setPaintProperty(RADAR_RINGS_LAYER_ID, 'line-opacity', Math.min(0.5, value));
      }
    },
    applyTheme(ctx, paint) {
      theme = paint.theme;
      applyLegend();
      if (ctx.map.getLayer(RADAR_RINGS_LAYER_ID)) {
        ctx.map.setPaintProperty(
          RADAR_RINGS_LAYER_ID,
          'line-color',
          paint.theme === 'night-red' ? '#ff3333' : '#33ff66',
        );
      }
    },
  };
}
