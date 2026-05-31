import type {
  GeoJSONSource,
  GeoJSONSourceSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import type { OwnVessel } from '$entities/vessel';
import type { OverlayContext, OverlayModule } from '$shared/map';
import { VESSEL_ICON_ID, vesselIconImage } from './vessel-icon';

const SOURCE_ID = 'binnacle-own-vessel';
const LAYER_ID = 'binnacle-own-vessel-symbol';

interface VesselOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

export function createVesselOverlay(vessel: OwnVessel): VesselOverlay {
  let lastLon: number | undefined;
  let lastLat: number | undefined;
  let lastHeading: number | undefined;

  function featureCollection(): GeoJSON.FeatureCollection {
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
      const source: GeoJSONSourceSpecification = { type: 'geojson', data: featureCollection() };
      ctx.map.addSource(SOURCE_ID, source);
      const layer: SymbolLayerSpecification = {
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
      };
      ctx.map.addLayer(layer, ctx.beforeIdFor('vessel'));
    },
    sync(ctx) {
      const position = vessel.position;
      const lon = position?.longitude;
      const lat = position?.latitude;
      const heading = position ? (vessel.headingDegrees ?? vessel.cogDegrees ?? 0) : undefined;
      if (lon === lastLon && lat === lastLat && heading === lastHeading) return;
      lastLon = lon;
      lastLat = lat;
      lastHeading = heading;
      const source = ctx.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      source?.setData(featureCollection());
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
