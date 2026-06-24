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
const RING_COLOR_DAY = '#33ff66';
const RING_COLOR_NIGHT = '#ff3333';

const RADAR_UNAVAILABLE_HINT =
  'No radar detected. Install a Signal K radar provider (mayara or Radar SK) to see the radar picture.';

function ringColor(theme: MapThemePaint['theme']): string {
  return theme === 'night-red' ? RING_COLOR_NIGHT : RING_COLOR_DAY;
}

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
// positioned by the mercator helper, heading as a uniform), plus a range-ring and heading-line GeoJSON
// layer above it. Off by default; in the traffic band so it reads with the live overlays and lands in
// the "Traffic and live data" panel category.
export function createPpiLayer(
  store: MarineRadarStore,
  getCenter: () => LatLon | undefined,
): PpiLayer {
  let gl: RadarGl | undefined;
  let echoMap: MapLibreMap | undefined;
  let theme: MapThemePaint['theme'] = 'day';
  let opacity = 1;
  let visible = false;
  let frame: RadarFrame | undefined;
  let dirty = false;
  let legendVersion = '';
  // The last ring geometry inputs, compared numerically so sync rewrites the rings source only when the
  // vessel position, range, or heading actually changed (no per-sync string allocation).
  let lastRingLat = Number.NaN;
  let lastRingLon = Number.NaN;
  let lastRingRange = Number.NaN;
  let lastRingHeading = Number.NaN;
  let ringsDrawn = false;

  function applyLegend(): void {
    const legend = store.selected?.legend;
    if (gl && legend) gl.setLegend(themedColorTable(legend, theme));
  }

  function addEcho(ctx: OverlayContext): void {
    const canvas = ctx.map.getCanvas();
    let contextLost = false;
    let removed = false;
    let glCtx: WebGL2RenderingContext | undefined;

    function buildGl(): void {
      if (!glCtx) return;
      try {
        gl = new RadarGl(glCtx);
        applyLegend();
        gl.setOpacity(opacity);
        dirty = true;
      } catch (error) {
        // A shader compile or link failure must not abort the whole overlay registration (it runs
        // synchronously inside registerAll): degrade to an empty echo, which the render guard no-ops,
        // and flag the radar status. This mirrors wind-overlay's degrade-on-GL-failure.
        console.warn('[marine-radar] WebGL init failed; radar echo disabled', error);
        gl = undefined;
        store.setStatus('error');
      }
    }

    const onLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
    };
    const onRestored = () => {
      if (removed) return;
      contextLost = false;
      gl = undefined;
      buildGl();
      if (visible) ctx.map.triggerRepaint();
    };
    const onVisible = () => {
      if (!removed && !document.hidden && visible && gl && !contextLost) ctx.map.triggerRepaint();
    };

    const layer: CustomLayerInterface = {
      id: RADAR_ECHO_LAYER_ID,
      type: 'custom',
      onAdd(map: MapLibreMap, gc: WebGLRenderingContext | WebGL2RenderingContext) {
        echoMap = map;
        glCtx = gc as WebGL2RenderingContext;
        canvas.addEventListener('webglcontextlost', onLost as EventListener);
        canvas.addEventListener('webglcontextrestored', onRestored as EventListener);
        document.addEventListener('visibilitychange', onVisible);
        buildGl();
      },
      render(_gc: WebGLRenderingContext | WebGL2RenderingContext, args: unknown) {
        if (!gl || !visible || contextLost) return;
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
      },
      onRemove() {
        removed = true;
        canvas.removeEventListener('webglcontextlost', onLost as EventListener);
        canvas.removeEventListener('webglcontextrestored', onRestored as EventListener);
        document.removeEventListener('visibilitychange', onVisible);
        gl?.dispose();
        gl = undefined;
        echoMap = undefined;
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
        paint: { 'line-color': ringColor(theme), 'line-width': 1, 'line-opacity': 0.5 },
      };
      ctx.map.addLayer(layer, ctx.beforeIdFor('traffic'));
    }
  }

  function syncRings(ctx: OverlayContext): void {
    const center = getCenter();
    if (!center || !frame) {
      if (ringsDrawn) {
        ringsDrawn = false;
        setSourceData(ctx.map, RINGS_SOURCE_ID, emptyFeatureCollection());
      }
      return;
    }
    const heading = frame.heading ?? Number.NaN;
    // Object.is so the no-heading (NaN) case compares equal to itself and does not rebuild every sync.
    if (
      ringsDrawn &&
      Object.is(center.latitude, lastRingLat) &&
      Object.is(center.longitude, lastRingLon) &&
      Object.is(frame.range, lastRingRange) &&
      Object.is(heading, lastRingHeading)
    ) {
      return;
    }
    lastRingLat = center.latitude;
    lastRingLon = center.longitude;
    lastRingRange = frame.range;
    lastRingHeading = heading;
    ringsDrawn = true;
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
    unavailableHint: RADAR_UNAVAILABLE_HINT,
    manageable: true,
    layerIds: [RADAR_ECHO_LAYER_ID, RADAR_RINGS_LAYER_ID],
    add(ctx) {
      addEcho(ctx);
      addRings(ctx);
    },
    pushFrame(next) {
      frame = next;
      dirty = true;
      // The echo is data-driven: a new frame requests one repaint, which runs render(); MapLibre's own
      // camera repaints cover pans and zooms, and the rings update (a GeoJSON setSourceData) repaints
      // when the vessel moves. So there is a single repaint path, not a self-scheduling loop plus a tick.
      if (visible) echoMap?.triggerRepaint();
    },
    reset() {
      dirty = true;
      legendVersion = '';
      ringsDrawn = false;
    },
    sync(ctx) {
      const version = store.selectedId ?? '';
      if (version !== legendVersion) {
        legendVersion = version;
        applyLegend();
      }
      syncRings(ctx);
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
        ctx.map.setPaintProperty(RADAR_RINGS_LAYER_ID, 'line-color', ringColor(paint.theme));
      }
    },
  };
}
