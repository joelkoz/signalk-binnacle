import type { OwnVessel } from '$entities/vessel';
import type { OverlayContext, OverlayModule } from '$shared/map';
import { VESSEL_ICON_ID, vesselIconImage } from './vessel-icon';

const SOURCE_ID = 'binnacle-own-vessel';
const LAYER_ID = 'binnacle-own-vessel-symbol';

interface VesselOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

function emptyCollection() {
  return { type: 'FeatureCollection', features: [] as unknown[] };
}

export function createVesselOverlay(vessel: OwnVessel): VesselOverlay {
  function featureCollection() {
    const position = vessel.position;
    if (!position) return emptyCollection();
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [position.longitude, position.latitude] },
          properties: { heading: vessel.headingDegrees ?? vessel.cogDegrees ?? 0 },
        },
      ],
    };
  }

  return {
    id: 'own-vessel',
    title: 'Own vessel',
    band: 'vessel',
    supportsOpacity: true,
    add(ctx) {
      if (!ctx.map.hasImage(VESSEL_ICON_ID)) {
        ctx.map.addImage(VESSEL_ICON_ID, vesselIconImage());
      }
      ctx.map.addSource(SOURCE_ID, { type: 'geojson', data: featureCollection() } as never);
      ctx.map.addLayer(
        {
          id: LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          layout: {
            'icon-image': VESSEL_ICON_ID,
            'icon-rotate': ['get', 'heading'],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        } as never,
        ctx.beforeIdFor('vessel'),
      );
    },
    sync(ctx) {
      const source = ctx.map.getSource(SOURCE_ID) as { setData?: (d: unknown) => void } | undefined;
      source?.setData?.(featureCollection());
    },
    setVisible(ctx, visible) {
      ctx.map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(LAYER_ID, 'icon-opacity', opacity);
    },
    remove(ctx) {
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.removeLayer(LAYER_ID);
      if (ctx.map.getSource(SOURCE_ID)) ctx.map.removeSource(SOURCE_ID);
    },
  };
}
