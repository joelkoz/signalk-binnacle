import type { Map as MapLibreMap } from 'maplibre-gl';
import type { MapThemePaint } from './map-theme';

export type ZBand =
  | 'basemap'
  | 'bathymetry'
  | 'track'
  | 'weather'
  | 'routes'
  | 'safety'
  | 'traffic'
  | 'vessel'
  | 'overlay-top';

export const Z_ORDER: readonly ZBand[] = [
  'basemap',
  'bathymetry',
  'track',
  'weather',
  'routes',
  'safety',
  'traffic',
  'vessel',
  'overlay-top',
] as const;

export interface OverlayContext {
  map: MapLibreMap;
  beforeIdFor(band: ZBand): string | undefined;
}

export interface OverlayModule {
  readonly id: string;
  readonly title: string;
  readonly band: ZBand;
  readonly supportsOpacity: boolean;
  // Initial visibility when there is no saved state. Defaults to visible; streaming depth layers
  // set this false so they start off until the user enables one for their area.
  readonly defaultVisible?: boolean;
  // The MapLibre layer ids this overlay manages, bottom to top, so the LayerManager can
  // restack the whole overlay group when the user reorders layers.
  readonly layerIds: readonly string[];
  add(ctx: OverlayContext): void | Promise<void>;
  remove(ctx: OverlayContext): void;
  setVisible(ctx: OverlayContext, visible: boolean): void;
  setOpacity?(ctx: OverlayContext, opacity: number): void;
  reattach?(ctx: OverlayContext): void | Promise<void>;
  applyTheme?(ctx: OverlayContext, paint: MapThemePaint): void;
}
