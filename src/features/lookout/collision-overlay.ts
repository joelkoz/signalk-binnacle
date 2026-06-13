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
  removeLayersAndSources,
  setLayersVisibility,
} from '$shared/map';

const SOURCE_ID = 'binnacle-collision';
const LAYER_ID = 'binnacle-collision-ring';

// Ring geometry per severity, named so the danger and warning grading is one source. The warning
// values double as the match fallback for an unknown severity.
const RING_RADIUS = { danger: 20, warning: 16 } as const;
const RING_STROKE_WIDTH = { danger: 3, warning: 2 } as const;

// The overlay id. The chart pins this just beneath the vessel so an active alarm can never be hidden;
// exported so the pinned list references the same constant instead of a literal that could drift.
export const COLLISION_OVERLAY_ID = 'collision';

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
    id: COLLISION_OVERLAY_ID,
    title: 'Collision risk',
    band: 'safety',
    // The overlay is pinned beneath the vessel and an active alarm must never be user-dimmable.
    supportsOpacity: false,
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
          'circle-radius': [
            'match',
            ['get', 'severity'],
            'danger',
            RING_RADIUS.danger,
            'warning',
            RING_RADIUS.warning,
            RING_RADIUS.warning,
          ],
          'circle-color': 'rgba(0, 0, 0, 0)',
          'circle-stroke-width': [
            'match',
            ['get', 'severity'],
            'danger',
            RING_STROKE_WIDTH.danger,
            'warning',
            RING_STROKE_WIDTH.warning,
            RING_STROKE_WIDTH.warning,
          ],
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
      setLayersVisibility(ctx.map, [LAYER_ID], visible);
    },
    remove(ctx) {
      removeLayersAndSources(ctx.map, [LAYER_ID], [SOURCE_ID]);
    },
  };
}
