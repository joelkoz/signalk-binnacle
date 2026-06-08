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
  // An optional parent overlay id. A sub-layer (for example the NOAA ENC data-quality overlay under
  // the NOAA ENC chart) nests under its parent in the Layers panel and is only shown when the parent
  // is on, so a facet never renders without the chart it annotates.
  readonly parent?: string;
  // An optional named group this overlay is a facet of. When two or more overlays share a group id,
  // the Layers panel renders one labeled group header above them and lists each as a facet under it,
  // so a multi-facet chart (the NOAA ENC chart plus its data-quality overlay) reads as one unit.
  // Generic: any future multi-facet source declares the same descriptor.
  readonly group?: { readonly id: string; readonly title: string };
  readonly supportsOpacity: boolean;
  // Initial visibility when there is no saved state. Defaults to visible; streaming depth layers
  // set this false so they start off until the user enables one for their area.
  readonly defaultVisible?: boolean;
  // Initial opacity when there is no saved state. Defaults to 1; the translucent weather fields set
  // this below 1 so the chart reads through them.
  readonly defaultOpacity?: number;
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
