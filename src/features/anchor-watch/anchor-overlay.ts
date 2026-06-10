import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  FillLayerSpecification,
  GeoJSONSource,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  MapMouseEvent,
  MapTouchEvent,
} from 'maplibre-gl';
import type { AnchorWatch } from '$entities/anchor';
import type { OwnVessel } from '$entities/vessel';
import type { LatLon } from '$shared/geo';
import {
  emptyFeatureCollection,
  type MapThemePaint,
  mapThemePaint,
  type OverlayContext,
  type OverlayModule,
} from '$shared/map';
import { geodesicCircleRing } from '$shared/nav';

const SHAPE_SRC = 'binnacle-anchor-shapes';
const POINT_SRC = 'binnacle-anchor-point';
const FILL_LAYER = 'binnacle-anchor-swing-fill';
const RING_LAYER = 'binnacle-anchor-swing-ring';
const RODE_LAYER = 'binnacle-anchor-rode';
const MARKER_LAYER = 'binnacle-anchor-marker';
const BAND = 'routes';
const LAYERS = [FILL_LAYER, RING_LAYER, RODE_LAYER, MARKER_LAYER];

export const ANCHOR_OVERLAY_ID = 'anchor-watch';

// The swing fill is a faint wash so the chart reads through it; the ring and marker carry the color.
const FILL_OPACITY = 0.1;

// Watch geometry in the selection accent; the alarm color takes over while dragging.
function watchColor(paint: MapThemePaint): ExpressionSpecification {
  return ['case', ['get', 'dragging'], paint.danger, paint.select];
}

function shapeFeatures(
  anchor: LatLon | undefined,
  radiusMeters: number | undefined,
  vessel: LatLon | undefined,
  dragging: boolean,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (anchor && radiusMeters !== undefined) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [geodesicCircleRing(anchor.latitude, anchor.longitude, radiusMeters)],
      },
      properties: { dragging },
    });
  }
  if (anchor && vessel) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [anchor.longitude, anchor.latitude],
          [vessel.longitude, vessel.latitude],
        ],
      },
      properties: { dragging, rode: true },
    });
  }
  return { type: 'FeatureCollection', features };
}

function pointFeatures(anchor: LatLon | undefined, dragging: boolean): GeoJSON.FeatureCollection {
  if (!anchor) return emptyFeatureCollection();
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [anchor.longitude, anchor.latitude] },
        properties: { dragging },
      },
    ],
  };
}

export interface AnchorOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

// The on-chart anchor watch: the swing circle, the rode line from anchor to vessel, and a draggable
// anchor marker. Dragging the marker previews locally and commits the new drop point through
// onMoved once the pointer lifts (the app routes it to the server PUT or the local store).
export function createAnchorOverlay(
  anchor: AnchorWatch,
  vessel: OwnVessel,
  onMoved?: (position: LatLon) => void,
): AnchorOverlay {
  let paint = mapThemePaint('day');
  let opacity = 1;
  // The marker position while a drag is in flight, overriding the store so the preview is smooth
  // without committing every pointer move. Cleared on pointer-up; in server mode the marker can snap
  // back briefly until the stream confirms the PUT, which is honest about who owns the state.
  let dragPreview: LatLon | undefined;
  let needsRedraw = false;
  let lastAnchor: LatLon | undefined;
  let lastVessel: LatLon | undefined;
  let lastRadius: number | undefined;
  let lastDragging = false;
  // add() can run again after a base-style swap; the map keeps its listeners across that, so the
  // drag handlers must only ever attach once.
  let handlersAttached = false;

  const onPointerMove = (e: MapMouseEvent | MapTouchEvent): void => {
    dragPreview = { latitude: e.lngLat.lat, longitude: e.lngLat.lng };
    needsRedraw = true;
  };

  return {
    id: ANCHOR_OVERLAY_ID,
    title: 'Anchor watch',
    band: BAND,
    supportsOpacity: true,
    layerIds: LAYERS,
    add(ctx) {
      const { map } = ctx;
      const before = ctx.beforeIdFor(BAND);
      if (!map.getSource(SHAPE_SRC)) {
        const source: GeoJSONSourceSpecification = {
          type: 'geojson',
          data: emptyFeatureCollection(),
        };
        map.addSource(SHAPE_SRC, source);
      }
      if (!map.getSource(POINT_SRC)) {
        const source: GeoJSONSourceSpecification = {
          type: 'geojson',
          data: emptyFeatureCollection(),
        };
        map.addSource(POINT_SRC, source);
      }
      if (!map.getLayer(FILL_LAYER)) {
        const layer: FillLayerSpecification = {
          id: FILL_LAYER,
          type: 'fill',
          source: SHAPE_SRC,
          filter: ['!', ['has', 'rode']],
          paint: { 'fill-color': watchColor(paint), 'fill-opacity': FILL_OPACITY * opacity },
        };
        map.addLayer(layer, before);
      }
      if (!map.getLayer(RING_LAYER)) {
        const layer: LineLayerSpecification = {
          id: RING_LAYER,
          type: 'line',
          source: SHAPE_SRC,
          filter: ['!', ['has', 'rode']],
          paint: {
            'line-color': watchColor(paint),
            'line-width': ['case', ['get', 'dragging'], 3, 2],
          },
        };
        map.addLayer(layer, before);
      }
      if (!map.getLayer(RODE_LAYER)) {
        const layer: LineLayerSpecification = {
          id: RODE_LAYER,
          type: 'line',
          source: SHAPE_SRC,
          filter: ['has', 'rode'],
          paint: {
            'line-color': watchColor(paint),
            'line-width': 1.5,
            'line-dasharray': [1, 2],
          },
        };
        map.addLayer(layer, before);
      }
      if (!map.getLayer(MARKER_LAYER)) {
        const layer: CircleLayerSpecification = {
          id: MARKER_LAYER,
          type: 'circle',
          source: POINT_SRC,
          paint: {
            'circle-radius': 7,
            'circle-color': watchColor(paint),
            'circle-stroke-color': paint.markerGlyph,
            'circle-stroke-width': 1.5,
          },
        };
        map.addLayer(layer, before);
      }
      // Force a redraw so a reattach after a base-style swap repopulates the emptied sources.
      needsRedraw = true;

      if (!onMoved || handlersAttached) return;
      handlersAttached = true;
      const endDrag = (e: MapMouseEvent | MapTouchEvent): void => {
        map.off('mousemove', onPointerMove);
        map.off('touchmove', onPointerMove);
        const committed = dragPreview ?? { latitude: e.lngLat.lat, longitude: e.lngLat.lng };
        dragPreview = undefined;
        needsRedraw = true;
        onMoved(committed);
      };
      map.on('mousedown', MARKER_LAYER, (e: MapLayerMouseEvent) => {
        e.preventDefault();
        map.on('mousemove', onPointerMove);
        map.once('mouseup', endDrag);
      });
      map.on('touchstart', MARKER_LAYER, (e: MapLayerTouchEvent) => {
        if (e.points.length !== 1) return;
        e.preventDefault();
        map.on('touchmove', onPointerMove);
        map.once('touchend', endDrag);
      });
      map.on('mouseenter', MARKER_LAYER, () => {
        map.getCanvas().style.cursor = 'move';
      });
      map.on('mouseleave', MARKER_LAYER, () => {
        map.getCanvas().style.cursor = '';
      });
    },
    sync(ctx) {
      const anchorPos = dragPreview ?? anchor.position;
      const vesselPos = vessel.position;
      const radius = anchor.radiusMeters;
      const dragging = anchor.dragging;
      if (
        !needsRedraw &&
        anchorPos === lastAnchor &&
        vesselPos === lastVessel &&
        radius === lastRadius &&
        dragging === lastDragging
      ) {
        return;
      }
      needsRedraw = false;
      lastAnchor = anchorPos;
      lastVessel = vesselPos;
      lastRadius = radius;
      lastDragging = dragging;
      (ctx.map.getSource(SHAPE_SRC) as GeoJSONSource | undefined)?.setData(
        shapeFeatures(anchorPos, radius, vesselPos, dragging),
      );
      (ctx.map.getSource(POINT_SRC) as GeoJSONSource | undefined)?.setData(
        pointFeatures(anchorPos, dragging),
      );
    },
    setVisible(ctx, visible) {
      const value = visible ? 'visible' : 'none';
      for (const id of LAYERS) {
        ctx.map.setLayoutProperty(id, 'visibility', value);
      }
    },
    setOpacity(ctx, next) {
      opacity = next;
      ctx.map.setPaintProperty(FILL_LAYER, 'fill-opacity', FILL_OPACITY * opacity);
      ctx.map.setPaintProperty(RING_LAYER, 'line-opacity', opacity);
      ctx.map.setPaintProperty(RODE_LAYER, 'line-opacity', opacity);
      ctx.map.setPaintProperty(MARKER_LAYER, 'circle-opacity', opacity);
      ctx.map.setPaintProperty(MARKER_LAYER, 'circle-stroke-opacity', opacity);
    },
    applyTheme(ctx, next) {
      paint = next;
      ctx.map.setPaintProperty(FILL_LAYER, 'fill-color', watchColor(paint));
      ctx.map.setPaintProperty(RING_LAYER, 'line-color', watchColor(paint));
      ctx.map.setPaintProperty(RODE_LAYER, 'line-color', watchColor(paint));
      ctx.map.setPaintProperty(MARKER_LAYER, 'circle-color', watchColor(paint));
      ctx.map.setPaintProperty(MARKER_LAYER, 'circle-stroke-color', paint.markerGlyph);
    },
    remove(ctx) {
      for (const id of LAYERS) {
        if (ctx.map.getLayer(id)) ctx.map.removeLayer(id);
      }
      for (const src of [SHAPE_SRC, POINT_SRC]) {
        if (ctx.map.getSource(src)) ctx.map.removeSource(src);
      }
    },
  };
}
