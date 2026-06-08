import type { LayerListItem } from '$shared/map';

export interface LayerCategory {
  id: string;
  title: string;
}

// The former flat Overlays band split into meaningful categories by overlay id. The chart and ocean
// bands keep their own sections. Children (a chart facet) never reach here; they nest under a parent.
const LIVE = new Set(['ais', 'tides']);
const NAV_AIDS = new Set(['seamark']);
const AREAS = new Set(['mpa-noaa', 'mpa-emodnet', 'bound-12nm', 'bound-eez']);

// The Layers-panel category a movable row falls under. Band decides the broad section (the bathymetry
// band is charts, the weather band is ocean conditions); within the former Overlays span a small id
// set names the live, navigation-aid, and area categories, and everything else (routes, notes, and
// the track) is the navigator's own data. An unknown future overlay falls into that own-data bucket,
// so it is always visible, never lost behind an unmatched category.
export function layerCategory(item: LayerListItem): LayerCategory {
  if (item.band === 'basemap' || item.band === 'bathymetry') {
    return { id: 'charts', title: 'Charts and depth' };
  }
  if (item.band === 'weather') return { id: 'ocean', title: 'Ocean conditions' };
  if (LIVE.has(item.id)) return { id: 'live', title: 'Traffic and live data' };
  if (NAV_AIDS.has(item.id)) return { id: 'nav-aids', title: 'Navigation aids' };
  if (AREAS.has(item.id)) return { id: 'areas', title: 'Areas and boundaries' };
  return { id: 'mine', title: 'My routes and tracks' };
}

// Categories in map z-order, top of the map first, so the panel reads the same as the stack and a
// drag-to-reorder lands where the navigator drops it. This must match the band and registration order
// in ChartCanvas: traffic and the top of safety (AIS, tides), then the rest of safety (aids, then
// areas), then routes and the track, then the ocean fields, then the charts.
export const CATEGORY_ORDER = ['live', 'nav-aids', 'areas', 'mine', 'ocean', 'charts'];

// First-run open state. The two glance-often categories open; the reference, ocean, and chart
// categories collapse to cut clutter. A persisted user change overrides this per category.
export const CATEGORY_DEFAULT_OPEN: Record<string, boolean> = {
  live: true,
  'nav-aids': false,
  areas: false,
  mine: true,
  ocean: false,
  charts: false,
};
