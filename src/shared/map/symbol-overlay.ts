import type {
  GeoJSONSource,
  GeoJSONSourceSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import type { Rgba } from './icon-raster';
import { setMapImage } from './map-image';
import type { MapThemePaint } from './map-theme';
import type { OverlayContext, OverlayModule, ZBand } from './types';

export interface SymbolOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

// Shared scaffolding for a rotated-icon point overlay (own vessel, AIS targets, and
// any future symbol layer). The two original overlays were byte-identical apart from
// the ids, the icon, the band, the theme paint field, and their sync change-detection,
// so those are the config; everything else lives here once.
export interface SymbolOverlayConfig {
  id: string;
  title: string;
  band: ZBand;
  sourceId: string;
  layerId: string;
  iconId: string;
  iconImage: (color: Rgba) => ImageData;
  // Pixel ratio the icon image is rendered at (default 1). Icons drawn at 2x pass 2 here
  // so the on-screen size is half the image, kept crisp on retina displays.
  pixelRatio?: number;
  defaultColor: Rgba;
  paintColor: (paint: MapThemePaint) => Rgba;
  // Builds the current feature set.
  features: () => GeoJSON.FeatureCollection;
  // Returns true and records new state when the features changed since the last sync,
  // so a static map does not rebuild the GeoJSON every frame.
  shouldRefresh: () => boolean;
  // Optional per-sync side effect that runs before the change check (AIS pruning).
  beforeSync?: () => void;
}

export function createSymbolOverlay(config: SymbolOverlayConfig): SymbolOverlay {
  function refresh(ctx: OverlayContext): void {
    const source = ctx.map.getSource(config.sourceId) as GeoJSONSource | undefined;
    source?.setData(config.features());
  }

  return {
    id: config.id,
    title: config.title,
    band: config.band,
    supportsOpacity: true,
    layerIds: [config.layerId],
    add(ctx) {
      setMapImage(
        ctx.map,
        config.iconId,
        config.iconImage(config.defaultColor),
        config.pixelRatio ?? 1,
      );
      const source: GeoJSONSourceSpecification = { type: 'geojson', data: config.features() };
      ctx.map.addSource(config.sourceId, source);
      const layer: SymbolLayerSpecification = {
        id: config.layerId,
        type: 'symbol',
        source: config.sourceId,
        layout: {
          'icon-image': config.iconId,
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      };
      ctx.map.addLayer(layer, ctx.beforeIdFor(config.band));
    },
    sync(ctx) {
      config.beforeSync?.();
      if (config.shouldRefresh()) refresh(ctx);
    },
    applyTheme(ctx, paint) {
      const image = config.iconImage(config.paintColor(paint));
      setMapImage(ctx.map, config.iconId, image, config.pixelRatio ?? 1);
    },
    setVisible(ctx, visible) {
      ctx.map.setLayoutProperty(config.layerId, 'visibility', visible ? 'visible' : 'none');
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(config.layerId, 'icon-opacity', opacity);
    },
    remove(ctx) {
      if (ctx.map.getLayer(config.layerId)) ctx.map.removeLayer(config.layerId);
      if (ctx.map.getSource(config.sourceId)) ctx.map.removeSource(config.sourceId);
    },
  };
}
