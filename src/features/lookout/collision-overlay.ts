import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  GeoJSONSource,
  GeoJSONSourceSpecification,
} from 'maplibre-gl';
import type { CollisionAssessment, DangerContact } from '$entities/collision';
import {
  type MapThemePaint,
  mapThemePaint,
  type OverlayContext,
  type OverlayModule,
} from '$shared/map';

const SOURCE_ID = 'binnacle-collision';
const LAYER_ID = 'binnacle-collision-ring';

interface CollisionOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

// A graded ring around each dangerous AIS target, colored by severity from the theme.
function strokeColor(paint: MapThemePaint): ExpressionSpecification {
  return [
    'match',
    ['get', 'severity'],
    'danger',
    paint.danger,
    'warning',
    paint.warning,
    paint.warning,
  ];
}

function featureCollection(contacts: readonly DangerContact[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: contacts.map((contact) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [contact.position.longitude, contact.position.latitude],
      },
      properties: { severity: contact.severity },
    })),
  };
}

export function createCollisionOverlay(collision: CollisionAssessment): CollisionOverlay {
  // The assessment is a memoized derived value, so its contacts array keeps the same identity
  // until traffic, the own fix, or the thresholds actually change. A reference check is the
  // dirty check, with no per-frame string to build in the animation loop.
  let lastContacts: readonly DangerContact[] | undefined;

  return {
    id: 'collision',
    title: 'Collision risk',
    band: 'safety',
    supportsOpacity: true,
    layerIds: [LAYER_ID],
    add(ctx) {
      const contacts = collision.assessment.contacts;
      const source: GeoJSONSourceSpecification = {
        type: 'geojson',
        data: featureCollection(contacts),
      };
      ctx.map.addSource(SOURCE_ID, source);
      const layer: CircleLayerSpecification = {
        id: LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': ['match', ['get', 'severity'], 'danger', 20, 'warning', 16, 16],
          'circle-color': 'rgba(0, 0, 0, 0)',
          'circle-stroke-width': ['match', ['get', 'severity'], 'danger', 3, 'warning', 2, 2],
          'circle-stroke-color': strokeColor(mapThemePaint('day')),
        },
      };
      ctx.map.addLayer(layer, ctx.beforeIdFor('safety'));
      lastContacts = contacts;
    },
    sync(ctx) {
      const contacts = collision.assessment.contacts;
      if (contacts === lastContacts) return;
      lastContacts = contacts;
      const source = ctx.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      source?.setData(featureCollection(contacts));
    },
    applyTheme(ctx, paint) {
      ctx.map.setPaintProperty(LAYER_ID, 'circle-stroke-color', strokeColor(paint));
    },
    setVisible(ctx, visible) {
      ctx.map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(LAYER_ID, 'circle-stroke-opacity', opacity);
    },
    remove(ctx) {
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.removeLayer(LAYER_ID);
      if (ctx.map.getSource(SOURCE_ID)) ctx.map.removeSource(SOURCE_ID);
    },
  };
}
