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

// The weather band sits just above bathymetry and below the track, so ocean fields (sea-surface
// temperature, sea ice) read as a background layer under the vessel trail and the navigation
// overlays, and so the Layers panel's single Weather section never splits the Overlays section that
// would otherwise sit on both sides of it.
export const Z_ORDER: readonly ZBand[] = [
  'basemap',
  'bathymetry',
  'weather',
  'track',
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
  // The Layers-panel category this overlay belongs to, so the panel groups it without knowing any
  // feature id. When absent the panel derives a category from the band. The category vocabulary and
  // its order live in the panel; an overlay just declares which one it joins.
  readonly category?: string;
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
