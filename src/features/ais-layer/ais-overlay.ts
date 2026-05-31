import type {
  GeoJSONSource,
  GeoJSONSourceSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import type { AisTargets } from '$entities/ais';
import type { OverlayContext, OverlayModule } from '$shared/map';
import type { SignalKStore } from '$shared/signalk';
import { AIS_ICON_ID, aisIconImage } from './ais-icon';

const SOURCE_ID = 'binnacle-ais';
const LAYER_ID = 'binnacle-ais-symbol';
const STALE_TTL_MS = 360_000;

interface AisOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

export function createAisOverlay(targets: AisTargets, store: SignalKStore): AisOverlay {
  let lastVersion = -1;

  function featureCollection(): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: targets.list().map((target) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [target.position.longitude, target.position.latitude],
        },
        properties: {
          id: target.id,
          name: target.name ?? '',
          heading: target.headingDegrees ?? target.cogDegrees ?? 0,
        },
      })),
    };
  }

  return {
    id: 'ais',
    title: 'AIS targets',
    band: 'traffic',
    supportsOpacity: true,
    add(ctx) {
      if (!ctx.map.hasImage(AIS_ICON_ID)) {
        ctx.map.addImage(AIS_ICON_ID, aisIconImage());
      }
      const source: GeoJSONSourceSpecification = { type: 'geojson', data: featureCollection() };
      ctx.map.addSource(SOURCE_ID, source);
      const layer: SymbolLayerSpecification = {
        id: LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        layout: {
          'icon-image': AIS_ICON_ID,
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      };
      ctx.map.addLayer(layer, ctx.beforeIdFor('traffic'));
    },
    sync(ctx) {
      store.pruneAis(now(), STALE_TTL_MS);
      if (store.aisVersion === lastVersion) return;
      lastVersion = store.aisVersion;
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
